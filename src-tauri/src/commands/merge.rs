use crate::commands::apply_no_window;
use crate::commands::process::{
    monitor_ffmpeg_progress, register_job, run_registered_ffmpeg, CompletePayload, ErrorPayload,
};
use crate::commands::video::{
    get_duration, probe_stream_profile, profiles_compatible_for_copy, StreamProfile,
};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
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
    pub crf: Option<u32>,
    /// When true (default), prefer stream-copy cuts when no crop is applied.
    /// Copy is keyframe-aligned; set false for frame-accurate re-encode.
    pub prefer_copy: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeVideosParams {
    pub input_files: Vec<String>,
    pub output_file: String,
    pub crf: Option<u32>,
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

    let has_crop = params.crop_width.is_some() && params.crop_height.is_some();
    let prefer_copy = params.prefer_copy.unwrap_or(true);

    // Quality-first: stream-copy segments + concat demuxer when no crop.
    // Cuts are keyframe-aligned (not frame-accurate).
    if prefer_copy && !has_crop {
        return multi_cut_stream_copy(params, job_id, app, state.inner().clone()).await;
    }

    multi_cut_reencode(params, job_id, app, state.inner().clone()).await
}

async fn multi_cut_stream_copy(
    params: MultiCutMergeParams,
    job_id: Uuid,
    app: AppHandle,
    state: AppState,
) -> Result<String, String> {
    let work_dir = std::env::temp_dir().join(format!("ffmpeg_multicut_{}", job_id));
    std::fs::create_dir_all(&work_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // Placeholder so cancel_all / cancel by id finds this job before the first ffmpeg spawn.
    {
        let mut pids = state.job_pids.lock().await;
        pids.insert(job_id, 0);
    }

    let total_duration: f64 = params
        .segments
        .iter()
        .map(|s| s.end_time - s.start_time)
        .sum();

    let app_clone = app.clone();
    let state_clone = state.clone();
    let input = params.input_file.clone();
    let output = params.output_file.clone();
    let segments = params.segments.clone();

    tokio::spawn(async move {
        let result = run_multi_cut_copy_pipeline(
            &input,
            &output,
            &segments,
            job_id,
            total_duration,
            &work_dir,
            app_clone.clone(),
            state_clone.clone(),
        )
        .await;

        // Cleanup work dir always
        let _ = std::fs::remove_dir_all(&work_dir);

        // Clear cancelled flag for this multi-step job
        {
            let mut cancelled = state_clone.cancelled_jobs.lock().await;
            cancelled.remove(&job_id);
        }

        match result {
            Ok(true) => {
                let _ = app_clone.emit(
                    "ffmpeg-complete",
                    CompletePayload {
                        job_id: job_id.to_string(),
                    },
                );
            }
            Ok(false) => {
                // Cancelled — event already emitted by cancel_process
                log::info!("multi_cut stream-copy job {} cancelled", job_id);
            }
            Err(e) => {
                let _ = app_clone.emit(
                    "ffmpeg-error",
                    ErrorPayload {
                        job_id: job_id.to_string(),
                        error: e,
                    },
                );
            }
        }
    });

    Ok(job_id.to_string())
}

async fn run_multi_cut_copy_pipeline(
    input: &str,
    output: &str,
    segments: &[Segment],
    job_id: Uuid,
    total_duration: f64,
    work_dir: &Path,
    app: AppHandle,
    state: AppState,
) -> Result<bool, String> {
    let mut segment_files: Vec<String> = Vec::new();
    let mut elapsed_before = 0.0_f64;

    for (i, seg) in segments.iter().enumerate() {
        if is_cancelled(&state, job_id).await {
            return Ok(false);
        }

        let seg_path = work_dir.join(format!("seg_{:04}.mp4", i));
        let seg_path_str = seg_path.to_string_lossy().to_string();
        let dur = seg.end_time - seg.start_time;

        // Input seek + stream copy — preserves original quality (keyframe-aligned).
        let args = vec![
            "-ss".to_string(),
            seg.start_time.to_string(),
            "-i".to_string(),
            input.to_string(),
            "-t".to_string(),
            dur.to_string(),
            "-c".to_string(),
            "copy".to_string(),
            "-avoid_negative_ts".to_string(),
            "make_zero".to_string(),
            "-y".to_string(),
            seg_path_str.clone(),
        ];

        // Progress duration is total output; offset isn't supported in monitor, so use segment
        // duration so percent still advances roughly.
        let ok = run_registered_ffmpeg(
            args,
            job_id,
            total_duration.max(dur),
            app.clone(),
            state.clone(),
            None,
            false, // intermediate — no complete/error
        )
        .await?;

        if is_cancelled(&state, job_id).await {
            return Ok(false);
        }
        if !ok {
            return Err(format!(
                "Failed to extract segment {} ({}s–{}s) with stream copy",
                i + 1,
                seg.start_time,
                seg.end_time
            ));
        }

        // Synthetic progress pulse between segments
        let elapsed_before_next = elapsed_before + dur;
        let percent = if total_duration > 0.0 {
            (elapsed_before_next / total_duration * 95.0).min(95.0)
        } else {
            0.0
        };
        let _ = app.emit(
            "ffmpeg-progress",
            crate::commands::process::ProgressPayload {
                job_id: job_id.to_string(),
                seconds: elapsed_before_next,
                percent,
            },
        );
        elapsed_before = elapsed_before_next;

        segment_files.push(seg_path_str);
    }

    if is_cancelled(&state, job_id).await {
        return Ok(false);
    }

    let list_path = work_dir.join("concat_list.txt");
    write_concat_list(&list_path, &segment_files)
        .map_err(|e| format!("Failed to write concat list: {}", e))?;

    let args = vec![
        "-f".to_string(),
        "concat".to_string(),
        "-safe".to_string(),
        "0".to_string(),
        "-i".to_string(),
        list_path.to_string_lossy().to_string(),
        "-c".to_string(),
        "copy".to_string(),
        "-y".to_string(),
        output.to_string(),
    ];

    let ok = run_registered_ffmpeg(
        args,
        job_id,
        total_duration.max(1.0),
        app,
        state.clone(),
        None,
        false,
    )
    .await?;

    if is_cancelled(&state, job_id).await {
        return Ok(false);
    }
    if !ok {
        return Err("Failed to concat stream-copied segments".to_string());
    }

    Ok(true)
}

async fn multi_cut_reencode(
    params: MultiCutMergeParams,
    job_id: Uuid,
    app: AppHandle,
    state: AppState,
) -> Result<String, String> {
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
    let crf_value = params.crf.unwrap_or(8);
    args.push("-crf".to_string());
    args.push(crf_value.to_string());
    args.push("-y".to_string());
    args.push(params.output_file.clone());

    log::info!("multi_cut_merge reencode: ffmpeg args: {:?}", args);

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

    let total_duration: f64 = params
        .segments
        .iter()
        .map(|s| s.end_time - s.start_time)
        .sum();

    let app_clone = app.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        monitor_ffmpeg_progress(stderr, job_id, total_duration, app_clone, state_clone, None, true)
            .await;
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

    // Probe all inputs for stream-copy eligibility (quality-first).
    let mut profiles: Vec<StreamProfile> = Vec::new();
    for file in &params.input_files {
        match probe_stream_profile(file).await {
            Ok(p) => profiles.push(p),
            Err(e) => {
                log::warn!(
                    "Could not probe {}: {} — falling back to re-encode",
                    file,
                    e
                );
                profiles.clear();
                break;
            }
        }
    }

    let can_copy = !profiles.is_empty() && profiles_compatible_for_copy(&profiles);
    log::info!(
        "merge_videos: stream-copy eligible = {} ({} inputs)",
        can_copy,
        params.input_files.len()
    );

    let list_path = std::env::temp_dir().join(format!("ffmpeg_concat_list_{}.txt", job_id));
    write_concat_list(&list_path, &params.input_files)
        .map_err(|e| format!("Failed to write concat list: {}", e))?;

    let args = if can_copy {
        // Preserve original quality — concat demuxer + stream copy.
        vec![
            "-f".to_string(),
            "concat".to_string(),
            "-safe".to_string(),
            "0".to_string(),
            "-i".to_string(),
            list_path.to_string_lossy().to_string(),
            "-c".to_string(),
            "copy".to_string(),
            "-y".to_string(),
            params.output_file.clone(),
        ]
    } else {
        // Incompatible streams — re-encode. Prefer first file's resolution when known;
        // fall back to 1920x1080. Keep source fps when possible (no forced fps=30).
        let (tw, th) = profiles
            .first()
            .map(|p| (p.width.max(1), p.height.max(1)))
            .unwrap_or((1920, 1080));

        let mut all_have_audio = true;
        for file in &params.input_files {
            if !check_audio_stream(file).await {
                all_have_audio = false;
                break;
            }
        }

        let mut args: Vec<String> = vec![
            "-f".to_string(),
            "concat".to_string(),
            "-safe".to_string(),
            "0".to_string(),
            "-i".to_string(),
            list_path.to_string_lossy().to_string(),
            "-vf".to_string(),
            format!(
                "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1",
                w = tw,
                h = th
            ),
            "-c:v".to_string(),
            "libx264".to_string(),
        ];
        let crf_value = params.crf.unwrap_or(8);
        args.push("-crf".to_string());
        args.push(crf_value.to_string());

        if all_have_audio {
            args.push("-c:a".to_string());
            args.push("aac".to_string());
        } else {
            args.push("-an".to_string());
        }

        args.push("-y".to_string());
        args.push(params.output_file.clone());
        args
    };

    log::info!("merge_videos: ffmpeg args: {:?}", args);

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

    register_job(state.inner(), job_id, child).await?;

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
    let cleanup = list_path.clone();
    tokio::spawn(async move {
        monitor_ffmpeg_progress(
            stderr,
            job_id,
            total_duration,
            app_clone,
            state_clone,
            Some(cleanup),
            true,
        )
        .await;
    });

    Ok(job_id.to_string())
}

async fn is_cancelled(state: &AppState, job_id: Uuid) -> bool {
    let cancelled = state.cancelled_jobs.lock().await;
    cancelled.contains(&job_id)
}

/// Write an ffmpeg concat demuxer list file. Paths are single-quoted with `'` escaped as `'\''`;
/// backslashes are normalised to forward slashes so the demuxer does not interpret them as
/// escapes (a Windows-specific hazard).
fn write_concat_list(path: &Path, files: &[String]) -> std::io::Result<()> {
    let mut content = String::new();
    for f in files {
        let normalized = f.replace('\\', "/").replace('\'', "'\\''");
        content.push_str(&format!("file '{}'\n", normalized));
    }
    std::fs::write(path, content)
}

/// Check if a video file has an audio stream using ffprobe
async fn check_audio_stream(file_path: &str) -> bool {
    let mut command = Command::new("ffprobe");
    command.args(&[
        "-v", "quiet",
        "-select_streams", "a",
        "-show_entries", "stream=codec_type",
        "-of", "csv=p=0",
        file_path,
    ]);
    apply_no_window(&mut command);

    let output = command.output().await;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_concat_list_escapes_quotes_and_backslashes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("list.txt");
        write_concat_list(
            &path,
            &[
                r"C:\Videos\file.mp4".to_string(),
                r"D:\My Videos\O'Brien.mp4".to_string(),
            ],
        )
        .unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("file 'C:/Videos/file.mp4'"));
        assert!(content.contains("file 'D:/My Videos/O'\\''Brien.mp4'"));
    }
}
