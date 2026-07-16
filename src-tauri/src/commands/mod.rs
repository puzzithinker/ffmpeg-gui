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

#[cfg(windows)]
fn apply_no_window_std(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

/// Kill a process and its children. Used by cancel and exit cleanup so ffmpeg cannot outlive
/// the UI after Stop is clicked (or after the Child handle has already been taken for wait).
///
/// - Windows: `taskkill /F /T /PID` (tree kill, CREATE_NO_WINDOW).
/// - Unix: `kill -KILL` on the pid.
///
/// Idempotent: returns Ok if the process is already gone.
pub fn kill_process_tree(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Ok(());
    }

    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
        apply_no_window_std(&mut cmd);
        match cmd.output() {
            Ok(out) => {
                // taskkill exit code 128 / 1 often means "not found" — treat as success for cancel.
                if out.status.success() {
                    log::info!("kill_process_tree: taskkill succeeded for pid {}", pid);
                    Ok(())
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    let combined = format!("{}{}", stdout, stderr).to_lowercase();
                    if combined.contains("not found")
                        || combined.contains("no running instance")
                        || combined.contains("not running")
                    {
                        Ok(())
                    } else {
                        log::warn!(
                            "kill_process_tree: taskkill pid {} status {:?}: {}",
                            pid,
                            out.status.code(),
                            combined.trim()
                        );
                        // Still Ok — process may already be dead; cancel should not fail the UI.
                        Ok(())
                    }
                }
            }
            Err(e) => {
                log::warn!("kill_process_tree: failed to spawn taskkill for pid {}: {}", pid, e);
                Err(format!("Failed to kill process {}: {}", pid, e))
            }
        }
    }

    #[cfg(not(windows))]
    {
        // libc::kill would need a dep; use the kill binary which is always present on our targets.
        match std::process::Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .output()
        {
            Ok(out) => {
                if out.status.success() {
                    log::info!("kill_process_tree: kill -KILL succeeded for pid {}", pid);
                    Ok(())
                } else {
                    // ESRCH / not found → already dead
                    Ok(())
                }
            }
            Err(e) => Err(format!("Failed to kill process {}: {}", pid, e)),
        }
    }
}
