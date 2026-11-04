import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { CORPUS } from '../corpus';
import { capture } from '../capture';
import { snapshotFile } from '../run-group';
// @ts-expect-error shared JavaScript snapshot comparison
import { compareValues, parseSnapshot, formatCaseReport } from '../../../../scripts/results-snapshot/compare.mjs';

beforeAll(async () => { await initSolver(); });
for (const c of CORPUS.filter((c) => c.group === 'basic' || c.group === 'pro')) {
  it(`static/modal self-checks preserve ${c.name}`, async () => {
    const fresh = await capture({ ...c, advanced: c.advanced?.filter((a) => a === 'modal') });
    const baseline = parseSnapshot(readFileSync(snapshotFile(c.name), 'utf8'));
    const expected = Object.fromEntries(Object.entries(baseline.values).filter(([key]) => !/^(pdelta|spectral|buckling)\./.test(key)));
    const diff = compareValues(expected, fresh.values);
    expect(diff.differs, formatCaseReport(c.name, diff)).toBe(false);
    expect(diff.added).toEqual([]);
  }, 180_000);
}
