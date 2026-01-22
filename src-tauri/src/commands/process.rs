use crate::state::{AppState, ProcessJob};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
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
    let reader = BufReader::new(stderr);
    let mut lines = reader.lines();
    let time_regex = Regex::new(r"time=(\d+):(\d+):(\d+\.\d+)").unwrap();

    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(captures) = time_regex.captures(&line) {
            let hours: f64 = captures[1].parse().unwrap_or(0.0);
            let minutes: f64 = captures[2].parse().unwrap_or(0.0);
            let seconds: f64 = captures[3].parse().unwrap_or(0.0);

            let current_seconds = hours * 3600.0 + minutes * 60.0 + seconds;
            let percent = if duration > 0.0 {
                (current_seconds / duration * 100.0).min(100.0)
            } else {
                0.0
            };

            let _ = app.emit(
                "ffmpeg-progress",
                ProgressPayload {
                    job_id: job_id.to_string(),
                    seconds: current_seconds,
                    percent,
                },
            );
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
                    let _ = app.emit(
                        "ffmpeg-error",
                        ErrorPayload {
                            job_id: job_id.to_string(),
                            error: format!("FFmpeg exited with code {:?}", status.code()),
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
