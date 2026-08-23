// SafTerm — File system commands
//
// File dialogs, save, download operations that were handled by
// Electron's dialog.showSaveDialog / shell.downloadFile.

use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn download_file(_app: tauri::AppHandle, path: String) -> Result<(), String> {
    // pony tail: for now just verify the file exists.
    // A full implementation would copy to ~/Downloads or use
    // the platform's download API.
    let pb = PathBuf::from(&path);
    if pb.exists() {
        Ok(())
    } else {
        Err(format!("file not found: {}", path))
    }
}

#[tauri::command]
pub async fn save_text_file(
    _app: tauri::AppHandle,
    file_name: Option<String>,
    content: String,
) -> Result<Option<String>, String> {
    let default_name = file_name.unwrap_or_else(|| "session.log".into());
    let dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    let saved = rfd::AsyncFileDialog::new()
        .set_title("Save File")
        .set_file_name(&default_name)
        .set_directory(&dir)
        .save_file()
        .await;

    match saved {
        Some(file) => {
            let path = file.path().to_path_buf();
            fs::write(&path, content).map_err(|e| format!("write: {}", e))?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn open_native_path(_app: tauri::AppHandle, path: String) -> Result<(), String> {
    let _ = opener::open(&path);
    Ok(())
}

#[tauri::command]
pub fn get_path_for_file(path: Option<String>) -> Result<String, String> {
    // In Electron this comes from webUtils.getPathForFile().
    // For Tauri frontend, the File object path is available directly.
    Ok(path.unwrap_or_default())
}