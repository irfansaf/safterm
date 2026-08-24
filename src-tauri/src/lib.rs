// SafTerm — Tauri application

mod appcommands;
mod commands;
mod filesystem;
mod screenshot;
mod windows;

use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};

use commands::{WavesrvEndpoint, WavesrvState};
use tauri::{Emitter, Manager};

fn find_wavesrv(resource_dir: &PathBuf) -> PathBuf {
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    let candidates: Vec<PathBuf> = vec![
        resource_dir.join("dist").join("bin").join(format!("wavesrv.{}", arch)),
        PathBuf::from("dist/bin").join(format!("wavesrv.{}", arch)),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("dist").join("bin").join(format!("wavesrv.{}", arch)),
    ];
    for c in &candidates { if c.exists() { return c.clone(); } }
    candidates[0].clone()
}

fn spawn_wavesrv(
    app_handle: &tauri::AppHandle,
    endpoint_store: Arc<Mutex<Option<WavesrvEndpoint>>>,
) -> Result<Child, String> {
    let resource_dir = app_handle.path().resource_dir().unwrap_or_else(|_| PathBuf::from("."));
    let wavesrv_path = find_wavesrv(&resource_dir);

    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(&wavesrv_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&wavesrv_path, perms);
        }
    }

    let data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("tauri-dev");
    fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {}", e))?;
    let app_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("dist");

    let mut cmd = Command::new(&wavesrv_path);
    cmd.env("WAVETERM_DATA_DIR", data_dir.to_string_lossy().to_string())
       .env("WAVETERM_DEV", "1")
       .env("WCLOUD_PING_ENDPOINT", "https://ping-dev.waveterm.dev/central")
       .env("WCLOUD_ENDPOINT", "https://api-dev.waveterm.dev/central")
       .env("WCLOUD_WS_ENDPOINT", "wss://wsapi-dev.waveterm.dev")
       .env("WAVETERM_NOCONFIRMQUIT", "1")
       .env("WAVETERM_AUTH_KEY", "tauri-dev-auth-key-00000000")
       .env("WAVETERM_CONFIG_HOME", data_dir.to_string_lossy().to_string())
       .env("WAVETERM_DATA_HOME", data_dir.to_string_lossy().to_string())
       .env("WAVETERM_APP_PATH", app_path.to_string_lossy().to_string())
       .env("WAVETERM_RESOURCES_PATH", app_path.to_string_lossy().to_string());

    // Also pass any vars from project .env file
    if let Ok(env_content) = fs::read_to_string(".env") {
        for line in env_content.lines() {
            if let Some((k, v)) = line.split_once('=') {
                let k = k.trim();
                let v = v.trim().trim_matches('"').trim_matches('\'');
                if !k.is_empty() && !k.starts_with('#') {
                    cmd.env(k, v);
                }
            }
        }
    }

    let mut child = cmd
        .env("WAVETERM_DATA_DIR", data_dir.to_string_lossy().to_string())
        .env("WAVETERM_DEV", "1")
        .env("WCLOUD_PING_ENDPOINT", "https://ping-dev.waveterm.dev/central")
        .env("WCLOUD_ENDPOINT", "https://api-dev.waveterm.dev/central")
        .env("WCLOUD_WS_ENDPOINT", "wss://wsapi-dev.waveterm.dev")
        .env("WAVETERM_NOCONFIRMQUIT", "1")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn wavesrv ({}): {}", wavesrv_path.display(), e))?;

    let stderr = child.stderr.take().expect("stderr");
    let app_clone = app_handle.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut init_ids: Option<(String, String, String)> = None;
        for line in BufReader::new(stderr).lines() {
            if let Ok(line) = line {
                eprintln!("[wavesrv] {}", line);
                if line.contains("WAVESRV-INIT") {
                    let mut client = String::new();
                    let mut window = String::new();
                    let mut tab = String::new();
                    for part in line.split_whitespace() {
                        if let Some(value) = part.strip_prefix("client:") { client = value.to_string(); }
                        if let Some(value) = part.strip_prefix("window:") { window = value.to_string(); }
                        if let Some(value) = part.strip_prefix("tab:") { tab = value.to_string(); }
                    }
                    if !client.is_empty() && !window.is_empty() && !tab.is_empty() {
                        init_ids = Some((client, window, tab));
                    }
                }
                if line.contains("WAVESRV-ESTART") {
                    let mut ws = String::new();
                    let mut web = String::new();
                    for part in line.split_whitespace() {
                        if let Some(a) = part.strip_prefix("ws:") { ws = a.to_string(); }
                        if let Some(a) = part.strip_prefix("web:") { web = a.to_string(); }
                    }
                    if !ws.is_empty() {
                        let (client_id, window_id, tab_id) = init_ids.clone()
                            .map(|(client, window, tab)| (Some(client), Some(window), Some(tab)))
                            .unwrap_or((None, None, None));
                        if let Ok(mut endpoint) = endpoint_store.lock() {
                            *endpoint = Some(WavesrvEndpoint {
                                ws: ws.clone(),
                                web: web.clone(),
                                client_id,
                                window_id,
                                tab_id,
                            });
                        }
                        let app_for_ready = app_clone.clone();
                        let init_for_ready = init_ids.clone();
                        std::thread::spawn(move || {
                            for _ in 0..30 {
                                std::thread::sleep(std::time::Duration::from_millis(250));
                                if app_for_ready.get_webview_window("main").is_some() {
                                    let js = format!(
                                        "window.__SAFTERM_ENV = {{ WAVE_SERVER_WS_ENDPOINT:'{}', WAVE_SERVER_WEB_ENDPOINT:'{}' }}; if(window.__safTermReady) window.__safTermReady();",
                                        ws, web
                                    );
                                    let app_for_main = app_for_ready.clone();
                                    let ws_log = ws.clone();
                                    let web_log = web.clone();
                                    let ws_event = ws.clone();
                                    let web_event = web.clone();
                                    match app_for_ready.run_on_main_thread(move || {
                                        let _ = app_for_main.emit(
                                            "wavesrv-ready",
                                            serde_json::json!({
                                                "ws": ws_event,
                                                "web": web_event,
                                                "clientId": init_for_ready.as_ref().map(|v| v.0.clone()),
                                                "windowId": init_for_ready.as_ref().map(|v| v.1.clone()),
                                                "tabId": init_for_ready.as_ref().map(|v| v.2.clone()),
                                            }),
                                        );
                                        if let Some(w) = app_for_main.get_webview_window("main") {
                                            match w.eval(&js) {
                                                Ok(()) => eprintln!("[tauri] injected ws={} web={}", ws_log, web_log),
                                                Err(err) => eprintln!("[tauri] endpoint injection failed: {}", err),
                                            }
                                        }
                                    }) {
                                        Ok(()) => {}
                                        Err(err) => eprintln!("[tauri] main-thread injection failed: {}", err),
                                    }
                                    break;
                                }
                            }
                        });
                    }
                    continue;
                }
            }
        }
    });

    eprintln!("[tauri] wavesrv pid={} path={}", child.id(), wavesrv_path.display());
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(WavesrvState {
            is_ready: Mutex::new(false),
            endpoint: Arc::new(Mutex::new(None)),
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            windows::open_new_window, windows::close_window, windows::get_window_labels,
            windows::maximize_window, windows::minimize_window, windows::fullscreen_window,
            commands::get_is_dev, commands::get_platform, commands::get_home_dir,
            commands::get_data_dir, commands::get_config_dir, commands::get_env,
            commands::get_wavesrv_endpoint,
            commands::get_user_name, commands::get_host_name, commands::browse_folder,
            filesystem::download_file, filesystem::save_text_file, filesystem::open_native_path,
            filesystem::get_path_for_file, appcommands::native_paste, appcommands::do_refresh,
            appcommands::set_keyboard_chord_mode, appcommands::increment_term_commands,
            appcommands::clear_webview_storage, screenshot::capture_screenshot,
            commands::open_external, commands::set_window_title,
        ])
        .setup(move |app| {
            let endpoint_store = app.state::<WavesrvState>().endpoint.clone();
            let child = spawn_wavesrv(app.handle(), endpoint_store)?;
            *app.state::<WavesrvState>().child.lock().unwrap() = Some(child);
            let monitor_app = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(1));
                let state = monitor_app.state::<WavesrvState>();
                let mut child = state.child.lock().unwrap();
                if let Some(process) = child.as_mut() {
                    match process.try_wait() {
                        Ok(Some(status)) => {
                            eprintln!("[tauri] wavesrv exited: {}", status);
                            break;
                        }
                        Ok(None) => {}
                        Err(err) => {
                            eprintln!("[tauri] wavesrv status error: {}", err);
                            break;
                        }
                    }
                } else {
                    break;
                }
            });
            if let Some(w) = app.handle().get_webview_window("main") {
                w.set_title("SafTerm").unwrap();
            }
            Ok(())
        })
        .run(context)
        .expect("error while running tauri application");
}