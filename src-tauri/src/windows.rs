// SafTerm — Window/Tab management commands
//
// These implement the workspace/tab management that was previously
// handled by Electron's BrowserWindow API. In Tauri, each window is
// a WebviewWindow. Workspaces are React-side concepts managed via WOS.

use std::sync::atomic::AtomicU32;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// ── Window State ──────────────────────────────────────────────────
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

// ── Commands ─────────────────────────────────────────────────────

#[tauri::command]
pub fn open_new_window(app: tauri::AppHandle) -> Result<String, String> {
    let n = WINDOW_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let label = format!("workspace-{}", n);

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(format!("SafTerm - Workspace {}", n))
        .inner_size(1200.0, 800.0)
        .min_inner_size(600.0, 400.0)
        .build()
        .map_err(|e| format!("open window: {}", e))?;

    Ok(label)
}

#[tauri::command]
pub fn close_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close();
    }
    Ok(())
}

#[tauri::command]
pub fn get_window_labels(app: tauri::AppHandle) -> Vec<String> {
    app.webview_windows().keys().cloned().collect()
}

#[tauri::command]
pub fn maximize_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.maximize().map_err(|e| format!("maximize: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| format!("minimize: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn fullscreen_window(app: tauri::AppHandle, fullscreen: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_fullscreen(fullscreen)
            .map_err(|e| format!("fullscreen: {}", e))?;
    }
    Ok(())
}