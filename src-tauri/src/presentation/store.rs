//! What the app keeps for the TV between windows: the newest published update and the sound setting.

use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Mirrored by `PRESENTATION_ERROR_CODES` in src/platform/presentation.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PresentationErrorCode {
    WindowClosed,
    WindowFailed,
    Unexpected,
}

impl PresentationErrorCode {
    fn user_message(self) -> &'static str {
        match self {
            Self::WindowClosed => "A janela da apresentação está fechada.",
            Self::WindowFailed => "Não foi possível abrir a janela da apresentação.",
            Self::Unexpected => "Ocorreu um erro inesperado na apresentação.",
        }
    }
}

/// Serialised as `{ code, message }`; `message` is European Portuguese and safe to show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PresentationError {
    pub code: PresentationErrorCode,
    pub message: String,
}

impl From<PresentationErrorCode> for PresentationError {
    fn from(code: PresentationErrorCode) -> Self {
        Self { code, message: code.user_message().to_string() }
    }
}

impl PresentationError {
    pub fn logged(code: PresentationErrorCode, detail: impl std::fmt::Display) -> Self {
        eprintln!("[presentation] {detail}");
        code.into()
    }
}

/// Mirrors `PresentationUpdate` in src/presentation/presentationState.ts. `state` stays opaque JSON.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationUpdate {
    /// Increases with every publish from the operator; an older update never replaces a newer one.
    pub seq: u64,
    /// `false` shows the state at once, without animation or sound.
    pub reveal: bool,
    pub state: Value,
}

/// What a newly opened presentation window, or the operator after opening it, reads first.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationSnapshot {
    pub update: Option<PresentationUpdate>,
    pub muted: bool,
}

#[derive(Default)]
pub struct PresentationStore {
    snapshot: Mutex<PresentationSnapshot>,
    /// Held while the window is looked up and built, so two quick opens never race on the label.
    pub opening: Mutex<()>,
}

impl PresentationStore {
    fn lock(&self) -> MutexGuard<'_, PresentationSnapshot> {
        self.snapshot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Keeps `update` unless a newer one is already stored; returns whether it was kept.
    pub fn accept(&self, update: PresentationUpdate) -> bool {
        let mut snapshot = self.lock();
        if snapshot.update.as_ref().is_some_and(|stored| stored.seq >= update.seq) {
            return false;
        }
        snapshot.update = Some(update);
        true
    }

    pub fn set_muted(&self, muted: bool) {
        self.lock().muted = muted;
    }

    pub fn snapshot(&self) -> PresentationSnapshot {
        self.lock().clone()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn update(seq: u64, kind: &str) -> PresentationUpdate {
        PresentationUpdate {
            seq,
            reveal: true,
            state: json!({ "kind": kind, "tournamentName": "Taça", "payload": null }),
        }
    }

    #[test]
    fn store_keeps_the_newest_update_and_sound_setting() {
        let store = PresentationStore::default();
        assert_eq!(store.snapshot(), PresentationSnapshot { update: None, muted: false });

        assert!(store.accept(update(1, "idle")));
        assert!(store.accept(update(2, "draw")));
        store.set_muted(true);

        let snapshot = store.snapshot();
        assert_eq!(snapshot.update.unwrap().state["kind"], "draw");
        assert!(snapshot.muted);
    }

    #[test]
    fn store_drops_older_and_repeated_updates() {
        let store = PresentationStore::default();
        assert!(store.accept(update(5, "result")));
        assert!(!store.accept(update(4, "draw")));
        assert!(!store.accept(update(5, "idle")));
        assert_eq!(store.snapshot().update.unwrap().state["kind"], "result");
    }

    #[test]
    fn update_reads_the_operator_payload() {
        let parsed: PresentationUpdate = serde_json::from_value(json!({
            "seq": 7, "reveal": false, "state": { "kind": "idle", "tournamentName": "Taça", "payload": null },
        }))
        .unwrap();
        assert_eq!(parsed.seq, 7);
        assert!(!parsed.reveal);
    }

    #[test]
    fn snapshot_serialises_for_the_windows() {
        let store = PresentationStore::default();
        store.set_muted(true);
        assert_eq!(serde_json::to_value(store.snapshot()).unwrap(), json!({ "update": null, "muted": true }));
    }

    #[test]
    fn errors_serialise_as_code_and_portuguese_message() {
        let error: PresentationError = PresentationErrorCode::WindowClosed.into();
        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            json!({ "code": "window_closed", "message": "A janela da apresentação está fechada." })
        );
        let failed = serde_json::to_value(PresentationError::from(PresentationErrorCode::WindowFailed)).unwrap();
        assert_eq!(failed["code"], "window_failed");
        let unexpected = serde_json::to_value(PresentationError::from(PresentationErrorCode::Unexpected)).unwrap();
        assert_eq!(unexpected["code"], "unexpected");
    }
}
