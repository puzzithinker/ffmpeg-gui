use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn select_video_file(app: AppHandle) -> Result<Option<String>, String> {
    let file_path = app.dialog()
        .file()
        .add_filter("Video Files", &["mp4", "avi", "mov", "mkv", "webm", "flv"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    Ok(file_path.map(|p| p.as_path().unwrap().to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn select_subtitle_file(app: AppHandle) -> Result<Option<String>, String> {
    let file_path = app.dialog()
        .file()
        .add_filter("Subtitle Files", &["srt", "vtt", "ass", "ssa"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    Ok(file_path.map(|p| p.as_path().unwrap().to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn select_output_file(app: AppHandle) -> Result<Option<String>, String> {
    let file_path = app.dialog()
        .file()
        .add_filter("Video Files", &["mp4", "avi", "mov", "mkv"])
        .add_filter("All Files", &["*"])
        .blocking_save_file();

    Ok(file_path.map(|p| p.as_path().unwrap().to_string_lossy().to_string()))
}
