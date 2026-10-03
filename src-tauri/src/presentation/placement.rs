//! Puts the TV window fullscreen on a display, or in a normal window on the operator's screen.

use tauri::{AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, Runtime, WebviewWindow};

use super::displays::{describe_display, PresentationDisplay};
use super::store::{PresentationError, PresentationErrorCode};
use super::OPERATOR_LABEL;

/// The normal window, for testing on one screen. Logical pixels.
pub const WINDOW_SIZE: (f64, f64) = (1280.0, 720.0);
/// From the corner of the operator's screen, so the title bar stays reachable. Physical pixels.
const WINDOW_OFFSET: i32 = 80;

fn same_monitor(a: &Monitor, b: &Monitor) -> bool {
    a.name() == b.name() && a.position() == b.position()
}

/// The connected monitors in display-number order, each with what the operator is shown of it.
pub fn connected<R: Runtime>(app: &AppHandle<R>) -> Vec<(PresentationDisplay, Monitor)> {
    let monitors = app.available_monitors().unwrap_or_default();
    let primary = app.primary_monitor().ok().flatten();
    let mut listed: Vec<_> = monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let (size, position) = (monitor.size(), monitor.position());
            let (number, display) = describe_display(
                index,
                monitor.name().map(String::as_str),
                (size.width, size.height),
                (position.x, position.y),
                monitor.scale_factor(),
                primary.as_ref().is_some_and(|primary| same_monitor(primary, &monitor)),
            );
            (number, display, monitor)
        })
        .collect();
    listed.sort_by_key(|(number, ..)| *number);
    listed.into_iter().map(|(_, display, monitor)| (display, monitor)).collect()
}

fn is_on<R: Runtime>(window: &WebviewWindow<R>, monitor: &Monitor) -> bool {
    window.current_monitor().ok().flatten().is_some_and(|current| same_monitor(&current, monitor))
}

/// Fullscreen takes the monitor the window is on, so the window leaves fullscreen and moves first.
fn move_to<R: Runtime>(window: &WebviewWindow<R>, monitor: &Monitor) -> tauri::Result<()> {
    window.set_fullscreen(false)?;
    window.set_position(*monitor.position())?;
    window.show()?;
    window.set_fullscreen(true)
}

/// Shows the window fullscreen on `monitor`, checking it got there and trying once more if not.
pub fn fullscreen_on<R: Runtime>(window: &WebviewWindow<R>, monitor: &Monitor) -> Result<(), PresentationError> {
    let failed = |error: tauri::Error| PresentationError::logged(PresentationErrorCode::WindowFailed, error);
    window.unminimize().map_err(failed)?;
    let already_there = window.is_fullscreen().unwrap_or(false) && is_on(window, monitor);
    if !already_there {
        move_to(window, monitor).map_err(failed)?;
        if !is_on(window, monitor) {
            move_to(window, monitor).map_err(failed)?;
        }
        if !is_on(window, monitor) {
            let name = monitor.name().map_or("?", String::as_str);
            return Err(PresentationError::logged(
                PresentationErrorCode::WindowFailed,
                format!("the TV window did not reach {name}"),
            ));
        }
    }
    window.show().and_then(|_| window.set_focus()).map_err(failed)
}

/// A normal, resizable window near the corner of the screen the operator window is on.
pub fn windowed<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) -> tauri::Result<()> {
    let screen = app
        .get_webview_window(OPERATOR_LABEL)
        .and_then(|operator| operator.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    window.unminimize()?;
    window.set_fullscreen(false)?;
    window.set_resizable(true)?;
    if let Some(screen) = screen {
        let corner = screen.position();
        window.set_position(PhysicalPosition::new(corner.x + WINDOW_OFFSET, corner.y + WINDOW_OFFSET))?;
    }
    // After the move, so the size follows the scale of the screen it ends up on.
    window.set_size(LogicalSize::new(WINDOW_SIZE.0, WINDOW_SIZE.1))?;
    window.show()?;
    window.set_focus()
}
