/// SafTerm — Tauri IPC commands
///
/// These #[tauri::command] functions are callable from the React frontend
/// via `invoke("command_name", { args })`. Each mirrors a handler from
/// the original Electron preload/IPC bridge.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

pub struct WavesrvState {
    pub is_ready: Mutex<bool>,
}

#[tauri::command]
pub fn create_new_window(app: tauri::AppHandle) -> Result<(), String> {
    let label = format!(
        "window-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title("SafTerm")
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| format!("create window: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_is_dev() -> bool {
    cfg!(debug_assertions)
}

#[tauri::command]
pub fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn get_home_dir() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle) -> String {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn get_config_dir(app: tauri::AppHandle) -> String {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub fn get_env(var_name: String) -> String {
    std::env::var(&var_name).unwrap_or_default()
}

#[tauri::command]
pub fn get_user_name() -> String {
    whoami::username()
}

#[tauri::command]
pub fn get_host_name() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn browse_folder(
    _app: tauri::AppHandle,
    title: Option<String>,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let default_dir = default_path
        .and_then(|p| PathBuf::from(p).parent().map(|d| d.to_path_buf()))
        .or_else(|| std::env::current_dir().ok());
    let result = rfd::FileDialog::new()
        .set_title(&title.unwrap_or_else(|| "Open Folder".into()))
        .set_directory(&default_dir.unwrap_or_else(|| PathBuf::from(".")))
        .pick_folder();
    Ok(result.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let _ = opener::open(&url);
    Ok(())
}

#[tauri::command]
pub fn set_window_title(app: tauri::AppHandle, title: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_title(&title).map_err(|e| format!("set title: {}", e))?;
    }
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_is_dev() {
        assert!(get_is_dev());
    }

    #[test]
    fn test_get_platform_not_empty() {
        let p = get_platform();
        assert!(!p.is_empty());
    }

    #[test]
    fn test_get_home_dir_not_empty() {
        assert!(!get_home_dir().is_empty());
    }

    #[test]
    fn test_get_env_default_is_empty() {
        assert_eq!(get_env("NONEXISTENT_VAR_XYZ".into()), "");
    }
}