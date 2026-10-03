//! The TV presentation window: its lifecycle, and the events sent to it and back to the operator.

mod store;

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, Monitor, Runtime, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub use store::{
    PresentationError, PresentationErrorCode, PresentationSnapshot, PresentationStore,
    PresentationUpdate,
};

pub const PRESENTATION_LABEL: &str = "presentation";
pub const OPERATOR_LABEL: &str = "operator";
const PRESENTATION_URL: &str = "index.html#/presentation";
const PRESENTATION_TITLE: &str = "Picanha Tournament — Apresentação";
/// To the TV.
pub const STATE_EVENT: &str = "presentation-state";
pub const SKIP_EVENT: &str = "presentation-skip";
/// To every window, so the operator and the TV show the same sound setting.
pub const MUTED_EVENT: &str = "presentation-muted";
/// To the operator, when the TV window is gone.
pub const CLOSED_EVENT: &str = "presentation-closed";

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

/// Moves the hidden window onto the TV, shows it, then makes it fullscreen there.
fn place_on<R: Runtime>(window: &WebviewWindow<R>, monitor: &Monitor) -> tauri::Result<()> {
    window.set_position(*monitor.position())?;
    window.show()?;
    window.set_fullscreen(true)
}

fn build_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let builder = WebviewWindowBuilder::new(
        app,
        PRESENTATION_LABEL,
        WebviewUrl::App(PRESENTATION_URL.into()),
    )
    .title(PRESENTATION_TITLE);

    let Some(monitor) = secondary_monitor(app) else {
        builder.inner_size(1280.0, 720.0).resizable(true).build()?;
        return Ok(());
    };
    // Hidden until it sits on the TV, so it never flashes on the operator screen.
    let window = builder.visible(false).build()?;
    place_on(&window, &monitor).inspect_err(|_| {
        // A half-placed window would hold the label; the next open starts clean.
        let _ = window.destroy();
    })
}

/// Shows and focuses the presentation window, or creates it (again, after it was closed).
/// The window reads the latest update itself through `get_presentation_state` once it listens.
#[tauri::command(async)]
pub fn open_presentation_window<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PresentationStore>,
) -> Result<(), PresentationError> {
    let _opening = store.opening.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let failed =
        |error: tauri::Error| PresentationError::logged(PresentationErrorCode::WindowFailed, error);
    if let Some(window) = presentation_window(&app) {
        return window
            .unminimize()
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus())
            .map_err(failed);
    }
    build_window(&app).map_err(failed)
}

// The commands below are synchronous on purpose: they run one after another, in call order, on the
// main thread, so a newer state, skip or mute never lands before an older one.

/// Keeps `update` for a window opened later, then sends it to the open window, if any.
/// An update older than the stored one is dropped quietly.
#[tauri::command]
pub fn publish_presentation_state<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PresentationStore>,
    update: PresentationUpdate,
) -> Result<(), PresentationError> {
    if !store.accept(update.clone()) {
        return Ok(());
    }
    emit_to_presentation(&app, STATE_EVENT, update)
}

#[tauri::command]
pub fn get_presentation_state(store: State<'_, PresentationStore>) -> PresentationSnapshot {
    store.snapshot()
}

/// Completes the reveal running on the TV at once.
#[tauri::command]
pub fn skip_presentation<R: Runtime>(app: AppHandle<R>) -> Result<(), PresentationError> {
    emit_to_presentation(&app, SKIP_EVENT, ())
}

/// Kept for the next window and told to both windows, whichever of them changed it. Without a TV
/// window there is nothing more to tell, so that is not an error.
#[tauri::command]
pub fn set_presentation_muted<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PresentationStore>,
    muted: bool,
) -> Result<(), PresentationError> {
    store.set_muted(muted);
    app.emit(MUTED_EVENT, muted)
        .map_err(|error| PresentationError::logged(PresentationErrorCode::Unexpected, error))
}

/// Tells the operator the TV window is gone, so it stops offering the TV controls.
pub fn presentation_closed<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit_to(OPERATOR_LABEL, CLOSED_EVENT, ());
}

/// The TV has nothing worth keeping once the operator window is gone.
pub fn close_with_operator<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = presentation_window(app) {
        let _ = window.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
