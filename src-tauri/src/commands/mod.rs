pub mod dialog;
pub mod video;
pub mod process;
pub mod logging;
pub mod merge;
pub mod subtitle;

// Suppress the console window that Windows allocates for every spawned child process when the
// parent uses `windows_subsystem = "windows"`. Must be applied to every ffmpeg/ffprobe spawn;
// omitting it causes per-spawn conhost.exe handle bursts that compound under load.
#[cfg(windows)]
pub fn apply_no_window(command: &mut tokio::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn apply_no_window(_command: &mut tokio::process::Command) {}
