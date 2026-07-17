use std::sync::LazyLock;
use regex::Regex;

// Compile the ffmpeg time regex exactly once. `Regex::new` is expensive (NFA build + bytecode
// generation + heap allocs); calling it per stderr line saturates a CPU core for the entire
// duration of a job. Requires Rust ≥1.80 for `LazyLock`.
static TIME_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"time=(\d+):(\d+):(\d+\.?\d*)").unwrap()
});

pub fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    TIME_REGEX.captures(line).map(|captures| {
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
