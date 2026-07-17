mod commands;
mod state;

use commands::kill_process_tree;
use state::AppState;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // File pickers live in the frontend via @tauri-apps/plugin-dialog (not Rust IPC).
            commands::video::get_duration,
            commands::video::check_ffmpeg_availability,
            // Command macros live on the defining modules (re-exports omit __cmd__ helpers).
            commands::process::command::process_video,
            commands::process::cancel::cancel_process,
            commands::process::cancel::cancel_all_processes,
            commands::logging::write_frontend_log,
            commands::logging::get_log_file_path,
            commands::merge::multi_cut_merge,
            commands::merge::merge_videos,
            commands::subtitle::read_subtitle_file,
            commands::subtitle::write_subtitle_file,
            commands::subtitle::write_temp_subtitle,
        ])
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            log::info!("FFmpeg GUI starting up...");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // On exit, kill any still-running ffmpeg children so they don't outlive the app as
        // orphaned processes (which compound system load toward instability).
        if let RunEvent::Exit = event {
            let state = app_handle.state::<AppState>();

            // Prefer PID tree kill — works even if a monitor task holds the job mutex.
            let pids: Vec<(uuid::Uuid, u32)> = {
                if let Ok(pids) = state.job_pids.try_lock() {
                    pids.iter().map(|(id, pid)| (*id, *pid)).collect()
                } else {
                    Vec::new()
                }
            };
            for (id, pid) in &pids {
                match kill_process_tree(*pid) {
                    Ok(()) => log::info!("Killed orphaned ffmpeg job {} (pid {}) on app exit", id, pid),
                    Err(e) => log::warn!("Failed to kill job {} pid {} on exit: {}", id, pid, e),
                }
            }

            // Also start_kill any Children still in the map (best-effort; try_lock avoids deadlock).
            // Clone the Arc out of state so the temporary State borrow ends before we lock.
            let active_jobs = state.active_jobs.clone();
            let jobs_guard = active_jobs.try_lock().ok();
            if let Some(mut jobs) = jobs_guard {
                for (id, mut job) in jobs.drain() {
                    match job.child.start_kill() {
                        Ok(()) => log::info!("start_kill on orphaned job {} on app exit", id),
                        Err(e) => log::warn!("start_kill failed for job {} on exit: {}", id, e),
                    }
                }
            } else if pids.is_empty() {
                log::warn!("Could not acquire job lock on exit; orphaned ffmpeg processes may remain");
            }
        }
    });
}
