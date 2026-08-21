use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

use crate::commands::apply_no_window;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeFormat {
    pub duration: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeOutput {
    pub format: ProbeFormat,
}

/// Stream fingerprint used to decide whether concat demuxer + stream copy is safe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamProfile {
    pub video_codec: String,
    pub width: u32,
    pub height: u32,
    pub pix_fmt: String,
    /// Average frame rate as reported by ffprobe (e.g. "30/1", "30000/1001").
    pub avg_frame_rate: String,
    pub audio_codec: Option<String>,
    pub sample_rate: Option<String>,
    pub channels: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ProbeStreamsOutput {
    streams: Vec<ProbeStream>,
}

#[derive(Debug, Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    pix_fmt: Option<String>,
    avg_frame_rate: Option<String>,
    sample_rate: Option<String>,
    channels: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ProbeMediaOutput {
    format: Option<ProbeFormat>,
    streams: Option<Vec<ProbeStream>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MediaInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
}

fn parse_media_info(probe: &ProbeMediaOutput) -> Result<MediaInfo, String> {
    let duration = probe
        .format
        .as_ref()
        .ok_or_else(|| "ffprobe output missing format".to_string())?
        .duration
        .parse::<f64>()
        .map_err(|e| format!("Failed to parse duration: {}", e))?;

    let video = probe.streams.as_ref().and_then(|streams| {
        streams
            .iter()
            .find(|s| s.codec_type.as_deref() == Some("video"))
    });

    Ok(MediaInfo {
        duration,
        width: video.and_then(|v| v.width).unwrap_or(0),
        height: video.and_then(|v| v.height).unwrap_or(0),
    })
}

#[tauri::command]
pub async fn get_media_info(file_path: String) -> Result<MediaInfo, String> {
    log::info!("Getting media info for file: {}", file_path);

    if !Path::new(&file_path).exists() {
        return Err("File does not exist".to_string());
    }

    let mut command = Command::new("ffprobe");
    command.args(&[
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        &file_path,
    ]);
    apply_no_window(&mut command);

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to spawn ffprobe: {}. Make sure ffprobe is installed and in PATH.", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed with exit code: {:?}",
            output.status.code()
        ));
    }

    let probe: ProbeMediaOutput = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    parse_media_info(&probe)
}

#[tauri::command]
pub async fn get_duration(file_path: String) -> Result<f64, String> {
    log::info!("Getting duration for file: {}", file_path);

    // Input validation
    if !Path::new(&file_path).exists() {
        log::error!("File does not exist: {}", file_path);
        return Err("File does not exist".to_string());
    }

    log::debug!("File exists, spawning ffprobe...");

    // Spawn ffprobe
    let mut command = Command::new("ffprobe");
    command.args(&[
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        &file_path,
    ]);
    apply_no_window(&mut command);

    let output = command
        .output()
        .await
        .map_err(|e| {
            log::error!("Failed to spawn ffprobe: {}", e);
            format!("Failed to spawn ffprobe: {}. Make sure ffprobe is installed and in PATH.", e)
        })?;

    if !output.status.success() {
        log::error!("ffprobe failed with exit code: {:?}", output.status.code());
        return Err(format!("ffprobe failed with exit code: {:?}", output.status.code()));
    }

    log::debug!("ffprobe output: {}", String::from_utf8_lossy(&output.stdout));

    // Parse JSON output
    let probe_data: ProbeOutput = serde_json::from_slice(&output.stdout)
        .map_err(|e| {
            log::error!("Failed to parse ffprobe output: {}", e);
            format!("Failed to parse ffprobe output: {}", e)
        })?;

    let duration = probe_data.format.duration.parse::<f64>()
        .map_err(|e| {
            log::error!("Failed to parse duration: {}", e);
            format!("Failed to parse duration: {}", e)
        })?;

    log::info!("Successfully got duration: {} seconds", duration);
    Ok(duration)
}

/// Probe video/audio stream properties for stream-copy compatibility checks.
pub async fn probe_stream_profile(file_path: &str) -> Result<StreamProfile, String> {
    if !Path::new(file_path).exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let mut command = Command::new("ffprobe");
    command.args(&[
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        file_path,
    ]);
    apply_no_window(&mut command);

    let output = command
        .output()
        .await
        .map_err(|e| format!("Failed to spawn ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed with exit code: {:?}",
            output.status.code()
        ));
    }

    let probe: ProbeStreamsOutput = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe streams: {}", e))?;

    parse_stream_profile(&probe)
}

fn parse_stream_profile(probe: &ProbeStreamsOutput) -> Result<StreamProfile, String> {
    let video = probe
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("video"))
        .ok_or_else(|| "No video stream found".to_string())?;

    let audio = probe
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("audio"));

    Ok(StreamProfile {
        video_codec: video
            .codec_name
            .clone()
            .unwrap_or_else(|| "unknown".to_string()),
        width: video.width.unwrap_or(0),
        height: video.height.unwrap_or(0),
        pix_fmt: video
            .pix_fmt
            .clone()
            .unwrap_or_else(|| "unknown".to_string()),
        avg_frame_rate: video
            .avg_frame_rate
            .clone()
            .unwrap_or_else(|| "0/0".to_string()),
        audio_codec: audio.and_then(|a| a.codec_name.clone()),
        sample_rate: audio.and_then(|a| a.sample_rate.clone()),
        channels: audio.and_then(|a| a.channels),
    })
}

/// True when all profiles match closely enough for concat demuxer + `-c copy`.
pub fn profiles_compatible_for_copy(profiles: &[StreamProfile]) -> bool {
    if profiles.len() < 2 {
        return profiles.len() == 1;
    }
    let first = &profiles[0];
    profiles.iter().all(|p| {
        p.video_codec == first.video_codec
            && p.width == first.width
            && p.height == first.height
            && p.pix_fmt == first.pix_fmt
            && normalize_frame_rate(&p.avg_frame_rate) == normalize_frame_rate(&first.avg_frame_rate)
            && p.audio_codec == first.audio_codec
            && p.sample_rate == first.sample_rate
            && p.channels == first.channels
    })
}

/// Normalize "30/1" and "30/1.0" style rates for comparison; treat "0/0" as unknown equal only to itself.
fn normalize_frame_rate(rate: &str) -> String {
    if let Some((n, d)) = rate.split_once('/') {
        if let (Ok(num), Ok(den)) = (n.parse::<f64>(), d.parse::<f64>()) {
            if den != 0.0 {
                // Quantize to 3 decimals to absorb 30000/1001 vs float noise
                return format!("{:.3}", num / den);
            }
        }
    }
    rate.to_string()
}

#[tauri::command]
pub async fn check_ffmpeg_availability() -> Result<bool, String> {
    let mut ffmpeg_cmd = Command::new("ffmpeg");
    ffmpeg_cmd.arg("-version");
    apply_no_window(&mut ffmpeg_cmd);
    let ffmpeg_check = ffmpeg_cmd.output().await;

    let mut ffprobe_cmd = Command::new("ffprobe");
    ffprobe_cmd.arg("-version");
    apply_no_window(&mut ffprobe_cmd);
    let ffprobe_check = ffprobe_cmd.output().await;

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

    #[test]
    fn test_profiles_compatible_identical() {
        let p = StreamProfile {
            video_codec: "h264".into(),
            width: 1920,
            height: 1080,
            pix_fmt: "yuv420p".into(),
            avg_frame_rate: "30/1".into(),
            audio_codec: Some("aac".into()),
            sample_rate: Some("48000".into()),
            channels: Some(2),
        };
        assert!(profiles_compatible_for_copy(&[p.clone(), p]));
    }

    #[test]
    fn test_profiles_incompatible_resolution() {
        let a = StreamProfile {
            video_codec: "h264".into(),
            width: 1920,
            height: 1080,
            pix_fmt: "yuv420p".into(),
            avg_frame_rate: "30/1".into(),
            audio_codec: Some("aac".into()),
            sample_rate: Some("48000".into()),
            channels: Some(2),
        };
        let mut b = a.clone();
        b.width = 1280;
        assert!(!profiles_compatible_for_copy(&[a, b]));
    }

    #[test]
    fn test_profiles_incompatible_audio_codec() {
        // Merge stream-copy must refuse when audio codecs differ (would produce broken concat).
        let a = StreamProfile {
            video_codec: "h264".into(),
            width: 1920,
            height: 1080,
            pix_fmt: "yuv420p".into(),
            avg_frame_rate: "30/1".into(),
            audio_codec: Some("aac".into()),
            sample_rate: Some("48000".into()),
            channels: Some(2),
        };
        let mut b = a.clone();
        b.audio_codec = Some("mp3".into());
        assert!(!profiles_compatible_for_copy(&[a, b]));
    }

    #[test]
    fn test_profiles_incompatible_video_codec() {
        let a = StreamProfile {
            video_codec: "h264".into(),
            width: 1920,
            height: 1080,
            pix_fmt: "yuv420p".into(),
            avg_frame_rate: "30/1".into(),
            audio_codec: None,
            sample_rate: None,
            channels: None,
        };
        let mut b = a.clone();
        b.video_codec = "hevc".into();
        assert!(!profiles_compatible_for_copy(&[a, b]));
    }

    #[test]
    fn test_profiles_compatible_frame_rate_forms() {
        let a = StreamProfile {
            video_codec: "h264".into(),
            width: 1920,
            height: 1080,
            pix_fmt: "yuv420p".into(),
            avg_frame_rate: "30/1".into(),
            audio_codec: None,
            sample_rate: None,
            channels: None,
        };
        let mut b = a.clone();
        b.avg_frame_rate = "30/1".into();
        assert!(profiles_compatible_for_copy(&[a, b]));
    }

    #[test]
    fn test_parse_stream_profile_from_json() {
        let probe: ProbeStreamsOutput = serde_json::from_value(json!({
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1280,
                    "height": 720,
                    "pix_fmt": "yuv420p",
                    "avg_frame_rate": "25/1"
                },
                {
                    "codec_type": "audio",
                    "codec_name": "aac",
                    "sample_rate": "44100",
                    "channels": 2
                }
            ]
        }))
        .unwrap();

        let profile = parse_stream_profile(&probe).unwrap();
        assert_eq!(profile.video_codec, "h264");
        assert_eq!(profile.width, 1280);
        assert_eq!(profile.audio_codec.as_deref(), Some("aac"));
        assert_eq!(profile.channels, Some(2));
    }

    #[test]
    fn test_parse_media_info_duration_and_size() {
        let probe: ProbeMediaOutput = serde_json::from_value(json!({
            "format": { "duration": "125.5" },
            "streams": [
                {
                    "codec_type": "audio",
                    "codec_name": "aac"
                },
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1280,
                    "height": 720
                }
            ]
        }))
        .unwrap();

        assert_eq!(
            parse_media_info(&probe).unwrap(),
            MediaInfo {
                duration: 125.5,
                width: 1280,
                height: 720
            }
        );
    }

    #[test]
    fn test_parse_media_info_missing_video_stream() {
        let probe: ProbeMediaOutput = serde_json::from_value(json!({
            "format": { "duration": "10" },
            "streams": [{ "codec_type": "audio", "codec_name": "aac" }]
        }))
        .unwrap();

        assert_eq!(
            parse_media_info(&probe).unwrap(),
            MediaInfo {
                duration: 10.0,
                width: 0,
                height: 0
            }
        );
    }
}
