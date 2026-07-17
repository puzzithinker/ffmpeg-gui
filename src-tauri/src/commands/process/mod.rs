//! FFmpeg job orchestration: spawn, progress monitor, cancel, and arg building.

mod types;
mod progress;
mod args;
pub mod cancel;
pub mod monitor;
pub mod command;

#[cfg(test)]
mod tests;

pub use types::{CompletePayload, ErrorPayload, ProcessVideoParams, ProgressPayload};
pub use progress::{calculate_progress_percentage, parse_ffmpeg_time};
pub use args::normalize_brightness;
pub use monitor::{monitor_ffmpeg_progress, register_job, run_registered_ffmpeg};

// Re-export for unit tests and internal use
#[cfg(test)]
pub(crate) use args::{build_ffmpeg_args, escape_subtitle_path, validate_inputs};
