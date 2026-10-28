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
import { capture } from '../capture';
import { snapshotFile } from '../run-group';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, formatCaseReport, mergeValues, parseSnapshot, serialiseSnapshot } from '../../../../scripts/results-snapshot/compare.mjs';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { decide } from '../../../../scripts/results-snapshot/gate.mjs';

const CASE = CORPUS.find((c) => c.name === '2d-simply-supported')!;
const REGISTRY = JSON.parse(readFileSync(new URL('../../provenance/result-changes.json', import.meta.url), 'utf8'));

beforeAll(async () => { await initSolver(); });

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

    const unregistered = decide({ snapshots, baseRegistry: REGISTRY, headRegistry: REGISTRY, fragments: [] });
    expect(unregistered.ok).toBe(false);
    expect(unregistered.report).toContain('no new entry in web/src/lib/provenance/result-changes.json');
    expect(unregistered.report).toContain('no changelog.d/ fragment under "### BREAKING (results)"');
    expect(unregistered.report).toContain(file);

    // A fragment alone, or a fragment in another section, is not enough.
    const entry = { ...REGISTRY.changes[0], id: 'negative-case-entry', resultsVersion: REGISTRY.currentResultsVersion + 1 };
    const registered = { ...REGISTRY, currentResultsVersion: entry.resultsVersion, changes: [entry, ...REGISTRY.changes] };
    const fixed = { file: 'changelog.d/x.md', text: '### Fixed\n#### Something (2026-10-28)\n' };
    const breaking = { file: 'changelog.d/y.md', text: '### BREAKING (results)\n#### The beam load (2026-10-28)\n' };
    expect(decide({ snapshots, baseRegistry: REGISTRY, headRegistry: REGISTRY, fragments: [breaking] }).ok).toBe(false);
    expect(decide({ snapshots, baseRegistry: REGISTRY, headRegistry: registered, fragments: [fixed] }).ok).toBe(false);
    const ok = decide({ snapshots, baseRegistry: REGISTRY, headRegistry: registered, fragments: [breaking] });
    expect(ok.ok).toBe(true);
    expect(ok.report).toContain('negative-case-entry');
  });
});
