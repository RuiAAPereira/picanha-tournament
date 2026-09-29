mod commands;
mod presentation;
pub mod storage;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::StorageState::beside_executable())
        .manage(presentation::PresentationStore::default())
        .on_window_event(|window, event| {
            if window.label() == "operator" && matches!(event, WindowEvent::Destroyed) {
                presentation::close_with_operator(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_current_tournament,
            commands::save_tournament,
            commands::list_tournaments,
            commands::export_backup,
            presentation::open_presentation_window,
            presentation::publish_presentation_state,
            presentation::get_presentation_state,
            presentation::skip_presentation,
            presentation::set_presentation_muted,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar Picanha Tournament");
}
