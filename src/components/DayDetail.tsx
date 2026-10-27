import type { DayStats } from '../analysis/aggregate';
import { formatDay, formatDuration, formatTime, type TimeZoneMode } from '../analysis/dates';
import { SPEEDS, VARIANT_LABELS } from '../analysis/filters';
import { clockLabel, playDuration } from '../lichess/normalize';
import { formatSigned, plural } from './format';

interface Props {
  day: number;
  stats?: DayStats;
  tz: TimeZoneMode;
  onClose: () => void;
}

const speedLabel = (speed: string) => SPEEDS.find((s) => s.key === speed)?.label ?? speed;
const RESULT_LABEL = { win: 'Win', draw: 'Draw', loss: 'Loss' };

export function DayDetail({ day, stats, tz, onClose }: Props) {
  const games = stats?.list ?? [];
  return (
    <section className="card day-detail" aria-label={`Games on ${formatDay(day)}`}>
      <header className="card-header">
        <div>
          <h2>{formatDay(day)}</h2>
          <p className="muted">
            {stats
              ? `${plural(stats.games, 'game')} · ${stats.wins} W ${stats.draws} D ${stats.losses} L · ${formatSigned(stats.ratingDiff)} rating · ${formatDuration(stats.durationMs)}`
              : 'No games matching the filters on this day.'}
          </p>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close day details">
          ✕
        </button>
      </header>
      {games.length > 0 && (
        <div className="scroll-x">
          <table className="games">
            <thead>
              <tr>
                <th>Time</th>
                <th>Game</th>
                <th>Opponent</th>
                <th>Result</th>
                <th className="num">Rating</th>
                <th>Opening</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td className="nowrap">{formatTime(g.createdAt, tz)}</td>
                  <td className="nowrap">
                    <span className={`piece ${g.color}`} title={`Played as ${g.color}`} />
                    {speedLabel(g.speed)} {clockLabel(g)}
                    {g.variant !== 'standard' && <span className="tag">{VARIANT_LABELS[g.variant] ?? g.variant}</span>}
                    {!g.rated && <span className="tag">casual</span>}
                  </td>
                  <td className="nowrap">
                    {g.opponentName}
                    {g.opponentRating !== undefined && <span className="muted"> ({g.opponentRating})</span>}
                  </td>
                  <td className={`result ${g.result}`}>{RESULT_LABEL[g.result]}</td>
                  <td className="num nowrap">
                    {g.myRating ?? ''}
                    {g.ratingDiff !== undefined && (
                      <span className={g.ratingDiff >= 0 ? 'up' : 'down'}> {formatSigned(g.ratingDiff)}</span>
                    )}
                  </td>
                  <td className="opening" title={g.openingName}>
                    {g.eco && <span className="muted">{g.eco} </span>}
                    {g.openingName ?? ''}
                  </td>
                  <td className="nowrap">
                    <a href={`https://lichess.org/${g.id}${g.color === 'black' ? '/black' : ''}`} target="_blank" rel="noreferrer">
                      Open ↗
                    </a>
                    {g.speed !== 'correspondence' && <span className="muted"> {formatDuration(playDuration(g))}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
