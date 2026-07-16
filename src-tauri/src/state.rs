use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

pub struct ProcessJob {
    pub child: tokio::process::Child,
    pub job_id: Uuid,
    /// OS process id captured at spawn. Survives in `job_pids` after the Child is taken for wait,
    /// so cancel can still kill the process if the monitor already owns the Child.
    pub pid: u32,
    /// Set by cancel_process so the monitor does not emit complete/error after a deliberate kill.
    pub cancelled: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct AppState {
    /// Live children still available for `start_kill` / wait ownership transfer.
    pub active_jobs: Arc<Mutex<HashMap<Uuid, ProcessJob>>>,
    /// PID registry kept until the job is fully reaped. Cancel always consults this map so it
    /// works after the monitor has removed the Child for `wait()`.
    pub job_pids: Arc<Mutex<HashMap<Uuid, u32>>>,
    /// Job IDs that were cancelled (so monitor can suppress success/error events).
    pub cancelled_jobs: Arc<Mutex<std::collections::HashSet<Uuid>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            active_jobs: Arc::new(Mutex::new(HashMap::new())),
            job_pids: Arc::new(Mutex::new(HashMap::new())),
            cancelled_jobs: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
