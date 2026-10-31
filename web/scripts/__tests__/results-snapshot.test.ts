/**
 * The results snapshot gate's comparison and decision (#716), as pure functions: the tolerance,
 * the committed format, and when a pull request must register a result change.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, mergeValues, flatten, storeNumber, serialiseSnapshot, parseSnapshot, familyOf, RTOL, ATOL } from '../results-snapshot/compare.mjs';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { decide, isBreakingResultsFragment, newRegistryEntries } from '../results-snapshot/gate.mjs';

describe('the tolerance', () => {
  const ref = { 'r.m[e1].my': 100, 'r.m[e2].my': -40, 'r.m[e3].my': 0, 'r.d[n1].ux': 0.0123 };
  it('takes last-bit noise as the same result', () => {
    expect(compareValues(ref, { ...ref, 'r.m[e1].my': 100 * (1 + 1e-12), 'r.d[n1].ux': 0.0123 * (1 - 1e-9) }).differs).toBe(false);
    // A value that should be zero, as round-off: within ATOL of the quantity's peak (100).
    expect(compareValues(ref, { ...ref, 'r.m[e3].my': 3e-12 }).differs).toBe(false);
  });
  it('catches a change far below any engineering difference', () => {
    const d = compareValues(ref, { ...ref, 'r.m[e2].my': -40 * (1 + 1e-5) });
    expect(d.differs).toBe(true);
    expect(d.changed.map((c: { path: string }) => c.path)).toEqual(['r.m[e2].my']);
    // A zero that becomes a small fraction of the peak.
    expect(compareValues(ref, { ...ref, 'r.m[e3].my': 1e-4 }).differs).toBe(true);
  });
  describe('a component statics makes zero, against the size of its vector', () => {
    const truss = {
      'base.reactions[n1].rx': 5.684341886e-14, 'base.reactions[n1].rz': 35, 'base.reactions[n5].rx': 0, 'base.reactions[n5].rz': 35,
      'base.reactions[n1].my': 0, 'base.elementForces[e1].nStart': 35, 'base.elementForces[e1].vStart': 2e-15, 'base.elementForces[e1].mStart': 0,
    };
    it('takes round-off in it as the same result, though it is 25 % of its own peak', () => {
      expect(compareValues(truss, { ...truss, 'base.reactions[n1].rx': 7.105427358e-14, 'base.elementForces[e1].vStart': -3e-15 }).differs).toBe(false);
    });
    it('NEGATIVE: catches a real value in it, a millionth of the vector', () => {
      const d = compareValues(truss, { ...truss, 'base.reactions[n1].rx': 35e-6 });
      expect(d.changed.map((c: { path: string }) => c.path)).toEqual(['base.reactions[n1].rx']);
      expect(compareValues(truss, { ...truss, 'base.elementForces[e1].vStart': 35e-6 }).differs).toBe(true);
    });
    it('NEGATIVE: never takes the floor from another unit (a moment from forces)', () => {
      expect(compareValues(truss, { ...truss, 'base.reactions[n1].my': 1e-9 }).differs).toBe(true);
      expect(compareValues(truss, { ...truss, 'base.elementForces[e1].mStart': 1e-9 }).differs).toBe(true);
    });
    it('groups by collection, unit and result set', () => {
      expect(familyOf('case[3].reactions[n1].fx')).toBe('case[].reactions[].<force>');
      expect(familyOf('base.reactions[n1].rz')).toBe(familyOf('base.reactions[n2].fz'));
      expect(familyOf('base.displacements[n1].rz')).toBe('base.displacements[].<rotation>');
      expect(familyOf('base.reactions[n1].my')).not.toBe(familyOf('base.reactions[n1].rx'));
      expect(familyOf('base.quadStresses[e1].nodeIndex')).toBeNull();
      expect(familyOf('base.resultSummary.displacementX.maxValue')).toBeNull();
    });
  });
  it('is the stated rule', () => {
    expect(RTOL).toBe(1e-6);
    expect(ATOL).toBe(1e-7);
  });
  it('compares verdicts and refusals exactly', () => {
    expect(compareValues({ s: 'ok' }, { s: 'fail' }).differs).toBe(true);
    expect(compareValues({ 'solve.refusal': 'a' }, { 'solve.refusal': 'b' }).differs).toBe(true);
    expect(compareValues({ ok: true }, { ok: false }).differs).toBe(true);
  });
  it('counts a value no longer produced as a change, and a new one as an addition', () => {
    expect(compareValues({ a: 1, b: 2 }, { a: 1 })).toMatchObject({ differs: true, removed: ['b'] });
    expect(compareValues({ a: 1 }, { a: 1, b: 2 })).toMatchObject({ differs: false, added: ['b'] });
  });
});

describe('storing', () => {
  it('rounds to ten digits and spells what JSON cannot', () => {
    expect(storeNumber(1 / 3)).toBe(0.3333333333);
    expect(storeNumber(-0)).toBe(0);
    expect(storeNumber(NaN)).toBe('NaN');
    expect(storeNumber(-Infinity)).toBe('-Infinity');
  });
  it('keys records by their id and leaves out what is not a result', () => {
    const out = flatten({ displacements: [{ nodeId: 7, ux: 1 }], timings: { total: 3 }, elementForces: [{ elementId: 2, length: 5, qI: -1, mStart: 4 }] }, 'base', {});
    expect(out).toEqual({ 'base.displacements[n7].ux': 1, 'base.elementForces[e2].mStart': 4 });
  });
  it('regenerating keeps the committed spelling of values within the tolerance', () => {
    expect(mergeValues({ a: 1.000000001, b: 5 }, { a: 1, b: 6, c: 2 })).toEqual({ a: 1.000000001, b: 6, c: 2 });
  });
  it('writes one line per record and reads it back', () => {
    const s = { case: 'x', covers: 'y', format: 1, values: { 'base.d[n1].ux': 1, 'base.d[n1].uz': 2, 'solve.ok': true, 'design.s[e1].c.Fcr': 3 } };
    const text = serialiseSnapshot(s);
    expect(text).toContain('"base.d[n1]": {"ux":1,"uz":2}');
    expect(text).toContain('"design.s[e1]": {"c.Fcr":3}');
    expect(parseSnapshot(text)).toEqual(s);
  });
});

describe('the gate', () => {
  const snap = (values: Record<string, unknown>) => ({ case: 'c', covers: '', format: 1, values });
  const registry = { currentResultsVersion: 4, changes: [{ id: 'old', resultsVersion: 4 }] };
  const registered = { currentResultsVersion: 5, changes: [{ id: 'new', resultsVersion: 5 }, ...registry.changes] };
  const breaking = { file: 'changelog.d/a.md', text: '### BREAKING (results)\n#### A (2026-10-28)\n' };
  const moved = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: snap({ v: 1.01 }) }];

  it('passes a pull request whose snapshots did not move', () => {
    const same = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: snap({ v: 1 + 1e-12, w: 2 }) }];
    expect(decide({ snapshots: same, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(true);
  });
  it('rejects a second PR reusing a released version even without snapshot changes', () => {
    const baseRegistry = { currentResultsVersion: 5, changes: [{ id: 'containment', resultsVersion: 5 }, ...registry.changes] };
    const entry = { id: 'solid-shell-local-stress-axes', resultsVersion: 5 };
    const headRegistry = { ...baseRegistry, changes: [entry, ...baseRegistry.changes] };
    const result = decide({ snapshots: [], baseRegistry, headRegistry, fragments: [breaking] });
    expect(result.ok).toBe(false);
    expect(result.report).toContain('solid-shell-local-stress-axes');
    expect(result.report).toContain('through 5 are already released');
    expect(decide({ snapshots: [], baseRegistry, headRegistry: {
      currentResultsVersion: 6, changes: [{ ...entry, resultsVersion: 6 }, ...baseRegistry.changes],
    }, fragments: [breaking] }).ok).toBe(true);
  });
  it('rejects losing or renumbering entries from the first PR', () => {
    for (const changes of [registry.changes, [{ id: 'new', resultsVersion: 6 }, ...registry.changes]]) {
      const result = decide({ snapshots: [], baseRegistry: registered,
        headRegistry: { currentResultsVersion: 6, changes }, fragments: [] });
      expect(result.ok).toBe(false);
      expect(result.report).toContain('Missing or renumbered entries: new');
    }
  });
  it('passes a new case without a registry entry: coverage is not a change', () => {
    const added = [{ file: 'web/results-snapshots/new.json', base: null, head: snap({ v: 1 }) }];
    expect(decide({ snapshots: added, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(true);
  });
  it('NEGATIVE: fails a moved result without a registry entry (#451)', () => {
    const r = decide({ snapshots: moved, baseRegistry: registry, headRegistry: registry, fragments: [breaking] });
    expect(r.ok).toBe(false);
    expect(r.report).toContain('v: 1 → 1.01');
    expect(r.report).toContain('no new entry');
  });
  it('NEGATIVE: fails a moved result without a BREAKING (results) fragment', () => {
    const r = decide({ snapshots: moved, baseRegistry: registry, headRegistry: registered, fragments: [{ file: 'changelog.d/b.md', text: '### Fixed\n' }] });
    expect(r.ok).toBe(false);
    expect(r.report).toContain('BREAKING (results)');
  });
  it('NEGATIVE: fails a deleted snapshot without a registry entry', () => {
    const deleted = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: null }];
    expect(decide({ snapshots: deleted, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(false);
  });
  it('passes a moved result with both', () => {
    const r = decide({ snapshots: moved, baseRegistry: registry, headRegistry: registered, fragments: [breaking] });
    expect(r.ok).toBe(true);
    expect(r.report).toContain('Registered: new (results version 5)');
  });
  it('reads the fragment section from its first line and the entries by id', () => {
    expect(isBreakingResultsFragment('\n### BREAKING (results)\n#### x')).toBe(true);
    expect(isBreakingResultsFragment('### Fixed\n### BREAKING (results)')).toBe(false);
    expect(newRegistryEntries(registry, registered).map((e: { id: string }) => e.id)).toEqual(['new']);
  });
});
