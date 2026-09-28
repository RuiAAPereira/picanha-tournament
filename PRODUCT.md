# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: React + TypeScript + Tauri, selected for a portable Windows executable, mature UI animation tooling, and the team's React experience. SQLite is local only.

## Users

The tournament organiser operates the app on a laptop during informal Portuguese-pool tournaments. Players and spectators follow a full-screen presentation on an extended 16:9 TV display.

## Product Purpose

Picanha Tournament replaces a manually managed tournament spreadsheet with a dependable local tournament engine and a memorable live presentation. Success is fast, low-error operation during the event and an attractive, legible TV experience.

## Positioning

The product combines local tournament administration, transparent draw and qualification decisions, and broadcast-style live presentation in one offline portable app.

## Operating Context

Windows laptop with an extended 2560x1440 TV display. The organiser creates tournaments, enters names and results, corrects errors safely, and starts presentation moments. Events are normally offline.

## Capabilities and Constraints

- One portable Windows executable; no installation and no server.
- SQLite database and exported backups live in a `data` folder next to the executable.
- Autosave after every change, automatic recovery, and manual export backup.
- 4–32 players. The engine prefers groups of four, accepts equally sized groups of 3–5, and can propose transparent preliminary rounds for a clean power-of-two knockout bracket.
- All players begin in one draw pot. The draw result and timestamp are retained.
- Group rules: three points for a win; tiebreakers are fewest balls left by the losing player, head-to-head, then draw.
- A normal result records a winner and the loser's remaining balls. Withdrawal records all balls remaining; past matches stay and future matches become administrative wins.
- Knockout pairings follow a fixed World-Cup-style bracket. Changes that would alter completed later rounds require explicit confirmation.
- The visible language is European Portuguese. Tournament logo is optional; a typographic mark is generated when it is absent.
- The demo exposes New Tournament and Continue Tournament; historical records are retained for a later history view.

## Brand Commitments

Working name: Picanha Tournament. The presentation is a premium sports broadcast: dark arena atmosphere, snooker-table green accent, clear score-first composition, elegant player cards and motion graphics. It must not copy Clash branding or assets. Sound effects play at 40% by default with an always-visible mute control.

## Evidence on Hand

No existing application, logo, player imagery, or brand assets are in the repository. A deterministic demo tournament with fictional player names and prepared results is required.

## Product Principles

- The organiser can always understand and correct the tournament state.
- Fairness is visible: draw, qualification, and tiebreak decisions are explainable.
- Presentation moments are short, skippable, and never delay the tournament.
- Operation stays private on the laptop; spectators receive an uncluttered fullscreen story.
- Local-first means the event continues without internet.

## Accessibility & Inclusion

Use high contrast, large legible type at TV distance, and never communicate tournament state through colour alone. Provide keyboard-operable organiser controls and an always-visible audio mute control.
