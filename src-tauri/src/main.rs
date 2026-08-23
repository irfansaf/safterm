// SafTerm — Tauri main entry point
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    safterm_lib::run();
}