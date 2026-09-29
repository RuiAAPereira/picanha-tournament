use std::path::PathBuf;
use std::sync::Mutex;

use tauri::State;

use crate::storage::{
    Storage, StorageError, StorageErrorCode, TournamentSnapshot, TournamentSummary,
};

type Opener = Box<dyn Fn() -> Result<Storage, StorageError> + Send + Sync>;

/// Lazily opened storage. A failed open is retried on the next command.
pub struct StorageState {
    storage: Mutex<Option<Storage>>,
    open: Opener,
}

impl StorageState {
    pub fn new(open: impl Fn() -> Result<Storage, StorageError> + Send + Sync + 'static) -> Self {
        Self { storage: Mutex::new(None), open: Box::new(open) }
    }

    /// Storage in `<exe_dir>/data`, resolved from the running executable.
    pub fn beside_executable() -> Self {
        Self::new(|| Storage::open(&executable_dir()?))
    }

    fn with<T>(&self, f: impl FnOnce(&Storage) -> Result<T, StorageError>) -> Result<T, StorageError> {
        let mut guard = self.storage.lock().unwrap_or_else(|poisoned| {
            let mut guard = poisoned.into_inner();
            *guard = None;
            self.storage.clear_poison();
            guard
        });
        if guard.is_none() {
            *guard = Some((self.open)()?);
        }
        let storage = guard.as_ref().expect("storage opened above");
        let result = f(storage);
        // A connection opened while the file was read-only, locked or damaged
        // keeps failing; drop it so the next command reopens from scratch.
        if let Err(error) = &result {
            if matches!(
                error.code,
                StorageErrorCode::Unwritable | StorageErrorCode::Busy | StorageErrorCode::Corrupt
            ) {
                *guard = None;
            }
        }
        result
    }
}

fn executable_dir() -> Result<PathBuf, StorageError> {
    let exe = std::env::current_exe()?;
    exe.parent().map(PathBuf::from).ok_or_else(|| {
        StorageError::with_detail(StorageErrorCode::Unexpected, "executable has no parent directory")
    })
}

#[tauri::command(async)]
pub fn load_current_tournament(
    storage: State<'_, StorageState>,
) -> Result<Option<TournamentSnapshot>, StorageError> {
    storage.with(Storage::load_current)
}

#[tauri::command(async)]
pub fn save_tournament(
    storage: State<'_, StorageState>,
    snapshot: TournamentSnapshot,
) -> Result<(), StorageError> {
    storage.with(|s| s.save(&snapshot))
}

#[tauri::command(async)]
pub fn list_tournaments(
    storage: State<'_, StorageState>,
) -> Result<Vec<TournamentSummary>, StorageError> {
    storage.with(Storage::list)
}

/// `destination` is resolved inside `<exe>/data/backups`; a bare file name is the normal case.
#[tauri::command(async)]
pub fn export_backup(
    storage: State<'_, StorageState>,
    tournament_id: String,
    destination: PathBuf,
) -> Result<(), StorageError> {
    storage.with(|s| s.export_backup(&tournament_id, &destination))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use serde_json::json;

    use super::*;
    use crate::storage::{DATA_DIR_NAME, DB_FILE_NAME, SNAPSHOT_SCHEMA_VERSION};

    fn snapshot(name: &str) -> TournamentSnapshot {
        TournamentSnapshot {
            schema_version: SNAPSHOT_SCHEMA_VERSION,
            tournament_id: "t-1".into(),
            name: name.into(),
            saved_at: "2026-09-28T20:00:00.000Z".into(),
            status: "in_progress".into(),
            state: json!({ "id": "t-1", "auditLog": [] }),
        }
    }

    fn set_readonly(path: &Path, readonly: bool) {
        let mut permissions = fs::metadata(path).unwrap().permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(readonly);
        fs::set_permissions(path, permissions).unwrap();
    }

    fn counting_state(dir: &Path) -> (StorageState, Arc<AtomicUsize>) {
        let opens = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&opens);
        let dir = dir.to_path_buf();
        let state = StorageState::new(move || {
            counter.fetch_add(1, Ordering::SeqCst);
            Storage::open(&dir)
        });
        (state, opens)
    }

    #[test]
    fn storage_state_reopens_after_read_only_database_becomes_writable() {
        let exe_dir = tempfile::tempdir().unwrap();
        Storage::open(exe_dir.path()).unwrap().save(&snapshot("Antes")).unwrap();
        let db_path = exe_dir.path().join(DATA_DIR_NAME).join(DB_FILE_NAME);
        let (state, opens) = counting_state(exe_dir.path());

        set_readonly(&db_path, true);
        let err = state.with(|s| s.save(&snapshot("Durante"))).unwrap_err();
        set_readonly(&db_path, false);

        assert_eq!(err.code, StorageErrorCode::Unwritable);
        state.with(|s| s.save(&snapshot("Depois"))).expect("save after folder is writable again");
        assert_eq!(opens.load(Ordering::SeqCst), 2);
        assert_eq!(state.with(Storage::load_current).unwrap().unwrap().name, "Depois");
    }

    #[test]
    fn storage_state_keeps_connection_after_non_io_errors() {
        let exe_dir = tempfile::tempdir().unwrap();
        let (state, opens) = counting_state(exe_dir.path());
        let mut invalid = snapshot("Sem histórico");
        invalid.state = json!({});

        assert_eq!(state.with(|s| s.save(&invalid)).unwrap_err().code, StorageErrorCode::InvalidSnapshot);
        state.with(|s| s.save(&snapshot("Válido"))).unwrap();

        assert_eq!(opens.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn storage_state_recovers_from_poisoned_lock() {
        let exe_dir = tempfile::tempdir().unwrap();
        let (state, opens) = counting_state(exe_dir.path());
        state.with(|s| s.save(&snapshot("Antes"))).unwrap();

        let state = Arc::new(state);
        let panicking = Arc::clone(&state);
        let joined = std::thread::spawn(move || {
            let _ = panicking.with(|_| -> Result<(), StorageError> { panic!("falha simulada") });
        })
        .join();
        assert!(joined.is_err());

        assert_eq!(state.with(Storage::load_current).unwrap().unwrap().name, "Antes");
        assert_eq!(opens.load(Ordering::SeqCst), 2);
    }
}
