// SafTerm — Tauri application
//
// Replaces emain/*.ts with a native Rust shell.

mod appcommands;
mod commands;
mod filesystem;
mod screenshot;
mod windows;

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use commands::WavesrvState;
use tauri::Manager;

fn find_wavesrv(resource_dir: &PathBuf) -> PathBuf {
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    let candidates: Vec<PathBuf> = vec![
        resource_dir.join("dist").join("bin").join(format!("wavesrv.{}", arch)),
        PathBuf::from("dist/bin").join(format!("wavesrv.{}", arch)),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("dist")
            .join("bin")
            .join(format!("wavesrv.{}", arch)),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }
    candidates[0].clone()
}

fn spawn_wavesrv(app_handle: &tauri::AppHandle) -> Result<Child, String> {
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let wavesrv_path = find_wavesrv(&resource_dir);

    #[cfg(unix)]
    {
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
        .unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {}", e))?;

    let log_path = data_dir.join("tauri-wavesrv.log");
    let mut log_file = fs::File::create(&log_path).map_err(|e| format!("log file: {}", e))?;
    writeln!(log_file, "wavesrv path: {:?}", wavesrv_path).unwrap();

    let child = Command::new(&wavesrv_path)
        .env("WAVETERM_DATA_DIR", data_dir.to_string_lossy().to_string())
        .spawn()
        .map_err(|e| format!("spawn wavesrv ({}): {}", wavesrv_path.display(), e))?;

    eprintln!("[tauri] wavesrv pid={} path={}", child.id(), wavesrv_path.display());
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let wavesrv_handle: Mutex<Option<Child>> = Mutex::new(None);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(WavesrvState {
            is_ready: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            windows::open_new_window,
            windows::close_window,
            windows::get_window_labels,
            windows::maximize_window,
            windows::minimize_window,
            windows::fullscreen_window,
            commands::get_is_dev,
            commands::get_platform,
            commands::get_home_dir,
            commands::get_data_dir,
            commands::get_config_dir,
            commands::get_env,
            commands::get_user_name,
            commands::get_host_name,
            commands::browse_folder,
            filesystem::download_file,
            filesystem::save_text_file,
            filesystem::open_native_path,
            filesystem::get_path_for_file,
            appcommands::native_paste,
            appcommands::do_refresh,
            appcommands::set_keyboard_chord_mode,
            appcommands::increment_term_commands,
            appcommands::clear_webview_storage,
            screenshot::capture_screenshot,
            commands::open_external,
            commands::set_window_title,
        ])
        .setup(move |app| {
            let child = spawn_wavesrv(app.handle())?;
            *wavesrv_handle.lock().unwrap() = Some(child);

            if let Some(main_window) = app.handle().get_webview_window("main") {
                main_window.set_title("SafTerm").unwrap();
            }

            Ok(())
        })
        .run(context)
        .expect("error while running tauri application");
}