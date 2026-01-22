use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

pub struct ProcessJob {
    pub child: tokio::process::Child,
    pub job_id: Uuid,
}

#[derive(Clone)]
pub struct AppState {
    pub active_jobs: Arc<Mutex<HashMap<Uuid, ProcessJob>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            active_jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
