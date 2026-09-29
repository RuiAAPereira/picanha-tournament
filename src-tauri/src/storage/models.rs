use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Snapshot schema written by this build. Bump when the frontend `TournamentState`
/// changes incompatibly; older builds refuse newer snapshots instead of guessing.
pub const SNAPSHOT_SCHEMA_VERSION: u32 = 1;

/// Full tournament snapshot. `state` is the frontend `TournamentState`, stored
/// as opaque JSON: the TypeScript domain is its source of truth.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentSnapshot {
    pub schema_version: u32,
    pub tournament_id: String,
    pub name: String,
    pub saved_at: String,
    pub status: String,
    pub state: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TournamentSummary {
    pub tournament_id: String,
    pub name: String,
    pub saved_at: String,
    pub status: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageErrorCode {
    Unwritable,
    Corrupt,
    NotFound,
    SchemaNewer,
    HistoryConflict,
    InvalidSnapshot,
    InvalidDestination,
    Busy,
    Unexpected,
}

impl StorageErrorCode {
    fn user_message(self) -> &'static str {
        match self {
            Self::Unwritable => {
                "Não foi possível guardar os dados. Confirme que a pasta do programa permite escrita e tente novamente."
            }
            Self::Corrupt => "Os dados guardados estão danificados e não puderam ser lidos.",
            Self::NotFound => "O torneio pedido não foi encontrado.",
            Self::SchemaNewer => {
                "Os dados foram guardados por uma versão mais recente do programa. Atualize o Picanha Tournament para os abrir."
            }
            Self::HistoryConflict => {
                "O histórico do torneio não corresponde ao que está guardado. A alteração não foi guardada."
            }
            Self::InvalidSnapshot => "Os dados do torneio são inválidos e não foram guardados.",
            Self::InvalidDestination => {
                "A cópia de segurança tem de ser guardada na pasta de cópias do programa. Escolha outro nome de ficheiro."
            }
            Self::Busy => {
                "Os dados estão a ser usados por outro programa. Feche-o e tente novamente."
            }
            Self::Unexpected => "Ocorreu um erro inesperado ao aceder aos dados guardados.",
        }
    }
}

/// User-safe error: `message` is European Portuguese and never contains paths or
/// SQLite text. Internal detail goes to stderr only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StorageError {
    pub code: StorageErrorCode,
    pub message: String,
}

impl StorageError {
    pub fn new(code: StorageErrorCode) -> Self {
        Self { code, message: code.user_message().to_string() }
    }

    pub(crate) fn with_detail(code: StorageErrorCode, detail: impl std::fmt::Display) -> Self {
        eprintln!("[storage] {code:?}: {detail}");
        Self::new(code)
    }
}

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for StorageError {}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        use rusqlite::{Error as E, ErrorCode as Sql};
        let code = match &error {
            // Stored values of the wrong type or range: the file was altered.
            E::FromSqlConversionFailure(..)
            | E::InvalidColumnType(..)
            | E::IntegralValueOutOfRange(..)
            | E::Utf8Error(_) => StorageErrorCode::Corrupt,
            _ => match error.sqlite_error_code() {
                Some(
                    Sql::ReadOnly
                    | Sql::CannotOpen
                    | Sql::PermissionDenied
                    | Sql::DiskFull
                    | Sql::SystemIoFailure
                    | Sql::FileLockingProtocolFailed,
                ) => StorageErrorCode::Unwritable,
                Some(Sql::DatabaseBusy | Sql::DatabaseLocked) => StorageErrorCode::Busy,
                Some(Sql::NotADatabase | Sql::DatabaseCorrupt) => StorageErrorCode::Corrupt,
                _ => StorageErrorCode::Unexpected,
            },
        };
        Self::with_detail(code, error)
    }
}

impl From<std::io::Error> for StorageError {
    fn from(error: std::io::Error) -> Self {
        Self::with_detail(StorageErrorCode::Unwritable, error)
    }
}
