use std::path::Path;
use super::types::ProcessVideoParams;

pub(crate) fn validate_inputs(params: &ProcessVideoParams) -> Result<(), String> {
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

pub(crate) fn build_ffmpeg_args(params: &ProcessVideoParams) -> Result<Vec<String>, String> {
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

        let crf_value = params.crf.unwrap_or(8);
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
pub(crate) fn escape_subtitle_path(path: &str) -> String {
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
