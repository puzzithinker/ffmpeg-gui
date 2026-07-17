use crate::commands::kill_process_tree;
use crate::state::AppState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use super::types::CompletePayload;

pub(crate) async fn is_job_cancelled(state: &AppState, job_id: Uuid) -> bool {
    let cancelled = state.cancelled_jobs.lock().await;
    cancelled.contains(&job_id)
}

/// Kill a single job by id. Always attempts PID tree kill so this works even if the monitor
/// already took the Child out of `active_jobs` for wait.
#[tauri::command]
pub async fn cancel_process(job_id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let uuid = Uuid::parse_str(&job_id).map_err(|_| "Invalid job ID".to_string())?;
    cancel_job_inner(uuid, &app, state.inner()).await
}

/// Kill every active job. Used when the UI has `isProcessing` but no job id yet (race between
/// Start and the first progress event / invoke return).
#[tauri::command]
pub async fn cancel_all_processes(app: AppHandle, state: State<'_, AppState>) -> Result<u32, String> {
    let ids: Vec<Uuid> = {
        let pids = state.job_pids.lock().await;
        pids.keys().copied().collect()
    };

    if ids.is_empty() {
        // Still try active_jobs in case pid registry is empty but a child exists.
        let ids_from_jobs: Vec<Uuid> = {
            let jobs = state.active_jobs.lock().await;
            jobs.keys().copied().collect()
        };
        if ids_from_jobs.is_empty() {
            return Ok(0);
        }
        for id in ids_from_jobs {
            let _ = cancel_job_inner(id, &app, state.inner()).await;
        }
        return Ok(1);
    }

    let count = ids.len() as u32;
    for id in ids {
        let _ = cancel_job_inner(id, &app, state.inner()).await;
    }
    Ok(count)
}

async fn cancel_job_inner(uuid: Uuid, app: &AppHandle, state: &AppState) -> Result<(), String> {
    // Mark cancelled first so the monitor suppresses complete/error events.
    {
        let mut cancelled = state.cancelled_jobs.lock().await;
        cancelled.insert(uuid);
    }

    // Prefer start_kill on the live Child if still in the map (do NOT remove — monitor reaps).
    let pid_from_child = {
        let mut jobs = state.active_jobs.lock().await;
        if let Some(job) = jobs.get_mut(&uuid) {
            job.cancelled.store(true, Ordering::SeqCst);
            let pid = job.pid;
            if let Err(e) = job.child.start_kill() {
                log::warn!("start_kill failed for job {}: {}", uuid, e);
            } else {
                log::info!("start_kill issued for job {} pid {}", uuid, pid);
            }
            Some(pid)
        } else {
            None
        }
    };

    // Always kill by PID (process tree) — works after Child was taken for wait, and covers
    // cases where start_kill failed or only killed a wrapper.
    let pid = {
        let pids = state.job_pids.lock().await;
        pids.get(&uuid).copied().or(pid_from_child)
    };

    if let Some(pid) = pid {
        if let Err(e) = kill_process_tree(pid) {
            log::warn!("kill_process_tree failed for job {} pid {}: {}", uuid, pid, e);
        }
    } else {
        // No pid and no child — job already finished. Still emit cancelled so UI clears.
        log::warn!("cancel_job_inner: no pid/child for job {} (may already have exited)", uuid);
    }

    let _ = app.emit(
        "ffmpeg-cancelled",
        CompletePayload {
            job_id: uuid.to_string(),
        },
    );

    Ok(())
}

