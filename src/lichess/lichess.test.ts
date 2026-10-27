import { describe, expect, it } from 'vitest';
import { readNdjson } from './ndjson';
import { clockLabel, normalizeGame, playDuration } from './normalize';
import { aborted, drawCorrespondence, lossAsBlack, vsStockfish, winAsWhite } from './fixtures';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(it: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('readNdjson', () => {
  it('parses lines split across chunks', async () => {
    const lines = await collect(readNdjson<{ a: number }>(streamOf(['{"a":1}\n{"a"', ':2}\n', '\n{"a":3}'])));
    expect(lines).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('handles multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"n":"é"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 7));
        c.enqueue(bytes.slice(7));
        c.close();
      },
    });
    expect(await collect(readNdjson(stream))).toEqual([{ n: 'é' }]);
  });
});

describe('normalizeGame', () => {
  it('reads a win as white', () => {
    const g = normalizeGame(winAsWhite, 'Nairwolf')!;
    expect(g).toMatchObject({
      color: 'white',
      result: 'win',
      opponentName: 'Abeille007',
      opponentRating: 1751,
      myRating: 1698,
      ratingDiff: 13,
      clockInitial: 600,
      clockIncrement: 5,
      eco: 'B10',
      userId: 'nairwolf',
      opponentIsAI: false,
    });
  });

  it('reads a loss as black', () => {
    expect(normalizeGame(lossAsBlack, 'nairwolf')).toMatchObject({ color: 'black', result: 'loss', ratingDiff: -8 });
  });

  it('reads a correspondence draw', () => {
    const g = normalizeGame(drawCorrespondence, 'nairwolf')!;
    expect(g).toMatchObject({ result: 'draw', speed: 'correspondence', daysPerTurn: 3 });
    expect(playDuration(g)).toBe(0);
    expect(clockLabel(g)).toBe('3 days');
  });

  it('detects computer opponents', () => {
    const g = normalizeGame(vsStockfish, 'nairwolf')!;
    expect(g).toMatchObject({ opponentIsAI: true, opponentName: 'Stockfish level 3', result: 'win', variant: 'chess960' });
    expect(playDuration(g)).toBe(300000);
  });

  it('drops aborted games and games of other users', () => {
    expect(normalizeGame(aborted, 'nairwolf')).toBeNull();
    expect(normalizeGame(winAsWhite, 'someoneelse')).toBeNull();
  });
});

describe('clockLabel', () => {
  it('formats clocks', () => {
    expect(clockLabel({ clockInitial: 180, clockIncrement: 2, speed: 'blitz' })).toBe('3+2');
    expect(clockLabel({ clockInitial: 30, clockIncrement: 0, speed: 'ultraBullet' })).toBe('½+0');
    expect(clockLabel({ clockInitial: 90, clockIncrement: 1, speed: 'bullet' })).toBe('1½+1');
    expect(clockLabel({ speed: 'correspondence' })).toBe('∞');
  });
});
