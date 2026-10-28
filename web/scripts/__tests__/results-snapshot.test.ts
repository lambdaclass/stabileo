/**
 * The results snapshot gate's comparison and decision (#716), as pure functions: the tolerance,
 * the committed format, and when a pull request must register a result change.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, mergeValues, flatten, storeNumber, serialiseSnapshot, parseSnapshot, RTOL, ATOL } from '../results-snapshot/compare.mjs';
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
  it('is the stated rule', () => {
    expect(RTOL).toBe(1e-6);
    expect(ATOL).toBe(1e-7);
  });
  it('compares verdicts and refusals exactly', () => {
    expect(compareValues({ s: 'ok' }, { s: 'fail' }).differs).toBe(true);
    expect(compareValues({ 'solve.refusal': 'a' }, { 'solve.refusal': 'b' }).differs).toBe(true);
    expect(compareValues({ ok: true }, { ok: false }).differs).toBe(true);
  });
  it('counts a value no longer produced as a change', () => {
    expect(compareValues({ a: 1, b: 2 }, { a: 1 })).toMatchObject({ differs: true, removed: ['b'] });
  });
  it('NEGATIVE: counts a newly produced value as a change (another combination, mode or limit state)', () => {
    const before = { 'combo[1].reactions[n1].fz': 10 };
    const d = compareValues(before, { ...before, 'combo[2].reactions[n1].fz': 12 });
    expect(d).toMatchObject({ differs: true, added: ['combo[2].reactions[n1].fz'] });
    expect(compareValues({ 'design.steel[e1].flexure.ratio': 0.5 }, { 'design.steel[e1].flexure.ratio': 0.5, 'design.steel[e1].ltb.ratio': 0.7 }).differs).toBe(true);
  });
  it('compares a spectral mode participation by magnitude: an eigenvector sign flip is not a change', () => {
    const p = 'spectral.X.perMode[0].participation';
    const f = 'spectral.X.perMode[0].modalForce';
    expect(compareValues({ [p]: -0.9229, [f]: -12.5 }, { [p]: 0.9229, [f]: 12.5 }).differs).toBe(false);
    // NEGATIVE: a changed magnitude is.
    expect(compareValues({ [p]: -0.9229 }, { [p]: 0.9300 }).differs).toBe(true);
    // Stored as a magnitude, and regenerating writes the magnitude.
    expect(flatten({ participation: -0.9229 }, 'spectral.X.perMode[0]', {})).toEqual({ [p]: 0.9229 });
    expect(mergeValues({ [p]: -0.9229 }, { [p]: 0.9229 })).toEqual({ [p]: 0.9229 });
    // Other quantities keep their sign.
    expect(compareValues({ 'base.reactions[n1].fz': -1 }, { 'base.reactions[n1].fz': 1 }).differs).toBe(true);
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
    // An array inside a record stays in the record's row.
    const env = { case: 'x', covers: 'y', format: 2, values: { 'envelope.momentY[e1].posValues[0]': 1, 'envelope.momentY[e1].negValues[0]': -1, 'buckling.factors[0]': 5 } };
    const t2 = serialiseSnapshot(env);
    expect(t2).toContain('"envelope.momentY[e1]": {"negValues[0]":-1,"posValues[0]":1}');
    expect(t2).toContain('"buckling.factors[0]": 5');
    expect(parseSnapshot(t2)).toEqual(env);
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
    const same = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: snap({ v: 1 + 1e-12 }) }];
    expect(decide({ snapshots: same, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(true);
  });
  it('NEGATIVE: fails a value newly produced in an existing snapshot without a registry entry', () => {
    const added = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: snap({ v: 1, 'combo[9].v': 2 }) }];
    const r = decide({ snapshots: added, baseRegistry: registry, headRegistry: registry, fragments: [] });
    expect(r.ok).toBe(false);
    expect(r.report).toContain('combo[9].v: newly produced');
  });
  it('a snapshot format bump lets the harness record more, but not move or drop a value', () => {
    const v2 = (values: Record<string, unknown>) => ({ ...snap(values), format: 2 });
    const more = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: v2({ v: 1, 'envelope.m[e1].posValues[0]': 3 }) }];
    expect(decide({ snapshots: more, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(true);
    const moved = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: v2({ v: 2, w: 3 }) }];
    expect(decide({ snapshots: moved, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(false);
    const dropped = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1, u: 2 }), head: v2({ v: 1 }) }];
    expect(decide({ snapshots: dropped, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(false);
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
