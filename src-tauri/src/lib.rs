mod commands;
mod state;

use state::AppState;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::dialog::select_video_file,
            commands::dialog::select_subtitle_file,
            commands::dialog::select_output_file,
            commands::video::get_duration,
            commands::video::check_ffmpeg_availability,
            commands::process::process_video,
            commands::process::cancel_process,
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
        // orphaned processes (which compound system load toward instability). `start_kill` is
        // synchronous (SIGKILL/terminate) — safe to call from this sync handler. `try_lock`
        // avoids deadlocking if a monitor task happens to hold the mutex at exit.
        if let RunEvent::Exit = event {
            // Clone the Arc<Mutex> out of state to break the borrow from `app_handle.state()`
            // before locking — the State wrapper is a temporary that would otherwise be dropped
            // while the guard is still live. `.ok()` materialises the guard into a named local so
            // its drop order is well-defined relative to `active_jobs`.
            let active_jobs = app_handle.state::<AppState>().active_jobs.clone();
            let jobs_guard = active_jobs.try_lock().ok();
            if let Some(mut jobs) = jobs_guard {
                for (id, mut job) in jobs.drain() {
                    match job.child.start_kill() {
                        Ok(()) => log::info!("Killed orphaned ffmpeg job {} on app exit", id),
                        Err(e) => log::warn!("Failed to kill orphaned ffmpeg job {} on exit: {}", id, e),
                    }
                }
            } else {
                log::warn!("Could not acquire job lock on exit; orphaned ffmpeg processes may remain");
            }
        }
    });
}
