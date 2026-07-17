use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoParams {
    pub input_file: String,
    pub output_file: String,
    pub start_time: Option<f64>,
    pub end_time: Option<f64>,
    pub subtitle_file: Option<String>,
    pub subtitle_font: Option<String>,
    pub subtitle_font_size: Option<u32>,
    pub brightness: Option<f64>,
    pub crop_width: Option<u32>,
    pub crop_height: Option<u32>,
    pub crop_x: Option<u32>,
    pub crop_y: Option<u32>,
    pub quality_mode: Option<String>,
    pub crf: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProgressPayload {
    pub job_id: String,
    pub seconds: f64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompletePayload {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub job_id: String,
    pub error: String,
}
