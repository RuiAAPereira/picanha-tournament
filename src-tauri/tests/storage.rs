use std::fs;
use std::path::{Path, PathBuf};

use picanha_tournament_lib::storage::{
    Storage, StorageErrorCode, TournamentSnapshot, BACKUPS_DIR_NAME, DATA_DIR_NAME, DB_FILE_NAME,
    SNAPSHOT_SCHEMA_VERSION,
};
use serde_json::{json, Value};

fn state(id: &str, name: &str, audit_log: Value) -> Value {
    json!({
        "id": id,
        "name": name,
        "createdAt": "2026-09-28T19:00:00.000Z",
        "players": [
            { "id": "p1", "displayName": "Ana" },
            { "id": "p2", "displayName": "Bruno" },
            { "id": "p3", "displayName": "Carla" }
        ],
        "proposal": { "groupCount": 1, "groupSize": 3, "preliminaryCount": 0, "notes": null },
        "draw": { "seed": 42, "groups": [["p1", "p2", "p3"]], "preliminary": [] },
        "preliminaryMatches": [],
        "groups": [{
            "id": "A",
            "playerIds": ["p1", "p2", "p3"],
            "preliminaryWinnerMatchIds": [],
            "matches": [
                {
                    "id": "A-1", "player1Id": "p1", "player2Id": "p2", "groupId": "A",
                    "result": { "winnerId": "p1", "loserBallsRemaining": 3, "kind": "played" }
                },
                { "id": "A-2", "player1Id": "p2", "player2Id": "p3", "groupId": "A" }
            ]
        }],
        "bracket": { "rounds": [], "championId": null, "ratio": 0.1, "third": 0.30000000000000004, "negative": -1 },
        "tieDraws": [],
        "auditLog": audit_log
    })
}

fn result_event(match_id: &str, at: &str) -> Value {
    json!({
        "type": "result",
        "at": at,
        "matchId": match_id,
        "result": { "winnerId": "p1", "loserBallsRemaining": 3, "kind": "played" }
    })
}

fn snapshot(id: &str, name: &str, saved_at: &str, audit_log: Value) -> TournamentSnapshot {
    TournamentSnapshot {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        tournament_id: id.to_string(),
        name: name.to_string(),
        saved_at: saved_at.to_string(),
        status: "in_progress".to_string(),
        state: state(id, name, audit_log),
    }
}

fn open(dir: &Path) -> Storage {
    Storage::open(dir).expect("storage opens")
}

fn backups_dir(exe_dir: &Path) -> PathBuf {
    exe_dir.join(DATA_DIR_NAME).join(BACKUPS_DIR_NAME)
}

fn dir_entries(dir: &Path) -> Vec<String> {
    match fs::read_dir(dir) {
        Ok(entries) => entries.map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect(),
        Err(_) => Vec::new(),
    }
}

fn assert_no_path_in_message(message: &str, dir: &Path) {
    let dir_text = dir.to_string_lossy();
    assert!(!message.contains(dir_text.as_ref()), "message leaks path: {message}");
    assert!(!message.contains(DB_FILE_NAME), "message leaks file name: {message}");
    assert!(!message.contains('\\') && !message.contains('/'), "message looks like a path: {message}");
}

#[test]
fn storage_creates_database_under_data_beside_executable() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());

    let expected = exe_dir.path().join(DATA_DIR_NAME).join(DB_FILE_NAME);
    assert_eq!(DATA_DIR_NAME, "data");
    assert_eq!(DB_FILE_NAME, "picanha-tournament.sqlite");
    assert_eq!(BACKUPS_DIR_NAME, "backups");
    assert_eq!(storage.db_path(), expected.as_path());
    assert!(expected.is_file());
}

#[test]
fn storage_starts_without_current_tournament() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());

    assert_eq!(storage.load_current().unwrap(), None);
    assert!(storage.list().unwrap().is_empty());
}

#[test]
fn storage_reloads_saved_snapshot_identically_after_restart() {
    let exe_dir = tempfile::tempdir().unwrap();
    let saved = snapshot(
        "t-1",
        "Torneio da Picanha",
        "2026-09-28T20:00:00.000Z",
        json!([result_event("A-1", "2026-09-28T19:30:00.000Z")]),
    );
    open(exe_dir.path()).save(&saved).unwrap();

    let loaded = open(exe_dir.path()).load_current().unwrap().expect("current tournament");

    assert_eq!(loaded, saved);
    assert_eq!(
        serde_json::to_string(&loaded.state).unwrap(),
        serde_json::to_string(&saved.state).unwrap()
    );
    assert_eq!(loaded.state["bracket"]["third"].as_f64(), Some(0.30000000000000004));
    let wire = serde_json::to_value(&loaded).unwrap();
    assert_eq!(wire["schemaVersion"], json!(1));
    assert_eq!(wire["tournamentId"], json!("t-1"));
    assert_eq!(wire["savedAt"], json!("2026-09-28T20:00:00.000Z"));
    assert_eq!(wire["status"], json!("in_progress"));
}

#[test]
fn storage_tracks_latest_saved_tournament_as_current_and_lists_summaries() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    storage.save(&snapshot("t-1", "Primeiro", "2026-09-28T20:00:00.000Z", json!([]))).unwrap();
    let mut second = snapshot("t-2", "Segundo", "2026-09-28T21:00:00.000Z", json!([]));
    second.status = "finished".to_string();
    storage.save(&second).unwrap();

    assert_eq!(storage.load_current().unwrap().unwrap().tournament_id, "t-2");
    let summaries = storage.list().unwrap();
    let ids: Vec<_> = summaries.iter().map(|s| s.tournament_id.as_str()).collect();
    assert_eq!(ids, vec!["t-2", "t-1"]);
    assert_eq!(summaries[0].name, "Segundo");
    assert_eq!(summaries[0].status, "finished");
    assert_eq!(summaries[0].saved_at, "2026-09-28T21:00:00.000Z");
    let wire = serde_json::to_value(&summaries[0]).unwrap();
    assert_eq!(
        wire,
        json!({ "tournamentId": "t-2", "name": "Segundo", "savedAt": "2026-09-28T21:00:00.000Z", "status": "finished" })
    );

    storage.save(&snapshot("t-1", "Primeiro renomeado", "2026-09-28T22:00:00.000Z", json!([]))).unwrap();
    assert_eq!(storage.load_current().unwrap().unwrap().name, "Primeiro renomeado");
    assert_eq!(storage.list().unwrap().len(), 2);
}

#[test]
fn storage_appends_audit_events_without_rewriting_history() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let first = result_event("A-1", "2026-09-28T19:30:00.000Z");
    let second = result_event("A-2", "2026-09-28T19:45:00.000Z");
    storage.save(&snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([first.clone()]))).unwrap();
    storage
        .save(&snapshot("t-1", "Torneio", "2026-09-28T20:05:00.000Z", json!([first.clone(), second.clone()])))
        .unwrap();

    let conn = rusqlite::Connection::open(storage.db_path()).unwrap();
    let mut stmt = conn
        .prepare("SELECT seq, event_json FROM audit_events WHERE tournament_id = 't-1' ORDER BY seq")
        .unwrap();
    let rows: Vec<(i64, Value)> = stmt
        .query_map([], |row| {
            let text: String = row.get(1)?;
            Ok((row.get(0)?, serde_json::from_str(&text).unwrap()))
        })
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(rows, vec![(0, first), (1, second)]);

    let tampered = conn.execute("UPDATE audit_events SET event_json = '{}' WHERE seq = 0", []);
    let tampered = tampered.expect_err("audit events must be immutable").to_string();
    assert!(tampered.contains("audit_events is append-only"), "unexpected error: {tampered}");
    let deleted = conn.execute("DELETE FROM audit_events", []);
    let deleted = deleted.expect_err("audit events must be append-only").to_string();
    assert!(deleted.contains("audit_events is append-only"), "unexpected error: {deleted}");
}

#[test]
fn storage_rejects_history_conflict_and_keeps_previous_snapshot() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let original = snapshot(
        "t-1",
        "Torneio",
        "2026-09-28T20:00:00.000Z",
        json!([result_event("A-1", "2026-09-28T19:30:00.000Z")]),
    );
    storage.save(&original).unwrap();
    storage.save(&snapshot("t-2", "Outro", "2026-09-28T20:01:00.000Z", json!([]))).unwrap();

    // Rewritten first event: the summary and snapshot writes happen before the
    // audit check, so this exercises a mid-transaction rollback.
    let conflicting = snapshot(
        "t-1",
        "Nome alterado",
        "2026-09-28T20:10:00.000Z",
        json!([
            result_event("A-1", "2026-09-28T19:31:00.000Z"),
            result_event("A-2", "2026-09-28T19:45:00.000Z")
        ]),
    );
    let err = storage.save(&conflicting).unwrap_err();
    assert_eq!(err.code, StorageErrorCode::HistoryConflict);
    assert_no_path_in_message(&err.message, exe_dir.path());

    let shrunk = snapshot("t-1", "Torneio", "2026-09-28T20:11:00.000Z", json!([]));
    assert_eq!(storage.save(&shrunk).unwrap_err().code, StorageErrorCode::HistoryConflict);

    let reopened = open(exe_dir.path());
    assert_eq!(reopened.load_current().unwrap().unwrap().tournament_id, "t-2");
    let t1 = reopened.list().unwrap().into_iter().find(|s| s.tournament_id == "t-1").unwrap();
    assert_eq!(t1.name, "Torneio");
    assert_eq!(t1.saved_at, "2026-09-28T20:00:00.000Z");

    reopened.save(&snapshot("t-1", "Torneio", "2026-09-28T20:20:00.000Z", json!([
        result_event("A-1", "2026-09-28T19:30:00.000Z")
    ]))).unwrap();
    assert_eq!(reopened.load_current().unwrap().unwrap().state, original.state);
}

#[test]
fn storage_rejects_snapshot_without_audit_log() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let mut missing = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]));
    missing.state.as_object_mut().unwrap().remove("auditLog");

    let err = storage.save(&missing).unwrap_err();

    assert_eq!(err.code, StorageErrorCode::InvalidSnapshot);
    assert_eq!(storage.load_current().unwrap(), None);
}

#[test]
fn storage_reports_unwritable_location_in_portuguese_without_paths() {
    let exe_dir = tempfile::tempdir().unwrap();
    fs::write(exe_dir.path().join(DATA_DIR_NAME), b"not a directory").unwrap();

    let err = Storage::open(exe_dir.path()).unwrap_err();

    assert_eq!(err.code, StorageErrorCode::Unwritable);
    assert!(err.message.contains("guardar"), "unexpected message: {}", err.message);
    assert_no_path_in_message(&err.message, exe_dir.path());
    let wire = serde_json::to_value(&err).unwrap();
    assert_eq!(wire["code"], json!("unwritable"));
    assert_eq!(wire["message"], json!(err.message));
}

#[test]
fn storage_failed_save_on_read_only_database_keeps_previous_snapshot() {
    let exe_dir = tempfile::tempdir().unwrap();
    let saved = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]));
    let db_path = {
        let storage = open(exe_dir.path());
        storage.save(&saved).unwrap();
        storage.db_path().to_path_buf()
    };
    let mut permissions = fs::metadata(&db_path).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&db_path, permissions.clone()).unwrap();

    let outcome = Storage::open(exe_dir.path()).and_then(|storage| {
        let restored = storage.load_current()?;
        let saved_again = storage.save(&snapshot("t-1", "Alterado", "2026-09-28T20:05:00.000Z", json!([])));
        Ok((restored, saved_again))
    });

    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    fs::set_permissions(&db_path, permissions).unwrap();
    let (restored, saved_again) = outcome.expect("read-only database still opens and loads");
    assert_eq!(restored.as_ref(), Some(&saved));
    let err = saved_again.unwrap_err();
    assert_eq!(err.code, StorageErrorCode::Unwritable);
    assert_no_path_in_message(&err.message, exe_dir.path());
    assert_eq!(open(exe_dir.path()).load_current().unwrap(), Some(saved));
}

#[test]
fn storage_reports_busy_when_another_program_holds_a_write_lock() {
    let exe_dir = tempfile::tempdir().unwrap();
    let saved = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]));
    let storage = open(exe_dir.path());
    storage.save(&saved).unwrap();
    let other = rusqlite::Connection::open(storage.db_path()).unwrap();
    other.execute_batch("BEGIN EXCLUSIVE").unwrap();

    let err = storage.save(&snapshot("t-1", "Alterado", "2026-09-28T20:05:00.000Z", json!([]))).unwrap_err();

    assert_eq!(err.code, StorageErrorCode::Busy);
    assert!(err.message.contains("outro programa"), "unexpected message: {}", err.message);
    other.execute_batch("ROLLBACK").unwrap();
    assert_eq!(storage.load_current().unwrap(), Some(saved));
}

#[test]
fn storage_reports_corrupt_database_file() {
    let exe_dir = tempfile::tempdir().unwrap();
    let data_dir = exe_dir.path().join(DATA_DIR_NAME);
    fs::create_dir_all(&data_dir).unwrap();
    fs::write(data_dir.join(DB_FILE_NAME), vec![0x42u8; 8192]).unwrap();

    let err = Storage::open(exe_dir.path()).unwrap_err();

    assert_eq!(err.code, StorageErrorCode::Corrupt);
    assert_no_path_in_message(&err.message, exe_dir.path());
}

#[test]
fn storage_reports_current_pointer_without_snapshot_as_corrupt() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    rusqlite::Connection::open(storage.db_path())
        .unwrap()
        .execute("INSERT INTO settings (key, value) VALUES ('current_tournament_id', 'fantasma')", [])
        .unwrap();

    assert_eq!(storage.load_current().unwrap_err().code, StorageErrorCode::Corrupt);
}

#[test]
fn storage_reports_unparseable_snapshot_json_as_corrupt() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    storage.save(&snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]))).unwrap();
    let conn = rusqlite::Connection::open(storage.db_path()).unwrap();
    let rejected = conn.execute("UPDATE snapshots SET state_json = '{not json'", []);
    assert!(rejected.is_err(), "schema must reject invalid state_json");
    conn.execute_batch("PRAGMA ignore_check_constraints = ON").unwrap();
    conn.execute("UPDATE snapshots SET state_json = '{not json'", []).unwrap();

    assert_eq!(storage.load_current().unwrap_err().code, StorageErrorCode::Corrupt);
}

#[test]
fn storage_reports_wrongly_typed_columns_as_corrupt() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    storage.save(&snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]))).unwrap();
    rusqlite::Connection::open(storage.db_path())
        .unwrap()
        .execute("UPDATE tournaments SET name = x'00ff'", [])
        .unwrap();

    assert_eq!(storage.load_current().unwrap_err().code, StorageErrorCode::Corrupt);
}

#[test]
fn storage_rejects_snapshots_from_newer_schema_versions() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let mut newer = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]));
    newer.schema_version = SNAPSHOT_SCHEMA_VERSION + 1;
    assert_eq!(storage.save(&newer).unwrap_err().code, StorageErrorCode::SchemaNewer);

    storage.save(&snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]))).unwrap();
    rusqlite::Connection::open(storage.db_path())
        .unwrap()
        .execute("UPDATE snapshots SET schema_version = schema_version + 1", [])
        .unwrap();

    let err = storage.load_current().unwrap_err();
    assert_eq!(err.code, StorageErrorCode::SchemaNewer);
    assert!(err.message.contains("versão"), "unexpected message: {}", err.message);
}

#[test]
fn storage_records_applied_migrations_once() {
    let exe_dir = tempfile::tempdir().unwrap();
    let db_path = open(exe_dir.path()).db_path().to_path_buf();
    open(exe_dir.path());

    let conn = rusqlite::Connection::open(db_path).unwrap();
    let versions: Vec<i64> = conn
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(versions, vec![1]);
}

#[test]
fn storage_refuses_database_migrated_by_newer_version() {
    let exe_dir = tempfile::tempdir().unwrap();
    let db_path = open(exe_dir.path()).db_path().to_path_buf();
    rusqlite::Connection::open(db_path)
        .unwrap()
        .execute("INSERT INTO schema_migrations (version, applied_at) VALUES (99, 'futuro')", [])
        .unwrap();

    let err = Storage::open(exe_dir.path()).unwrap_err();

    assert_eq!(err.code, StorageErrorCode::SchemaNewer);
}

#[test]
fn storage_exports_consistent_backup_atomically() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let saved = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([
        result_event("A-1", "2026-09-28T19:30:00.000Z")
    ]));
    storage.save(&saved).unwrap();
    let backups = backups_dir(exe_dir.path());
    fs::create_dir_all(&backups).unwrap();
    fs::write(backups.join("torneio.sqlite"), b"old backup").unwrap();

    storage.export_backup("t-1", Path::new("torneio.sqlite")).unwrap();

    let restored_dir = tempfile::tempdir().unwrap();
    let restored_data = restored_dir.path().join(DATA_DIR_NAME);
    fs::create_dir_all(&restored_data).unwrap();
    fs::copy(backups.join("torneio.sqlite"), restored_data.join(DB_FILE_NAME)).unwrap();
    assert_eq!(open(restored_dir.path()).load_current().unwrap(), Some(saved.clone()));
    assert_eq!(dir_entries(&backups), vec!["torneio.sqlite".to_string()]);
    assert_eq!(storage.load_current().unwrap(), Some(saved));
}

#[test]
fn storage_backup_restores_exported_tournament_as_current() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let first = snapshot("t-1", "Primeiro", "2026-09-28T20:00:00.000Z", json!([]));
    storage.save(&first).unwrap();
    storage.save(&snapshot("t-2", "Segundo", "2026-09-28T21:00:00.000Z", json!([]))).unwrap();

    storage.export_backup("t-1", Path::new("primeiro.sqlite")).unwrap();

    let restored_dir = tempfile::tempdir().unwrap();
    let restored_data = restored_dir.path().join(DATA_DIR_NAME);
    fs::create_dir_all(&restored_data).unwrap();
    fs::copy(backups_dir(exe_dir.path()).join("primeiro.sqlite"), restored_data.join(DB_FILE_NAME)).unwrap();
    assert_eq!(open(restored_dir.path()).load_current().unwrap(), Some(first));
    assert_eq!(storage.load_current().unwrap().unwrap().tournament_id, "t-2");
}

#[test]
fn storage_export_creates_missing_backup_folder_and_accepts_paths_inside_it() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    storage.save(&snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]))).unwrap();
    let backups = backups_dir(exe_dir.path());

    storage.export_backup("t-1", Path::new("copia.sqlite")).unwrap();
    storage.export_backup("t-1", Path::new("setembro/./copia.sqlite")).unwrap();
    storage.export_backup("t-1", &backups.join("absoluta.sqlite")).unwrap();

    assert!(backups.join("copia.sqlite").is_file());
    assert!(backups.join("setembro").join("copia.sqlite").is_file());
    assert!(backups.join("absoluta.sqlite").is_file());
}

#[test]
fn storage_export_rejects_destinations_outside_backup_folder() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let saved = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]));
    storage.save(&saved).unwrap();
    let outside = tempfile::tempdir().unwrap();
    let live_db = storage.db_path().to_path_buf();
    let candidates: Vec<PathBuf> = vec![
        outside.path().join("fora.sqlite"),
        PathBuf::from("../fuga.sqlite"),
        PathBuf::from("sub/../../fuga.sqlite"),
        PathBuf::from(format!("../{DB_FILE_NAME}")),
        live_db,
        backups_dir(exe_dir.path()),
        PathBuf::from(""),
        PathBuf::from("."),
    ];

    for destination in candidates {
        let err = storage.export_backup("t-1", &destination).unwrap_err();
        assert_eq!(err.code, StorageErrorCode::InvalidDestination, "destination {destination:?}");
        assert_no_path_in_message(&err.message, exe_dir.path());
    }

    assert!(dir_entries(outside.path()).is_empty());
    assert_eq!(dir_entries(&exe_dir.path().join(DATA_DIR_NAME)), vec![DB_FILE_NAME.to_string()]);
    assert_eq!(open(exe_dir.path()).load_current().unwrap(), Some(saved));
}

#[test]
fn storage_export_rejects_file_names_windows_would_alter() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    storage.save(&snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]))).unwrap();
    let candidates = [
        "copia.sqlite:ads",
        "copia*.sqlite",
        "copia?.sqlite",
        "copia\".sqlite",
        "copia<1>.sqlite",
        "copia|.sqlite",
        "copia\u{1}.sqlite",
        "copia.sqlite.",
        "copia.sqlite ",
        "setembro./copia.sqlite",
        "setembro /copia.sqlite",
    ];

    for destination in candidates {
        let err = storage.export_backup("t-1", Path::new(destination)).unwrap_err();
        assert_eq!(err.code, StorageErrorCode::InvalidDestination, "destination {destination:?}");
        assert_no_path_in_message(&err.message, exe_dir.path());
    }

    assert!(dir_entries(&backups_dir(exe_dir.path())).is_empty());
}

#[test]
fn storage_export_rejects_reserved_device_names() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    storage.save(&snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]))).unwrap();

    for destination in ["CON", "con.sqlite", "Nul.sqlite", "aux", "prn.tar.sqlite", "com1.sqlite", "LPT9.sqlite", "com1/copia.sqlite"] {
        let err = storage.export_backup("t-1", Path::new(destination)).unwrap_err();
        assert_eq!(err.code, StorageErrorCode::InvalidDestination, "destination {destination:?}");
        assert_no_path_in_message(&err.message, exe_dir.path());
    }
    assert!(dir_entries(&backups_dir(exe_dir.path())).is_empty());

    storage.export_backup("t-1", Path::new("consola.sqlite")).unwrap();
    storage.export_backup("t-1", Path::new("com10.sqlite")).unwrap();
    assert!(backups_dir(exe_dir.path()).join("consola.sqlite").is_file());
    assert!(backups_dir(exe_dir.path()).join("com10.sqlite").is_file());
}

#[test]
fn storage_export_rejects_unknown_tournament_without_writing() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());

    let err = storage.export_backup("inexistente", Path::new("copia.sqlite")).unwrap_err();

    assert_eq!(err.code, StorageErrorCode::NotFound);
    assert!(dir_entries(&backups_dir(exe_dir.path())).is_empty());
}

#[test]
fn storage_export_to_unwritable_destination_fails_cleanly() {
    let exe_dir = tempfile::tempdir().unwrap();
    let storage = open(exe_dir.path());
    let saved = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]));
    storage.save(&saved).unwrap();
    let backups = backups_dir(exe_dir.path());
    fs::create_dir_all(&backups).unwrap();
    fs::write(backups.join("bloqueado"), b"file, not folder").unwrap();

    let err = storage.export_backup("t-1", Path::new("bloqueado/copia.sqlite")).unwrap_err();

    assert_eq!(err.code, StorageErrorCode::Unwritable);
    assert_no_path_in_message(&err.message, exe_dir.path());
    assert_eq!(dir_entries(&backups), vec!["bloqueado".to_string()]);
    assert_eq!(storage.load_current().unwrap(), Some(saved));
}

#[cfg(windows)]
mod acl {
    use super::*;
    use std::process::Command;

    const EVERYONE_SID: &str = "*S-1-1-0";

    /// Removes the deny entries even if the test panics.
    struct DenyWriteGuard(Vec<PathBuf>);

    impl DenyWriteGuard {
        fn deny(dirs: &[PathBuf]) -> Self {
            let guard = Self(dirs.to_vec());
            for dir in dirs {
                let output = Command::new("icacls")
                    .arg(dir)
                    .args(["/deny", &format!("{EVERYONE_SID}:(AD,WD)")])
                    .output()
                    .expect("icacls available");
                assert!(output.status.success(), "icacls deny failed: {output:?}");
            }
            guard
        }
    }

    impl Drop for DenyWriteGuard {
        fn drop(&mut self) {
            for dir in &self.0 {
                let _ = Command::new("icacls").arg(dir).args(["/remove:d", EVERYONE_SID]).output();
            }
        }
    }

    #[test]
    fn storage_denied_data_folder_fails_save_and_export_then_recovers() {
        let exe_dir = tempfile::tempdir().unwrap();
        let saved = snapshot("t-1", "Torneio", "2026-09-28T20:00:00.000Z", json!([]));
        let storage = open(exe_dir.path());
        storage.save(&saved).unwrap();
        let data_dir = exe_dir.path().join(DATA_DIR_NAME);
        let backups = backups_dir(exe_dir.path());
        fs::create_dir_all(&backups).unwrap();

        {
            let _guard = DenyWriteGuard::deny(&[data_dir.clone(), backups.clone()]);

            let save_err = storage
                .save(&snapshot("t-1", "Alterado", "2026-09-28T20:05:00.000Z", json!([])))
                .unwrap_err();
            assert_eq!(save_err.code, StorageErrorCode::Unwritable);
            assert_no_path_in_message(&save_err.message, exe_dir.path());
            let export_err = storage.export_backup("t-1", Path::new("copia.sqlite")).unwrap_err();
            assert_eq!(export_err.code, StorageErrorCode::Unwritable);
            assert_no_path_in_message(&export_err.message, exe_dir.path());
        }

        drop(storage);
        assert!(dir_entries(&backups).is_empty());
        let reopened = open(exe_dir.path());
        assert_eq!(reopened.load_current().unwrap(), Some(saved));
        reopened.save(&snapshot("t-1", "Depois", "2026-09-28T20:10:00.000Z", json!([]))).unwrap();
    }
}
