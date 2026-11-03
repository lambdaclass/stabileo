/**
 * The corpus, `web/results-snapshots/` and the group entry points match one to one
 * (`coverage.ts`), and the rule fails a removed case and an orphaned snapshot.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { CORPUS } from '../corpus';
import { coverageProblems } from '../coverage';
import { SNAPSHOT_DIR } from '../run-group';

const TESTS = new URL('./', import.meta.url);

/** The group each `snapshot-<group>.test.ts` runs, read from its `runGroup('<group>')`. */
function entryGroups(): string[] {
  return readdirSync(TESTS).filter((f) => /^snapshot-.*\.test\.ts$/.test(f)).map((f) => {
    const m = /runGroup\('([^']+)'\)/.exec(readFileSync(new URL(f, TESTS), 'utf8'));
    const named = /^snapshot-(.*)\.test\.ts$/.exec(f)![1];
    expect(m?.[1], `${f} runs the group it is named after`).toBe(named);
    return named;
  });
}

const snapshots = () => readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

describe('results snapshot coverage', () => {
  it('every corpus case has its snapshot, every snapshot its case, every group its entry point', () => {
    expect(coverageProblems({ corpus: CORPUS, snapshots: snapshots(), entryGroups: entryGroups() })).toEqual([]);
  });

  it('NEGATIVE: a case removed from the corpus leaves an orphaned snapshot, which fails', () => {
    const corpus = CORPUS.filter((c) => c.name !== '2d-portal-frame');
    expect(coverageProblems({ corpus, snapshots: snapshots(), entryGroups: entryGroups() }))
      .toEqual([expect.stringContaining('snapshot 2d-portal-frame.json belongs to no corpus case')]);
  });

  it('NEGATIVE: an orphaned snapshot, and a case without one, fail', () => {
    const r = coverageProblems({ corpus: [{ name: 'a', group: 'basic' }], snapshots: ['b'], entryGroups: ['basic'] });
    expect(r).toEqual([
      expect.stringContaining('corpus case a has no snapshot'),
      expect.stringContaining('snapshot b.json belongs to no corpus case'),
    ]);
  });

  it('NEGATIVE: a group without an entry point, an entry point without cases, a duplicate case', () => {
    const r = coverageProblems({ corpus: [{ name: 'a', group: 'pro' }, { name: 'a', group: 'pro' }], snapshots: ['a'], entryGroups: ['basic'] });
    expect(r).toEqual([
      'corpus case a is listed twice',
      expect.stringContaining('corpus group pro has no test entry point'),
      expect.stringContaining('snapshot-basic.test.ts runs a group with no corpus case'),
    ]);
  });
});
