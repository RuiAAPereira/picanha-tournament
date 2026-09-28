# Picanha Tournament Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline Windows demo that creates, runs, persists, and presents a Portuguese-pool tournament for 4–32 players.

**Architecture:** The React frontend owns pure tournament rules and the organiser workflow. A narrow Tauri/Rust boundary owns SQLite, the portable `data` directory, backups, and opening/synchronising the second presentation window. The presentation is a separate webview that subscribes to a read-only projection of the current tournament; this keeps operator controls private.

**Tech Stack:** Tauri 2, Rust, React, TypeScript, Vite, Vitest, Testing Library, `rusqlite`, Framer Motion, Web Audio API.

**Spec:** `docs/superpowers/specs/2026-09-28-picanha-tournament-demo-design.md`

## Global Constraints

- Windows portable executable; no network, account, installer, or server.
- Visible copy is European Portuguese.
- SQLite database and exported backups live under `data` beside the executable.
- Autosave after every confirmed mutation; restore the current tournament after restart.
- Support 4–32 players; prioritise groups of four, then equal groups of 3–5 and transparent preliminary rounds.
- Group rules are 3 points for a win; tiebreak order is fewest balls left, head-to-head, then draw.
- Normal result records winner plus the loser's remaining balls; withdrawal means all balls remaining.
- Presentation targets 2560×1440 and remains usable at 1920×1080; all presentation animation is skippable.
- Do not add final decorative art, bespoke charts, or Clash-derived assets in this implementation.

## Review Focus

- A 13-player request must not silently create unequal groups; it must propose an equal-group/preliminary route or block creation with an explanation.
- A tie on points and remaining balls must use head-to-head only when that match exists and finish with an auditable draw when still tied.
- Correcting a group result after a knockout match is confirmed must require explicit destructive confirmation and recompute affected downstream state.
- If the executable directory is temporarily unwritable, save/export must fail clearly without corrupting the previously saved database.
- When the presentation display is absent or closes, tournament operation must continue and the operator must be able to reopen it.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/domain/types.ts` | Immutable TypeScript entities and branded identifiers. |
| `src/domain/standings.ts` | Points, tiebreaking and qualification calculation. |
| `src/domain/formats.ts` | Fair-format proposals, preliminary-round calculation and round-robin fixtures. |
| `src/domain/bracket.ts` | Fixed World-Cup-style knockout slots and downstream invalidation. |
| `src/domain/tournament.ts` | Mutation use cases and state transition guards. |
| `src/domain/*.test.ts` | Pure rule tests co-located with their implementation. |
| `src/platform/tournamentRepository.ts` | Typed frontend adapter for Tauri storage commands. |
| `src/platform/presentation.ts` | Typed frontend adapter for second-window lifecycle and event publication. |
| `src/app/TournamentProvider.tsx` | Loads, mutates and autosaves one tournament session. |
| `src/app/routes/*` | Operator routes: home, setup, groups, bracket and result dialog. |
| `src/presentation/*` | Read-only fullscreen presentation route and presentation states. |
| `src-tauri/src/storage/mod.rs` | Portable database location, migrations, transactions and backup. |
| `src-tauri/src/storage/models.rs` | SQLite row mapping and schema migration definitions. |
| `src-tauri/src/commands.rs` | Tauri commands for snapshots, backups and presentation events. |
| `src-tauri/src/presentation.rs` | Creates/reopens the `presentation` webview and emits state events. |
| `src-tauri/tests/storage.rs` | Temporary-directory persistence and failed-write integration tests. |

### Task 1: Bootstrap the desktop application and test harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`
- Create: `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`
- Create: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`
- Create: `.gitignore`, `README.md`

**Interfaces:**
- Produces `npm run dev`, `npm test`, `npm run typecheck`, and `npm run tauri build`.
- Produces route selection based on `window.location.hash`: `#/operator` and `#/presentation`.

- [ ] **Step 1: Scaffold a Tauri 2 React + TypeScript application without a package manager lockfile generated outside the repository**

Configure the main webview as `operator`, use hash routing, and set the product name to `Picanha Tournament`.

- [ ] **Step 2: Add a failing smoke test for `App`**

```tsx
it('renders the operator shell', () => {
  render(<App />)
  expect(screen.getByRole('main', { name: /torneio/i })).toBeVisible()
})
```

- [ ] **Step 3: Run the smoke test to verify it fails**

Run: `npm test -- App.test.tsx`

Expected: FAIL because the application shell does not exist.

- [ ] **Step 4: Implement the minimal accessible operator shell and test setup**

`App` must expose `<main aria-label="Torneio">` and route `#/presentation` to a temporary read-only placeholder.

- [ ] **Step 5: Run frontend verification**

Run: `npm test -- App.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts vitest.config.ts tsconfig.json src src-tauri .gitignore README.md
git commit -m "build: bootstrap tauri tournament app"
```

### Task 2: Model results and calculate group standings

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/standings.ts`
- Test: `src/domain/standings.test.ts`

**Interfaces:**
- Produces `type PlayerId = string`, `type MatchId = string`, `type MatchResult`, `type GroupStanding`, and `type TournamentMatch`.
- Produces `calculateStandings(players: PlayerId[], matches: TournamentMatch[]): GroupStanding[]`.
- Produces `recordResult(match: TournamentMatch, winnerId: PlayerId, loserBallsRemaining: number, kind?: 'played' | 'withdrawal'): TournamentMatch`.

- [ ] **Step 1: Write failing standing tests for points and every tiebreak tier**

```ts
expect(calculateStandings(['rui', 'sara'], [ruiBeatSaraWith(4)])).toMatchObject([
  { playerId: 'rui', points: 3, ballsLeft: 0 },
  { playerId: 'sara', points: 0, ballsLeft: 4 },
])
expect(tiedOnPointsAndBalls).toBeOrderedByHeadToHead()
expect(stillTied).toHaveProperty('requiresDraw', true)
```

Also test a withdrawal normalises the losing ball count to the configured `ALL_BALLS_REMAINING` constant.

- [ ] **Step 2: Run the domain test to verify it fails**

Run: `npm test -- standings.test.ts`

Expected: FAIL because `calculateStandings` is undefined.

- [ ] **Step 3: Implement `types.ts` and `standings.ts`**

`GroupStanding` must retain `points`, `ballsLeft`, `headToHeadResult`, `rank`, and `requiresDraw`; do not replace unresolved final ties with random data.

- [ ] **Step 4: Run the domain test and typecheck**

Run: `npm test -- standings.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/standings.ts src/domain/standings.test.ts
git commit -m "feat(rules): calculate group standings"
```

### Task 3: Propose fair formats, fixtures and the transparent draw

**Files:**
- Create: `src/domain/formats.ts`
- Test: `src/domain/formats.test.ts`

**Interfaces:**
- Consumes: `PlayerId`, `TournamentMatch` from `src/domain/types.ts`.
- Produces `type FormatProposal`, `proposeFormats(playerCount: number, preferredGroupSize = 4): FormatProposal[]`.
- Produces `drawGroups(playerIds: PlayerId[], proposal: FormatProposal, random: () => number): DrawResult`.
- Produces `createRoundRobinFixtures(groupId: string, playerIds: PlayerId[]): TournamentMatch[]`.

- [ ] **Step 1: Write failing tests for 4, 8, 12, 13, 16 and 32 players**

```ts
expect(proposeFormats(16)[0]).toMatchObject({ groupSize: 4, groupCount: 4, knockoutSize: 8 })
expect(proposeFormats(13).every(x => x.groupSizes.every(size => size === x.groupSizes[0]))).toBe(true)
expect(proposeFormats(13)[0].preliminaryRound).toBeDefined()
```

Test that a seeded random source produces a reproducible one-pot draw and that every pair in a group appears exactly once in the fixtures.

- [ ] **Step 2: Run the format test to verify it fails**

Run: `npm test -- formats.test.ts`

Expected: FAIL because the format functions do not exist.

- [ ] **Step 3: Implement fair proposal ranking and fixture generation**

Rank first by group-size distance from four, then fewest preliminary matches, then largest clean knockout bracket. A proposal must state why it was selected, which players enter a preliminary draw, and whether creation is blocked.

- [ ] **Step 4: Run all format tests**

Run: `npm test -- formats.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/formats.ts src/domain/formats.test.ts
git commit -m "feat(rules): propose fair tournament formats"
```

### Task 4: Create bracket progression and safe correction rules

**Files:**
- Create: `src/domain/bracket.ts`
- Create: `src/domain/tournament.ts`
- Test: `src/domain/bracket.test.ts`
- Test: `src/domain/tournament.test.ts`

**Interfaces:**
- Consumes: domain types, `calculateStandings`, `FormatProposal` and `DrawResult`.
- Produces `createKnockoutBracket(groups: GroupStanding[][], knockoutSize: number): Bracket`.
- Produces `applyMatchResult(state: TournamentState, input: ResultInput): TournamentState`.
- Produces `correctionImpact(state: TournamentState, matchId: MatchId): { requiresConfirmation: boolean; invalidatedMatchIds: MatchId[] }`.
- Produces `correctMatchResult(state: TournamentState, input: ResultInput, confirmed: boolean): TournamentState`.

- [ ] **Step 1: Write failing tests for World-Cup crossings and correction impact**

```ts
expect(createKnockoutBracket([groupA, groupB], 4).rounds[0].matches[0]).toMatchObject({
  home: { group: 'A', rank: 1 }, away: { group: 'B', rank: 2 },
})
expect(correctionImpact(stateWithCompletedSemiFinal, groupMatchId)).toEqual({
  requiresConfirmation: true,
  invalidatedMatchIds: [semiFinalId, finalId],
})
expect(() => correctMatchResult(stateWithCompletedSemiFinal, input, false)).toThrow(/confirmação/i)
```

- [ ] **Step 2: Run bracket and tournament tests to verify they fail**

Run: `npm test -- bracket.test.ts tournament.test.ts`

Expected: FAIL because progression and correction guards do not exist.

- [ ] **Step 3: Implement bracket slots and immutable tournament transitions**

Use fixed group/rank slots rather than a random draw. A correction without downstream effects updates only dependent standings; a confirmed destructive correction clears only affected future results and records an audit event.

- [ ] **Step 4: Run the rule suite**

Run: `npm test -- src/domain && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bracket.ts src/domain/tournament.ts src/domain/bracket.test.ts src/domain/tournament.test.ts
git commit -m "feat(rules): progress bracket safely"
```

### Task 5: Persist an autosaved tournament beside the executable

**Files:**
- Create: `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/storage/models.rs`
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/platform/tournamentRepository.ts`
- Test: `src-tauri/tests/storage.rs`
- Test: `src/platform/tournamentRepository.test.ts`

**Interfaces:**
- Produces Rust commands `load_current_tournament() -> Result<Option<TournamentSnapshot>, StorageError>`, `save_tournament(snapshot: TournamentSnapshot) -> Result<(), StorageError>`, `list_tournaments() -> Result<Vec<TournamentSummary>, StorageError>`, and `export_backup(tournament_id: String, destination: PathBuf) -> Result<(), StorageError>`.
- Produces TypeScript `TournamentRepository` with matching async methods and `createTauriTournamentRepository(): TournamentRepository`.

- [ ] **Step 1: Write failing Rust tests for database location, migration and transaction rollback**

Create a temporary executable directory. Assert SQLite is created under `<executable>/data/picanha-tournament.sqlite`, a saved snapshot reloads identically, and a forced write error leaves the previous snapshot readable.

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml storage`

Expected: FAIL because storage commands are absent.

- [ ] **Step 3: Implement SQLite storage and Tauri command registration**

Use `rusqlite` transactions and a migration table. Store a normalized tournament summary plus a versioned JSON snapshot and immutable audit events; this preserves reliable restoration now while retaining future history query points. Convert I/O errors to Portuguese user-safe messages without exposing paths in the UI.

- [ ] **Step 4: Write and run the failing/passing frontend adapter test**

Mock the Tauri invocation boundary and assert repository methods invoke the correct command name and payload. Run: `npm test -- tournamentRepository.test.ts && cargo test --manifest-path src-tauri/Cargo.toml storage`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri src/platform/tournamentRepository.ts src/platform/tournamentRepository.test.ts
git commit -m "feat(storage): autosave local tournaments"
```

### Task 6: Build the organiser session and core operator flow

**Files:**
- Create: `src/app/TournamentProvider.tsx`
- Create: `src/app/useTournamentSession.ts`
- Create: `src/app/routes/HomePage.tsx`
- Create: `src/app/routes/NewTournamentPage.tsx`
- Create: `src/app/routes/GroupsPage.tsx`
- Create: `src/app/routes/BracketPage.tsx`
- Create: `src/app/components/ResultDialog.tsx`
- Create: `src/app/components/CorrectionConfirmDialog.tsx`
- Test: `src/app/routes/NewTournamentPage.test.tsx`
- Test: `src/app/components/ResultDialog.test.tsx`

**Interfaces:**
- Consumes: `TournamentRepository`, `proposeFormats`, `drawGroups`, and `applyMatchResult`.
- Produces `useTournamentSession(): TournamentSession`, exposing `state`, `createTournament`, `confirmDraw`, `recordResult`, `correctResult`, `openPresentation`, `exportBackup`, and `resumeCurrent`.

- [ ] **Step 1: Write failing UI tests for creation validation and result entry**

```tsx
await user.type(screen.getByLabelText(/jogador/i), 'Rui')
expect(screen.getByText(/formato recomendado/i)).toBeVisible()
await user.click(screen.getByRole('button', { name: /confirmar resultado/i }))
expect(recordResult).toHaveBeenCalledWith(expect.objectContaining({ winnerId: 'rui', loserBallsRemaining: 2 }))
```

Cover 13 players as an explained preliminary proposal, not an invisible uneven grouping. Cover withdrawal setting the loss to all balls remaining.

- [ ] **Step 2: Run UI tests to verify they fail**

Run: `npm test -- NewTournamentPage.test.tsx ResultDialog.test.tsx`

Expected: FAIL because session pages and dialogs do not exist.

- [ ] **Step 3: Implement operator routes and autosave wiring**

Keep controls keyboard-operable. Save only confirmed mutations; surface repository failures inline while preserving the current unsaved state for retry. Require a confirmation dialog when `correctionImpact` says downstream matches would be invalidated.

- [ ] **Step 4: Run operator tests and typecheck**

Run: `npm test -- src/app && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app src/App.tsx
git commit -m "feat(operator): run tournament workflow"
```

### Task 7: Add the second-window presentation and event synchronisation

**Files:**
- Create: `src-tauri/src/presentation.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`
- Create: `src/platform/presentation.ts`
- Create: `src/presentation/PresentationApp.tsx`
- Create: `src/presentation/usePresentationState.ts`
- Create: `src/presentation/DrawPresentation.tsx`
- Create: `src/presentation/ResultPresentation.tsx`
- Create: `src/presentation/ChampionPresentation.tsx`
- Test: `src/platform/presentation.test.ts`
- Test: `src/presentation/PresentationApp.test.tsx`

**Interfaces:**
- Produces `open_presentation_window() -> Result<(), PresentationError>` and `publish_presentation_state(state: PresentationState) -> Result<(), PresentationError>`.
- Produces `PresentationController.open(): Promise<void>` and `PresentationController.publish(state: PresentationState): Promise<void>`.
- Produces `type PresentationState = { kind: 'idle' | 'draw' | 'result' | 'champion'; tournamentName: string; payload: ... }`.

- [ ] **Step 1: Write failing adapter and rendering tests**

```ts
await controller.open()
expect(invoke).toHaveBeenCalledWith('open_presentation_window')
render(<PresentationApp initialState={resultState} />)
expect(screen.getByText('Rui')).toBeVisible()
expect(screen.getByText(/2 bolas/i)).toBeVisible()
```

Test a closed/missing presentation window produces a non-blocking operator warning and that calling `open` again requests a replacement window.

- [ ] **Step 2: Run presentation tests to verify they fail**

Run: `npm test -- presentation.test.ts PresentationApp.test.tsx`

Expected: FAIL because no presentation implementation exists.

- [ ] **Step 3: Implement the stable second webview path and state event**

Create a `presentation` `WebviewWindow` on `#/presentation`, request explicit Tauri permission to create it, then emit `presentation-state` only to that label. The presentation subscribes on mount and renders the last supplied state. The operator remains usable if window creation/event delivery fails.

- [ ] **Step 4: Implement presentation states with reduced-motion support**

Use Framer Motion only for the short draw, result and champion reveals; preserve content visibility with `prefers-reduced-motion`. Add one global mute button, starting at 40% volume, and a `Saltar` control available only to the operator.

- [ ] **Step 5: Run tests and build the debug desktop app**

Run: `npm test -- src/platform/presentation.test.ts src/presentation/PresentationApp.test.tsx && npm run tauri dev`

Expected: automated tests PASS; manually verify the second window can open, close and reopen.

- [ ] **Step 6: Commit**

```bash
git add src-tauri src/platform/presentation.ts src/platform/presentation.test.ts src/presentation
git commit -m "feat(presentation): show live tournament states"
```

### Task 8: Seed the deterministic demo, verify end-to-end and package

**Files:**
- Create: `src/demo/seedTournament.ts`
- Create: `src/demo/seedTournament.test.ts`
- Modify: `src/app/routes/HomePage.tsx`
- Modify: `README.md`
- Create: `docs/manual-test-demo.md`

**Interfaces:**
- Produces `createDemoTournament(): TournamentState` with 16 fictional players, completed group examples, a prepared result presentation and a champion state.
- Produces a documented manual acceptance script for laptop + extended TV.

- [ ] **Step 1: Write a failing deterministic demo test**

```ts
expect(createDemoTournament()).toMatchObject({ players: expect.arrayContaining([expect.objectContaining({ displayName: 'Rui' })]) })
expect(createDemoTournament()).toEqual(createDemoTournament())
```

Also assert it contains four groups of four, a valid eight-place bracket, and no unresolved group tie.

- [ ] **Step 2: Run the demo test to verify it fails**

Run: `npm test -- seedTournament.test.ts`

Expected: FAIL because no deterministic seed exists.

- [ ] **Step 3: Implement the seed and expose `Carregar demonstração`**

The action must create or replace only a newly selected demo session after confirmation; it must never overwrite an in-progress real tournament by default.

- [ ] **Step 4: Run automated verification**

Run: `npm test && npm run typecheck && cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 5: Execute the manual acceptance script and build the Windows package**

Run: `npm run tauri build`

Expected: a Windows executable is produced; verify create → draw → group result → presentation → correction guard → final → restart recovery → backup export on an extended display.

- [ ] **Step 6: Commit**

```bash
git add src/demo src/app/routes/HomePage.tsx README.md docs/manual-test-demo.md
git commit -m "feat(demo): add playable tournament scenario"
```

## Self-Review

- **Spec coverage:** Tasks 2–4 implement rules, fair formats, preliminary rounds, bracket and correction. Task 5 implements portable persistence and backup. Task 6 implements the laptop workflow. Task 7 implements the TV presentation, sound/mute and safe absence behaviour. Task 8 supplies the deterministic demo and packaging verification.
- **Step scan:** Each task begins with a named failing test, then a narrow implementation, a passing command and a scoped commit.
- **Type consistency:** `TournamentState`, `TournamentMatch`, `ResultInput`, `TournamentRepository` and `PresentationState` are the only cross-task state contracts; later tasks consume them by these names.
- **Review focus:** The five listed failure modes are pinned in Tasks 3, 2, 4, 5 and 7 respectively.
- **Proportion:** The plan specifies interfaces, test evidence and file boundaries but leaves ordinary implementation bodies to the executor.
