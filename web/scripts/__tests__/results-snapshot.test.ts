/**
 * The results snapshot gate's comparison and decision (#716), as pure functions: the tolerance,
 * the committed format, and when a pull request must register a result change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import spanAxial from '../../src/lib/provenance/result-changes/pdelta-span-axial.json';
import { compareValues, mergeValues, flatten, storeNumber, serialiseSnapshot, parseSnapshot, RTOL, ATOL } from '../results-snapshot/compare.mjs';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { decide, isBreakingResultsFragment, newlyRecorded, corpusExamples, modelInputs, proveEquivalence, headEngineServesBase } from '../results-snapshot/gate.mjs';

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
  const registry = { schema: 1, numbered: [{ id: 'old', resultsVersion: 4 }], unnumbered: [] };
  const registered = { ...registry, unnumbered: [{ id: 'new', when: {}, quantities: ['*'] }] };
  const caseFeatures = { 'web/results-snapshots/c.json': ['space3D', 'analysis:linear'], 'web/results-snapshots/d.json': ['space3D', 'analysis:linear'] };
  const breaking = { file: 'changelog.d/a.md', text: '### BREAKING (results)\n#### A (2026-10-28)\n' };
  const moved = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: snap({ v: 1.01 }) }];

  it.each([
    ['pro-3d-portal-frame', 1.006424741],
    ['pro-3d-tower', 1.000275385],
  ])('#1329: registers %s displacement amplification', (name, before) => {
    const file = `web/results-snapshots/${name}.json`;
    const head = parseSnapshot(readFileSync(new URL(`../../results-snapshots/${name}.json`, import.meta.url), 'utf8'));
    const base = { ...head, values: { ...head.values, 'pdelta.b2': before } };
    const r = decide({
      snapshots: [{ file, base, head }],
      baseRegistry: registry,
      headRegistry: { ...registry, unnumbered: [spanAxial] },
      fragments: [breaking],
      caseFeatures: { [file]: ['space3D', 'frameMembers', 'analysis:linear', 'analysis:pdelta'] },
    });
    expect(r.changed).toHaveLength(1);
    expect(r.ok, r.report).toBe(true);
  });

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
  it('NEGATIVE: a format bump excuses only what that format began recording', () => {
    const v2 = (values: Record<string, unknown>) => ({ ...snap(values), format: 2 });
    const solverAdded = [{ file: 'web/results-snapshots/c.json', base: snap({ v: 1 }), head: v2({ v: 1, 'envelope.m[e1].posValues[0]': 3, 'combo[9].v': 2 }) }];
    const r = decide({ snapshots: solverAdded, baseRegistry: registry, headRegistry: registry, fragments: [] });
    expect(r.ok).toBe(false);
    expect(r.report).toContain('combo[9].v: newly produced');
    expect(r.report).not.toContain('envelope.m[e1]');
  });
  it('NEGATIVE: a format field edited in the snapshot alone, not in the harness, excuses nothing', () => {
    const v3 = { ...snap({ v: 1, 'envelope.m[e1].posValues[0]': 3 }), format: 3 };
    const forged = [{ file: 'web/results-snapshots/c.json', base: { ...snap({ v: 1 }), format: 2 }, head: v3 }];
    expect(decide({ snapshots: forged, baseRegistry: registry, headRegistry: registry, fragments: [] }).ok).toBe(false);
    expect(newlyRecorded('envelope.m[e1].posValues[0]', 1, 3, 2, { 2: /^envelope\./ })).toBe(false);
    expect(newlyRecorded('envelope.m[e1].posValues[0]', 1, 3, 3, { 2: /^envelope\./ })).toBe(true);
    expect(newlyRecorded('combo[1].v', 1, 3, 3, { 2: /^envelope\./ })).toBe(false);
  });
  it('rejects an entry added to the frozen numbered versions, or one that names its own version', () => {
    for (const head of [
      { ...registry, numbered: [{ id: 'solid-shell-local-stress-axes', resultsVersion: 5 }, ...registry.numbered] },
      { ...registry, unnumbered: [{ id: 'solid-shell-local-stress-axes', resultsVersion: 5 }] },
    ]) {
      const result = decide({ snapshots: [], baseRegistry: registry, headRegistry: head, fragments: [breaking] });
      expect(result.ok).toBe(false);
      expect(result.report).toContain('solid-shell-local-stress-axes');
    }
  });
  it('rejects removing, renumbering or editing an entry already on main, but lets its wording be corrected', () => {
    const numberedBase = { ...registry, numbered: [{ id: 'old', resultsVersion: 4, when: { any: ['shells'] }, title: { en: 'a' } }] };
    for (const head of [
      { ...numberedBase, numbered: [] },
      { ...numberedBase, numbered: [{ ...numberedBase.numbered[0], resultsVersion: 5 }] },
      { ...numberedBase, numbered: [{ ...numberedBase.numbered[0], when: { any: ['frames'] } }] },
    ]) {
      const result = decide({ snapshots: [], baseRegistry: numberedBase, headRegistry: head, fragments: [] });
      expect(result.ok, JSON.stringify(head)).toBe(false);
      expect(result.report).toContain('old (version 4)');
    }
    const shipped = { ...registry, unnumbered: [{ id: 'new', when: { any: ['shells'] }, title: { en: 'a' }, file: 'x/new.json' }] };
    for (const head of [
      { ...shipped, unnumbered: [] },
      { ...shipped, unnumbered: [{ ...shipped.unnumbered[0], when: { any: ['frames'] } }] },
      { ...shipped, unnumbered: [{ ...shipped.unnumbered[0], resultsVersion: 5 }] },
    ]) {
      const result = decide({ snapshots: [], baseRegistry: shipped, headRegistry: head, fragments: [] });
      expect(result.ok, JSON.stringify(head)).toBe(false);
      expect(result.report).toContain('new');
    }
    const reworded = { ...shipped, unnumbered: [{ ...shipped.unnumbered[0], title: { en: 'b' } }] };
    expect(decide({ snapshots: [], baseRegistry: shipped, headRegistry: reworded, fragments: [] }).ok).toBe(true);
  });
  it('accepts the move from the single registry file: every entry kept with its version', () => {
    const legacy = { schema: 1, numbered: [{ id: 'old', resultsVersion: 4 }], unnumbered: [] };
    expect(decide({ snapshots: [], baseRegistry: legacy, headRegistry: { ...legacy }, fragments: [] }).ok).toBe(true);
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
    const r = decide({ snapshots: moved, baseRegistry: registry, headRegistry: registered, fragments: [breaking], caseFeatures });
    expect(r.ok).toBe(true);
    expect(r.report).toContain('Registered: new (the next results version');
  });
  describe('an examples-scoped entry', () => {
    const examplesOnly = { ...registry, unnumbered: [{ id: 'ex', scope: 'examples', examples: ['torsion'] }] };
    const caseExample = { 'web/results-snapshots/c.json': 'torsion', 'web/results-snapshots/d.json': 'other' };
    const run = (snapshots: unknown[], changedFixtures: string[], headRegistry: unknown = examplesOnly) =>
      decide({ snapshots, baseRegistry: registry, headRegistry, fragments: [breaking], changedFixtures, caseExample, caseFeatures });

    it('registers a moved snapshot of a listed example whose fixture changed', () => {
      expect(run(moved, ['torsion']).ok).toBe(true);
    });
    it('NEGATIVE: fails when a listed example\'s fixture did not change: the numbers moved for another reason', () => {
      const r = run(moved, []);
      expect(r.ok).toBe(false);
      expect(r.report).toContain('did not change: torsion');
      expect(run([], []).ok).toBe(false);
    });
    it('NEGATIVE: cannot explain a moved snapshot of an example it does not list, so an engine change still needs an entry with when', () => {
      const other = [...moved, { file: 'web/results-snapshots/d.json', base: snap({ v: 1 }), head: snap({ v: 2 }) }];
      const r = run(other, ['torsion']);
      expect(r.ok).toBe(false);
      expect(r.report).toContain('can explain web/results-snapshots/d.json');
      const withEngineEntry = { ...examplesOnly, unnumbered: [{ id: 'engine', when: {}, quantities: ['*'] }, ...examplesOnly.unnumbered] };
      expect(run(other, ['torsion'], withEngineEntry).ok).toBe(true);
    });
    it('NEGATIVE: asks the CLI to prove every snapshot of a listed example, moved or not, even beside an unrelated engine entry', () => {
      const proof = [{ file: 'web/results-snapshots/c.json', example: 'torsion' }];
      expect(run(moved, ['torsion']).equivalence).toEqual(proof);
      expect(run([], ['torsion']).equivalence).toEqual(proof);
      const withEngineEntry = { ...examplesOnly, unnumbered: [{ id: 'engine', when: {}, quantities: ['*'] }, ...examplesOnly.unnumbered] };
      expect(run(moved, ['torsion'], withEngineEntry).equivalence).toEqual(proof);
    });
    it('NEGATIVE: fails for a listed example no corpus case opens: nothing could prove its numbers', () => {
      const unknown = { ...examplesOnly, unnumbered: [{ ...examplesOnly.unnumbered[0], examples: ['torsion', 'nowhere'] }] };
      const r = run(moved, ['torsion', 'nowhere'], unknown);
      expect(r.ok).toBe(false);
      expect(r.report).toContain('no corpus case opens: nowhere');
    });
    it('NEGATIVE: a fixture edited only in whitespace, key order or names has the same model inputs, so it is not a changed example', () => {
      const fixture = { name: 'Torsion Beam', sections: [{ id: 1, name: 'IPN 300', j: 1e-7 }], loads: [{ type: 'nodal3d', data: { mx: 8 } }] };
      const text = JSON.stringify(fixture, null, 2);
      expect(modelInputs(JSON.stringify(fixture))).toBe(modelInputs(text));
      expect(modelInputs(text)).toBe(modelInputs(JSON.stringify({ loads: fixture.loads, sections: [{ j: 1e-7, id: 1, name: 'SHS' }], name: 'Renamed' })));
      expect(modelInputs(text)).not.toBe(modelInputs(JSON.stringify({ ...fixture, loads: [{ type: 'nodal3d', data: { mx: 0.8 } }] })));
      expect(run(moved, []).ok).toBe(false);
    });
  });
  it('maps each corpus case opened from an example to its snapshot', () => {
    const corpus = "  { name: '3d-torsion-beam', source: ex('3d-torsion-beam'), workspace: '3d' },\n  { name: '2d-simply-supported', source: ex('simply-supported'), workspace: '2d' },\n  { name: 'pro-x', source: { ded: 'a.ded' } },";
    expect(corpusExamples(corpus)).toEqual({ 'web/results-snapshots/3d-torsion-beam.json': '3d-torsion-beam', 'web/results-snapshots/2d-simply-supported.json': 'simply-supported' });
  });
  it('reads the fragment section from its first line and the entries by id', () => {
    expect(isBreakingResultsFragment('\n### BREAKING (results)\n#### x')).toBe(true);
    expect(isBreakingResultsFragment('### Fixed\n### BREAKING (results)')).toBe(false);
  });
});

describe('the examples-only equivalence proof, with both engines', () => {
  const base = 'base-sha';
  const IPN = '{"sections":[{"name":"IPN 300"}]}';
  const SHS = '{"sections":[{"name":"SHS 100"}]}';
  const files: Record<string, Record<string, string>> = {
    [base]: { 'web/results-snapshots/torsion-beam.json': '{"v":1}', 'web/src/lib/templates/fixtures/torsion.json': IPN, 'web/src/lib/results-snapshot/__tests__/examples-equivalence.test.ts': 'proof' },
    HEAD: { 'web/results-snapshots/torsion-beam.json': '{"v":2}', 'web/src/lib/templates/fixtures/torsion.json': SHS },
  };
  const at = (rev: string, path: string) => files[rev]?.[path] ?? null;
  const cases = [{ file: 'web/results-snapshots/torsion-beam.json', example: 'torsion' }];
  const prove = async (engine: (tree: string | null, fixture: string, snapshot: string) => boolean) => {
    const calls: Array<{ tree: string | null; fixture: string; snapshot: string }> = [];
    let disposed = 0;
    const solve = async (tree: string | null, list: string) => {
      const { readFileSync } = await import('node:fs');
      const items = JSON.parse(readFileSync(list, 'utf8')) as Array<{ fixture: string; snapshot: string }>;
      return items.every((item) => {
        const call = { tree, fixture: readFileSync(item.fixture, 'utf8'), snapshot: readFileSync(item.snapshot, 'utf8') };
        calls.push(call);
        return engine(call.tree, call.fixture, call.snapshot);
      }) ? 0 : 1;
    };
    const code = await proveEquivalence(cases, base, at, { solve, baseTree: async () => ({ dir: 'base-tree', dispose: () => { disposed += 1; } }) });
    return { code, calls, disposed };
  };

  it('solves the old fixture with this engine against the old numbers, and the new fixture with the base engine against the new numbers', async () => {
    const { code, calls, disposed } = await prove(() => true);
    expect(code).toBe(0);
    expect(calls).toEqual([
      { tree: null, fixture: IPN, snapshot: '{"v":1}' },
      { tree: 'base-tree', fixture: SHS, snapshot: '{"v":2}' },
    ]);
    expect(disposed).toBe(1);
  });
  it('NEGATIVE: fails an engine change that affects only the new section, which the old fixture never reaches', async () => {
    const changedForShsOnly = (tree: string | null, fixture: string) => !(tree === 'base-tree' && fixture === SHS);
    const { code, disposed } = await prove(changedForShsOnly);
    expect(code).toBe(1);
    expect(disposed).toBe(1);
  });
  it('NEGATIVE: fails when this engine gives the old example other numbers, without checking out the base', async () => {
    const { code, calls, disposed } = await prove((tree) => tree !== null);
    expect(code).toBe(1);
    expect(calls).toHaveLength(1);
    expect(disposed).toBe(0);
  });
  it('NEGATIVE: fails an example with no fixture at HEAD, before solving anything', async () => {
    const { code, calls } = await (async () => {
      const calls: unknown[] = [];
      const code = await proveEquivalence(cases, base, (rev: string, path: string) => (rev === 'HEAD' && path.includes('fixtures') ? null : at(rev, path)),
        { solve: async () => { calls.push(1); return 0; }, baseTree: async () => ({ dir: 'x', dispose: () => {} }) });
      return { code, calls };
    })();
    expect(code).toBe(1);
    expect(calls).toEqual([]);
  });
  it('NEGATIVE: fails against a base that has no equivalence proof, whose engine nothing could ask', async () => {
    const calls: unknown[] = [];
    const code = await proveEquivalence(cases, base, (rev: string, path: string) => (path.endsWith('examples-equivalence.test.ts') ? null : at(rev, path)),
      { solve: async () => { calls.push(1); return 0; }, baseTree: async () => ({ dir: 'x', dispose: () => {} }) });
    expect(code).toBe(1);
    expect(calls).toEqual([]);
  });
});

describe('the base checkout reuses this build\'s engine', () => {
  it('when only the app, the docs, the changelog or research papers changed', () => {
    expect(headEngineServesBase(['web/src/lib/templates/fixtures/torsion.json', 'docs/verification/PROVENANCE.md', 'changelog.d/x.md', 'research/papers.yaml'])).toBe(true);
    expect(headEngineServesBase([])).toBe(true);
  });
  it('NEGATIVE: not when only the WASM build script changed', () => {
    expect(headEngineServesBase(['web/src/x.ts', 'scripts/wasm-cached.sh'])).toBe(false);
  });
  it('NEGATIVE: not when a committed engine build changed, which is the engine itself', () => {
    expect(headEngineServesBase(['web/src/lib/wasm/dedaliano_engine_bg.wasm'])).toBe(false);
    expect(headEngineServesBase(['web/src/x.ts', 'web/src/lib/wasm/dedaliano_engine.js'])).toBe(false);
  });
  it('NEGATIVE: not when only the engine build script changed', () => {
    expect(headEngineServesBase(['engine/build.rs'])).toBe(false);
  });
  it('NEGATIVE: not for a path it does not know, at the top level or as research Rust', () => {
    expect(headEngineServesBase(['new-build-input.sh'])).toBe(false);
    expect(headEngineServesBase(['.github/workflows/ci.yml'])).toBe(false);
    expect(headEngineServesBase(['research/topopt/src/lib.rs'])).toBe(false);
  });
});
