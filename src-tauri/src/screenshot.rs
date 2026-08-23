// SafTerm — Screenshot capture (stub)
//
// pony tail: Tauri v2 screenshot API requires the `unstable` feature
// and may not be available on all platforms. For now, return empty.
// Replace with actual implementation when Tauri v3 stabilizes the API.

#[tauri::command]
pub async fn capture_screenshot(
    _app: tauri::AppHandle,
    _rect: Option<serde_json::Value>,
) -> Result<String, String> {
    // Return a 1x1 transparent PNG as base64.
    // The frontend already handles the empty case gracefully.
    Ok("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==".into())
}