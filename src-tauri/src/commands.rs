use std::path::PathBuf;
use std::sync::Mutex;

use tauri::State;

use crate::storage::{
    Storage, StorageError, StorageErrorCode, TournamentSnapshot, TournamentSummary,
};

/// Lazily opened storage beside the executable. Opening is retried on the next
/// command if it failed (e.g. the folder was temporarily unwritable).
#[derive(Default)]
pub struct StorageState(Mutex<Option<Storage>>);

impl StorageState {
    fn with<T>(&self, f: impl FnOnce(&Storage) -> Result<T, StorageError>) -> Result<T, StorageError> {
        let mut guard = self
            .0
            .lock()
            .map_err(|_| StorageError::with_detail(StorageErrorCode::Unexpected, "storage lock poisoned"))?;
        if guard.is_none() {
            *guard = Some(Storage::open(&executable_dir()?)?);
        }
        f(guard.as_ref().expect("storage opened above"))
    }
}

fn executable_dir() -> Result<PathBuf, StorageError> {
    let exe = std::env::current_exe()?;
    exe.parent().map(PathBuf::from).ok_or_else(|| {
        StorageError::with_detail(StorageErrorCode::Unexpected, "executable has no parent directory")
    })
}

#[tauri::command]
pub fn load_current_tournament(
    storage: State<'_, StorageState>,
) -> Result<Option<TournamentSnapshot>, StorageError> {
    storage.with(Storage::load_current)
}

#[tauri::command]
pub fn save_tournament(
    storage: State<'_, StorageState>,
    snapshot: TournamentSnapshot,
) -> Result<(), StorageError> {
    storage.with(|s| s.save(&snapshot))
}

#[tauri::command]
pub fn list_tournaments(
    storage: State<'_, StorageState>,
) -> Result<Vec<TournamentSummary>, StorageError> {
    storage.with(Storage::list)
}

#[tauri::command]
pub fn export_backup(
    storage: State<'_, StorageState>,
    tournament_id: String,
    destination: PathBuf,
) -> Result<(), StorageError> {
    storage.with(|s| s.export_backup(&tournament_id, &destination))
}
