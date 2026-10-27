import type { LichessGame } from './types';

// Real-shaped NDJSON lines from /api/games/user/Nairwolf?moves=false&opening=true.
export const winAsWhite: LichessGame = JSON.parse(
  '{"id":"ny0Q7VmQ","rated":true,"variant":"standard","speed":"rapid","perf":"rapid","createdAt":1791922998136,"lastMoveAt":1791923638550,"status":"resign","source":"pool","players":{"white":{"user":{"name":"Nairwolf","flair":"nature.wolf","id":"nairwolf"},"rating":1698,"ratingDiff":13},"black":{"user":{"name":"Abeille007","id":"abeille007"},"rating":1751,"ratingDiff":-6}},"winner":"white","opening":{"eco":"B10","name":"Caro-Kann Defense: Two Knights Attack","ply":5},"clock":{"initial":600,"increment":5,"totalTime":800}}',
);

export const lossAsBlack: LichessGame = JSON.parse(
  '{"id":"UEepaA26","rated":true,"variant":"standard","speed":"rapid","perf":"rapid","createdAt":1791718667512,"lastMoveAt":1791719943199,"status":"mate","source":"pool","players":{"white":{"user":{"name":"elmntb","id":"elmntb"},"rating":1718,"ratingDiff":134,"provisional":true},"black":{"user":{"name":"Nairwolf","flair":"nature.wolf","id":"nairwolf"},"rating":1706,"ratingDiff":-8}},"winner":"white","opening":{"eco":"C45","name":"Scotch Game: Schmidt Variation","ply":8},"clock":{"initial":600,"increment":5,"totalTime":800}}',
);

export const drawCorrespondence: LichessGame = {
  id: 'corr0001',
  rated: true,
  variant: 'standard',
  speed: 'correspondence',
  perf: 'correspondence',
  createdAt: 1790000000000,
  lastMoveAt: 1790900000000,
  status: 'draw',
  source: 'lobby',
  players: {
    white: { user: { name: 'someone', id: 'someone' }, rating: 2000, ratingDiff: 0 },
    black: { user: { name: 'Nairwolf', id: 'nairwolf' }, rating: 2017, ratingDiff: -1 },
  },
  daysPerTurn: 3,
};

export const vsStockfish: LichessGame = {
  id: 'ai000001',
  rated: false,
  variant: 'chess960',
  speed: 'blitz',
  perf: 'chess960',
  createdAt: 1700000000000,
  lastMoveAt: 1700000300000,
  status: 'mate',
  source: 'ai',
  players: {
    white: { aiLevel: 3 },
    black: { user: { name: 'Nairwolf', id: 'nairwolf' }, rating: 1500 },
  },
  winner: 'black',
  clock: { initial: 180, increment: 2, totalTime: 260 },
};

export const aborted: LichessGame = { ...winAsWhite, id: 'abort001', status: 'aborted', winner: undefined };
