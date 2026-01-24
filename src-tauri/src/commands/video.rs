use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeFormat {
    pub duration: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeOutput {
    pub format: ProbeFormat,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_probe_output_parsing_valid() {
        let json_str = json!({
            "format": {
                "duration": "123.45"
            }
        })
        .to_string();

        let probe_data: ProbeOutput = serde_json::from_str(&json_str).unwrap();
        let duration = probe_data.format.duration.parse::<f64>().unwrap();

        assert_eq!(duration, 123.45);
    }

    #[test]
    fn test_probe_output_parsing_integer_duration() {
        let json_str = json!({
            "format": {
                "duration": "60"
            }
        })
        .to_string();

        let probe_data: ProbeOutput = serde_json::from_str(&json_str).unwrap();
        let duration = probe_data.format.duration.parse::<f64>().unwrap();

        assert_eq!(duration, 60.0);
    }

    #[test]
    fn test_probe_output_parsing_invalid_duration() {
        let json_str = json!({
            "format": {
                "duration": "not_a_number"
            }
        })
        .to_string();

        let probe_data: ProbeOutput = serde_json::from_str(&json_str).unwrap();
        let result = probe_data.format.duration.parse::<f64>();

        assert!(result.is_err());
    }

    #[test]
    fn test_probe_output_parsing_zero_duration() {
        let json_str = json!({
            "format": {
                "duration": "0"
            }
        })
        .to_string();

        let probe_data: ProbeOutput = serde_json::from_str(&json_str).unwrap();
        let duration = probe_data.format.duration.parse::<f64>().unwrap();

        assert_eq!(duration, 0.0);
    }

    #[test]
    fn test_probe_output_parsing_large_duration() {
        let json_str = json!({
            "format": {
                "duration": "7200.5"
            }
        })
        .to_string();

        let probe_data: ProbeOutput = serde_json::from_str(&json_str).unwrap();
        let duration = probe_data.format.duration.parse::<f64>().unwrap();

        assert_eq!(duration, 7200.5);
    }
}
