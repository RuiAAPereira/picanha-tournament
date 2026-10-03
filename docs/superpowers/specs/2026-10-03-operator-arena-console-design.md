# Operator Arena Console redesign

## Purpose

Replace the organiser application's plain document-style interface with a dark, premium sports-broadcast workspace. The redesign serves the tournament organiser operating a laptop during an event: it must make the tournament state, next action, and safe correction path immediately legible while preserving the existing local-first behaviour and accessibility contracts.

## Scope

The redesign covers every organiser surface:

- Home / tournament lobby
- Tournament setup and draw
- Groups and standings
- Knockout bracket
- Result, correction, and confirmation dialogs
- Shared operator header, notices, save state, presentation controls, and backup action

The TV presentation window, tournament rules, storage, routes, Portuguese content, and domain data are out of scope.

## Visual direction: Arena Console

The operator interface is a dark arena control desk. Its palette uses deep navy-charcoal grounds, elevated graphite panels, warm-white text, and snooker-table green as the interactive accent. Gold is reserved for advancement and champion moments; red is reserved for destructive or error states. Colour never conveys state by itself: labels, iconography where present, text, and contrast carry the same meaning.

The application should feel like an event-management tool before it feels like a game: information-dense, calm under pressure, and quick to operate. The sports-broadcast character comes through precise score hierarchy, progression cues, and panel treatment rather than decorative clutter.

## Shared shell

`OperatorLayout` becomes a persistent event bar and workspace frame.

- A typographic Picanha Tournament mark anchors the left side.
- The tournament name and live state sit beside the mark when a tournament is loaded.
- Primary navigation has a clear active state and is visually separated from utility actions.
- Save status is a labelled live indicator; warnings/errors remain fully announced and actionable.
- Presentation display selection/launch and backup export form a compact utility zone.
- The page body uses a constrained widescreen grid with a distinct page heading/context area and an action-aware content region.

At narrow widths, utility controls wrap deliberately and panels collapse to one column without changing tab order or hiding required actions.

## Screen designs

### Home

The home screen is an event lobby. A large current-tournament panel reports whether the event is active or complete and places “Continuar torneio” as the primary action when available. New tournament and demo loading remain available as secondary actions. The existing replacement confirmation remains a guarded dialog.

### Draw

The pre-draw state reads as a briefing card: event name, player count, format rationale, persistence message, and a decisive draw action. After a draw, groups are roster panels with clear group labels and player lists; preliminary matches remain visibly separated. The route onward to groups is a prominent progression action.

### Groups

Groups are responsive standings boards. A board header contains its group label and progress; the standings table uses rank emphasis, aligned score columns, and an explicit status treatment for any required draw. Completed matches are compact scored result tiles; the next playable match is visually promoted with the result-entry action. Corrections remain available on completed matches, intentionally quieter than play actions. Pending and completed states keep their current semantic headings and order.

### Knockout

Rounds are arranged horizontally as a visual progression at desktop widths and become an ordered vertical progression on narrow screens. Match tiles show completion, availability, and advancement clearly without implying a winner before one exists. A completed tournament gains a distinct champion panel that honours the winner but does not obscure bracket detail.

### Dialogs and forms

Dialogs use the same graphite surface and high-contrast modal layer as the workspace. The match pairing is a strong header. Winner options are large, keyboard-accessible selectable controls; balls remaining is a focused numeric field with a concise explanation; withdrawal remains a clearly labelled alternative. Existing focus trap, Escape cancel, error associations, and return-focus behaviour are retained.

## Component and data approach

The existing React/domain architecture remains intact. `OperatorLayout`, route components, `GroupCard`, `MatchItem`, and modal components receive presentational structure/classes only where necessary to express the new hierarchy. Domain calculations, routing, session storage, result flows, and the presentation-window integration are unchanged.

Reusable visual concepts should be represented by CSS classes/tokens rather than a new UI library: workspace surfaces, status chips, primary/secondary/destructive controls, standings rows, match tiles, and modal fields. All operator styling stays scoped to the operator surface so it cannot affect the presentation window.

## Accessibility and resilience

- Preserve semantic tables, lists, fieldsets, labels, live regions, alerts, and button text/aria labels.
- Keep a high-contrast, consistently visible focus treatment.
- Retain explicit save, retry, warning, and storage-unavailable messages.
- Maintain touch-friendly primary controls and keyboard operation.
- Respect reduced motion; any visual transitions are short, non-blocking, and optional.

## Verification

Existing unit/component tests must continue to pass. Update only assertions legitimately affected by the redesigned accessible structure, and add targeted coverage for any new state/status content. Verify the rendered operator experience at desktop and narrow/mobile widths, including a result dialog. Run the design detector on changed UI targets and conduct a final visual/a11y review before handing off.
