use crate::commands::process::monitor_ffmpeg_progress;
use crate::commands::video::get_duration;
use crate::state::{AppState, ProcessJob};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, State};
use tokio::process::Command;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiCutMergeParams {
    pub input_file: String,
    pub output_file: String,
    pub segments: Vec<Segment>,
    pub crop_width: Option<u32>,
    pub crop_height: Option<u32>,
    pub crop_x: Option<u32>,
    pub crop_y: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeVideosParams {
    pub input_files: Vec<String>,
    pub output_file: String,
}

#[tauri::command]
pub async fn multi_cut_merge(
    params: MultiCutMergeParams,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let job_id = Uuid::new_v4();

    if !Path::new(&params.input_file).exists() {
        return Err("Input file does not exist".to_string());
    }
    let valid_exts = ["mp4", "avi", "mov", "mkv", "webm"];
    let output_ext = Path::new(&params.output_file)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if !valid_exts.contains(&output_ext) {
        return Err(format!(
            "Invalid output extension: {}. Supported: mp4, avi, mov, mkv, webm",
            output_ext
        ));
    }
    if params.segments.is_empty() {
        return Err("At least one segment is required".to_string());
    }
    for seg in &params.segments {
        if seg.start_time >= seg.end_time {
            return Err(format!(
                "Segment start ({}) must be less than end ({})",
                seg.start_time, seg.end_time
            ));
        }
    }

    let has_audio = check_audio_stream(&params.input_file).await;

    let n = params.segments.len();
    let mut filters: Vec<String> = Vec::new();
    let mut concat_inputs: Vec<String> = Vec::new();

    for (i, seg) in params.segments.iter().enumerate() {
        let crop_filter = match (params.crop_width, params.crop_height) {
            (Some(w), Some(h)) => {
                let x = params.crop_x.unwrap_or(0);
                let y = params.crop_y.unwrap_or(0);
                format!(",crop={}:{}:{}:{}", w, h, x, y)
            }
            _ => String::new(),
        };
        filters.push(format!(
            "[0:v]trim=start={}:end={},setpts=PTS-STARTPTS{}[v{}]",
            seg.start_time, seg.end_time, crop_filter, i
        ));
        if has_audio {
            filters.push(format!(
                "[0:a]atrim=start={}:end={},asetpts=PTS-STARTPTS[a{}]",
                seg.start_time, seg.end_time, i
            ));
            concat_inputs.push(format!("[v{}][a{}]", i, i));
        } else {
            concat_inputs.push(format!("[v{}]", i));
        }
    }

    let audio_count = if has_audio { 1 } else { 0 };
    filters.push(format!(
        "{}concat=n={}:v=1:a={}[outv]{}",
        concat_inputs.join(""),
        n,
        audio_count,
        if has_audio { "[outa]" } else { "" }
    ));

    let filter_complex = filters.join(";");

    // Build args
    let mut args = vec![
        "-i".to_string(),
        params.input_file.clone(),
        "-filter_complex".to_string(),
        filter_complex,
        "-map".to_string(),
        "[outv]".to_string(),
    ];

    if has_audio {
        args.push("-map".to_string());
        args.push("[outa]".to_string());
    }

    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    if has_audio {
        args.push("-c:a".to_string());
        args.push("aac".to_string());
    }
    args.push("-y".to_string());
    args.push(params.output_file.clone());

    log::info!("multi_cut_merge: ffmpeg args: {:?}", args);

    let mut command = Command::new("ffmpeg");
    command.args(&args).stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture ffmpeg stderr".to_string())?;

    {
        let mut jobs = state.active_jobs.lock().await;
        jobs.insert(job_id, ProcessJob { child, job_id });
    }

    // Total duration = sum of segment durations
    let total_duration: f64 = params
        .segments
        .iter()
        .map(|s| s.end_time - s.start_time)
        .sum();

    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    tokio::spawn(async move {
        monitor_ffmpeg_progress(stderr, job_id, total_duration, app_clone, state_clone).await;
    });

    Ok(job_id.to_string())
}

#[tauri::command]
pub async fn merge_videos(
    params: MergeVideosParams,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let job_id = Uuid::new_v4();

    // Validate
    if params.input_files.len() < 2 {
        return Err("At least 2 input files are required".to_string());
    }
    for file in &params.input_files {
        if !Path::new(file).exists() {
            return Err(format!("Input file does not exist: {}", file));
        }
    }
    let valid_exts = ["mp4", "avi", "mov", "mkv", "webm"];
    let output_ext = Path::new(&params.output_file)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if !valid_exts.contains(&output_ext) {
        return Err(format!(
            "Invalid output extension: {}. Supported: mp4, avi, mov, mkv, webm",
            output_ext
        ));
    }

    let n = params.input_files.len();

    // Check if ALL input files have audio
    let mut all_have_audio = true;
    for file in &params.input_files {
        if !check_audio_stream(file).await {
            all_have_audio = false;
            break;
        }
    }

    // Build args
    let mut args: Vec<String> = Vec::new();

    // Add all input files
    for file in &params.input_files {
        args.push("-i".to_string());
        args.push(file.clone());
    }

    // Build filter_complex
    let mut filters: Vec<String> = Vec::new();
    let mut concat_inputs: Vec<String> = Vec::new();

    for i in 0..n {
        // Ensure all streams are same format by forcing a consistent resolution
        // and framerate — this is the "auto-transcode" approach
        filters.push(format!(
            "[{}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{}]",
            i, i
        ));
        if all_have_audio {
            filters.push(format!(
                "[{}:a]aresample=44100[a{}]",
                i, i
            ));
            concat_inputs.push(format!("[v{}][a{}]", i, i));
        } else {
            concat_inputs.push(format!("[v{}]", i));
        }
    }

    let audio_count = if all_have_audio { 1 } else { 0 };
    filters.push(format!(
        "{}concat=n={}:v=1:a={}[outv]{}",
        concat_inputs.join(""),
        n,
        audio_count,
        if all_have_audio { "[outa]" } else { "" }
    ));

    let filter_complex = filters.join(";");

    args.push("-filter_complex".to_string());
    args.push(filter_complex);
    args.push("-map".to_string());
    args.push("[outv]".to_string());

    if all_have_audio {
        args.push("-map".to_string());
        args.push("[outa]".to_string());
    }

    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    if all_have_audio {
        args.push("-c:a".to_string());
        args.push("aac".to_string());
    }
    args.push("-y".to_string());
    args.push(params.output_file.clone());

    log::info!("merge_videos: ffmpeg args: {:?}", args);

    let mut command = Command::new("ffmpeg");
    command.args(&args).stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture ffmpeg stderr".to_string())?;

    {
        let mut jobs = state.active_jobs.lock().await;
        jobs.insert(job_id, ProcessJob { child, job_id });
    }

    // Total duration = sum of all input durations
    let mut total_duration: f64 = 0.0;
    for file in &params.input_files {
        match get_duration(file.clone()).await {
            Ok(d) => total_duration += d,
            Err(e) => log::warn!("Could not get duration for {}: {}", file, e),
        }
    }

    let app_clone = app.clone();
    let state_clone = state.inner().clone();
    tokio::spawn(async move {
        monitor_ffmpeg_progress(stderr, job_id, total_duration, app_clone, state_clone).await;
    });

    Ok(job_id.to_string())
}

/// Check if a video file has an audio stream using ffprobe
async fn check_audio_stream(file_path: &str) -> bool {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            file_path,
        ])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout.trim().contains("audio")
        }
        _ => {
            log::warn!("Could not probe audio for {}, assuming no audio", file_path);
            false
        }
    }
}
