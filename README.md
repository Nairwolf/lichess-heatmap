# Lichess Heatmap

A GitHub-style calendar of the days a Lichess user played. Darker cells mean more play. It runs entirely in your browser: games come straight from the [Lichess API](https://lichess.org/api) and are cached in IndexedDB.

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
```

Enter a username, or open `http://localhost:5173/?u=YourName`.

Other commands:
- `npm test` runs the unit tests (Vitest).
- `npm run build` type-checks and builds `dist/`.

## What you can do

- **Date range:** last 12 months, this year, any year, all time, or a custom range. Ranges longer than a year show one calendar per year.
- **Filters:** time control, exact clock (`3+2`, `10+5`, …), variant, rated or casual, color, result, humans or computer, opponent name, game type (pool, friend, arena, swiss, simul), and opening (ECO prefix or name).
- **What the color shows:** games played, time played, wins, or rating change (red/blue scale).
- **Display options:** quantile or linear scale, green / blue / orange palettes, weeks starting Monday or Sunday, days in local time or UTC.
- **Day details:** click a day (or move with the arrow keys) to list its games, each linking to lichess.org.
- **Stats:** totals, active days, longest and current streak, busiest day, W/D/L, time played and rating change.
- **"When you play":** a weekday × hour grid.
- **Shareable URLs:** the username, filters and settings are kept in the URL, so a bookmark or reload restores the view.

## How the download works

Lichess limits each game export to about 25 games/s anonymously, 30/s with a token, and 60/s for your own games with your own token. It allows 2 concurrent exports per IP and refuses clients that send too many requests. So the sync (`src/store/sync.ts`):

- **Asks for metadata only.** It requests `moves=false`, newest games first.
- **Runs 2 long streams.** When one finishes, it takes over the older half of the other's remaining time span. A full history takes about 10 requests.
- **Fetches the range on screen first.** Changing the date range redirects one stream there.
- **Remembers what it has.** It records which time spans are fully downloaded, so an interrupted sync resumes where it stopped, and later visits only fetch new games. Games still being played (such as correspondence) are re-checked by id on the next sync.
- **Backs off when refused.** It waits 60 s after a refusal (a 429, or a CORS-less error), then resumes.
- **Doesn't re-ask right away.** Reloading within 5 minutes of a sync reuses the cache. The **Refresh** button forces a sync.

Example: about 4,000 games take ~80 s on the first visit without a token. The last 12 months appear within ~8 s, and later visits take about a second.

An optional [personal API token](https://lichess.org/account/oauth/token/create?description=Lichess+heatmap) (no scope needed) speeds up the download. It is stored only in your browser's localStorage.

## Code map

| Path | Role |
|---|---|
| `src/lichess/` | API client, NDJSON streaming, normalization to compact `GameRecord`s |
| `src/store/` | IndexedDB cache, covered-interval bookkeeping, the sync engine |
| `src/analysis/` | Day math (DST-safe day numbers), filters, aggregation & streaks, color scales |
| `src/state/` | URL ⇄ view state, the `useLichessData` hook |
| `src/components/` | SVG calendar, weekday×hour grid, filters, stats, day details |
