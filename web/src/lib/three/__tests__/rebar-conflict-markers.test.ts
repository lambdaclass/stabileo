/**
 * Making a marker cheaper must not make it a different marker.
 *
 * ── What changed, and what it is allowed to change ─────────────────
 *
 * A conflict marker went from a 10 × 8 sphere to a 6 × 4 one: 140 triangles to 36. On the 7-storey
 * building, which carries 39 240 open conflicts, that is 5 493 600 triangles down to 1 412 640 —
 * against the 1 008 672 the whole reinforcement needs.
 *
 * In the browser it bought about 1,9× on a family switch with the markers on screen, not the 3,89×
 * the geometry fell by: the rest of that cost is fill rate, and 39 240 translucent spheres cover the
 * same screen area however few triangles each is made of. The reduction is real and it is not the
 * whole story, which is why the number below is a triangle count and the timing lives in the
 * browser benchmark where it can be measured honestly.
 *
 * A marker is a dot. Its ROUNDNESS carries nothing. What it carries is where the conflict is and how
 * bad it is — position, and a radius scaled by the shortfall and floored so a 2 mm one is still
 * visible. Those are what this file pins, one assertion each, because a performance change that
 * quietly drops a warning is worse than the slow frame it replaced.
 *
 * ── Selecting one ──────────────────────────────────────────────────
 *
 * Markers are now pickable, through `pickableConflicts()` and `conflictAt(slot)`. Those two are
 * deliberately not `pickable()`: a marker is a small sphere sitting inside the cage at exactly
 * the places where bars are densest, and letting it compete by distance in the same hit list
 * would take clicks away from every bar around it. The caller raycasts markers first and
 * separately, and treats a hit as the deliberate act it is.
 *
 * `conflictAt` is the piece that makes a click mean anything, because the filter COMPACTS the
 * instance buffer: slot 3 holding the conflict it held a moment ago is a property, not an
 * obvious truth, and a picker that assumed otherwise would open an inspector on the wrong
 * conflict. That is tested here at length.
 *
 * Severity, class, measured clearance and requirement are not in the marker geometry at all:
 * they live on `SceneConflictMarker`, which is what the inspector reads. So they are pinned on
 * the PROJECTION rather than on the mesh.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createRebarScene, rebarSceneBuilds, MARKER_SEGMENTS, type RebarScene }
  from '../rebar-scene';
import {
  filterScene, type SceneConflictMarker, type SceneFilter, type SceneModel,
} from '../../engine/detailing/scene-model';
import { workspaceScene } from '../../engine/detailing/__tests__/helpers/workspace-scene';

/** The tessellation this replaced, kept as the reference the reduction is measured against. */
const BEFORE = { width: 10, height: 8 } as const;

function trianglesOf(width: number, height: number): number {
  const g = new THREE.SphereGeometry(1, width, height);
  const n = (g.getIndex()?.count ?? 0) / 3;
  g.dispose();
  return n;
}

/** The radius the builder gives a marker, restated so the test does not trust the mesh alone. */
function radiusFor(c: SceneConflictMarker): number {
  const shortfall = Math.max(0, c.required - c.clearance);
  return Math.max(0.02, Math.min(0.12, shortfall * 1.5));
}

/** Position and scale of one instance slot, read back off the mesh. */
function instanceAt(marks: THREE.InstancedMesh, i: number) {
  const m = new THREE.Matrix4();
  marks.getMatrixAt(i, m);
  return {
    position: new THREE.Vector3().setFromMatrixPosition(m),
    scale: new THREE.Vector3().setFromMatrixScale(m),
  };
}

// A whole-building test: 30 s rather than Vitest's 5 s default, for the reason set out in
// `provisional-projections.test.ts` — under a full-suite pool these were failing on
// contention with every assertion passing.
describe('the marker got cheaper, not different', { timeout: 30_000 }, () => {
  let scene: SceneModel;
  let built: RebarScene;

  beforeAll(async () => {
    scene = (await workspaceScene('pro-edificio-7p')).scene;
    built = createRebarScene(scene);
  }, 600_000);

  // ─── The reduction, measured ───────────────────────────────────

  it('reports the reduction rather than claiming it', () => {
    const before = trianglesOf(BEFORE.width, BEFORE.height);
    const after = trianglesOf(MARKER_SEGMENTS.width, MARKER_SEGMENTS.height);
    const n = scene.conflicts.length;

    console.log(`\nconflict markers — pro-edificio-7p\n`
      + `  conflicts                 ${n.toLocaleString('en')}\n`
      + `  triangles per marker      ${before} → ${after}`
      + `  (${(before / after).toFixed(2)}× fewer)\n`
      + `  marker triangles total    ${(before * n).toLocaleString('en')}`
      + ` → ${(after * n).toLocaleString('en')}\n`
      + `  reinforcement triangles   ${built.stats.triangles.toLocaleString('en')}\n`
      + `  markers as a multiple of the reinforcement `
      + `${(before * n / built.stats.triangles).toFixed(2)}× → `
      + `${(after * n / built.stats.triangles).toFixed(2)}×\n`);

    expect(after).toBeLessThan(before);
    expect(built.stats.markerTriangles).toBe(after);
    expect(built.stats.markers).toBe(n);
    expect(built.stats.markerTrianglesTotal).toBe(after * n);
    /**
     * The markers must stop being the dominant geometry.
     *
     * The point of the change, as a number. At 10 × 8 they were five and a half times the
     * reinforcement; anything at or above it means the reduction did not land.
     */
    expect(built.stats.markerTrianglesTotal).toBeLessThan(built.stats.triangles * 2);
  });

  // ─── Nothing lost, nothing renamed ────────────────────────────

  it('draws one marker per conflict, and loses none', () => {
    expect(scene.conflicts.length).toBeGreaterThan(0);
    expect(built.markers).not.toBeNull();
    expect(built.markers!.count).toBe(scene.conflicts.length);
    expect(built.markers!.instanceMatrix.count).toBe(scene.conflicts.length);
  });

  it('keeps every conflict\'s identity, position and measurements in the projection', () => {
    /**
     * The projection is what the panel reads.
     *
     * Severity, class, the measured clearance and what was required reach the user through the
     * detailing panel's conflict navigator, which never touches this geometry. Pinning them here
     * is what makes "the tessellation changed and nothing else did" a checkable claim.
     */
    for (const c of scene.conflicts) {
      expect(c.barIds).toHaveLength(2);
      expect(c.barIds[0]).toBeTruthy();
      expect(c.barIds[1]).toBeTruthy();
      expect(c.assemblyId).toBeTruthy();
      expect(c.pairClass).toBeTruthy();
      expect(Number.isFinite(c.clearance)).toBe(true);
      expect(Number.isFinite(c.required)).toBe(true);
      expect(Number.isFinite(c.at.x + c.at.y + c.at.z)).toBe(true);
    }
    // Eight assertions across 39 240 conflicts is 314 000 of them. That is the point — a
    // sample cannot prove "none was lost" — but it does not fit Vitest's 5 s default on a
    // loaded machine, and a gate that fails on machine load is a gate nobody trusts.
  }, 60_000);

  it('places every marker at its own conflict, at its own size', () => {
    // Every one of them, not a sample: a single marker at the wrong place is a red dot on a bar
    // that is fine, and there are 39 240 chances to be believed.
    const marks = built.markers!;
    for (let i = 0; i < scene.conflicts.length; i++) {
      const c = scene.conflicts[i];
      const { position, scale } = instanceAt(marks, i);
      // Float32 in the instance matrix, so millimetre tolerance on a metre-scale coordinate.
      expect(position.x, `marker ${i} x`).toBeCloseTo(c.at.x, 4);
      expect(position.y, `marker ${i} y`).toBeCloseTo(c.at.y, 4);
      expect(position.z, `marker ${i} z`).toBeCloseTo(c.at.z, 4);
      expect(scale.x, `marker ${i} radius`).toBeCloseTo(radiusFor(c), 5);
    }
  }, 60_000);

  it('still floors the smallest marker and caps the largest, so size keeps meaning size', () => {
    // The size is the severity. A tessellation change must not touch the scale rule.
    const marks = built.markers!;
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < scene.conflicts.length; i++) {
      const r = instanceAt(marks, i).scale.x;
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    expect(min).toBeGreaterThan(0.02 - 1e-6);
    expect(max).toBeLessThan(0.12 + 1e-6);
  });

  // ─── The map back ─────────────────────────────────────────────

  it('answers which conflict a drawn slot holds, unfiltered', () => {
    for (let i = 0; i < scene.conflicts.length; i++) {
      expect(built.conflictAt(i)).toBe(scene.conflicts[i]);
    }
    expect(built.conflictAt(-1)).toBeNull();
    expect(built.conflictAt(scene.conflicts.length)).toBeNull();
  });

  it('keeps the map right after the buffer has been compacted', () => {
    /**
     * The property that is not obvious.
     *
     * A filter compacts the instance buffer, so slot 0 stops being conflict 0. The matrix at a slot
     * and the identity reported for that slot have to move together — and they are updated by two
     * different lines, which is exactly the kind of pairing that drifts.
     */
    const marks = built.markers!;
    built.setVisibility({ filter: { solidKinds: ['slab'] } });
    expect(marks.count).toBeGreaterThan(0);
    expect(marks.count).toBeLessThan(scene.conflicts.length);

    for (let i = 0; i < marks.count; i++) {
      const c = built.conflictAt(i);
      expect(c, `slot ${i} names a conflict`).not.toBeNull();
      const { position, scale } = instanceAt(marks, i);
      expect(position.x, `slot ${i} sits at its own conflict`).toBeCloseTo(c!.at.x, 4);
      expect(position.y).toBeCloseTo(c!.at.y, 4);
      expect(position.z).toBeCloseTo(c!.at.z, 4);
      expect(scale.x).toBeCloseTo(radiusFor(c!), 5);
    }
    // Past the drawn count is nobody's, not the former occupant's.
    expect(built.conflictAt(marks.count)).toBeNull();

    built.setVisibility({ filter: {} });
    expect(marks.count).toBe(scene.conflicts.length);
    for (let i = 0; i < scene.conflicts.length; i++) {
      expect(built.conflictAt(i)).toBe(scene.conflicts[i]);
    }
  });

  // ─── Picking ──────────────────────────────────────────────────

  it('offers the marker mesh for picking, separately from the bars', () => {
    built.setVisibility({ filter: {} });
    const pickable = built.pickableConflicts();
    expect(pickable, 'the marker mesh is offered').toEqual([built.markers]);
    // Separately: a marker in the bar/concrete list would win by distance inside the cage and
    // take clicks away from the steel it is sitting among.
    expect(built.pickable()).not.toContain(built.markers);
  });

  it('offers nothing to pick when the markers are switched off', () => {
    built.setVisibility({ conflicts: false });
    expect(built.pickableConflicts(), 'a hidden marker cannot be clicked').toEqual([]);
    built.setVisibility({ conflicts: true });
    expect(built.pickableConflicts()).toEqual([built.markers]);
  });

  it('resolves a picked slot to the conflict actually drawn there, filter or no filter', () => {
    /**
     * The whole point of picking, stated as the property it depends on.
     *
     * A raycast reports an `instanceId` in the COMPACTED buffer. Resolving that through the
     * conflict array directly — `scene.conflicts[instanceId]` — is the obvious wrong thing, and
     * it would silently open the inspector on a different conflict the moment any layer switch
     * was on. So the slot is resolved through `conflictAt`, and this checks that the identity
     * it returns is the one whose geometry is in that slot, under a filter and without one.
     */
    for (const f of [{}, { solidKinds: ['slab'] }, { solidKinds: ['column'] }] as SceneFilter[]) {
      built.setVisibility({ filter: f, conflicts: true });
      const marks = built.markers!;
      expect(marks.count).toBeGreaterThan(0);
      // Sample across the buffer rather than all 40 000: the compaction is uniform, and the
      // exhaustive pass over every slot already runs in the compaction test above.
      const step = Math.max(1, Math.floor(marks.count / 50));
      for (let i = 0; i < marks.count; i += step) {
        const c = built.conflictAt(i)!;
        expect(c, `slot ${i} under ${JSON.stringify(f)}`).toBeTruthy();
        const { position } = instanceAt(marks, i);
        expect(position.x, `slot ${i} geometry matches its identity`).toBeCloseTo(c.at.x, 4);
        expect(position.y).toBeCloseTo(c.at.y, 4);
        expect(position.z).toBeCloseTo(c.at.z, 4);
        // Everything the inspector shows must be present on what a pick resolves to.
        expect(c.barIds[0]).toBeTruthy();
        expect(c.barIds[1]).toBeTruthy();
        expect(c.barIds[0]).not.toBe(c.barIds[1]);
        expect(Number.isFinite(c.clearance)).toBe(true);
        expect(Number.isFinite(c.required)).toBe(true);
        expect(Number.isFinite(c.shortfall)).toBe(true);
        expect(c.severity).toBeTruthy();
        expect(c.pairClass).toBeTruthy();
        expect(c.assemblyId).toBeTruthy();
        expect(c.elementIds.length, 'the parent member is reachable from a pick')
          .toBeGreaterThan(0);
      }
    }
    built.setVisibility({ filter: {} });
  }, 60_000);

  it('does not rebuild the tubes to make a marker selectable', () => {
    // Picking is a read. A selection that re-tubed 22 817 bars would be the three-second
    // freeze this whole viewport was rebuilt to remove.
    const before = rebarSceneBuilds();
    built.pickableConflicts();
    built.conflictAt(0);
    built.setVisibility({ filter: { solidKinds: ['column'] } });
    built.conflictAt(0);
    built.setVisibility({ filter: {} });
    expect(rebarSceneBuilds()).toBe(before);
  });

  // ─── Filters ──────────────────────────────────────────────────

  it('shows the same markers a filtered scene would carry', () => {
    /**
     * The renderer and `filterScene` must agree about which conflicts survive a filter.
     *
     * A marker drawn for a conflict the tally has dropped is a warning about something the user is
     * not looking at; a marker missing for one it kept is a conflicted cage silently reported clean.
     */
    for (const f of [
      {}, { solidKinds: ['slab'] }, { solidKinds: ['column', 'beam'] }, { solidKinds: [] },
      { hideBars: true }, { conflictedOnly: true },
    ] as SceneFilter[]) {
      built.setVisibility({ filter: f });
      const expected = filterScene(scene, f).conflicts.length;
      expect(built.markers!.count, `markers under ${JSON.stringify(f)}`).toBe(expected);
    }
    built.setVisibility({ filter: {} });
    expect(built.markers!.count).toBe(scene.conflicts.length);
  });

  it('hides the markers on their own switch, without dropping any', () => {
    const marks = built.markers!;
    built.setVisibility({ conflicts: false });
    expect(marks.visible).toBe(false);
    // Hidden, not discarded: every instance is still there and still names its conflict.
    expect(marks.count).toBe(scene.conflicts.length);
    expect(built.conflictAt(0)).toBe(scene.conflicts[0]);

    built.setVisibility({ conflicts: true });
    expect(marks.visible).toBe(true);
    expect(marks.count).toBe(scene.conflicts.length);
  });

  // ─── The rest of the scene ────────────────────────────────────

  it('rebuilds no tube when the markers are switched, however many times', () => {
    const builds = rebarSceneBuilds();
    const buffers = built.bars.map((b) => b.mesh.geometry.getAttribute('position'));
    for (let i = 0; i < 20; i++) {
      built.setVisibility({ conflicts: i % 2 === 0 });
    }
    built.setVisibility({ conflicts: true });
    expect(rebarSceneBuilds() - builds, 'tubes rebuilt by switching markers').toBe(0);
    expect(built.bars.map((b) => b.mesh.geometry.getAttribute('position'))).toEqual(buffers);
  });

  it('leaves the reinforcement and the families exactly as they were', () => {
    built.setVisibility({ filter: {}, conflicts: true, concrete: true });
    // The counts the QA session pinned, unchanged by anything to do with markers.
    expect(scene.bars.length).toBeGreaterThan(19_000);
    expect(built.stats.tubes).toBe(scene.bars.filter((b) => b.polyline.length >= 2).length);

    const families = [...new Set(built.bars
      .filter((b) => b.mesh.visible && b.drawn.length > 0)
      .map((b) => b.family))];
    expect(families).toContain('column');
    expect(families).toContain('slab');
    expect(families).toContain('wall');
  });
});
