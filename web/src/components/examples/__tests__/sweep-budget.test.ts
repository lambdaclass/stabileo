import { createHash } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from '../catalog';
import type { Outcome, Values } from '../define';

type Registered = { name: string; body: () => void };
const registered: Registered[] = [];
const seen = new Map<string, Values[]>();
let outcome: (index: number) => Outcome;

function clean(): Outcome {
  return {
    status: 'ok', readouts: [], charts: [], notes: [],
    certificate: { status: 'certified', kind: 'linear', bound: 0, measure: 'errorBound' },
    views: {
      outrigger: {
        xy: [0, 0, 1, 1], cells: [0, 1], cellSize: 2, values: [0, 0],
        perCell: false, range: { min: 0, max: 0 }, field: '', unit: '',
        geometryOnly: false, bounds: [0, 0, 1, 1],
      },
    },
  };
}

beforeAll(async () => {
  let suite = '';
  const collect = (name: string, body: () => void) => {
    const parent = suite;
    suite = `${parent} ${name}`;
    try { body(); } finally { suite = parent; }
  };
  vi.doMock('vitest', () => ({
    expect, afterAll: () => {},
    describe: Object.assign(collect, {
      each: (rows: (readonly [string, unknown])[]) => (name: string, body: (id: string, example: unknown) => void) => {
        for (const row of rows) collect(name.replace('%s', row[0]), () => body(...row));
      },
    }),
    it: (name: string, body: () => void) => {
      if (name.includes('seeded sample')) registered.push({ name: `${suite} ${name}`, body });
    },
  }));
  vi.doMock('../catalog', () => ({
    EXAMPLES: EXAMPLES.map(example => ({
      id: example.id, params: example.params, dimension: example.dimension,
      build: (values: Values) => values,
      analyses: (values: Values) => {
        const samples = seen.get(example.id) ?? [];
        const index = samples.length;
        samples.push(values);
        seen.set(example.id, samples);
        return outcome(index);
      },
    })),
  }));
  try { await import('./sweep.test'); } finally {
    vi.doUnmock('vitest');
    vi.doUnmock('../catalog');
  }
});

beforeEach(() => {
  seen.clear();
  outcome = clean;
});

function run() {
  const counts: number[] = [];
  const failures: { name: string; error: unknown }[] = [];
  for (const test of registered) {
    const before = [...seen.values()].reduce((sum, samples) => sum + samples.length, 0);
    try { test.body(); } catch (error) { failures.push({ name: test.name, error }); }
    counts.push([...seen.values()].reduce((sum, samples) => sum + samples.length, 0) - before);
  }
  return { counts, failures };
}

describe('seeded slider sweep execution', () => {
  it.fails('keeps each test to at most 25 complete example analyses (#1958)', () => {
    const { counts, failures } = run();
    expect(failures).toEqual([]);
    expect(counts.length).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBeLessThanOrEqual(25);
  });

  it('visits the original 300 seeded inputs of every example exactly once and in order', () => {
    expect(run().failures).toEqual([]);
    const coverage = Object.fromEntries(EXAMPLES.map(({ id }) => {
      const samples = seen.get(id)!;
      expect(samples).toHaveLength(300);
      return [id, createHash('sha256').update(JSON.stringify(samples)).digest('hex')];
    }));
    expect(coverage).toEqual({
      "beam-frame": "6797b5fac44959dae72df4e222dbd58f7a91ef69b1090eaa18c9ee455d156d29",
      "slab-on-columns": "816e09b1d8018d7bcc6d8c23757296d88693d2fe0e11bce45bdf00cf7dbdcbc8",
      "earthquake-frame": "913e225f883407ce64cadddd52becdcb9d5ba4031215d59556d093aa84d621f2",
      "rc-column": "86d2411c7f930e69f1d638aa8daf9a3c695454c541e8616f81f49e641280cc80",
      "outrigger": "aff042d58523a034fbfd219243550a36af483633e1b2132b7222bd1404895bdd",
      "tower": "6602d215fe90914b7d51e803c5e9bd5cb8481fa96b3877a76d9f05687cb8e7c7"
});
  });

  it.each([59, 60])('keeps the strict aggregate refusal limit with %i refusals out of 300', refused => {
    outcome = index => index < refused ? { status: 'refused', code: 'noLoad' } : clean();
    const { failures } = run();
    expect(failures).toHaveLength(refused === 59 ? 0 : EXAMPLES.length);
    for (const failure of failures) expect(failure.name).toContain('refuses less than 20%');
    for (const samples of seen.values()) expect(samples).toHaveLength(300);
  });

  it.each([0, 24, 25, 299])('rejects a dirty sample at index %i, including chunk boundaries', dirty => {
    outcome = index => {
      const result = clean();
      if (index === dirty && result.status === 'ok') result.views.outrigger.values[0] = NaN;
      return result;
    };
    const { failures } = run();
    expect(failures).toHaveLength(EXAMPLES.length);
    for (const failure of failures) expect((failure.error as { actual: unknown }).actual).toEqual([expect.stringContaining('non-finite value')]);
    for (const samples of seen.values()) expect(samples).toHaveLength(300);
  });
});
