# Operator Arena Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain organiser interface with a dark, accessible Arena Console that makes tournament state and next actions fast to scan across every operator screen.

**Architecture:** Preserve the existing React routes, session/provider, domain model, result flow, and presentation integration. Evolve the shared operator shell plus its CSS token system first, then add small presentational structures/classes to each screen and reusable match/dialog component; no new UI framework or data interface is introduced.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, scoped CSS.

**Spec:** `docs/superpowers/specs/2026-10-03-operator-arena-console-design.md`

## Global Constraints

- Keep all visible product copy in European Portuguese.
- Do not change tournament rules, route semantics, storage, autosave, or presentation-window behavior.
- Keep all operator styles scoped under `.operator`; presentation styles must be unaffected.
- Preserve semantic tables/forms/lists, labels, alerts, live regions, keyboard operation, focus handling, and visible high-contrast focus.
- Use deep navy-charcoal, graphite panels, warm-white text, snooker-green interaction accents; reserve gold for progression/champion treatment and red for errors/destructive actions.
- Motion, if used, is short, non-blocking, and disabled/reduced for `prefers-reduced-motion`.

## Review Focus

- A narrow viewport keeps every command and primary result action reachable without horizontal page overflow; cover with a rendered CSS/manual viewport check in Task 5.
- Save failure, unavailable storage, and informational notices retain text, role, and recovery actions after the shell markup moves; cover with OperatorLayout tests in Task 1.
- A match awaiting players or an unresolved knockout slot never gains a false playable/result state; retain the existing no-button assertion in Task 4.
- Result dialog keyboard focus, Escape cancellation, validation association, and withdrawal behavior survive the visual-control markup change; retain and extend ResultDialog tests in Task 3.
- A completed tournament announces the champion as text in addition to its gold visual treatment; retain the existing bracket champion assertion in Task 4.

---

## File structure

- `src/app/OperatorLayout.tsx` — shared event bar, navigation state hooks, save/notice surface structure.
- `src/app/app.css` — Arena Console tokens, responsive workspace, controls, panels, standings, matches, bracket, and modal styling.
- `src/app/routes/HomePage.tsx` — event lobby composition and action hierarchy.
- `src/app/routes/DrawPage.tsx` — draw briefing and roster-panel composition.
- `src/app/routes/GroupsPage.tsx` — groups page context and preliminary/tie grouping.
- `src/app/routes/BracketPage.tsx` — bracket context and champion panel composition.
- `src/app/components/GroupCard.tsx` — standings-board semantic structure and progress metadata.
- `src/app/components/MatchItem.tsx` — reusable match-tile state classes and score/action hierarchy.
- `src/app/components/ResultDialog.tsx` — winner-card and score-form structure while retaining input semantics.
- `src/app/routes/HomePage.test.tsx`, `src/app/routes/GroupsPage.test.tsx`, `src/app/routes/BracketPage.test.tsx`, `src/app/components/ResultDialog.test.tsx` — flow and accessibility regression coverage.
- `src/app/OperatorLayout.test.tsx` — new shell status/action regression coverage.

### Task 1: Establish the Arena Console shell and styling foundation

**Files:**
- Create: `src/app/OperatorLayout.test.tsx`
- Modify: `src/app/OperatorLayout.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `useTournamentSession()`, `PresentationControls`, `ROUTES`, existing `SAVE_LABELS`.
- Produces: `main.operator.operator-page` with an event bar, labelled save/status region, navigation, and utility actions that all routes inherit.

- [ ] **Step 1: Write failing shell tests**

Add `OperatorLayout.test.tsx` using `renderOperator` and `fakeRepository`. Assert the accessible `Torneio` main landmark contains navigation links for the active session, a labelled save status with `Guardado`, the presentation control, and backup button. Add a storage-error fixture/assertion that the alert contains the retry action.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `rtk npm test -- --run src/app/OperatorLayout.test.tsx`

Expected: FAIL because the event-bar/status structure assertions are not yet present.

- [ ] **Step 3: Implement the shared event bar in `OperatorLayout.tsx`**

Keep the current controls and handler functions. Add structural classes for brand, tournament context, primary navigation, utilities, and save state; derive the current route from `window.location.hash` only for a non-semantic active visual class/`aria-current="page"`. Do not remove the existing live region or error/warning/retry behavior.

- [ ] **Step 4: Replace the base operator CSS in `src/app/app.css`**

Define the dark token palette and shared primitive classes: workspace background, elevated panel, button hierarchy, form controls, status chips/banners, responsive event bar, focus ring, and reduced-motion fallback. Preserve existing selectors needed by unmodified components until their tasks migrate them.

- [ ] **Step 5: Run focused shell tests and typecheck**

Run: `rtk npm test -- --run src/app/OperatorLayout.test.tsx; rtk npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/OperatorLayout.tsx src/app/OperatorLayout.test.tsx src/app/app.css
git commit -m "feat: establish arena console operator shell"
```

### Task 2: Compose the event lobby, setup, and draw as operator panels

**Files:**
- Modify: `src/app/routes/HomePage.tsx`
- Modify: `src/app/routes/NewTournamentPage.tsx`
- Modify: `src/app/routes/DrawPage.tsx`
- Modify: `src/app/routes/HomePage.test.tsx`
- Modify: `src/app/routes/NewTournamentPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 panel/control classes and all existing session/navigation functions.
- Produces: semantic page-region classes for lobby, setup, briefing, and roster panels; all existing button/link names stay unchanged.

- [ ] **Step 1: Write failing page-structure assertions**

Extend HomePage coverage to find a labelled current-tournament panel while retaining the existing replacement-dialog assertions. Extend NewTournamentPage coverage to find labelled enrolment and format sections after player interaction. Add DrawPage coverage that verifies the pre-draw briefing and drawn group roster regions without changing links/actions.

- [ ] **Step 2: Run the affected route tests to verify they fail**

Run: `rtk npm test -- --run src/app/routes/HomePage.test.tsx src/app/routes/NewTournamentPage.test.tsx src/app/routes/DrawPage.test.tsx`

Expected: FAIL because the new labelled panel structure is absent.

- [ ] **Step 3: Implement lobby, setup, and draw composition**

In `HomePage`, wrap existing status and actions in a labelled event-lobby panel and retain confirmation behavior. In `NewTournamentPage`, add classes/section labels for the enrolment stream and format choices without changing form data or labels. In `DrawPage`, add a briefing panel before drawing and labelled roster panels after drawing; preserve pre-elimination content and route targets.

- [ ] **Step 4: Add corresponding scoped styles**

Implement the wide/narrow grids, panel hierarchy, player roster treatment, format-choice selection treatment, and primary/secondary action placement in `app.css`. Do not target global elements outside `.operator`.

- [ ] **Step 5: Run route tests and typecheck**

Run: `rtk npm test -- --run src/app/routes/HomePage.test.tsx src/app/routes/NewTournamentPage.test.tsx src/app/routes/DrawPage.test.tsx; rtk npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/routes/HomePage.tsx src/app/routes/NewTournamentPage.tsx src/app/routes/DrawPage.tsx src/app/routes/HomePage.test.tsx src/app/routes/NewTournamentPage.test.tsx src/app/routes/DrawPage.test.tsx src/app/app.css
git commit -m "feat: redesign tournament lobby and draw workflow"
```

### Task 3: Turn group boards, match rows, and result dialogs into operational controls

**Files:**
- Modify: `src/app/routes/GroupsPage.tsx`
- Modify: `src/app/components/GroupCard.tsx`
- Modify: `src/app/components/MatchItem.tsx`
- Modify: `src/app/components/ResultDialog.tsx`
- Modify: `src/app/routes/GroupsPage.test.tsx`
- Modify: `src/app/components/ResultDialog.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: current `ResultFlow`, `groupStandings`, `isGroupFinished`, match result types, and Task 1 tokens.
- Produces: `GroupCard` standings boards and `MatchItem` stateful match tiles; `ResultDialog` still submits `ResultEntry` exactly as before.

- [ ] **Step 1: Write failing state-structure tests**

Extend GroupsPage tests to assert each group remains a labelled region with a standings table and that its available result action is contained in the group board. Extend ResultDialog tests to assert the winner options remain radio controls inside a labelled winner section and the confirmation control remains available after a selection.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `rtk npm test -- --run src/app/routes/GroupsPage.test.tsx src/app/components/ResultDialog.test.tsx`

Expected: FAIL on the new labelled state-board/winner-section assertions.

- [ ] **Step 3: Implement group-board and match-tile structure**

In `GroupsPage` and `GroupCard`, add page/context, board-header, standings, pending, and completed match-section classes; keep existing headings, tables, live error, warning, and tie-draw behavior. In `MatchItem`, derive a `match--complete`, `match--ready`, or `match--waiting` class from existing result/readiness values without changing button conditions or accessible names.

- [ ] **Step 4: Implement dialog control structure**

In `ResultDialog`, apply classes around the pairing header, winner fieldset, choices, score entry, and footer actions. Keep native radio/checkbox/input controls, validation `aria-describedby`, focus management through `Modal`, and the exact `onConfirm` payload.

- [ ] **Step 5: Style boards, tiles, and dialog controls**

Use dense score-first standings, promoted ready-match action, subdued completed result, explicit waiting state, and high-contrast winner-selection controls. Add responsive group grid rules and ensure dialog content fits a narrow viewport with no clipped controls.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `rtk npm test -- --run src/app/routes/GroupsPage.test.tsx src/app/components/ResultDialog.test.tsx; rtk npm run typecheck`

Expected: PASS; existing result recording, correction, tie draw, focus, and validation assertions remain green.

- [ ] **Step 7: Commit**

```bash
git add src/app/routes/GroupsPage.tsx src/app/components/GroupCard.tsx src/app/components/MatchItem.tsx src/app/components/ResultDialog.tsx src/app/routes/GroupsPage.test.tsx src/app/components/ResultDialog.test.tsx src/app/app.css
git commit -m "feat: redesign group boards and result controls"
```

### Task 4: Render knockout progression and champion state as a bracket surface

**Files:**
- Modify: `src/app/routes/BracketPage.tsx`
- Modify: `src/app/routes/BracketPage.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `MatchItem` state classes from Task 3, `championId`, `roundName`, and existing bracket route data.
- Produces: labelled round panels in a responsive progression surface and a text-backed champion panel.

- [ ] **Step 1: Write failing bracket-surface assertions**

Extend BracketPage tests to assert that each existing round region is inside a labelled bracket progression container and that a finished tournament exposes a labelled champion region containing `Campeão: Ana`. Keep the unresolved-slot assertion that no result button exists.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `rtk npm test -- --run src/app/routes/BracketPage.test.tsx`

Expected: FAIL because the progression/champion regions do not yet exist.

- [ ] **Step 3: Implement bracket and champion structure**

Wrap rounds in a labelled progression container; retain the current heading, round regions, match ordering, and links. Render the champion text in a separate labelled panel only when `championId` returns a player.

- [ ] **Step 4: Style responsive progression**

At desktop, use a horizontally scrollable/visible round progression with connected visual rhythm; at narrow widths, use a vertically ordered stack. Give the champion panel the reserved gold accent while maintaining text contrast.

- [ ] **Step 5: Run focused bracket tests and typecheck**

Run: `rtk npm test -- --run src/app/routes/BracketPage.test.tsx; rtk npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/routes/BracketPage.tsx src/app/routes/BracketPage.test.tsx src/app/app.css
git commit -m "feat: redesign knockout progression"
```

### Task 5: Verify the finished operator surface

**Files:**
- Modify: any Task 1–4 file only if verification exposes a concrete issue
- Create: `.impeccable/review/desktop.png`
- Create: `.impeccable/review/mobile.png`

**Interfaces:**
- Consumes: the completed operator app and the spec’s visual/accessibility constraints.
- Produces: verified desktop/mobile evidence and a detector report suitable for final review.

- [ ] **Step 1: Run the complete automated suite**

Run: `rtk npm test; rtk npm run build`

Expected: all tests pass and Vite production build succeeds.

- [ ] **Step 2: Capture and inspect desktop and narrow operator states**

Use the app preview to capture Home, Draw, Groups with an open result dialog, and Knockout at a desktop width and a narrow/mobile width. Save validated top-of-page captures to the two required review paths; ensure no hidden/incomplete entrance state, clipped control, or horizontal page overflow is present.

- [ ] **Step 3: Run the Impeccable mechanical detector once**

Run: `rtk node "C:\\Users\\ruisa\\.agents\\skills\\impeccable\\scripts\\detect.mjs" --json src/app/OperatorLayout.tsx src/app/routes/HomePage.tsx src/app/routes/NewTournamentPage.tsx src/app/routes/DrawPage.tsx src/app/routes/GroupsPage.tsx src/app/routes/BracketPage.tsx src/app/components/GroupCard.tsx src/app/components/MatchItem.tsx src/app/components/ResultDialog.tsx src/app/app.css`

Expected: inspect the JSON findings, fix only mechanical UI defects it identifies, then rerun the affected tests/build. Do not run the detector a second time.

- [ ] **Step 4: Commit any verification fixes and evidence**

```bash
git add .impeccable/review src/app
git commit -m "chore: verify arena console redesign"
```

## Plan self-review

- **Spec coverage:** Task 1 implements the shared shell, palette, accessibility/resilience, and responsive base; Task 2 covers home, setup, and draw; Task 3 covers groups, match states, and dialogs; Task 4 covers bracket/champion progression; Task 5 verifies desktop/mobile, detector, tests, and build.
- **Step scan:** Each task starts with an observable failing assertion and pairs implementation with focused verification. Styling is grouped with the owning semantic component rather than being an untestable standalone task.
- **Type consistency:** No new domain types or public APIs are introduced. Existing `ResultEntry`, `ResultFlow`, `TournamentState`, and route components stay their current contracts.
- **Review Focus:** All five listed user-risk cases map to Tasks 1, 3, 4, and 5, with existing checks explicitly retained where they already cover the behavior.
- **Proportion:** The plan records only structural/class/test decisions needed to execute the approved redesign; CSS values and implementation bodies remain for the implementer to author within the spec.
