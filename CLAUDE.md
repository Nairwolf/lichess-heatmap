# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev                          # Vite dev server on http://localhost:5173 (strictPort)
npm run build                        # tsc --noEmit, then vite build into dist/
npx tsc --noEmit                     # type-check only
npm test                             # vitest run (all tests)
npx vitest run src/store/sync.test.ts        # one test file
npx vitest run -t "fetches a newly selected range"   # one test by name
```

No linter or formatter is configured. `tsconfig.json` is strict with `noUnusedLocals`/`noUnusedParameters`, so unused code fails the build.

## What it is

A client-only React 19 + Vite app (no backend) that draws a GitHub-style activity calendar of a Lichess user's games. Games are streamed from the public Lichess API and cached in IndexedDB (via `idb`). An optional personal API token is kept in localStorage under `lichess-heatmap:token`. Opening `/?u=<name>` loads a user directly.

## Architecture

Data flows in one direction: **Lichess API → `GameRecord` → IndexedDB → React state → pure analysis → SVG components.**

### `src/lichess/`: API client and normalization
- `api.ts` streams NDJSON from `/api/games/user/{name}` (always `moves=false`, `sort=dateDesc`, `since`/`until` in ms) and `/api/games/export/_ids` (max 300 ids per POST). It maps HTTP statuses to `UserNotFoundError`, `RateLimitedError` and `InvalidTokenError`.
- `normalize.ts` turns a raw `LichessGame` into a compact, per-user `GameRecord` (the user's color, result, opponent, clock, opening). It returns `null` for games that never really started (`created`, `started`, `aborted`, `noStart`); the sync also relies on this to spot ongoing games. `playDuration` counts correspondence games as 0.
- `fixtures.ts` holds real-shaped API lines used by the tests.

### `src/store/`: cache and sync engine
- `db.ts`: the IndexedDB database `lichess-heatmap`. The `games` store is keyed by game id with a `byUser` index on `[userId, createdAt]`. The `meta` store holds one `SyncMeta` per user: `covered` intervals, `pendingIds` (games ongoing at the last sync) and `lastSyncAt`.
- `intervals.ts`: closed `[start, end]` ms intervals (merge, gaps, split around a priority range, prioritize).
- `sync.ts`: `GameSync` downloads whatever `meta.covered` is missing between the account's creation and now. The README explains the design; the invariants to keep when editing it:
  - **Exactly 2 concurrent export streams** (`WORKERS`). Lichess allows only 2 per IP and refuses clients that send too many requests, so the sync makes a few long requests. A worker with nothing left to do takes the older half of another stream's remaining span (`steal`). Spans shorter than `MIN_STEAL_MS` (3 days) are never split off.
  - Games stream newest-first. `remainingEnd` moves down as games arrive, and coverage is recorded batch by batch (every `BATCH_SIZE` games), so an interrupted sync resumes where it stopped.
  - The newest 12 h (`LIVE_MARGIN_MS`) is never marked covered, so live games get picked up next time. Ongoing games (e.g. correspondence) are stored as `pendingIds` and re-fetched by id on the next sync.
  - A 429, or a `TypeError` (a refusal without CORS headers), counts as transient: all workers pause for 60 s and then resume. Other errors abort the sync.
  - `setPriority(range)` reorders the queue and may interrupt a stream so that the range on screen downloads first. `priorityDone` in the progress events tells the UI when that range is complete.
  - Reloading within 5 min of a sync (`RECENT_SYNC_MS`) skips the network unless `force` is set (the Refresh button).

### `src/analysis/`: pure functions, no React
- `dates.ts`: calendar days are **day numbers** (integer days since 1970-01-01 for the calendar date in the chosen time zone, `'local' | 'utc'`), which keeps day arithmetic safe across DST changes. `DayRange` is in day numbers; `dayStartMs` converts back to ms. Keep in mind: sync intervals are in **ms**, view ranges are in **day numbers**.
- `filters.ts` (`Filters`, `matchesFilters`, `facetCounts`), `aggregate.ts` (per-day `DayStats`, metrics, weekday×hour matrix, streaks), `colorScale.ts` (quantile/linear scales). Color levels go from 0 to 4, and from −1 to −4 on the diverging rating scale. They map to the CSS classes `lv0…lv4` / `ln1…ln4`; the colors live in `styles.css` under `.palette-{green,blue,orange}`.

### `src/state/` and `src/App.tsx`
- The whole view (username, range, filters, metric, display options) is one `ViewState`. `urlState.ts` decodes it from `location.search` and encodes it back, writing only non-default values; `App` mirrors it to the URL with `history.replaceState`.
- `useLichessData(username, token, priority)` looks up the user, loads the cached games, starts a `GameSync`, and hands new games to React in batches (every 500 ms). Changing the username, the token or `runId` (refresh / clear cache) aborts the current sync and starts a new one. A change of `priority` only calls `sync.setPriority`.
- `App.tsx` derives everything else with a `useMemo` chain: `games` → `gamesInRange` → `filtered` → `byDay` → `scale` / `summary` / `matrix`. Facet counts are computed on `gamesInRange`, before filtering. It also turns the visible day range into the ms `priority` interval for the sync.

### Cross-file changes
- **New view setting:** `ViewState` + `DEFAULT_VIEW` + `decodeView` + `encodeView` (+ `urlState.test.ts`), then the UI in `components/Toolbar.tsx`.
- **New filter:** `Filters` + `DEFAULT_FILTERS` + `matchesFilters` + `countActiveFilters` in `filters.ts`, the URL key in `urlState.ts`, and the control in `components/FilterPanel.tsx`.
- **New stored game field:** `LichessGame` (`types.ts`) + `GameRecord` + `normalizeGame`. Games already in the cache won't have the field until that user's cache is cleared (the DB is at version 1 with no migrations).

## Tests

Vitest runs in the `node` environment (no DOM), so component code is untested. The tests cover the pure modules and the sync engine.
- `sync.test.ts` imports `fake-indexeddb/auto` and swaps the global `fetch` (`vi.stubGlobal`) for a fake Lichess that throttles streams, records each request, and tracks peak concurrency. Assertions check that peak concurrency is ≤ 2 and the request count stays low.
- `db.ts` caches its connection at module level, so all tests in a file share one database. Each sync test therefore uses a different user id (`alice`, `bob`, `carol`). Follow that pattern rather than clearing the database.
- `GameSync` accepts `retryDelayMs` so tests don't wait out the real 60 s pause.
