import { clockLabel, type GameRecord, type Result } from '../lichess/normalize';
import type { Speed } from '../lichess/types';

export type SourceGroup = 'lobby' | 'friend' | 'arena' | 'swiss' | 'simul' | 'ai' | 'other';

export interface Filters {
  /** Empty array = no restriction. */
  speeds: Speed[];
  variants: string[];
  clocks: string[];
  sources: SourceGroup[];
  results: Result[];
  rated: 'all' | 'rated' | 'casual';
  color: 'all' | 'white' | 'black';
  opponent: 'all' | 'human' | 'ai';
  opponentName: string;
  /** Matches an ECO code prefix ("B1") or part of the opening name ("caro-kann"). */
  opening: string;
}

export const DEFAULT_FILTERS: Filters = {
  speeds: [],
  variants: [],
  clocks: [],
  sources: [],
  results: [],
  rated: 'all',
  color: 'all',
  opponent: 'all',
  opponentName: '',
  opening: '',
};

export const SPEEDS: { key: Speed; label: string }[] = [
  { key: 'ultraBullet', label: 'UltraBullet' },
  { key: 'bullet', label: 'Bullet' },
  { key: 'blitz', label: 'Blitz' },
  { key: 'rapid', label: 'Rapid' },
  { key: 'classical', label: 'Classical' },
  { key: 'correspondence', label: 'Correspondence' },
];

export const VARIANT_LABELS: Record<string, string> = {
  standard: 'Standard',
  chess960: 'Chess960',
  crazyhouse: 'Crazyhouse',
  antichess: 'Antichess',
  atomic: 'Atomic',
  horde: 'Horde',
  kingOfTheHill: 'King of the Hill',
  racingKings: 'Racing Kings',
  threeCheck: 'Three-check',
  fromPosition: 'From Position',
};

export const SOURCE_LABELS: Record<SourceGroup, string> = {
  lobby: 'Quick pairing / lobby',
  friend: 'Friend challenge',
  arena: 'Arena tournament',
  swiss: 'Swiss tournament',
  simul: 'Simul',
  ai: 'Computer',
  other: 'Other',
};

export function sourceGroup(source: string): SourceGroup {
  switch (source) {
    case 'pool':
    case 'lobby':
      return 'lobby';
    case 'friend':
    case 'arena':
    case 'swiss':
    case 'simul':
    case 'ai':
      return source;
    default:
      return 'other';
  }
}

export function matchesFilters(g: GameRecord, f: Filters): boolean {
  if (f.speeds.length && !f.speeds.includes(g.speed)) return false;
  if (f.variants.length && !f.variants.includes(g.variant)) return false;
  if (f.clocks.length && !f.clocks.includes(clockLabel(g))) return false;
  if (f.sources.length && !f.sources.includes(sourceGroup(g.source))) return false;
  if (f.results.length && !f.results.includes(g.result)) return false;
  if (f.rated !== 'all' && g.rated !== (f.rated === 'rated')) return false;
  if (f.color !== 'all' && g.color !== f.color) return false;
  if (f.opponent !== 'all' && g.opponentIsAI !== (f.opponent === 'ai')) return false;
  const opp = f.opponentName.trim().toLowerCase();
  if (opp && !g.opponentName.toLowerCase().includes(opp)) return false;
  const opening = f.opening.trim().toLowerCase();
  if (opening) {
    const eco = g.eco?.toLowerCase() ?? '';
    const name = g.openingName?.toLowerCase() ?? '';
    if (!eco.startsWith(opening) && !name.includes(opening)) return false;
  }
  return true;
}

export function applyFilters(games: GameRecord[], f: Filters): GameRecord[] {
  return games.filter((g) => matchesFilters(g, f));
}

export function countActiveFilters(f: Filters): number {
  let n = 0;
  for (const key of ['speeds', 'variants', 'clocks', 'sources', 'results'] as const) if (f[key].length) n++;
  for (const key of ['rated', 'color', 'opponent'] as const) if (f[key] !== 'all') n++;
  if (f.opponentName.trim()) n++;
  if (f.opening.trim()) n++;
  return n;
}

export interface FacetCounts {
  speeds: Map<string, number>;
  variants: Map<string, number>;
  clocks: Map<string, number>;
  sources: Map<string, number>;
}

/** How many games each option would match, for the values present in `games`. */
export function facetCounts(games: GameRecord[]): FacetCounts {
  const counts: FacetCounts = { speeds: new Map(), variants: new Map(), clocks: new Map(), sources: new Map() };
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const g of games) {
    inc(counts.speeds, g.speed);
    inc(counts.variants, g.variant);
    inc(counts.clocks, clockLabel(g));
    inc(counts.sources, sourceGroup(g.source));
  }
  return counts;
}
