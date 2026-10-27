import { useCallback, useEffect, useMemo, useState } from 'react';
import { aggregateByDay, metricValue, summarize, weekHourMatrix } from './analysis/aggregate';
import { makeScale } from './analysis/colorScale';
import { dayNumber, dayStartMs, formatDay, formatDuration, partsOf, resolveRange } from './analysis/dates';
import { applyFilters, facetCounts } from './analysis/filters';
import { DayDetail } from './components/DayDetail';
import { FilterPanel } from './components/FilterPanel';
import { formatMetric, formatSigned, plural } from './components/format';
import { HeatmapView } from './components/HeatmapView';
import { StatsSummary } from './components/StatsSummary';
import { DisplaySettings, RangePicker } from './components/Toolbar';
import { Tooltip, type TooltipState } from './components/Tooltip';
import { UserBar } from './components/UserBar';
import { WeekHourGrid } from './components/WeekHourGrid';
import { decodeView, encodeView, type ViewState } from './state/urlState';
import { useLichessData } from './state/useLichessData';
import type { Interval } from './store/intervals';

const TOKEN_KEY = 'lichess-heatmap:token';

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable: the token only lasts for this page load.
  }
}

export function App() {
  const [view, setView] = useState<ViewState>(() => decodeView(window.location.search));
  const [token, setToken] = useState(readToken);
  const [selectedDay, setSelectedDay] = useState<number>();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const update = useCallback((patch: Partial<ViewState>) => setView((v) => ({ ...v, ...patch })), []);

  useEffect(() => {
    window.history.replaceState(null, '', encodeView(view) || window.location.pathname);
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedDay(undefined);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { tz, metric } = view;
  const today = dayNumber(Date.now(), tz);

  // Chunks overlapping the visible range are downloaded first.
  const priority = useMemo<Interval>(() => {
    const r = resolveRange(view.range, { today, accountStart: 0, from: view.from, to: view.to });
    return [dayStartMs(r.start, tz), dayStartMs(r.end + 1, tz) - 1];
  }, [view.range, view.from, view.to, today, tz]);

  const data = useLichessData(view.username, token, priority);
  const { user, games } = data;

  const accountStart = user ? dayNumber(user.createdAt, tz) : today - 364;
  const range = useMemo(
    () => resolveRange(view.range, { today, accountStart, from: view.from, to: view.to }),
    [view.range, view.from, view.to, today, accountStart],
  );

  const gamesInRange = useMemo(
    () =>
      games.filter((g) => {
        const d = dayNumber(g.createdAt, tz);
        return d >= range.start && d <= range.end;
      }),
    [games, tz, range],
  );
  const filtered = useMemo(() => applyFilters(gamesInRange, view.filters), [gamesInRange, view.filters]);
  const counts = useMemo(() => facetCounts(gamesInRange), [gamesInRange]);
  const byDay = useMemo(() => aggregateByDay(filtered, tz, range), [filtered, tz, range]);
  const scale = useMemo(
    () => makeScale([...byDay.values()].map((s) => metricValue(s, metric)), view.scale, metric === 'rating'),
    [byDay, metric, view.scale],
  );
  const summary = useMemo(() => summarize(byDay, range, today), [byDay, range, today]);
  const matrix = useMemo(() => weekHourMatrix(filtered, tz, view.weekStart, range), [filtered, tz, view.weekStart, range]);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = partsOf(today).year; y >= partsOf(accountStart).year; y--) out.push(y);
    return out;
  }, [today, accountStart]);

  const renderTooltip = useCallback(
    (day: number) => {
      const s = byDay.get(day);
      return (
        <>
          <strong>{formatMetric(metricValue(s, metric), metric)}</strong>
          <div>{formatDay(day)}</div>
          {s && (
            <div className="muted">
              {metric !== 'games' && `${plural(s.games, 'game')} · `}
              {s.wins} W {s.draws} D {s.losses} L · {formatSigned(s.ratingDiff)} · {formatDuration(s.durationMs)}
            </div>
          )}
        </>
      );
    },
    [byDay, metric],
  );

  const selectUser = (username: string) => {
    setSelectedDay(undefined);
    update({ username });
  };

  return (
    <div className={`app palette-${view.palette}`}>
      <header className="topbar">
        <h1>
          <span className="logo" aria-hidden="true">
            ♞
          </span>
          Lichess Heatmap
        </h1>
        <UserBar
          username={view.username}
          token={token}
          data={data}
          onSubmit={selectUser}
          onTokenChange={(t) => {
            writeToken(t);
            setToken(t);
          }}
        />
      </header>

      {!view.username ? (
        <Welcome />
      ) : (
        <div className="layout">
          <FilterPanel filters={view.filters} counts={counts} onChange={(filters) => update({ filters })} />
          <main>
            <div className="toolbar">
              <RangePicker view={view} years={years} onChange={update} />
              <DisplaySettings view={view} onChange={update} />
            </div>

            <StatsSummary summary={summary} onSelectDay={setSelectedDay} />

            <section className="card">
              <header className="card-header">
                <h2>{metric === 'games' ? 'Games per day' : `${formatMetricTitle(metric)} per day`}</h2>
                {data.progress?.phase === 'syncing' && !data.progress.priorityDone && (
                  <span className="muted small">Still downloading this period…</span>
                )}
              </header>
              <HeatmapView
                range={range}
                byDay={byDay}
                metric={metric}
                scale={scale}
                weekStart={view.weekStart}
                today={today}
                selectedDay={selectedDay}
                onSelect={setSelectedDay}
                onHover={setTooltip}
                renderTooltip={renderTooltip}
              />
            </section>

            {selectedDay !== undefined && (
              <DayDetail day={selectedDay} stats={byDay.get(selectedDay)} tz={tz} onClose={() => setSelectedDay(undefined)} />
            )}

            <section className="card">
              <header className="card-header">
                <h2>When you play</h2>
                <span className="muted small">Games started per weekday and hour ({tz === 'utc' ? 'UTC' : 'local time'})</span>
              </header>
              <WeekHourGrid matrix={matrix} weekStart={view.weekStart} scaleMode={view.scale} onHover={setTooltip} />
            </section>
          </main>
        </div>
      )}
      <Tooltip state={tooltip} />
    </div>
  );
}

function formatMetricTitle(metric: ViewState['metric']): string {
  return { games: 'Games', time: 'Time played', wins: 'Wins', rating: 'Rating change' }[metric];
}

function Welcome() {
  return (
    <div className="welcome">
      <h2>See which days you played on Lichess</h2>
      <p>
        Enter a Lichess username above. Its games are downloaded once from the Lichess API and kept in this browser, so
        later visits and filter changes are instant.
      </p>
      <p className="muted">
        The first download goes at about 50 games per second; the period you are looking at is fetched first.
      </p>
    </div>
  );
}
