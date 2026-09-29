mod commands;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::StorageState::beside_executable())
        .invoke_handler(tauri::generate_handler![
            commands::load_current_tournament,
            commands::save_tournament,
            commands::list_tournaments,
            commands::export_backup,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar Picanha Tournament");
}
