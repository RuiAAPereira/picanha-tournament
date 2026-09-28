//! Local tournament persistence: one SQLite file in `<exe_dir>/data`.
//!
//! Journal mode: SQLite's default rollback journal (DELETE). Every save is a
//! single transaction, so a failed write rolls back to the previous snapshot,
//! and the database stays one self-contained file next to the portable exe
//! (no `-wal`/`-shm` sidecars to lose when the folder is copied or the exe is
//! closed abruptly on a USB stick).

mod models;

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

pub use models::{
    StorageError, StorageErrorCode, TournamentSnapshot, TournamentSummary, SNAPSHOT_SCHEMA_VERSION,
};

pub const DATA_DIR_NAME: &str = "data";
pub const DB_FILE_NAME: &str = "picanha-tournament.sqlite";

const CURRENT_TOURNAMENT_KEY: &str = "current_tournament_id";

/// Ordered DB migrations; `schema_migrations` records which ones were applied.
/// Independent of `SNAPSHOT_SCHEMA_VERSION`, which versions the JSON payload.
const MIGRATIONS: &[(i64, &str)] = &[(
    1,
    r#"
    CREATE TABLE tournaments (
        tournament_id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        saved_at TEXT NOT NULL
    );
    CREATE TABLE snapshots (
        tournament_id TEXT PRIMARY KEY NOT NULL REFERENCES tournaments(tournament_id),
        schema_version INTEGER NOT NULL,
        state_json TEXT NOT NULL
    );
    CREATE TABLE audit_events (
        tournament_id TEXT NOT NULL REFERENCES tournaments(tournament_id),
        seq INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        PRIMARY KEY (tournament_id, seq)
    );
    CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
    CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
    CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
    );
    "#,
)];

#[derive(Debug)]
pub struct Storage {
    conn: Connection,
    db_path: PathBuf,
}

impl Storage {
    /// Opens (creating if needed) `<exe_dir>/data/picanha-tournament.sqlite`.
    /// An already-migrated database opens without writing, so a read-only
    /// folder still allows the current tournament to be restored.
    pub fn open(exe_dir: &Path) -> Result<Self, StorageError> {
        let data_dir = exe_dir.join(DATA_DIR_NAME);
        fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join(DB_FILE_NAME);
        let conn = Connection::open(&db_path)?;
        conn.busy_timeout(Duration::from_secs(2))?;
        conn.pragma_update(None, "foreign_keys", true)?;
        migrate(&conn)?;
        Ok(Self { conn, db_path })
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub fn load_current(&self) -> Result<Option<TournamentSnapshot>, StorageError> {
        let current: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [CURRENT_TOURNAMENT_KEY],
                |row| row.get(0),
            )
            .optional()?;
        let Some(tournament_id) = current else {
            return Ok(None);
        };
        let row = self
            .conn
            .query_row(
                "SELECT t.name, t.status, t.saved_at, s.schema_version, s.state_json
                 FROM tournaments t JOIN snapshots s ON s.tournament_id = t.tournament_id
                 WHERE t.tournament_id = ?1",
                [&tournament_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                },
            )
            .optional()?;
        let Some((name, status, saved_at, schema_version, state_json)) = row else {
            return Err(StorageError::with_detail(
                StorageErrorCode::Corrupt,
                "current tournament pointer has no snapshot",
            ));
        };
        let schema_version = u32::try_from(schema_version).map_err(|_| {
            StorageError::with_detail(StorageErrorCode::Corrupt, "invalid snapshot schema version")
        })?;
        if schema_version > SNAPSHOT_SCHEMA_VERSION {
            return Err(StorageError::with_detail(
                StorageErrorCode::SchemaNewer,
                format!("snapshot schema {schema_version} > supported {SNAPSHOT_SCHEMA_VERSION}"),
            ));
        }
        let state = serde_json::from_str(&state_json)
            .map_err(|error| StorageError::with_detail(StorageErrorCode::Corrupt, error))?;
        Ok(Some(TournamentSnapshot {
            schema_version,
            tournament_id,
            name,
            saved_at,
            status,
            state,
        }))
    }

    /// Saves summary, snapshot, new audit events and the current pointer in one
    /// transaction. Audit history is append-only: a snapshot whose log does not
    /// extend the stored one is rejected and nothing is written.
    pub fn save(&self, snapshot: &TournamentSnapshot) -> Result<(), StorageError> {
        if snapshot.schema_version > SNAPSHOT_SCHEMA_VERSION {
            return Err(StorageError::with_detail(
                StorageErrorCode::SchemaNewer,
                format!("refusing to save snapshot schema {}", snapshot.schema_version),
            ));
        }
        if snapshot.schema_version == 0 || snapshot.tournament_id.is_empty() {
            return Err(StorageError::with_detail(
                StorageErrorCode::InvalidSnapshot,
                "missing schema version or tournament id",
            ));
        }
        let Some(Value::Array(audit_log)) = snapshot.state.get("auditLog") else {
            return Err(StorageError::with_detail(
                StorageErrorCode::InvalidSnapshot,
                "state.auditLog is not an array",
            ));
        };
        let state_json = serde_json::to_string(&snapshot.state)
            .map_err(|error| StorageError::with_detail(StorageErrorCode::InvalidSnapshot, error))?;

        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO tournaments (tournament_id, name, status, saved_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(tournament_id) DO UPDATE SET
                name = excluded.name, status = excluded.status, saved_at = excluded.saved_at",
            params![snapshot.tournament_id, snapshot.name, snapshot.status, snapshot.saved_at],
        )?;
        tx.execute(
            "INSERT INTO snapshots (tournament_id, schema_version, state_json) VALUES (?1, ?2, ?3)
             ON CONFLICT(tournament_id) DO UPDATE SET
                schema_version = excluded.schema_version, state_json = excluded.state_json",
            params![snapshot.tournament_id, snapshot.schema_version, state_json],
        )?;
        append_audit_events(&tx, &snapshot.tournament_id, audit_log)?;
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![CURRENT_TOURNAMENT_KEY, snapshot.tournament_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Tournament summaries, most recently saved first.
    pub fn list(&self) -> Result<Vec<TournamentSummary>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT tournament_id, name, saved_at, status FROM tournaments
             ORDER BY saved_at DESC, tournament_id",
        )?;
        let summaries = stmt
            .query_map([], |row| {
                Ok(TournamentSummary {
                    tournament_id: row.get(0)?,
                    name: row.get(1)?,
                    saved_at: row.get(2)?,
                    status: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(summaries)
    }

    /// Writes a consistent copy of the database to `destination`. The copy is
    /// built in a temporary file beside it (`VACUUM INTO`, read-only on the live
    /// DB) and renamed into place, so a failure never leaves a partial backup.
    pub fn export_backup(&self, tournament_id: &str, destination: &Path) -> Result<(), StorageError> {
        let exists = self
            .conn
            .query_row(
                "SELECT 1 FROM tournaments WHERE tournament_id = ?1",
                [tournament_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !exists {
            return Err(StorageError::with_detail(
                StorageErrorCode::NotFound,
                format!("export of unknown tournament {tournament_id}"),
            ));
        }
        let file_name = destination.file_name().ok_or_else(|| {
            StorageError::with_detail(StorageErrorCode::Unwritable, "backup destination has no file name")
        })?;
        let parent = match destination.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => parent,
            _ => Path::new("."),
        };
        fs::create_dir_all(parent)?;

        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
        let temp_path = parent.join(format!(
            ".{}.{}-{}.tmp",
            file_name.to_string_lossy(),
            std::process::id(),
            nanos
        ));
        let result = write_backup(&self.conn, &temp_path, destination);
        if result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        result
    }
}

fn write_backup(conn: &Connection, temp_path: &Path, destination: &Path) -> Result<(), StorageError> {
    let temp_text = temp_path.to_str().ok_or_else(|| {
        StorageError::with_detail(StorageErrorCode::Unwritable, "backup path is not valid UTF-8")
    })?;
    conn.execute("VACUUM INTO ?1", [temp_text])?;
    fs::rename(temp_path, destination)?;
    Ok(())
}

fn append_audit_events(
    conn: &Connection,
    tournament_id: &str,
    audit_log: &[Value],
) -> Result<(), StorageError> {
    let mut stmt = conn.prepare(
        "SELECT event_json FROM audit_events WHERE tournament_id = ?1 ORDER BY seq",
    )?;
    let stored = stmt
        .query_map([tournament_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if stored.len() > audit_log.len() {
        return Err(StorageError::with_detail(
            StorageErrorCode::HistoryConflict,
            format!(
                "tournament {tournament_id}: incoming log has {} events, {} stored",
                audit_log.len(),
                stored.len()
            ),
        ));
    }
    for (seq, (stored_json, incoming)) in stored.iter().zip(audit_log).enumerate() {
        let stored_event: Value = serde_json::from_str(stored_json)
            .map_err(|error| StorageError::with_detail(StorageErrorCode::Corrupt, error))?;
        if &stored_event != incoming {
            return Err(StorageError::with_detail(
                StorageErrorCode::HistoryConflict,
                format!("tournament {tournament_id}: audit event {seq} differs from stored history"),
            ));
        }
    }
    let mut insert = conn.prepare(
        "INSERT INTO audit_events (tournament_id, seq, event_json) VALUES (?1, ?2, ?3)",
    )?;
    for (seq, event) in audit_log.iter().enumerate().skip(stored.len()) {
        let event_json = serde_json::to_string(event)
            .map_err(|error| StorageError::with_detail(StorageErrorCode::InvalidSnapshot, error))?;
        insert.execute(params![tournament_id, seq as i64, event_json])?;
    }
    Ok(())
}

fn migrate(conn: &Connection) -> Result<(), StorageError> {
    let has_table: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations')",
        [],
        |row| row.get(0),
    )?;
    let applied: i64 = if has_table {
        conn.query_row("SELECT COALESCE(MAX(version), 0) FROM schema_migrations", [], |row| row.get(0))?
    } else {
        0
    };
    let latest = MIGRATIONS.last().map_or(0, |(version, _)| *version);
    if applied > latest {
        return Err(StorageError::with_detail(
            StorageErrorCode::SchemaNewer,
            format!("database migration {applied} > supported {latest}"),
        ));
    }
    if applied == latest {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version > applied) {
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version, applied_at)
             VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            [version],
        )?;
    }
    tx.commit()?;
    Ok(())
}
