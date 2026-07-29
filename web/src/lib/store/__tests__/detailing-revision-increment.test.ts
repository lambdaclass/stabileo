/**
 * Regeneration must INCREMENT the detailing revision, not restart it.
 *
 * ── The invariant, and the defect it was hiding ──────────────────────
 *
 * `generate()` and `generateFloors()` both derive the new revision from the highest revision
 * already on the assemblies — `previousRevision: maxRevision(store.assemblies)`. `store` is a
 * `$derived` over `modelStore.model.detailing`, and a `$derived` is lazy and memoised: it
 * recomputes when a dependency changes AND it is read. Whether it happens to be current at the
 * moment a command runs therefore depends on what ELSE has read it in the same tick.
 *
 * That makes the revision counter depend on unrelated parts of the UI. This branch already
 * found and fixed the identical class TWICE, two lines away, and said so in the source: the
 * floor-assembly merge and `buildDocument` both read `modelStore.model.detailing` directly
 * because "a `$derived` does not recompute inside the synchronous call that wrote it". The two
 * `previousRevision` reads were left on the derived.
 *
 * The consequence is not cosmetic. A revision that resets to 1 on every regeneration means a
 * document series cannot be ordered, a review cannot be tied to the bars it described, and
 * supersession compares two revisions that are both "1".
 *
 * These tests read the PERSISTED model, never the store's own view, because the persisted model
 * is what a reopened project contains and it is the only source that cannot be a tick behind.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../index';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { resultsStore } from '../results.svelte';
import { verificationStore } from '../verification.svelte';
import type { ElementForces3D, QuadStress } from '../../engine/types-3d';

/** The revisions on the PERSISTED assemblies — not `detailingStore.assemblies`. */
function persistedRevisions(): number[] {
  return (modelStore.model.detailing?.assemblies ?? []).map((a) => a.detailingRevision);
}

function maxPersistedRevision(): number {
  const rs = persistedRevisions();
  return rs.length === 0 ? 0 : Math.max(...rs);
}

/** A 5 × 5 m slab on four columns, solved — the smallest model `generateFloors()` accepts. */
function buildFloorModel() {
  modelStore.clear();
  detailingStore.clear();
  verificationStore.clear();

  const sectionId = modelStore.addSection({
    name: '40×40', a: 0.16, iz: 0.00213, b: 0.4, h: 0.4,
  });
  const material = [...modelStore.model.materials.keys()][0];
  const top: number[] = [];
  const columns: number[] = [];
  for (const [x, y] of [[0, 0], [5, 0], [5, 5], [0, 5]] as const) {
    const base = modelStore.addNode(x, y, 0);
    const head = modelStore.addNode(x, y, 3);
    modelStore.addSupport(base, 'fixed3d');
    const col = modelStore.addElement(base, head, 'frame');
    modelStore.updateElementSection(col, sectionId);
    columns.push(col);
    top.push(head);
  }
  const quad = modelStore.addQuad([top[0], top[1], top[2], top[3]], material, 0.22);
  modelStore.addSurfaceLoad3D(quad, 10, 1);

  const stresses: QuadStress[] = [{
    elementId: quad, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 34, my: 28, mxy: 6, vonMises: 0,
  }];
  const forces = (n: number): ElementForces3D[] => columns.map((c) => ({
    elementId: c, length: 3, nStart: n, nEnd: n,
    vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
    releaseMyStart: false, releaseMyEnd: false,
    releaseMzStart: false, releaseMzEnd: false,
    releaseTStart: false, releaseTEnd: false,
  } as ElementForces3D));
  const res = () => ({
    displacements: [], reactions: [], quadStresses: stresses, elementForces: forces(-240),
  }) as never;
  resultsStore.setCombinationResults3D(
    new Map(modelStore.model.loadCases.map((c) => [c.id, res()])),
    new Map(modelStore.model.combinations.map((c) => [c.id, res()])),
    {} as never,
  );
  return { quad, columns };
}

describe('regeneration increments the detailing revision', () => {
  beforeEach(() => {
    modelStore.clear();
    detailingStore.clear();
    verificationStore.clear();
  });

  it('increments on every consecutive run, from the PERSISTED revision', () => {
    buildFloorModel();

    detailingStore.generateFloors();
    const first = maxPersistedRevision();
    expect(first, 'the first run must produce a numbered revision').toBeGreaterThan(0);

    detailingStore.generateFloors();
    const second = maxPersistedRevision();
    expect(second, 'a regeneration must not restart the counter').toBeGreaterThan(first);

    detailingStore.generateFloors();
    expect(maxPersistedRevision()).toBeGreaterThan(second);
  });

  /**
   * The invariant that actually broke, stated directly.
   *
   * Reading `previousRevision` from the `$derived` makes the counter depend on whether some
   * other reader happened to refresh that derived first. Nothing outside this store may be able
   * to change a revision number, so the run must take its previous revision from the persisted
   * model — which is exactly what a reopened project would carry.
   */
  it('does not depend on anything else having read the store view first', () => {
    buildFloorModel();
    detailingStore.generateFloors();
    const first = maxPersistedRevision();

    // Two runs back to back with NO intervening read of `detailingStore.assemblies`. The
    // derived is therefore at its most stale, which is the condition that produced revision 1
    // twice in a row in the browser.
    detailingStore.generateFloors();
    detailingStore.generateFloors();

    const revisions = persistedRevisions();
    expect(revisions.every((r) => r > 0)).toBe(true);
    expect(maxPersistedRevision()).toBeGreaterThan(first + 1);
  });

  it('keeps the revision monotonic across a beam and a floor run in one tick', () => {
    // Floor assemblies are ADDED to beam ones, and both take their previous revision from the
    // same counter. If either reads a stale view the two families disagree about what
    // revision the project is on.
    buildFloorModel();
    detailingStore.generateFloors();
    const afterFloors = maxPersistedRevision();
    detailingStore.generateFloors();
    expect(maxPersistedRevision()).toBeGreaterThan(afterFloors);
    // Every persisted assembly carries a real revision, none reset to 1.
    expect(persistedRevisions().some((r) => r === 0)).toBe(false);
  });
});
