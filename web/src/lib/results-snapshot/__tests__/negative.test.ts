/**
 * The gate's negative case (#716, per #451): a deliberate result change without a registry entry
 * fails it.
 *
 * The change is made the way a defect or a code change would reach a result: the corpus case is
 * opened and one of its numbers moves by 1 % before the app solves it (the beam's load, standing
 * in for a changed formula). Then both halves of the gate are run on it:
 *
 *   1. the snapshot test's comparison reports the moved values against the committed snapshot;
 *   2. with that snapshot regenerated, the pull-request gate fails without a registry entry and a
 *      BREAKING (results) fragment, names each missing piece, and passes once both are added.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { modelStore } from '../../store/model.svelte';
import { CORPUS } from '../corpus';
import { capture, openedFeatures } from '../capture';
import { snapshotFile } from '../run-group';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, formatCaseReport, mergeValues, parseSnapshot, serialiseSnapshot } from '../../../../scripts/results-snapshot/compare.mjs';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { decide } from '../../../../scripts/results-snapshot/gate.mjs';
import { readSourcesAt } from '../../../../scripts/result-changes/registry.mjs';

const CASE = CORPUS.find((c) => c.name === '2d-simply-supported')!;
const REGISTRY = readSourcesAt('HEAD')!;

beforeAll(async () => { await initSolver(); });

describe('a change to the envelope alone', () => {
  it('NEGATIVE: is reported, and fails the gate without registration', async () => {
    const name = '3d-building';
    const base = parseSnapshot(readFileSync(snapshotFile(name), 'utf8'));
    // The case has combinations, so its snapshot carries their envelope and governing combinations.
    const envelopePaths = Object.keys(base.values).filter((p) => p.startsWith('envelope.') && typeof base.values[p] === 'number' && base.values[p] !== 0);
    expect(envelopePaths.length).toBeGreaterThan(0);
    expect(Object.keys(base.values).some((p) => p.startsWith('envelope.governing['))).toBe(true);
    // The fresh capture produces the same envelope as committed.
    const fresh = await capture(CORPUS.find((c) => c.name === name)!);
    const d0 = compareValues(base.values, fresh.values);
    expect(d0.differs, formatCaseReport(name, d0)).toBe(false);

    const path = envelopePaths.find((p) => /posValues|negValues/.test(p))!;
    const head = { ...base, values: { ...base.values, [path]: (base.values[path] as number) * 1.01 } };
    const diff = compareValues(base.values, head.values);
    expect(diff.changed.map((c: { path: string }) => c.path)).toEqual([path]);
    const r = decide({ snapshots: [{ file: `web/results-snapshots/${name}.json`, base, head }], baseRegistry: REGISTRY, headRegistry: REGISTRY, fragments: [] });
    expect(r.ok).toBe(false);
    expect(r.report).toContain(path);
  });
});

describe('a deliberate result change', () => {
  it('is reported by the snapshot test, value by value', async () => {
    const committed = parseSnapshot(readFileSync(snapshotFile(CASE.name), 'utf8'));
    // Unchanged, the case reproduces its snapshot exactly.
    expect(compareValues(committed.values, (await capture(CASE)).values).differs).toBe(false);
    const changed = await capture(CASE, { afterOpen: () => { modelStore.updateLoad(1, { qI: -10.1, qJ: -10.1 }); } });
    const diff = compareValues(committed.values, changed.values);
    expect(diff.differs).toBe(true);
    const report = formatCaseReport(CASE.name, diff);
    expect(report).toMatch(/base\.reactions\[n\d+\]\.\w+: .+ → .+ \(1\.00 %\)/);
    expect(report).toMatch(/base\.displacements\[n\d+\]/);
  });

  it('fails the gate without a registry entry and a BREAKING (results) fragment, and passes with both', async () => {
    const file = `web/results-snapshots/${CASE.name}.json`;
    const base = parseSnapshot(readFileSync(snapshotFile(CASE.name), 'utf8'));
    const changed = await capture(CASE, { afterOpen: () => { modelStore.updateLoad(1, { qI: -10.1, qJ: -10.1 }); } });
    // The snapshot as `make snapshots-update` would rewrite it.
    const head = parseSnapshot(serialiseSnapshot({ ...changed, values: mergeValues(base.values, changed.values) }));
    const snapshots = [{ file, base, head }];
    const caseFeatures = { [file]: await openedFeatures(CASE) };

    const unregistered = decide({ snapshots, caseFeatures, baseRegistry: REGISTRY, headRegistry: REGISTRY, fragments: [] });
    expect(unregistered.ok).toBe(false);
    expect(unregistered.report).toContain('no new entry in web/src/lib/provenance/result-changes');
    expect(unregistered.report).toContain('no changelog.d/ fragment under "### BREAKING (results)"');
    expect(unregistered.report).toContain(file);

    // A fragment alone, or a fragment in another section, is not enough.
    const entry = {
      id: 'negative-case-entry',
      when: { all: ['plane2D', 'frameMembers', 'analysis:linear'] },
      quantities: ['displacements', 'reactions', 'elementForces', 'equilibrium', 'resultSummary'],
    };
    const registered = { ...REGISTRY, unnumbered: [...REGISTRY.unnumbered, entry] };
    const fixed = { file: 'changelog.d/x.md', text: '### Fixed\n#### Something (2026-10-28)\n' };
    const breaking = { file: 'changelog.d/y.md', text: '### BREAKING (results)\n#### The beam load (2026-10-28)\n' };
    expect(decide({ snapshots, caseFeatures, baseRegistry: REGISTRY, headRegistry: REGISTRY, fragments: [breaking] }).ok).toBe(false);
    expect(decide({ snapshots, caseFeatures, baseRegistry: REGISTRY, headRegistry: registered, fragments: [fixed] }).ok).toBe(false);
    const contextFree = { ...REGISTRY, unnumbered: [...REGISTRY.unnumbered, { id: 'context-free-entry' }] };
    const rejected = decide({ snapshots, caseFeatures, baseRegistry: REGISTRY, headRegistry: contextFree, fragments: [breaking] });
    expect(rejected.ok).toBe(false);
    expect(rejected.report).toContain('no applicable entry can explain');
    const ok = decide({ snapshots, caseFeatures, baseRegistry: REGISTRY, headRegistry: registered, fragments: [breaking] });
    expect(ok.ok).toBe(true);
    expect(ok.report).toContain('negative-case-entry');

    const examplesOnly = { ...entry, when: undefined, scope: 'examples', examples: ['simply-supported'] };
    const asExamples = { ...REGISTRY, unnumbered: [...REGISTRY.unnumbered, examplesOnly] };
    const disguised = decide({ snapshots, caseFeatures, baseRegistry: REGISTRY, headRegistry: asExamples, fragments: [breaking], changedFixtures: [], caseExample: { [file]: CASE.source && 'example' in CASE.source ? CASE.source.example : '' } });
    expect(disguised.ok).toBe(false);
    expect(disguised.report).toContain('did not change');
  });
});

describe('containment audit', () => {
  it('finds a refusal nested in an outcome error string', async () => {
    const { collectContainment, containmentFindings } = await import('../capture');
    containmentFindings.clear();
    const refusal = JSON.stringify({ message: 'withheld', structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741 }] });
    collectContainment({ outcome: { ok: false, error: refusal } });
    expect([...containmentFindings]).toEqual(['error:BU-BOUND']);
    containmentFindings.clear();
    collectContainment({ outcome: { ok: false, error: new Error(refusal) } });
    expect([...containmentFindings]).toEqual(['error:BU-BOUND']);
    containmentFindings.clear();
  });
});

describe('the examples-only equivalence proof', () => {
  it('NEGATIVE: holds for an example the engine still solves as recorded, and fails once the engine output for it shifts', async () => {
    const { sameAsBefore } = await import('../equivalence');
    const c = CORPUS.find((x) => x.name === '3d-torsion-beam')!;
    const fixture = JSON.parse(readFileSync(new URL('../../templates/fixtures/3d-torsion-beam.json', import.meta.url), 'utf8'));
    const recorded = parseSnapshot(readFileSync(snapshotFile(c.name), 'utf8'));
    expect((await sameAsBefore(c, fixture, recorded)).same).toBe(true);
    const rx = recorded.values['base.displacements[n2].rx'] as number;
    expect(rx).toBeCloseTo(0.0115, 4);
    const shifted = { ...recorded, values: { ...recorded.values, 'base.displacements[n2].rx': rx * 1.01 } };
    const r = await sameAsBefore(c, fixture, shifted);
    expect(r.same).toBe(false);
    expect(r.report).toContain('base.displacements[n2].rx');
  }, 120_000);
});
