use crate::commands::apply_no_window;
use crate::state::AppState;
use tauri::{AppHandle, State};
use tokio::process::Command;
use uuid::Uuid;

use super::args::{build_ffmpeg_args, validate_inputs};
use super::monitor::{monitor_ffmpeg_progress, register_job};
use super::types::ProcessVideoParams;

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

