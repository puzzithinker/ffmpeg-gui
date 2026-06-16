use std::fs;
use std::path::Path;
use tauri::Manager;

#[tauri::command]
pub fn read_subtitle_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_subtitle_file(
    app: tauri::AppHandle,
    content: String,
    original_path: Option<String>,
) -> Result<String, String> {
    let output_path = match original_path {
        Some(ref path) => {
            let original = Path::new(path);
            let stem = original
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("subtitle");
            let dir = original.parent().unwrap_or(Path::new("."));
            dir.join(format!("{}_edited.srt", stem))
                .to_string_lossy()
                .to_string()
        }
        None => {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            fs::create_dir_all(&dir)
                .map_err(|e| format!("Failed to create app data dir: {}", e))?;
            dir.join("subtitle_edited.srt")
                .to_string_lossy()
                .to_string()
        }
    };

    fs::write(&output_path, &content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(output_path)
}

#[tauri::command]
pub fn write_temp_subtitle(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let temp_path = dir.join("temp_subtitle.srt").to_string_lossy().to_string();

    fs::write(&temp_path, &content).map_err(|e| format!("Failed to write temp file: {}", e))?;

    Ok(temp_path)
}
