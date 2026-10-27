import { useEffect, useState, type FormEvent } from 'react';
import type { LichessUser } from '../lichess/types';
import type { LichessData } from '../state/useLichessData';
import type { SyncProgress } from '../store/sync';
import { formatInt, plural } from './format';

interface Props {
  username: string;
  token: string;
  data: LichessData;
  onSubmit: (username: string) => void;
  onTokenChange: (token: string) => void;
}

const TOKEN_URL = 'https://lichess.org/account/oauth/token/create?description=Lichess+heatmap';

export function UserBar({ username, token, data, onSubmit, onTokenChange }: Props) {
  const [draft, setDraft] = useState(username);
  const [tokenDraft, setTokenDraft] = useState(token);
  useEffect(() => setDraft(username), [username]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (name === username) data.refresh();
    else onSubmit(name);
  };

  return (
    <div className="userbar">
      <form className="user-form" onSubmit={submit}>
        <input
          type="text"
          placeholder="Lichess username"
          aria-label="Lichess username"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus={!username}
          spellCheck={false}
          autoCapitalize="off"
        />
        <button type="submit" className="primary" disabled={!draft.trim()}>
          {draft.trim() && draft.trim() === username ? 'Refresh' : 'Load'}
        </button>
      </form>

      <details className="token">
        <summary>{token ? 'API token set' : 'Faster download (optional)'}</summary>
        <p className="field-hint">
          Lichess sends 25 games/s without a token, 30/s with one, and 60/s for your own games with your own token.{' '}
          <a href={TOKEN_URL} target="_blank" rel="noreferrer">
            Create a token
          </a>{' '}
          (no scope needed). It is stored only in this browser.
        </p>
        <form
          className="token-form"
          onSubmit={(e) => {
            e.preventDefault();
            onTokenChange(tokenDraft.trim());
          }}
        >
          <input
            type="password"
            placeholder="lip_…"
            aria-label="Lichess API token"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            autoComplete="off"
          />
          <button type="submit">Save</button>
          {token && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setTokenDraft('');
                onTokenChange('');
              }}
            >
              Remove
            </button>
          )}
        </form>
      </details>

      {data.user && <SyncStatus user={data.user} games={data.games.length} progress={data.progress} data={data} />}
      {data.status === 'loading-user' && <p className="muted">Looking up {username}…</p>}
      {data.status === 'not-found' && <p className="error">No Lichess account named “{username}”.</p>}
      {data.error && <p className="error">{data.error}</p>}
    </div>
  );
}

function SyncStatus({ user, games, progress, data }: { user: LichessUser; games: number; progress?: SyncProgress; data: LichessData }) {
  const [, tick] = useState(0);
  const paused = progress?.phase === 'paused';
  useEffect(() => {
    if (!paused) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [paused]);

  const running = progress && ['starting', 'syncing', 'paused'].includes(progress.phase);
  const total = games + (running ? progress.remaining : 0);
  const ratio = total ? Math.min(1, games / total) : 1;
  const eta = running && progress.rate > 1 ? Math.round(progress.remaining / progress.rate) : undefined;

  return (
    <div className="sync">
      <div className="sync-line">
        <a href={`https://lichess.org/@/${user.id}`} target="_blank" rel="noreferrer" className="username">
          {user.username}
        </a>
        <span className="muted">
          {plural(games, 'game')} loaded
          {running && progress.remaining > 0 && <> · ~{formatInt(progress.remaining)} left</>}
          {eta !== undefined && eta > 0 && <> · ETA {eta < 60 ? `${eta}s` : `${Math.ceil(eta / 60)} min`}</>}
          {running && progress.rate > 1 && <> · {Math.round(progress.rate)} games/s</>}
        </span>
        {running && progress.priorityDone && <span className="badge">Selected range ready</span>}
        {progress?.phase === 'done' && <span className="badge">Up to date</span>}
        {!running && (
          <button className="link small" onClick={() => void data.clearCache()} title="Delete this user's cached games and download them again">
            Re-download all
          </button>
        )}
      </div>
      {running && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
          <div style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
      {paused && progress.pausedUntil && (
        <p className="muted">
          Lichess rate limit reached, resuming in {Math.max(0, Math.ceil((progress.pausedUntil - Date.now()) / 1000))}s…
        </p>
      )}
    </div>
  );
}
