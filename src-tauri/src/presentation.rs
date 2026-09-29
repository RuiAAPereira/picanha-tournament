//! The TV presentation window: lifecycle, the last published state, and events sent only to it.

use std::sync::{Mutex, MutexGuard};

use serde::Serialize;
use serde_json::Value;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, Runtime, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

pub const PRESENTATION_LABEL: &str = "presentation";
const PRESENTATION_URL: &str = "index.html#/presentation";
const PRESENTATION_TITLE: &str = "Picanha Tournament — Apresentação";
pub const STATE_EVENT: &str = "presentation-state";
pub const SKIP_EVENT: &str = "presentation-skip";
pub const MUTED_EVENT: &str = "presentation-muted";

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
    fn logged(code: PresentationErrorCode, detail: impl std::fmt::Display) -> Self {
        eprintln!("[presentation] {detail}");
        code.into()
    }
}

/// What a newly opened presentation window reads first.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationSnapshot {
    /// The last published `PresentationState`, kept as opaque JSON.
    pub state: Option<Value>,
    pub muted: bool,
}

/// The last published state and sound setting, kept while the TV window is closed or reopened.
#[derive(Default)]
pub struct PresentationStore {
    snapshot: Mutex<PresentationSnapshot>,
}

impl PresentationStore {
    fn lock(&self) -> MutexGuard<'_, PresentationSnapshot> {
        self.snapshot.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn store_state(&self, state: Value) {
        self.lock().state = Some(state);
    }

    pub fn set_muted(&self, muted: bool) {
        self.lock().muted = muted;
    }

    pub fn snapshot(&self) -> PresentationSnapshot {
        self.lock().clone()
    }
}

/// Sends to the presentation window when there is one; a missing window is `window_closed`.
fn deliver(
    window_open: bool,
    emit: impl FnOnce() -> tauri::Result<()>,
) -> Result<(), PresentationError> {
    if !window_open {
        return Err(PresentationErrorCode::WindowClosed.into());
    }
    emit().map_err(|error| PresentationError::logged(PresentationErrorCode::Unexpected, error))
}

fn presentation_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(PRESENTATION_LABEL)
}

fn emit_to_presentation<R: Runtime, S: Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: S,
) -> Result<(), PresentationError> {
    deliver(presentation_window(app).is_some(), || {
        app.emit_to(PRESENTATION_LABEL, event, payload)
    })
}

/// The first monitor that is not the primary one, when more than one is connected.
fn secondary_monitor<R: Runtime>(app: &AppHandle<R>) -> Option<Monitor> {
    let monitors = app.available_monitors().ok()?;
    if monitors.len() < 2 {
        return None;
    }
    let primary = app.primary_monitor().ok().flatten();
    monitors.into_iter().find(|monitor| {
        primary.as_ref().is_none_or(|primary| {
            primary.position() != monitor.position() || primary.name() != monitor.name()
        })
    })
}

fn build_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let builder = WebviewWindowBuilder::new(
        app,
        PRESENTATION_LABEL,
        WebviewUrl::App(PRESENTATION_URL.into()),
    )
    .title(PRESENTATION_TITLE);

    match secondary_monitor(app) {
        Some(monitor) => {
            // Hidden until it sits fullscreen on the TV, so it never flashes on the operator screen.
            let window = builder.visible(false).build()?;
            let PhysicalPosition { x, y } = *monitor.position();
            window.set_position(PhysicalPosition::new(x, y))?;
            window.set_fullscreen(true)?;
            window.show()?;
        }
        None => {
            builder.inner_size(1280.0, 720.0).resizable(true).build()?;
        }
    }
    Ok(())
}

/// Shows and focuses the presentation window, or creates it (again, after it was closed).
/// The window reads the latest state itself through `get_presentation_state` once mounted.
#[tauri::command(async)]
pub fn open_presentation_window<R: Runtime>(app: AppHandle<R>) -> Result<(), PresentationError> {
    if let Some(window) = presentation_window(&app) {
        let shown = window.unminimize().and_then(|_| window.show()).and_then(|_| window.set_focus());
        return shown.map_err(|error| PresentationError::logged(PresentationErrorCode::WindowFailed, error));
    }
    build_window(&app).map_err(|error| PresentationError::logged(PresentationErrorCode::WindowFailed, error))
}

/// Keeps `state` for a window opened later, then sends it to the open window, if any.
#[tauri::command(async)]
pub fn publish_presentation_state<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PresentationStore>,
    state: Value,
) -> Result<(), PresentationError> {
    store.store_state(state.clone());
    emit_to_presentation(&app, STATE_EVENT, state)
}

#[tauri::command]
pub fn get_presentation_state(store: State<'_, PresentationStore>) -> PresentationSnapshot {
    store.snapshot()
}

/// Completes the reveal running on the TV at once.
#[tauri::command(async)]
pub fn skip_presentation<R: Runtime>(app: AppHandle<R>) -> Result<(), PresentationError> {
    emit_to_presentation(&app, SKIP_EVENT, ())
}

/// Kept for the next window; sent to the open one. Without a window there is nothing to tell.
#[tauri::command(async)]
pub fn set_presentation_muted<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PresentationStore>,
    muted: bool,
) -> Result<(), PresentationError> {
    store.set_muted(muted);
    match emit_to_presentation(&app, MUTED_EVENT, muted) {
        Err(PresentationError { code: PresentationErrorCode::WindowClosed, .. }) => Ok(()),
        other => other,
    }
}

/// The TV has no controls of its own worth keeping once the operator window is gone.
pub fn close_with_operator<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = presentation_window(app) {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn store_keeps_the_last_state_and_sound_setting() {
        let store = PresentationStore::default();
        assert_eq!(store.snapshot(), PresentationSnapshot { state: None, muted: false });

        store.store_state(json!({ "kind": "idle", "tournamentName": "Taça", "payload": null }));
        store.store_state(json!({ "kind": "draw", "tournamentName": "Taça", "payload": {} }));
        store.set_muted(true);

        let snapshot = store.snapshot();
        assert_eq!(snapshot.state.unwrap()["kind"], "draw");
        assert!(snapshot.muted);
    }

    #[test]
    fn snapshot_serialises_for_the_presentation_window() {
        let store = PresentationStore::default();
        store.set_muted(true);
        assert_eq!(serde_json::to_value(store.snapshot()).unwrap(), json!({ "state": null, "muted": true }));
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

    #[test]
    fn delivery_without_a_window_reports_it_closed_and_does_not_emit() {
        let mut emitted = false;
        let result = deliver(false, || {
            emitted = true;
            Ok(())
        });
        assert_eq!(result.unwrap_err().code, PresentationErrorCode::WindowClosed);
        assert!(!emitted);
    }

    #[test]
    fn delivery_to_an_open_window_emits() {
        let mut emitted = false;
        deliver(true, || {
            emitted = true;
            Ok(())
        })
        .unwrap();
        assert!(emitted);
    }

    #[test]
    fn a_failed_emit_is_unexpected() {
        let result = deliver(true, || Err(tauri::Error::WindowNotFound));
        assert_eq!(result.unwrap_err().code, PresentationErrorCode::Unexpected);
    }
}
