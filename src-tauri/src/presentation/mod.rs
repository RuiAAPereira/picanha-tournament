//! The TV presentation window: its lifecycle, and the events sent to it and back to the operator.

mod displays;
mod placement;
mod store;

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, Runtime, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use displays::{choose_target, PresentationDisplay, Target};

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

fn build_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    let (width, height) = placement::WINDOW_SIZE;
    WebviewWindowBuilder::new(app, PRESENTATION_LABEL, WebviewUrl::App(PRESENTATION_URL.into()))
        .title(PRESENTATION_TITLE)
        .inner_size(width, height)
        // Hidden until it sits where it belongs, so it never flashes on the operator screen.
        .visible(false)
        .build()
}

/// The connected displays, by number, for the operator to choose where the TV window goes.
#[tauri::command]
pub fn list_presentation_displays<R: Runtime>(app: AppHandle<R>) -> Vec<PresentationDisplay> {
    placement::connected(&app).into_iter().map(|(display, _)| display).collect()
}

/// Puts the presentation window on `display` (or in a normal window for `WINDOWED`), creating it
/// when needed and moving it when it is already open. Without `display`, the one last chosen in this
/// session, else the first secondary display, else a normal window. The window reads the latest
/// update itself through `get_presentation_state` once it listens.
#[tauri::command(async)]
pub fn open_presentation_window<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PresentationStore>,
    display: Option<String>,
) -> Result<(), PresentationError> {
    let _opening = store.opening.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let failed =
        |error: tauri::Error| PresentationError::logged(PresentationErrorCode::WindowFailed, error);
    let connected = placement::connected(&app);
    let displays: Vec<_> = connected.iter().map(|(display, _)| display.clone()).collect();
    let target = choose_target(display.as_deref(), store.remembered_display().as_deref(), &displays)?;
    let monitor = match &target {
        Target::Display(id) => connected.iter().find(|(display, _)| &display.id == id).map(|(_, monitor)| monitor),
        Target::Windowed => None,
    };

    let existing = presentation_window(&app);
    let fresh = existing.is_none();
    let window = match existing {
        Some(window) => window,
        None => build_window(&app).map_err(failed)?,
    };
    let placed = match monitor {
        Some(monitor) => placement::fullscreen_on(&window, monitor),
        None => placement::windowed(&app, &window).map_err(failed),
    };
    if placed.is_err() && fresh {
        // A half-placed window would hold the label; the next open starts clean.
        let _ = window.destroy();
    }
    // A failed move of an open window keeps it, possibly out of fullscreen or between screens: it
    // still shows the tournament, and choosing a display and moving it again puts it right.
    placed?;
    store.remember_display(target.id());
    Ok(())
}

/// Closes the presentation window, if there is one; the operator hears of it through `CLOSED_EVENT`.
/// Waits for an open in progress, so it never closes a window still being placed.
#[tauri::command(async)]
pub fn close_presentation_window<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, PresentationStore>,
) -> Result<(), PresentationError> {
    let _opening = store.opening.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    match presentation_window(&app) {
        Some(window) => window
            .destroy()
            .map_err(|error| PresentationError::logged(PresentationErrorCode::Unexpected, error)),
        None => Ok(()),
    }
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
