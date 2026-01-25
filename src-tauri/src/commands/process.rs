use crate::state::{AppState, ProcessJob};
use std::collections::VecDeque;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoParams {
    pub input_file: String,
    pub output_file: String,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub subtitle_file: Option<String>,
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
    let time_regex = Regex::new(r"time=(\d+):(\d+):(\d+\.?\d*)").unwrap();

    time_regex.captures(line).map(|captures| {
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
    let mut child = Command::new("ffmpeg")
        .args(&args)
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}. Make sure ffmpeg is installed and in PATH.", e))?;

    // Take stderr for monitoring
    let stderr = child.stderr.take()
        .ok_or_else(|| "Failed to capture ffmpeg stderr".to_string())?;

    // Store child process in state
    {
        let mut jobs = state.active_jobs.lock().await;
        jobs.insert(
            job_id,
            ProcessJob {
                child,
                job_id,
            },
        );
    }

    // Calculate total duration for progress percentage
    let duration = params.end_time.unwrap_or(0.0) - params.start_time.unwrap_or(0.0);

    // Spawn task to monitor ffmpeg progress
    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    tokio::spawn(async move {
        monitor_ffmpeg_progress(stderr, job_id, duration, app_clone, state_clone).await;
    });

    Ok(job_id.to_string())
}

async fn monitor_ffmpeg_progress(
    stderr: impl tokio::io::AsyncRead + Unpin,
    job_id: Uuid,
    duration: f64,
    app: AppHandle,
    state: AppState,
) {
    let mut reader = BufReader::new(stderr);
    let mut buf = [0u8; 2048];
    let mut pending = String::new();
    let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(50);

    while let Ok(bytes_read) = reader.read(&mut buf).await {
        if bytes_read == 0 {
            break;
        }

        pending.push_str(&String::from_utf8_lossy(&buf[..bytes_read]));

        loop {
            if let Some(pos) = pending.find(['\r', '\n']) {
                let (segment, rest) = pending.split_at(pos);
                let trimmed = segment.trim();
                if !trimmed.is_empty() {
                    log::debug!("ffmpeg stderr [{}]: {}", job_id, trimmed);

                    if stderr_tail.len() == 50 {
                        stderr_tail.pop_front();
                    }
                    stderr_tail.push_back(trimmed.to_string());

                    if let Some(current_seconds) = parse_ffmpeg_time(trimmed) {
                        let percent = calculate_progress_percentage(current_seconds, duration);

                        let _ = app.emit(
                            "ffmpeg-progress",
                            ProgressPayload {
                                job_id: job_id.to_string(),
                                seconds: current_seconds,
                                percent,
                            },
                        );
                        log::info!(
                            "Emitted ffmpeg-progress for job {}: seconds={}, percent={}",
                            job_id,
                            current_seconds,
                            percent
                        );
                    }
                }

                // Drop the delimiter(s) and continue parsing the remainder
                let mut rest_iter = rest.chars();
                let _first = rest_iter.next();
                let remaining_rest: String = rest_iter.collect();
                let mut rest_clean = remaining_rest;
                // Remove an additional delimiter if present (handles \r\n)
                if rest_clean.starts_with('\n') || rest_clean.starts_with('\r') {
                    rest_clean = rest_clean[1..].to_string();
                }
                pending = rest_clean;
            } else {
                break;
            }
        }
    }

    // Wait for process to complete
    let mut jobs = state.active_jobs.lock().await;

    if let Some(mut job) = jobs.remove(&job_id) {
        match job.child.wait().await {
            Ok(status) => {
                if status.success() {
                    let _ = app.emit(
                        "ffmpeg-complete",
                        CompletePayload {
                            job_id: job_id.to_string(),
                        },
                    );
                } else {
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
            Err(e) => {
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
}

#[tauri::command]
pub async fn cancel_process(job_id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let uuid = Uuid::parse_str(&job_id).map_err(|_| "Invalid job ID".to_string())?;

    let mut jobs = state.active_jobs.lock().await;

    if let Some(mut job) = jobs.remove(&uuid) {
        job.child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill process: {}", e))?;

        // Emit cancelled event
        let _ = app.emit(
            "ffmpeg-cancelled",
            CompletePayload {
                job_id: job_id.to_string(),
            },
        );

        Ok(())
    } else {
        Err("Job not found".to_string())
    }
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
    let mut args = vec!["-i".to_string(), params.input_file.clone()];

    if let (Some(start), Some(end)) = (params.start_time, params.end_time) {
        args.push("-ss".to_string());
        args.push(start.to_string());
        args.push("-to".to_string());
        args.push(end.to_string());
    }

    if let Some(ref subtitle_file) = params.subtitle_file {
        // Escape path for ffmpeg filter (handle Windows paths and special chars)
        let escaped = subtitle_file
            .replace("\\", "\\\\")
            .replace(":", "\\:");
        args.push("-vf".to_string());
        args.push(format!("subtitles={}", escaped));
    }

    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push("-y".to_string()); // Overwrite output file if exists
    args.push(params.output_file.clone());

    Ok(args)
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
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert_eq!(args[0], "-i");
        assert_eq!(args[1], "/input/video.mp4");
        assert!(args.contains(&"-c:v".to_string()));
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"-c:a".to_string()));
        assert!(args.contains(&"aac".to_string()));
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
        };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];

        // Should escape backslashes and colons
        assert!(filter.contains("\\\\"));
        assert!(filter.contains("\\:"));
        assert!(filter.starts_with("subtitles="));
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitles() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: Some("/path/to/subtitle.srt".to_string()),
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"-vf".to_string()));
        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.starts_with("subtitles="));
    }
}
