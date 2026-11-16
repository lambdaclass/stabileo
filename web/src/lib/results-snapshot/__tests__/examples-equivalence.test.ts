import { beforeAll, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { CORPUS } from '../corpus';
import { sameAsBefore } from '../equivalence';
import { parseSnapshot } from '../../../../scripts/results-snapshot/compare.mjs';

const LIST = process.env.EXAMPLES_EQUIVALENCE;
const cases: Array<{ case: string; fixture: string; snapshot: string }> = LIST ? JSON.parse(readFileSync(LIST, 'utf8')) : [];

beforeAll(async () => { if (cases.length) await initSolver(); });

if (!LIST) it.skip('runs only from the snapshot gate (EXAMPLES_EQUIVALENCE)', () => {});
for (const item of cases) {
  it(`${item.case}: the example as it was gives the numbers it gave`, async () => {
    const c = CORPUS.find((x) => x.name === item.case);
    expect(c, item.case).toBeDefined();
    const r = await sameAsBefore(c!, JSON.parse(readFileSync(item.fixture, 'utf8')), parseSnapshot(readFileSync(item.snapshot, 'utf8')));
    expect(r.same, r.report).toBe(true);
  }, 600_000);
}
