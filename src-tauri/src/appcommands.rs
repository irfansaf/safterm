use tauri::Manager;
// SafTerm — Clipboard and app-level commands
//
// Handles native paste, clipboard operations, and app control.

#[tauri::command]
pub fn native_paste(_app: tauri::AppHandle) -> Result<(), String> {
    // pony tail: Tauri doesn't have a direct "paste to focused element" API.
    // The frontend handles paste events via standard DOM events.
    // This command exists for symmetry with the Electron API.
    Ok(())
}

#[tauri::command]
pub fn do_refresh(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .eval("location.reload()")
            .map_err(|e| format!("refresh: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_keyboard_chord_mode(_app: tauri::AppHandle) -> Result<(), String> {
    // No-op: keyboard chord detection is handled via DOM events in the frontend.
    Ok(())
}

#[tauri::command]
pub fn increment_term_commands(
    _app: tauri::AppHandle,
    _opts: Option<serde_json::Value>,
) -> Result<(), String> {
    // Telemetry / stat tracking — no-op in safTerm
    Ok(())
}

#[tauri::command]
pub fn clear_webview_storage(
    _app: tauri::AppHandle,
    _web_contents_id: Option<u32>,
) -> Result<(), String> {
    // Tauri doesn't support per-webview storage clearing.
    // The electron version used this to clear webview data.
    Ok(())
}