use crate::commands::{apply_no_window, kill_process_tree};
use crate::state::{AppState, ProcessJob};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

// Compile the ffmpeg time regex exactly once. `Regex::new` is expensive (NFA build + bytecode
// generation + heap allocs); calling it per stderr line saturates a CPU core for the entire
// duration of a job. Requires Rust ≥1.80 for `LazyLock`.
static TIME_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"time=(\d+):(\d+):(\d+\.?\d*)").unwrap()
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoParams {
    pub input_file: String,
    pub output_file: String,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub subtitle_file: Option<String>,
    pub subtitle_font: Option<String>,
    pub subtitle_font_size: Option<u32>,
    pub brightness: Option<f64>,
    pub crop_width: Option<u32>,
    pub crop_height: Option<u32>,
    pub crop_x: Option<u32>,
    pub crop_y: Option<u32>,
    pub quality_mode: Option<String>,
    pub crf: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub job_id: String,
    pub seconds: f64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompletePayload {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub job_id: String,
    pub error: String,
}

// Extracted pure functions for testing
pub fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    TIME_REGEX.captures(line).map(|captures| {
        let hours: f64 = captures[1].parse().unwrap_or(0.0);
        let minutes: f64 = captures[2].parse().unwrap_or(0.0);
        let seconds: f64 = captures[3].parse().unwrap_or(0.0);
        hours * 3600.0 + minutes * 60.0 + seconds
    })
}

pub fn calculate_progress_percentage(current_seconds: f64, duration: f64) -> f64 {
    if duration > 0.0 {
        (current_seconds / duration * 100.0).min(100.0)
    } else {
        0.0
    }
}

#[tauri::command]
pub async fn process_video(
    params: ProcessVideoParams,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Generate job ID
    let job_id = Uuid::new_v4();

    // Validate inputs
    validate_inputs(&params)?;

    // Build ffmpeg arguments
    let args = build_ffmpeg_args(&params)?;

    log::info!("Starting ffmpeg with args: {:?}", args);

    // Spawn ffmpeg process
    let mut command = Command::new("ffmpeg");
    command
        .args(&args)
        .stderr(std::process::Stdio::piped())
        // Progress is on stderr; leave stdout unconnected so a full pipe cannot stall ffmpeg.
        .stdout(std::process::Stdio::null());

    apply_no_window(&mut command);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}. Make sure ffmpeg is installed and in PATH.", e))?;

    // Take stderr for monitoring
    let stderr = child.stderr.take()
        .ok_or_else(|| "Failed to capture ffmpeg stderr".to_string())?;

    register_job(&state, job_id, child).await?;

    // Calculate total duration for progress percentage
    let duration = params.end_time.unwrap_or(0.0) - params.start_time.unwrap_or(0.0);

    // Spawn task to monitor ffmpeg progress
    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    tokio::spawn(async move {
        monitor_ffmpeg_progress(stderr, job_id, duration, app_clone, state_clone, None, true).await;
    });

    Ok(job_id.to_string())
}

/// Register a spawned child in both the live-job map and the PID registry so cancel can kill
/// the process even after the monitor takes the Child for wait.
pub async fn register_job(
    state: &AppState,
    job_id: Uuid,
    mut child: tokio::process::Child,
) -> Result<(), String> {
    let pid = child
        .id()
        .ok_or_else(|| "Failed to get ffmpeg process id".to_string())?;

    // If the user hit Stop before this process was spawned (multi-step jobs), kill immediately.
    let already_cancelled = {
        let cancelled = state.cancelled_jobs.lock().await;
        cancelled.contains(&job_id)
    };
    let cancelled = Arc::new(AtomicBool::new(already_cancelled));

    if already_cancelled {
        log::info!(
            "Job {} was already cancelled; killing freshly spawned pid {}",
            job_id,
            pid
        );
        let _ = child.start_kill();
        let _ = kill_process_tree(pid);
    }

    {
        let mut jobs = state.active_jobs.lock().await;
        jobs.insert(
            job_id,
            ProcessJob {
                child,
                job_id,
                pid,
                cancelled: cancelled.clone(),
            },
        );
    }
    {
        let mut pids = state.job_pids.lock().await;
        pids.insert(job_id, pid);
    }

    log::info!("Registered job {} with pid {}", job_id, pid);
    Ok(())
}

/// Spawn ffmpeg, register it under `job_id`, stream progress, and wait for exit.
/// When `emit_lifecycle` is false, does not emit complete/error (used for intermediate
/// multi-cut segment extracts); cancel still works via the shared job registry.
pub async fn run_registered_ffmpeg(
    args: Vec<String>,
    job_id: Uuid,
    duration: f64,
    app: AppHandle,
    state: AppState,
    cleanup_path: Option<PathBuf>,
    emit_lifecycle: bool,
) -> Result<bool, String> {
    log::info!("run_registered_ffmpeg job {} args: {:?}", job_id, args);

    let mut command = Command::new("ffmpeg");
    command
        .args(&args)
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null());
    apply_no_window(&mut command);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture ffmpeg stderr".to_string())?;

    register_job(&state, job_id, child).await?;

    let success = monitor_ffmpeg_progress(
        stderr,
        job_id,
        duration,
        app,
        state,
        cleanup_path,
        emit_lifecycle,
    )
    .await;

    Ok(success)
}

/// Returns true if the process exited successfully and was not cancelled.
pub async fn monitor_ffmpeg_progress(
    stderr: impl tokio::io::AsyncRead + Unpin,
    job_id: Uuid,
    duration: f64,
    app: AppHandle,
    state: AppState,
    cleanup_path: Option<PathBuf>,
    emit_lifecycle: bool,
) -> bool {
    let mut reader = BufReader::new(stderr);
    let mut buf = [0u8; 2048];
    let mut pending = String::new();
    let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(50);

    // Throttle progress emission to at most every 200 ms (≤5 Hz). Require the interval so
    // fast encodes cannot flood WebView2 when percent jumps by ≥1% inside the window.
    let mut last_emit: Option<Instant> = None;
    let mut last_percent: f64 = -1.0;
    const MIN_INTERVAL: Duration = Duration::from_millis(200);

    while let Ok(bytes_read) = reader.read(&mut buf).await {
        if bytes_read == 0 {
            break;
        }

        // Stop reading promptly after cancel so we can reap the child.
        if is_job_cancelled(&state, job_id).await {
            break;
        }

        pending.push_str(&String::from_utf8_lossy(&buf[..bytes_read]));

        loop {
            if let Some(pos) = pending.find(['\r', '\n']) {
                // Drain the line including its delimiter in one operation, then drop a trailing
                // paired delimiter (\r\n or \n\r) if present. Fewer String allocations than the
                // previous split_at + chars().next() + collect() + to_string() chain.
                let mut end = pos + 1;
                let bytes = pending.as_bytes();
                if let Some(&next) = bytes.get(end) {
                    if (next == b'\r' || next == b'\n') && next as char != bytes[pos] as char {
                        end += 1;
                    }
                }
                let segment: String = pending.drain(..end).collect();
                let trimmed = segment.trim();
                if !trimmed.is_empty() {
                    if stderr_tail.len() == 50 {
                        stderr_tail.pop_front();
                    }
                    stderr_tail.push_back(trimmed.to_string());

                    if let Some(current_seconds) = parse_ffmpeg_time(trimmed) {
                        let percent = calculate_progress_percentage(current_seconds, duration);

                        let now = Instant::now();
                        // Hard cap at 5 Hz so fast encodes cannot flood WebView2.
                        let time_ok = last_emit.map_or(true, |t| now.duration_since(t) >= MIN_INTERVAL);
                        let changed = last_emit.is_none()
                            || (percent - last_percent).abs() >= 0.05
                            || percent >= 100.0;

                        if time_ok && changed {
                            let _ = app.emit(
                                "ffmpeg-progress",
                                ProgressPayload {
                                    job_id: job_id.to_string(),
                                    seconds: current_seconds,
                                    percent,
                                },
                            );
                            last_emit = Some(now);
                            last_percent = percent;
                        }
                    }
                }
            } else {
                break;
            }
        }
    }

    let was_cancelled = is_job_cancelled(&state, job_id).await;

    // Take the job out of the map under the lock, then DROP the lock before waiting.
    // Holding the mutex across `child.wait().await` serialises every other job operation
    // (including cancellation of unrelated jobs) for the entire remaining process duration.
    // Cancel does NOT remove the Child — it only signals + kills by PID / start_kill — so
    // the monitor always owns reaping.
    let job = {
        let mut jobs = state.active_jobs.lock().await;
        jobs.remove(&job_id)
    };

    let mut success = false;

    if let Some(mut job) = job {
        // If cancelled but process still alive, ensure kill before wait.
        if was_cancelled || job.cancelled.load(Ordering::SeqCst) {
            let _ = job.child.start_kill();
        }

        match job.child.wait().await {
            Ok(status) => {
                if was_cancelled || job.cancelled.load(Ordering::SeqCst) {
                    // Cancel already emitted ffmpeg-cancelled; do not also emit complete/error.
                    log::info!(
                        "Job {} reaped after cancel (status {:?})",
                        job_id,
                        status.code()
                    );
                    success = false;
                } else if status.success() {
                    success = true;
                    if emit_lifecycle {
                        let _ = app.emit(
                            "ffmpeg-complete",
                            CompletePayload {
                                job_id: job_id.to_string(),
                            },
                        );
                    }
                } else {
                    success = false;
                    if emit_lifecycle {
                        let stderr_text = if stderr_tail.is_empty() {
                            "No stderr captured".to_string()
                        } else {
                            stderr_tail.iter().cloned().collect::<Vec<_>>().join("\n")
                        };

                        let _ = app.emit(
                            "ffmpeg-error",
                            ErrorPayload {
                                job_id: job_id.to_string(),
                                error: format!(
                                    "FFmpeg exited with code {:?}. Stderr:\n{}",
                                    status.code(),
                                    stderr_text
                                ),
                            },
                        );
                    }
                }
            }
            Err(e) => {
                success = false;
                if !was_cancelled && emit_lifecycle {
                    let _ = app.emit(
                        "ffmpeg-error",
                        ErrorPayload {
                            job_id: job_id.to_string(),
                            error: format!("Process error: {}", e),
                        },
                    );
                }
            }
        }
    } else if was_cancelled {
        log::info!(
            "Job {} already removed from map after cancel; pid kill should have reaped it",
            job_id
        );
        success = false;
    }

    // Drop PID registry entry once this process is reaped. Keep cancelled_jobs until the
    // outer multi-step job finishes (or until single-shot lifecycle ends with emit_lifecycle).
    {
        let mut pids = state.job_pids.lock().await;
        pids.remove(&job_id);
    }
    if emit_lifecycle {
        let mut cancelled = state.cancelled_jobs.lock().await;
        cancelled.remove(&job_id);
    }

    if let Some(path) = cleanup_path {
        let _ = std::fs::remove_file(&path);
    }

    success
}

async fn is_job_cancelled(state: &AppState, job_id: Uuid) -> bool {
    let cancelled = state.cancelled_jobs.lock().await;
    cancelled.contains(&job_id)
}

/// Kill a single job by id. Always attempts PID tree kill so this works even if the monitor
/// already took the Child out of `active_jobs` for wait.
#[tauri::command]
pub async fn cancel_process(job_id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let uuid = Uuid::parse_str(&job_id).map_err(|_| "Invalid job ID".to_string())?;
    cancel_job_inner(uuid, &app, state.inner()).await
}

/// Kill every active job. Used when the UI has `isProcessing` but no job id yet (race between
/// Start and the first progress event / invoke return).
#[tauri::command]
pub async fn cancel_all_processes(app: AppHandle, state: State<'_, AppState>) -> Result<u32, String> {
    let ids: Vec<Uuid> = {
        let pids = state.job_pids.lock().await;
        pids.keys().copied().collect()
    };

    if ids.is_empty() {
        // Still try active_jobs in case pid registry is empty but a child exists.
        let ids_from_jobs: Vec<Uuid> = {
            let jobs = state.active_jobs.lock().await;
            jobs.keys().copied().collect()
        };
        if ids_from_jobs.is_empty() {
            return Ok(0);
        }
        for id in ids_from_jobs {
            let _ = cancel_job_inner(id, &app, state.inner()).await;
        }
        return Ok(1);
    }

    let count = ids.len() as u32;
    for id in ids {
        let _ = cancel_job_inner(id, &app, state.inner()).await;
    }
    Ok(count)
}

async fn cancel_job_inner(uuid: Uuid, app: &AppHandle, state: &AppState) -> Result<(), String> {
    // Mark cancelled first so the monitor suppresses complete/error events.
    {
        let mut cancelled = state.cancelled_jobs.lock().await;
        cancelled.insert(uuid);
    }

    // Prefer start_kill on the live Child if still in the map (do NOT remove — monitor reaps).
    let pid_from_child = {
        let mut jobs = state.active_jobs.lock().await;
        if let Some(job) = jobs.get_mut(&uuid) {
            job.cancelled.store(true, Ordering::SeqCst);
            let pid = job.pid;
            if let Err(e) = job.child.start_kill() {
                log::warn!("start_kill failed for job {}: {}", uuid, e);
            } else {
                log::info!("start_kill issued for job {} pid {}", uuid, pid);
            }
            Some(pid)
        } else {
            None
        }
    };

    // Always kill by PID (process tree) — works after Child was taken for wait, and covers
    // cases where start_kill failed or only killed a wrapper.
    let pid = {
        let pids = state.job_pids.lock().await;
        pids.get(&uuid).copied().or(pid_from_child)
    };

    if let Some(pid) = pid {
        if let Err(e) = kill_process_tree(pid) {
            log::warn!("kill_process_tree failed for job {} pid {}: {}", uuid, pid, e);
        }
    } else {
        // No pid and no child — job already finished. Still emit cancelled so UI clears.
        log::warn!("cancel_job_inner: no pid/child for job {} (may already have exited)", uuid);
    }

    let _ = app.emit(
        "ffmpeg-cancelled",
        CompletePayload {
            job_id: uuid.to_string(),
        },
    );

    Ok(())
}

fn validate_inputs(params: &ProcessVideoParams) -> Result<(), String> {
    if !Path::new(&params.input_file).exists() {
        return Err("Input file does not exist".to_string());
    }

    // Validate output extension
    let valid_exts = ["mp4", "avi", "mov", "mkv", "webm"];
    let output_ext = Path::new(&params.output_file)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    if !valid_exts.contains(&output_ext) {
        return Err(format!(
            "Invalid output extension: {}. Supported formats: mp4, avi, mov, mkv, webm",
            output_ext
        ));
    }

    if let Some(ref sub_file) = params.subtitle_file {
        if !Path::new(sub_file).exists() {
            return Err("Subtitle file does not exist".to_string());
        }
    }

    Ok(())
}

fn build_ffmpeg_args(params: &ProcessVideoParams) -> Result<Vec<String>, String> {
    let has_filters = params.crop_width.is_some()
        || params.crop_height.is_some()
        || params.brightness.map_or(false, |b| b.abs() > 0.001)
        || params.subtitle_file.is_some();

    let effective_mode = match params.quality_mode.as_deref() {
        Some("copy") if has_filters => "reencode",
        Some("copy") => "copy",
        Some("reencode") => "reencode",
        None if has_filters => "reencode",
        None => "copy",
        _ => "reencode",
    };

    let mut args: Vec<String> = Vec::new();

    if effective_mode == "copy" {
        if let Some(start) = params.start_time {
            args.push("-ss".to_string());
            args.push(start.to_string());
        }
        args.push("-i".to_string());
        args.push(params.input_file.clone());
        if let (Some(start), Some(end)) = (params.start_time, params.end_time) {
            let duration = end - start;
            args.push("-t".to_string());
            args.push(duration.to_string());
        }
        args.push("-c".to_string());
        args.push("copy".to_string());
        args.push("-y".to_string());
        args.push(params.output_file.clone());
    } else {
        args.push("-i".to_string());
        args.push(params.input_file.clone());

        if let (Some(start), Some(end)) = (params.start_time, params.end_time) {
            args.push("-ss".to_string());
            args.push(start.to_string());
            args.push("-to".to_string());
            args.push(end.to_string());
        }

        let mut filters: Vec<String> = Vec::new();

        if let (Some(w), Some(h)) = (params.crop_width, params.crop_height) {
            let x = params.crop_x.unwrap_or(0);
            let y = params.crop_y.unwrap_or(0);
            filters.push(format!("crop={}:{}:{}:{}", w, h, x, y));
        }

        if let Some(brightness) = params.brightness {
            // UI slider is −100…100 (%); FFmpeg eq brightness expects roughly −1.0…1.0.
            let normalized = normalize_brightness(brightness);
            if normalized.abs() > 0.001 {
                filters.push(format!("eq=brightness={}", normalized));
            }
        }

        if let Some(ref subtitle_file) = params.subtitle_file {
            let escaped = escape_subtitle_path(subtitle_file);
            let mut sub_filter = format!("subtitles=filename='{}'", escaped);

            let mut style_parts: Vec<String> = Vec::new();
            if let Some(ref font) = params.subtitle_font {
                if !font.is_empty() {
                    style_parts.push(format!("FontName={}", font));
                }
            }
            if let Some(font_size) = params.subtitle_font_size {
                if font_size > 0 {
                    style_parts.push(format!("FontSize={}", font_size));
                }
            }
            if !style_parts.is_empty() {
                sub_filter.push_str(&format!(":force_style='{}'", style_parts.join(",")));
            }

            filters.push(sub_filter);
        }

        if !filters.is_empty() {
            args.push("-vf".to_string());
            args.push(filters.join(","));
        }

        let crf_value = params.crf.unwrap_or(18);
        args.push("-c:v".to_string());
        args.push("libx264".to_string());
        args.push("-crf".to_string());
        args.push(crf_value.to_string());
        args.push("-c:a".to_string());
        args.push("aac".to_string());
        args.push("-y".to_string());
        args.push(params.output_file.clone());
    }

    Ok(args)
}

/// Map UI brightness (−100…100) to FFmpeg `eq=brightness` (−1.0…1.0).
/// Values already in the −1…1 range are left as-is (for callers that pre-normalize).
pub fn normalize_brightness(value: f64) -> f64 {
    if value.abs() > 1.0 {
        (value / 100.0).clamp(-1.0, 1.0)
    } else {
        value.clamp(-1.0, 1.0)
    }
}

// FFmpeg's filter syntax treats ':' as an option separator and '\' as an escape character.
// To support Windows drive letters (e.g. C:\) and paths with spaces/quotes, we normalise
// the path for the subtitles filter:
//   - Replace backslashes with forward slashes so we don't need to double-escape them.
//   - Escape drive-letter colons so they aren't interpreted as option separators.
//   - Escape single quotes because the value is wrapped in single quotes.
// UNC paths (\\server\share\...) are a special case: a blanket backslash→slash conversion would
// yield //server/share/..., which ffmpeg's lavf may interpret as a protocol specifier. We
// therefore preserve the leading \\ as an escaped literal (\\\\ in the filter string) and only
// normalise the backslashes after the UNC prefix.
fn escape_subtitle_path(path: &str) -> String {
    let mut escaped = if path.starts_with(r"\\") {
        let mut s = String::from(r"\\\\");
        s.push_str(&path[2..].replace('\\', "/"));
        s
    } else {
        path.replace('\\', "/")
    };
    escaped = escaped.replace(':', r"\:");
    escaped.replace('\'', r"\'")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    #[test]
    fn test_parse_ffmpeg_time_standard_format() {
        let line = "frame=  123 fps= 30 q=28.0 size=    1024kB time=00:01:30.50 bitrate= 139.2kbits/s";
        let time = parse_ffmpeg_time(line).unwrap();
        assert!((time - 90.5).abs() < 0.001);
    }

    #[test]
    fn test_parse_ffmpeg_time_with_hours() {
        let line = "time=01:30:45.25";
        let time = parse_ffmpeg_time(line).unwrap();
        assert!((time - 5445.25).abs() < 0.001);
    }

    #[test]
    fn test_parse_ffmpeg_time_without_decimal() {
        let line = "time=00:00:30";
        let time = parse_ffmpeg_time(line).unwrap();
        assert_eq!(time, 30.0);
    }

    #[test]
    fn test_parse_ffmpeg_time_zero_time() {
        let line = "time=00:00:00.00";
        let time = parse_ffmpeg_time(line).unwrap();
        assert_eq!(time, 0.0);
    }

    #[test]
    fn test_parse_ffmpeg_time_invalid_format() {
        let line = "invalid line without time";
        assert!(parse_ffmpeg_time(line).is_none());
    }

    #[test]
    fn test_calculate_progress_percentage_normal() {
        let percent = calculate_progress_percentage(30.0, 100.0);
        assert_eq!(percent, 30.0);
    }

    #[test]
    fn test_calculate_progress_percentage_zero_duration() {
        let percent = calculate_progress_percentage(50.0, 0.0);
        assert_eq!(percent, 0.0);
    }

    #[test]
    fn test_calculate_progress_percentage_exceeds_100() {
        let percent = calculate_progress_percentage(120.0, 100.0);
        assert_eq!(percent, 100.0);
    }

    #[test]
    fn test_calculate_progress_percentage_at_duration() {
        let percent = calculate_progress_percentage(100.0, 100.0);
        assert_eq!(percent, 100.0);
    }

    #[test]
    fn test_validate_inputs_with_nonexistent_input_file() {
        let params = ProcessVideoParams {
                    input_file: "/nonexistent/path.mp4".to_string(),
                    output_file: "/output/file.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let result = validate_inputs(&params);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Input file does not exist");
    }

    #[test]
    fn test_validate_inputs_with_invalid_output_extension() {
        let mut input = NamedTempFile::new().unwrap();
        writeln!(input, "test data").unwrap();

        let params = ProcessVideoParams {
                    input_file: input.path().to_str().unwrap().to_string(),
                    output_file: "/output/file.txt".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let result = validate_inputs(&params);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid output extension"));
    }

    #[test]
    fn test_validate_inputs_with_valid_extensions() {
        let mut input = NamedTempFile::new().unwrap();
        writeln!(input, "test data").unwrap();

        let extensions = ["mp4", "avi", "mov", "mkv", "webm"];

        for ext in extensions {
            let params = ProcessVideoParams {
                        input_file: input.path().to_str().unwrap().to_string(),
                        output_file: format!("/output/file.{}", ext),
                        start_time: None,
                        end_time: None,
                        subtitle_file: None,
                        subtitle_font: None,
                        subtitle_font_size: None,
                        brightness: None,
                        crop_width: None,
                        crop_height: None,
                        crop_x: None,
                        crop_y: None,
                        quality_mode: None,
                        crf: None,
                    };

            assert!(validate_inputs(&params).is_ok());
        }
    }

    #[test]
    fn test_validate_inputs_with_missing_subtitle_file() {
        let mut input = NamedTempFile::new().unwrap();
        writeln!(input, "test data").unwrap();

        let params = ProcessVideoParams {
                    input_file: input.path().to_str().unwrap().to_string(),
                    output_file: "/output/file.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/nonexistent/subtitle.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let result = validate_inputs(&params);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Subtitle file does not exist");
    }

    #[test]
    fn test_build_ffmpeg_args_basic() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        // Default mode with no filters = copy mode
        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(!args.contains(&"libx264".to_string()));
        assert!(!args.contains(&"-crf".to_string()));
        assert!(args.contains(&"-y".to_string()));
        assert_eq!(args.last().unwrap(), "/output/video.mp4");
    }

    #[test]
    fn test_build_ffmpeg_args_with_trim() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: Some(10.5),
                    end_time: Some(60.0),
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: Some("reencode".to_string()),
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let ss_idx = args.iter().position(|x| x == "-ss").unwrap();
        let to_idx = args.iter().position(|x| x == "-to").unwrap();

        assert_eq!(args[ss_idx + 1], "10.5");
        assert_eq!(args[to_idx + 1], "60");
    }

    #[test]
    fn test_build_ffmpeg_args_with_windows_path_escaping() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("C:\\Users\\Name\\subtitles.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];

        // Should escape drive-letter colon and wrap as filename=
        assert!(filter.starts_with("subtitles=filename='"));
        assert!(filter.contains("C\\:/Users/Name/subtitles.srt"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitles() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/subtitle.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"-vf".to_string()));
        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.starts_with("subtitles=filename='"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_spaces_and_quotes() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("D:\\My Subs\\O'Connor\\show.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert_eq!(
            filter,
            "subtitles=filename='D\\:/My Subs/O\\'Connor/show.srt'"
        );
    }

    #[test]
    fn test_build_ffmpeg_args_with_unc_subtitle_path() {
        // UNC paths (\\server\share\...) must not be blanket-converted to //server/share/...
        // because ffmpeg's lavf may interpret a leading // as a protocol specifier. The leading
        // \\ is preserved as an escaped literal; trailing backslashes are normalised to /.
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some(r"\\NAS\media\subs\movie.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert_eq!(
            filter,
            r"subtitles=filename='\\\\NAS/media/subs/movie.srt'"
        );
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitle_force_style() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: Some("Arial".to_string()),
                    subtitle_font_size: Some(36),
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("subtitles=filename='/path/to/sub.srt'"));
        assert!(filter.contains(":force_style='FontName=Arial,FontSize=36'"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitle_font_only() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: Some("DejaVu Sans".to_string()),
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("force_style='FontName=DejaVu Sans'"));
        assert!(!filter.contains("FontSize"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitle_font_size_only() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: Some(48),
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("force_style='FontSize=48'"));
        assert!(!filter.contains("FontName"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_empty_font_name_ignored() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: Some("".to_string()),
                    subtitle_font_size: Some(24),
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("force_style='FontSize=24'"));
        assert!(!filter.contains("FontName="));
    }

    #[test]
    fn test_build_ffmpeg_args_copy_mode_no_filters() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("copy".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(!args.contains(&"libx264".to_string()));
        assert!(!args.contains(&"-crf".to_string()));
        assert!(!args.contains(&"-vf".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_args_copy_mode_with_filters_fallback() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: Some(0.5),
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("copy".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"-crf".to_string()));
        assert!(args.contains(&"18".to_string()));
        assert!(!args.contains(&"copy".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_args_reencode_mode_default_crf() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("reencode".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        let crf_idx = args.iter().position(|x| x == "-crf").unwrap();
        assert_eq!(args[crf_idx + 1], "18");
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"aac".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_args_reencode_mode_custom_crf() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("reencode".to_string()),
            crf: Some(23),
        };

        let args = build_ffmpeg_args(&params).unwrap();

        let crf_idx = args.iter().position(|x| x == "-crf").unwrap();
        assert_eq!(args[crf_idx + 1], "23");
    }

    #[test]
    fn test_build_ffmpeg_args_copy_mode_fast_seek() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: Some(10.0),
            end_time: Some(60.0),
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("copy".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        let ss_idx = args.iter().position(|x| x == "-ss").unwrap();
        let i_idx = args.iter().position(|x| x == "-i").unwrap();
        assert!(ss_idx < i_idx, "-ss should appear before -i in copy mode");

        let t_idx = args.iter().position(|x| x == "-t");
        assert!(t_idx.is_some(), "-t (duration) should be present in copy mode");
        assert_eq!(args[t_idx.unwrap() + 1], "50");

        assert!(!args.contains(&"-to".to_string()), "-to should not be used in copy mode");
    }

    #[test]
    fn test_default_mode_no_filters_uses_copy() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: None,
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(!args.contains(&"libx264".to_string()));
    }

    #[test]
    fn test_default_mode_with_filters_uses_reencode() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: Some(0.5),
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: None,
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"libx264".to_string()));
        let crf_idx = args.iter().position(|x| x == "-crf").unwrap();
        assert_eq!(args[crf_idx + 1], "18");
    }

    #[test]
    fn test_normalize_brightness_percent_scale() {
        assert!((normalize_brightness(50.0) - 0.5).abs() < 1e-9);
        assert!((normalize_brightness(-100.0) - (-1.0)).abs() < 1e-9);
        assert!((normalize_brightness(100.0) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_normalize_brightness_already_unit_range() {
        assert!((normalize_brightness(0.5) - 0.5).abs() < 1e-9);
        assert!((normalize_brightness(-0.25) - (-0.25)).abs() < 1e-9);
    }

    #[test]
    fn test_build_ffmpeg_args_brightness_percent_normalized() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: Some(50.0),
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: None,
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();
        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        assert!(args[vf_idx + 1].contains("eq=brightness=0.5"));
    }

    // Regression guard for the LazyLock regex cache fix (hard-reset vector #1). If a future
    // change re-introduces per-call `Regex::new` inside `parse_ffmpeg_time`, this test will
    // fail because compiling a regex 100 000 times is orders of magnitude slower than matching
    // against a cached one. Marked `#[ignore]` so it doesn't run in the normal `cargo test`
    // suite (timing-based tests are flaky on shared CI runners); run explicitly with
    // `cargo test -- --ignored parse_ffmpeg_time_regression`.
    //
    // The budget is generous (2 s for 100k calls on one line) to avoid false failures on slow
    // machines, while still catching the ~50×+ regression from recompiling per call.
    #[test]
    #[ignore]
    fn test_parse_ffmpeg_time_regex_cache_regression() {
        use std::time::Instant;
        let line = "frame=  123 fps= 30 q=28.0 size=    1024kB time=00:01:30.50 bitrate= 139.2kbits/s";

        // Warm the LazyLock so the first call's compile cost isn't measured.
        let _ = parse_ffmpeg_time(line);

        let start = Instant::now();
        for _ in 0..100_000 {
            let _ = parse_ffmpeg_time(line);
        }
        let elapsed = start.elapsed();

        assert!(
            elapsed.as_secs() < 2,
            "parse_ffmpeg_time took {:?} for 100k calls — regex is likely being recompiled \
             per call instead of served from the LazyLock cache. Expected <2s with caching.",
            elapsed
        );
    }
}
