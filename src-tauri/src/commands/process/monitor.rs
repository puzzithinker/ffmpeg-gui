use crate::commands::{apply_no_window, kill_process_tree};
use crate::state::{AppState, ProcessJob};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use super::progress::{parse_ffmpeg_time, calculate_progress_percentage};
use super::types::{CompletePayload, ErrorPayload, ProgressPayload};
use super::cancel::is_job_cancelled;

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
