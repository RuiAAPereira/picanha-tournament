//! The displays the TV window can go to, and which one an open request means.

use serde::Serialize;

use super::store::{PresentationError, PresentationErrorCode};

/// Asks for a normal window on the operator's screen instead of a display.
pub const WINDOWED: &str = "window";

/// Mirrored by `PresentationDisplay` in src/platform/presentationPort.ts. Sizes and positions are physical.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationDisplay {
    /// The device name, e.g. `\\.\DISPLAY1`.
    pub id: String,
    pub label: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub primary: bool,
    pub scale_factor: f64,
}

/// Where an open request puts the TV window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Display(String),
    Windowed,
}

impl Target {
    /// What the store remembers for the next open without a choice.
    pub fn id(&self) -> &str {
        match self {
            Self::Display(id) => id,
            Self::Windowed => WINDOWED,
        }
    }
}

/// The number Windows gives the display (`\\.\DISPLAY12` is 12), else its place in the list.
pub fn display_number(name: Option<&str>, index: usize) -> u32 {
    let trailing = |name: &str| {
        let digits = name.trim_end_matches(|c: char| c.is_ascii_digit());
        name[digits.len()..].parse().ok()
    };
    name.and_then(trailing).unwrap_or_else(|| u32::try_from(index + 1).unwrap_or(u32::MAX))
}

/// One monitor as the operator sees it; `index` is its place in the monitor list.
pub fn describe_display(
    index: usize,
    name: Option<&str>,
    size: (u32, u32),
    position: (i32, i32),
    scale_factor: f64,
    primary: bool,
) -> (u32, PresentationDisplay) {
    let number = display_number(name, index);
    let display = PresentationDisplay {
        id: name.map_or_else(|| format!("display-{}", index + 1), str::to_string),
        label: format!("Ecrã {number}"),
        width: size.0,
        height: size.1,
        x: position.0,
        y: position.1,
        primary,
        scale_factor,
    };
    (number, display)
}

/// What `requested` means given the connected displays; without a request, the display last chosen
/// in this session, else the first one that is not the primary, else a window.
pub fn choose_target(
    requested: Option<&str>,
    remembered: Option<&str>,
    displays: &[PresentationDisplay],
) -> Result<Target, PresentationError> {
    let listed = |id: &str| displays.iter().any(|display| display.id == id);
    match requested {
        Some(WINDOWED) => Ok(Target::Windowed),
        Some(id) if listed(id) => Ok(Target::Display(id.to_string())),
        Some(_) => Err(PresentationErrorCode::DisplayMissing.into()),
        None => Ok(match remembered {
            Some(WINDOWED) => Target::Windowed,
            Some(id) if listed(id) => Target::Display(id.to_string()),
            // A remembered display that is gone falls back quietly: nobody asked for it this time.
            _ => first_secondary(displays),
        }),
    }
}

fn first_secondary(displays: &[PresentationDisplay]) -> Target {
    if displays.len() < 2 {
        return Target::Windowed;
    }
    displays
        .iter()
        .find(|display| !display.primary)
        .map_or(Target::Windowed, |display| Target::Display(display.id.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn display(id: &str, primary: bool) -> PresentationDisplay {
        PresentationDisplay {
            id: id.into(),
            label: "Ecrã".into(),
            width: 1920,
            height: 1080,
            x: 0,
            y: 0,
            primary,
            scale_factor: 1.0,
        }
    }

    #[test]
    fn numbers_displays_from_the_device_name() {
        assert_eq!(display_number(Some(r"\\.\DISPLAY1"), 4), 1);
        assert_eq!(display_number(Some(r"\\.\DISPLAY12"), 0), 12);
    }

    #[test]
    fn numbers_odd_names_by_their_place() {
        assert_eq!(display_number(Some("Generic PnP Monitor"), 2), 3);
        assert_eq!(display_number(None, 0), 1);
        assert_eq!(display_number(Some(""), 1), 2);
        assert_eq!(display_number(Some("DISPLAY99999999999999999999"), 0), 1);
    }

    #[test]
    fn describes_a_display_for_the_operator() {
        let (number, described) = describe_display(1, Some(r"\\.\DISPLAY2"), (3440, 1440), (0, 0), 1.25, true);
        assert_eq!(number, 2);
        assert_eq!(
            described,
            PresentationDisplay {
                id: r"\\.\DISPLAY2".into(),
                label: "Ecrã 2".into(),
                width: 3440,
                height: 1440,
                x: 0,
                y: 0,
                primary: true,
                scale_factor: 1.25,
            }
        );
        let (_, unnamed) = describe_display(0, None, (1080, 1920), (-1080, -278), 1.0, false);
        assert_eq!((unnamed.id.as_str(), unnamed.label.as_str()), ("display-1", "Ecrã 1"));
    }

    #[test]
    fn serialises_displays_in_camel_case() {
        let value = serde_json::to_value(display("a", true)).unwrap();
        assert_eq!(value["scaleFactor"], 1.0);
        assert_eq!(value["primary"], true);
    }

    #[test]
    fn a_requested_display_is_used_when_connected() {
        let displays = [display("one", false), display("two", true)];
        assert_eq!(choose_target(Some("two"), Some("one"), &displays).unwrap(), Target::Display("two".into()));
        assert_eq!(choose_target(Some(WINDOWED), None, &displays).unwrap(), Target::Windowed);
    }

    #[test]
    fn a_requested_display_that_is_gone_is_missing() {
        let error = choose_target(Some("three"), None, &[display("one", false), display("two", true)]).unwrap_err();
        assert_eq!(error.code, PresentationErrorCode::DisplayMissing);
    }

    #[test]
    fn without_a_request_the_remembered_display_comes_first() {
        let displays = [display("one", false), display("two", true), display("tv", false)];
        assert_eq!(choose_target(None, Some("tv"), &displays).unwrap(), Target::Display("tv".into()));
        assert_eq!(choose_target(None, Some(WINDOWED), &displays).unwrap(), Target::Windowed);
    }

    #[test]
    fn without_a_request_or_a_remembered_display_the_first_secondary_is_used() {
        let displays = [display("main", true), display("one", false), display("tv", false)];
        assert_eq!(choose_target(None, None, &displays).unwrap(), Target::Display("one".into()));
        assert_eq!(choose_target(None, Some("gone"), &displays).unwrap(), Target::Display("one".into()));
    }

    #[test]
    fn a_single_display_gets_a_window() {
        assert_eq!(choose_target(None, None, &[display("main", true)]).unwrap(), Target::Windowed);
        assert_eq!(choose_target(None, None, &[display("unknown", false)]).unwrap(), Target::Windowed);
        assert_eq!(choose_target(None, None, &[]).unwrap(), Target::Windowed);
        assert_eq!(
            choose_target(None, None, &[display("a", true), display("b", true)]).unwrap(),
            Target::Windowed
        );
    }

    #[test]
    fn targets_remember_their_id() {
        assert_eq!(Target::Display("tv".into()).id(), "tv");
        assert_eq!(Target::Windowed.id(), WINDOWED);
    }
}
