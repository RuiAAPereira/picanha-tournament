/// Every app command; each gets `allow-<command>` / `deny-<command>` permissions, granted per window in
/// `capabilities/`. Keep in step with `generate_handler!` in src/lib.rs.
const COMMANDS: &[&str] = &[
    "load_current_tournament",
    "save_tournament",
    "list_tournaments",
    "export_backup",
    "open_presentation_window",
    "publish_presentation_state",
    "get_presentation_state",
    "skip_presentation",
    "set_presentation_muted",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
