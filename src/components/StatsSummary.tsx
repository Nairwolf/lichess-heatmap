import type { Streak, Summary } from '../analysis/aggregate';
import { formatDay, formatDaySpan, formatDuration } from '../analysis/dates';
import { formatInt, formatSigned, plural } from './format';

interface Props {
  summary: Summary;
  onSelectDay: (day: number) => void;
}

function streakRange(s: Streak): string {
  if (!s.length || s.start === undefined || s.end === undefined) return '—';
  return formatDaySpan(s.start, s.end);
}

function pct(n: number, total: number): string {
  return total ? `${Math.round((100 * n) / total)}%` : '—';
}

export function StatsSummary({ summary: s, onSelectDay }: Props) {
  const decided = s.wins + s.draws + s.losses;
  return (
    <div className="stats">
      <div className="stat">
        <div className="stat-label">Games</div>
        <div className="stat-value">{formatInt(s.games)}</div>
        <div className="stat-sub">
          {s.activeDays ? `${(s.games / s.activeDays).toFixed(1)} per active day` : 'No games in this range'}
        </div>
      </div>
      <div className="stat">
        <div className="stat-label">Active days</div>
        <div className="stat-value">{formatInt(s.activeDays)}</div>
        <div className="stat-sub">
          {pct(s.activeDays, s.rangeDays)} of {plural(s.rangeDays, 'day')}
        </div>
      </div>
      <div className="stat">
        <div className="stat-label">Longest streak</div>
        <div className="stat-value">{plural(s.longestStreak.length, 'day')}</div>
        <div className="stat-sub">{streakRange(s.longestStreak)}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Current streak</div>
        <div className="stat-value">{plural(s.currentStreak.length, 'day')}</div>
        <div className="stat-sub">{streakRange(s.currentStreak)}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Busiest day</div>
        <div className="stat-value">{s.busiestDay ? plural(s.busiestDay.games, 'game') : '—'}</div>
        <div className="stat-sub">
          {s.busiestDay ? (
            <button className="link" onClick={() => onSelectDay(s.busiestDay!.day)}>
              {formatDay(s.busiestDay.day)}
            </button>
          ) : (
            '—'
          )}
        </div>
      </div>
      <div className="stat">
        <div className="stat-label">Results</div>
        <div className="stat-value results-line">
          <span title="Wins">{pct(s.wins, decided)}</span>
          <span className="muted">/</span>
          <span title="Draws">{pct(s.draws, decided)}</span>
          <span className="muted">/</span>
          <span title="Losses">{pct(s.losses, decided)}</span>
        </div>
        <div className="stat-sub">
          {formatInt(s.wins)} W · {formatInt(s.draws)} D · {formatInt(s.losses)} L
        </div>
      </div>
      <div className="stat">
        <div className="stat-label">Time played</div>
        <div className="stat-value">{formatDuration(s.durationMs)}</div>
        <div className="stat-sub">Excludes correspondence</div>
      </div>
      <div className="stat">
        <div className="stat-label">Rating change</div>
        <div className="stat-value">{formatSigned(s.ratingDiff)}</div>
        <div className="stat-sub">Sum over rated games</div>
      </div>
    </div>
  );
}
