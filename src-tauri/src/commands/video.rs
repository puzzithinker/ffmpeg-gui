use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize)]
struct ProbeFormat {
    duration: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProbeOutput {
    format: ProbeFormat,
}

#[tauri::command]
pub async fn get_duration(file_path: String) -> Result<f64, String> {
    // Input validation
    if !Path::new(&file_path).exists() {
        return Err("File does not exist".to_string());
    }

    // Spawn ffprobe
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            &file_path,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to spawn ffprobe: {}. Make sure ffprobe is installed and in PATH.", e))?;

    if !output.status.success() {
        return Err(format!("ffprobe failed with exit code: {:?}", output.status.code()));
    }

    // Parse JSON output
    let probe_data: ProbeOutput = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    let duration = probe_data.format.duration.parse::<f64>()
        .map_err(|e| format!("Failed to parse duration: {}", e))?;

    Ok(duration)
}

#[tauri::command]
pub async fn check_ffmpeg_availability() -> Result<bool, String> {
    let ffmpeg_check = Command::new("ffmpeg").arg("-version").output().await;
    let ffprobe_check = Command::new("ffprobe").arg("-version").output().await;

    match (ffmpeg_check, ffprobe_check) {
        (Ok(ff), Ok(fp)) if ff.status.success() && fp.status.success() => Ok(true),
        _ => Err("FFmpeg or FFprobe not found in PATH. Please install FFmpeg and ensure it's accessible from the command line.".to_string()),
    }
}
