/**
 * A layer switch must not rebuild the building.
 *
 * ── What went wrong ────────────────────────────────────────────────
 *
 * Bars were merged into one buffer per COLOUR, so "hide columns" could only be expressed by
 * handing the renderer a smaller scene — and a smaller scene has a different signature, so all
 * 20 917 tubes were re-sampled, re-framed and re-emitted to answer a checkbox. Measured on the
 * 7-storey building: 5,9 s for the first columns toggle and up to 16,7 s for slabs, to arrive at
 * geometry already sitting on the GPU.
 *
 * Batching by family AND colour makes a family switch `mesh.visible`. The filters that cut ACROSS
 * a family — isolate this member, show only these states — compact the index instead, which
 * re-selects which of the already-built triangles are drawn and rebuilds no tube either.
 *
 * ── Why this file measures as well as asserts ───────────────────────
 *
 * Because "does not rebuild" is a claim about cost, and a cost nobody timed is a hope. So the
 * numbers are printed for the record — including the old rebuild-to-toggle path, measured in the
 * same run on the same machine, because a remembered figure from another session is not a
 * comparison.
 *
 * What is ASSERTED is not a timing. It is the build counter and the identity of the vertex
 * buffers: a switch may not build a tube and may not so much as re-upload one. Those cannot be
 * explained away by a busy machine, which is what a millisecond threshold inside a 262-file
 * parallel suite always can be. The timings carry ceilings too, wide enough to survive
 * contention and narrow enough to catch an order-of-magnitude return.
 *
 * ── Why the picking assertions are as long as they are ─────────────
 *
 * A picking map off by one bar does not look wrong. It returns the neighbouring bar's mark, and
 * a user reading a mark off the screen has no way to know. Frame elements and shell elements are
 * numbered independently and both start at 1, so a slab bar and a column bar can carry the same
 * number — 11 340 slab bars and 234 wall bars were once counted as column steel through exactly
 * that collision. Splitting the merge into more meshes is a new chance to reintroduce it, so
 * every batch's first and last triangle is checked, filtered and unfiltered.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createRebarScene, rebarSceneBuilds, type RebarScene } from '../rebar-scene';
import {
  filterScene, sceneSignature, summariseScene,
  type SceneBar, type SceneFilter, type SceneModel, type SceneSolid,
} from '../../engine/detailing/scene-model';
import { reportElementStatus } from '../../engine/detailing/element-status';
import { workspaceScene } from '../../engine/detailing/__tests__/helpers/workspace-scene';

// ─── A model with every family in it ─────────────────────────────

function line(x: number, y: number, z: number) {
  return [0, 1, 2, 3].map((i) => ({ x: x + i * 0.5, y, z }));
}

function bar(over: Partial<SceneBar>): SceneBar {
  return {
    barId: 'b', diameterMm: 16, role: 'longitudinal', ownerScope: 'frame',
    piece: 'longitudinal', assemblyId: 'a', elementIds: [1], cuttingLength: 2,
    conflicted: false, polyline: line(0, 0, 0),
    ...over,
  };
}

function solid(over: Partial<SceneSolid>): SceneSolid {
  return {
    id: 's', kind: 'beam', assemblyId: 'a', elementIds: [],
    base: [
      { x: 0, y: -0.1, z: -0.2 }, { x: 0, y: 0.1, z: -0.2 },
      { x: 0, y: 0.1, z: 0.2 }, { x: 0, y: -0.1, z: 0.2 },
    ],
    extrude: { x: 2, y: 0, z: 0 },
    label: { key: 'detailing.scene.solid.member', params: {} },
    reinforced: true,
    ...over,
  };
}

/**
 * One bar and one solid per family, with the id collision the real model has.
 *
 * Column steel names frame element 1 and slab steel names panel 1. Both are "1", and nothing in
 * the number says which — which is why `ownerScope` exists and why this fixture reproduces it
 * rather than using tidy distinct numbers that could never catch the bug.
 */
function everyFamily(): SceneModel {
  const bars: SceneBar[] = [
    bar({ barId: 'col-1:main', elementIds: [1], polyline: line(0, 0, 0) }),
    bar({
      barId: 'col-1:ties', elementIds: [1], role: 'transverse', piece: 'closedTie',
      polyline: line(0, 0, 1),
    }),
    bar({ barId: 'beam-2:bottom', elementIds: [2], polyline: line(0, 1, 0) }),
    bar({
      barId: 'slab-1:x', ownerScope: 'family', family: 'slab', elementIds: [1],
      polyline: line(0, 2, 0),
    }),
    bar({
      barId: 'wall-1:v', ownerScope: 'family', family: 'wall', elementIds: [1],
      polyline: line(0, 3, 0),
    }),
    bar({
      barId: 'footing-1:mat', ownerScope: 'family', family: 'footing', elementIds: [7],
      polyline: line(0, 4, 0),
    }),
  ];
  const solids: SceneSolid[] = [
    solid({ id: 'slab:1', kind: 'slab', elementIds: [] }),
    solid({ id: 'wall:1', kind: 'wall', elementIds: [] }),
    solid({ id: 'footing:7', kind: 'footing', elementIds: [7] }),
    // Member solids last, exactly as `buildSceneModel` appends them, so a frame member wins any
    // number it shares with a footing.
    solid({ id: 'member:1', kind: 'column', elementIds: [1] }),
    solid({ id: 'member:2', kind: 'beam', elementIds: [2] }),
    solid({ id: 'member:3', kind: 'beam', elementIds: [3], reinforced: false }),
  ];
  return {
    seriesId: 'S', revision: 1, readiness: 'ISSUED',
    bars, solids, conflicts: [],
    facets: {
      assemblies: [], families: ['slab', 'wall', 'footing'],
      roles: ['longitudinal', 'transverse'], layers: [],
    },
    bounds: { min: { x: 0, y: -0.1, z: -0.2 }, max: { x: 2, y: 4, z: 1 } },
    unresolvedMembers: [], unreinforcedMembers: [3],
  provisionalMembers: [], lockedMembers: [],
    torsionUnevaluatedMembers: [],
  };
}

/** Every family a batch reports, so a test can assert on families rather than on mesh names. */
const familiesOf = (built: RebarScene) => [...new Set(built.bars.map((b) => b.family))].sort();

/** Which families still have a drawn triangle on screen. */
function drawnFamilies(built: RebarScene): string[] {
  return [...new Set(built.bars
    .filter((b) => b.mesh.visible && b.drawn.length > 0)
    .map((b) => b.family))].sort();
}

/** Which concrete families are on screen. */
function drawnSolidKinds(built: RebarScene): string[] {
  return [...new Set(built.solids
    .filter((s) => s.mesh.visible && s.drawn.length > 0)
    .map((s) => s.kind))].sort();
}

/**
 * A fingerprint of every tube buffer: the attribute object, its array, and its version.
 *
 * This is the observable the "does not rebuild" claims are made against. Identity proves no
 * buffer was reallocated; the version proves none was even re-uploaded. Comparing triangle
 * counts would not do: a rebuild produces the same counts, which is the whole complaint.
 */
function tubeFingerprint(built: RebarScene) {
  return built.bars.map((b) => {
    const pos = b.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = b.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    return {
      family: b.family, category: b.category,
      pos, posArray: pos.array, posVersion: pos.version,
      nor, norArray: nor.array, norVersion: nor.version,
      bars: b.ranges.length,
    };
  });
}

/** Every bar id the batches claim, with duplicates kept so a double-claim is visible. */
const claimedBarIds = (built: RebarScene) =>
  built.bars.flatMap((b) => b.ranges.map((r) => r.barId));

const claimedSolidIds = (built: RebarScene) =>
  built.solids.flatMap((s) => s.ranges.map((r) => r.solidId));

// ─── The batches themselves ──────────────────────────────────────

describe('a batch is one family and one colour', () => {
  it('splits the merge by family, not only by colour', () => {
    const built = createRebarScene(everyFamily());
    expect(familiesOf(built)).toEqual(['beam', 'column', 'footing', 'slab', 'wall']);
    // And still by colour inside a family: the column has longitudinal steel and ties.
    const column = built.bars.filter((b) => b.family === 'column').map((b) => b.category).sort();
    expect(column).toEqual(['longitudinal', 'transverse']);
    built.dispose();
  });

  it('keeps every bar id the scene had, and gives each to exactly ONE batch', () => {
    const s = everyFamily();
    const built = createRebarScene(s);
    const claimed = claimedBarIds(built);
    expect(claimed.sort()).toEqual(s.bars.map((b) => b.barId).sort());
    // Sorted equality already proves the count, but a duplicate would mean one bar drawn twice
    // and pickable as two — worth its own sentence in the failure message.
    expect(new Set(claimed).size, 'no bar claimed by two batches').toBe(claimed.length);
    built.dispose();
  });

  it('gives every solid to exactly one batch, and keeps its id', () => {
    const s = everyFamily();
    const built = createRebarScene(s);
    const claimed = claimedSolidIds(built);
    expect(claimed.sort()).toEqual(s.solids.map((x) => x.id).sort());
    expect(new Set(claimed).size, 'no solid claimed by two batches').toBe(claimed.length);
    built.dispose();
  });

  it('produces the same ids and the same ranges on a second build of the same scene', () => {
    // Batch order is canonical rather than encounter order, so two builds of one document are
    // comparable — which is what makes a picking map testable at all.
    const s = everyFamily();
    const a = createRebarScene(s);
    const b = createRebarScene(s);
    const shape = (x: RebarScene) => x.bars.map((e) => ({
      family: e.family, category: e.category, ranges: e.ranges,
    }));
    expect(shape(b)).toEqual(shape(a));
    a.dispose();
    b.dispose();
  });

  it('does not let a column batch absorb the slab bar that shares its number', () => {
    // Panel 1 and column 1 are both "1". `ownerScope` is the only thing that separates them.
    const built = createRebarScene(everyFamily());
    const inColumn = built.bars.filter((b) => b.family === 'column')
      .flatMap((b) => b.ranges.map((r) => r.barId));
    expect(inColumn.sort()).toEqual(['col-1:main', 'col-1:ties']);
    expect(inColumn).not.toContain('slab-1:x');
    expect(inColumn).not.toContain('wall-1:v');
    built.dispose();
  });

  it('batches an unresolvable bar as unknown rather than guessing a family', () => {
    const s = everyFamily();
    // A bar naming a member no solid describes: it must still be drawn, and must answer no
    // family's switch.
    s.bars.push(bar({ barId: 'orphan', elementIds: [999], polyline: line(0, 5, 0) }));
    const built = createRebarScene(s);
    const unknown = built.bars.filter((b) => b.family === 'unknown')
      .flatMap((b) => b.ranges.map((r) => r.barId));
    expect(unknown).toEqual(['orphan']);

    built.setVisibility({ filter: { solidKinds: ['slab'] } });
    // Hidden families go, the orphan stays: hiding steel because nothing could work out which
    // switch owns it is the silent omission this view exists to prevent.
    expect(drawnFamilies(built)).toEqual(['slab', 'unknown']);
    built.dispose();
  });
});

// ─── Switching families ──────────────────────────────────────────

describe('a family switch touches that family and nothing else', () => {
  const ALL: SceneFilter['solidKinds'] = ['column', 'beam', 'slab', 'wall', 'footing', 'pedestal'];

  it('hiding columns leaves slabs, beams, walls and footings alone', () => {
    const built = createRebarScene(everyFamily());
    built.setVisibility({ filter: { solidKinds: ALL.filter((k) => k !== 'column') } });
    expect(drawnFamilies(built)).toEqual(['beam', 'footing', 'slab', 'wall']);
    expect(drawnSolidKinds(built)).toEqual(['beam', 'footing', 'slab', 'wall']);
    built.dispose();
  });

  it('hiding slabs leaves the columns exactly as they were', () => {
    const built = createRebarScene(everyFamily());
    const before = built.bars.filter((b) => b.family === 'column')
      .map((b) => ({ visible: b.mesh.visible, drawn: b.drawn }));
    built.setVisibility({ filter: { solidKinds: ALL.filter((k) => k !== 'slab') } });
    const after = built.bars.filter((b) => b.family === 'column')
      .map((b) => ({ visible: b.mesh.visible, drawn: b.drawn }));
    expect(after).toEqual(before);
    expect(drawnFamilies(built)).toEqual(['beam', 'column', 'footing', 'wall']);
    built.dispose();
  });

  it('switches every family back on again', () => {
    const built = createRebarScene(everyFamily());
    built.setVisibility({ filter: { solidKinds: [] } });
    expect(drawnFamilies(built)).toEqual([]);
    built.setVisibility({ filter: {} });
    expect(drawnFamilies(built)).toEqual(['beam', 'column', 'footing', 'slab', 'wall']);
    built.dispose();
  });

  it('agrees with `filterScene` about which bars survive', () => {
    /**
     * The picture and the tally are one statement.
     *
     * The panel counts what is on screen with `filterScene`; the renderer draws it with
     * `setVisibility`. A disagreement is not cosmetic — it is a tally claiming steel the user
     * cannot see, which is the failure mode the honest-status work exists to prevent.
     */
    const s = everyFamily();
    const built = createRebarScene(s);
    for (const f of [
      {}, { solidKinds: ['column'] }, { solidKinds: ['slab', 'wall'] }, { solidKinds: [] },
      { hideBars: true }, { elementIds: [1] }, { elementIds: [2] }, { elementIds: [] },
      { hideUnreinforced: true }, { conflictedOnly: true },
      { roles: ['transverse'] as const },
    ] as SceneFilter[]) {
      built.setVisibility({ filter: f });
      const drawn = built.bars
        .filter((b) => b.mesh.visible)
        .flatMap((b) => b.drawn.map((r) => r.barId)).sort();
      expect(drawn, `bars drawn under ${JSON.stringify(f)}`)
        .toEqual(filterScene(s, f).bars.map((b) => b.barId).sort());

      const concrete = built.solids
        .filter((x) => x.mesh.visible)
        .flatMap((x) => x.drawn.map((r) => r.solidId)).sort();
      expect(concrete, `concrete drawn under ${JSON.stringify(f)}`)
        .toEqual(filterScene(s, f).solids.map((x) => x.id).sort());
    }
    built.dispose();
  });
});

// ─── Isolation and the status filter ─────────────────────────────

describe('isolating a member works across batches', () => {
  it('draws only that member\'s steel and concrete', () => {
    const s = everyFamily();
    const built = createRebarScene(s);
    built.setVisibility({ filter: { elementIds: [2] } });
    const drawn = built.bars.filter((b) => b.mesh.visible)
      .flatMap((b) => b.drawn.map((r) => r.barId));
    expect(drawn).toEqual(['beam-2:bottom']);
    built.dispose();
  });

  it('keeps the isolated bar pickable at its FIRST and LAST triangle', () => {
    // The compacted index renumbers every triangle. A picking map that was not re-expressed
    // returns the neighbouring bar, and nothing on screen says so.
    const s = everyFamily();
    const built = createRebarScene(s);
    built.setVisibility({ filter: { elementIds: [1] } });
    for (const b of built.bars.filter((x) => x.mesh.visible)) {
      for (const r of b.drawn) {
        expect(built.barIdAt(b.mesh, r.firstTri)).toBe(r.barId);
        expect(built.barIdAt(b.mesh, r.firstTri + r.triCount - 1)).toBe(r.barId);
      }
    }
    built.dispose();
  });

  it('restores every triangle when the isolation is cleared', () => {
    const s = everyFamily();
    const built = createRebarScene(s);
    const whole = built.drawnTriangles();
    built.setVisibility({ filter: { elementIds: [1] } });
    expect(built.drawnTriangles()).toBeLessThan(whole);
    built.setVisibility({ filter: {} });
    expect(built.drawnTriangles()).toBe(whole);
    // And the map is back in the full index's coordinates.
    for (const b of built.bars) expect(b.drawn).toBe(b.ranges);
    built.dispose();
  });

  it('resolves a solid at its first and last triangle, filtered and unfiltered', () => {
    const s = everyFamily();
    const built = createRebarScene(s);
    for (const f of [{}, { elementIds: [1] }, { hideUnreinforced: true }] as SceneFilter[]) {
      built.setVisibility({ filter: f });
      for (const x of built.solids.filter((b) => b.mesh.visible)) {
        for (const r of x.drawn) {
          expect(built.solidIdAt(x.mesh, r.firstTri), `first tri of ${r.solidId}`)
            .toBe(r.solidId);
          expect(built.solidIdAt(x.mesh, r.firstTri + r.triCount - 1), `last tri of ${r.solidId}`)
            .toBe(r.solidId);
        }
      }
    }
    built.dispose();
  });

  it('refuses to pick a bar in a hidden batch', () => {
    const s = everyFamily();
    const built = createRebarScene(s);
    const slab = built.bars.find((b) => b.family === 'slab')!;
    expect(built.barIdAt(slab.mesh, slab.ranges[0].firstTri)).toBe('slab-1:x');
    built.setVisibility({ filter: { solidKinds: ['column'] } });
    // Not merely invisible: unpickable, and out of the raycaster's list entirely. `Mesh.raycast`
    // does not consult `visible`, so leaving it in would let a click select switched-off steel.
    expect(built.barIdAt(slab.mesh, slab.ranges[0].firstTri)).toBeNull();
    expect(built.pickable()).not.toContain(slab.mesh);
    built.dispose();
  });

  it('keeps the selected bar\'s identity intact through a filter change', () => {
    /**
     * Selecting is a round trip: triangle → bar id → the scene's own record of that bar.
     *
     * What the panel then reports — the mark, the family, the members — comes from that record,
     * so the property under test is that the id survives the batching and still names the SAME
     * bar, with its `ownerScope` and its parent members unchanged.
     */
    const s = everyFamily();
    const built = createRebarScene(s);
    const slabBatch = built.bars.find((b) => b.family === 'slab')!;
    const id = built.barIdAt(slabBatch.mesh, slabBatch.ranges[0].firstTri);
    const record = s.bars.find((b) => b.barId === id)!;
    expect(record.family).toBe('slab');
    expect(record.ownerScope).toBe('family');
    expect(record.elementIds).toEqual([1]);

    // The same bar, once other families have been switched off around it.
    built.setVisibility({ filter: { solidKinds: ['slab'], elementIds: [1] } });
    const visible = built.bars.find((b) => b.family === 'slab' && b.drawn.length > 0)!;
    expect(built.barIdAt(visible.mesh, visible.drawn[0].firstTri)).toBe(id);
    built.dispose();
  });
});

// ─── What must NOT be rebuilt ────────────────────────────────────

describe('nothing rebuilds a tube', () => {
  const cases: Array<[string, (b: RebarScene) => void]> = [
    ['changing opacity', (b) => b.setConcreteOpacity(0.3)],
    ['moving the section plane', (b) => b.setSection({ axis: 'z', at: 1.5 })],
    ['clearing the section plane', (b) => b.setSection(undefined)],
    ['hiding a family', (b) => b.setVisibility({ filter: { solidKinds: ['slab'] } })],
    ['showing every family again', (b) => b.setVisibility({ filter: {} })],
    ['hiding all the steel', (b) => b.setVisibility({ filter: { hideBars: true } })],
    ['hiding the concrete', (b) => b.setVisibility({ concrete: false })],
    ['isolating a member', (b) => b.setVisibility({ filter: { elementIds: [1] } })],
    ['filtering by state', (b) => b.setVisibility({ filter: { elementIds: [1, 2] } })],
    ['clearing the state filter', (b) => b.setVisibility({ filter: {} })],
    ['hiding unreinforced concrete', (b) => b.setVisibility({ filter: { hideUnreinforced: true } })],
  ];

  for (const [what, act] of cases) {
    it(`${what} touches no vertex and re-uploads no buffer`, () => {
      const built = createRebarScene(everyFamily());
      const before = tubeFingerprint(built);
      const builds = rebarSceneBuilds();
      act(built);
      expect(tubeFingerprint(built)).toEqual(before);
      expect(rebarSceneBuilds() - builds, 'tubes built').toBe(0);
      built.dispose();
    });
  }

  it('survives the same toggle repeated, without allocating a new buffer each time', () => {
    const built = createRebarScene(everyFamily());
    const before = tubeFingerprint(built);
    for (let i = 0; i < 40; i++) {
      built.setVisibility({ filter: { solidKinds: i % 2 ? ['slab'] : undefined } });
    }
    expect(tubeFingerprint(built)).toEqual(before);
    built.dispose();
  });

  it('allocates at most one scratch index per batch, however many filters are applied', () => {
    // The compaction writes into a scratch buffer allocated once and reused. A per-call
    // allocation would be a leak dressed as a filter.
    const built = createRebarScene(everyFamily());
    const arrays = new Set<unknown>();
    for (const ids of [[1], [2], [1, 2], [], [1], [7]]) {
      built.setVisibility({ filter: { elementIds: ids } });
      for (const b of built.bars) arrays.add(b.mesh.geometry.getIndex()!.array);
    }
    // One full index and at most one scratch per batch.
    expect(arrays.size).toBeLessThanOrEqual(built.bars.length * 2);
    built.dispose();
  });

  it('puts every conflict marker back where it was after repeated toggling', () => {
    /**
     * The bug this exists to catch, in one sentence: a compaction moves a later marker's matrix
     * into an earlier slot, so the live buffer stops matching the master — and the NEXT pass then
     * compacts already-moved matrices and places markers where no conflict is. It does not throw
     * and it does not look wrong. It puts a red dot on a bar that is fine.
     *
     * The 7-storey building carries 39 240 of these, so a drift of one is 39 239 chances to be
     * believed.
     */
    const s = everyFamily();
    s.conflicts = [
      {
        assemblyId: 'a', at: { x: 0, y: 0, z: 0 }, barIds: ['col-1:main', 'col-1:ties'],
        clearance: -0.005, required: 0.025, pairClass: 'x', shortfall: 0.01, severity: 'clearance' as const, elementIds: [1],
      },
      {
        assemblyId: 'a', at: { x: 1, y: 2, z: 0 }, barIds: ['slab-1:x', 'slab-1:x'],
        clearance: 0, required: 0.025, pairClass: 'x', shortfall: 0.01, severity: 'clearance' as const, elementIds: [1],
      },
      {
        assemblyId: 'a', at: { x: 2, y: 3, z: 0 }, barIds: ['wall-1:v', 'wall-1:v'],
        clearance: 0, required: 0.025, pairClass: 'x', shortfall: 0.01, severity: 'clearance' as const, elementIds: [1],
      },
    ];
    const built = createRebarScene(s);
    const marks = built.markers!;
    expect(marks.count).toBe(3);

    const original = [0, 1, 2].map((i) => {
      const m = new THREE.Matrix4();
      marks.getMatrixAt(i, m);
      return m.toArray();
    });

    for (let i = 0; i < 10; i++) {
      built.setVisibility({ filter: { solidKinds: ['slab'] } });
      // Only the slab conflict survives, and it is the SLAB one — not whichever happened to be
      // first in the buffer.
      expect(marks.count).toBe(1);
      const m = new THREE.Matrix4();
      marks.getMatrixAt(0, m);
      expect(m.toArray()).toEqual(original[1]);

      built.setVisibility({ filter: {} });
      expect(marks.count).toBe(3);
      for (let k = 0; k < 3; k++) {
        const back = new THREE.Matrix4();
        marks.getMatrixAt(k, back);
        expect(back.toArray(), `marker ${k} after round ${i}`).toEqual(original[k]);
      }
    }
    built.dispose();
  });

  it('a changed DOCUMENT does change the signature, so the tubes are rebuilt', () => {
    /**
     * The other half of the claim.
     *
     * "Never rebuild" would be a bug, not a fix: when the document's steel changes, the tubes on
     * the GPU are wrong. `sceneSignature` is what the viewport rebuilds on, and it must move for
     * a real change and stay still for a filter — because a filter no longer produces a new scene
     * at all.
     */
    const s = everyFamily();
    const before = sceneSignature(s);
    const changed: SceneModel = { ...s, bars: s.bars.slice(0, 3) };
    expect(sceneSignature(changed)).not.toBe(before);

    // And the geometry really is different: fewer bars, fewer triangles.
    const a = createRebarScene(s);
    const b = createRebarScene(changed);
    expect(b.stats.tubes).toBeLessThan(a.stats.tubes);
    expect(b.stats.triangles).toBeLessThan(a.stats.triangles);
    a.dispose();
    b.dispose();
  });
});

// ─── The 7-storey building ───────────────────────────────────────

/** Milliseconds, median of `runs`, so one unlucky GC pause does not become the number. */
function median(runs: number, act: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    act();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

const FAMILIES = ['column', 'beam', 'slab', 'wall', 'footing', 'pedestal'] as const;

/**
 * Ceilings for the two mechanisms, as a fraction of one full rebuild and a floor in milliseconds.
 *
 * ── Why these are loose, and what carries the claim instead ────────
 *
 * The structural property — "a switch does not rebuild the tubes" — is asserted by the BUILD
 * COUNTER and by the identity of the vertex buffers, not by a stopwatch. Those cannot be explained
 * away by a busy machine, and they are what the `nothing rebuilds a tube` block above and the
 * browser benchmark both check.
 *
 * These numbers exist to catch an order-of-magnitude change and nothing finer, because this file
 * runs inside a 262-file parallel suite: the same status filter measured 5,6 ms alone and 26,8 ms
 * with the whole suite competing for the machine. A threshold tuned to the quiet number fails on
 * the busy one and teaches everyone to ignore it.
 *
 * The two classes differ because the mechanisms differ. A family switch is a flag on a handful of
 * meshes and is genuinely O(batches). An isolate or a status filter cuts across batches, so it
 * compacts each one's index — a typed-array copy over every drawn triangle, which scales with the
 * model exactly as a rebuild does, and is legitimately a few percent of one.
 */
const BUDGETS = {
  /** `mesh.visible`, an opacity, a section plane. */
  flag: { fraction: 0.1, floorMs: 60 },
  /** An index compaction: isolate, filter by state. */
  compaction: { fraction: 0.5, floorMs: 250 },
} as const;

/** Which gestures are compactions rather than flags. Everything else is a flag. */
const COMPACTIONS = new Set(['status filter', 'isolate one member']);

for (const [label, example] of [
  ['small control', 'rc-qa-diagnostic'],
  ['7-storey building', 'pro-edificio-7p'],
] as const) {
  describe(`the cost of an interaction — ${label}`, () => {
    let scene: SceneModel;
    let outcomes: Map<number, import('../../engine/detailing/element-status').DesignOutcomeSummary>;
    let built: RebarScene;

    beforeAll(async () => {
      const w = await workspaceScene(example);
      scene = w.scene;
      outcomes = w.outcomes;
      built = createRebarScene(scene);
    }, 600_000);

    it('reports what it is measuring, and holds every switch to a fraction of a rebuild', () => {
      /**
       * Setup is measured separately from interaction, on purpose.
       *
       * The first version of the tab-return benchmark reactivated on top of an unsettled setup
       * and timed its own `loadModel` — 2 500 ms with no workspace open at all — then blamed the
       * tab switch. Building the scene is a one-off; a toggle is what the user does forty times
       * an hour. Mixing them hides which one is the problem.
       */
      const rebuild = median(3, () => createRebarScene(scene).dispose());

      /**
       * The old toggle, measured in the same run as the new one.
       *
       * This is not archaeology for its own sake: it is the BEFORE number, taken on the same
       * machine in the same conditions as the after. A remembered figure from another session is
       * not a comparison.
       */
      const beforeOld = rebarSceneBuilds();
      const oldToggle = median(3, () => {
        const smaller = filterScene(scene, { solidKinds: FAMILIES.filter((k) => k !== 'column') });
        createRebarScene(smaller).dispose();
      });
      const oldBuilds = rebarSceneBuilds() - beforeOld;

      /**
       * From here on, not one tube may be built.
       *
       * The rebuild and the old-toggle measurements above deliberately build; everything below is
       * a switch, and the counter is the claim. It is captured after the deliberate builds so what
       * it measures is unambiguous.
       */
      const buildsBefore = rebarSceneBuilds();
      const buffersBefore = tubeFingerprint(built);

      const switches: Array<[string, number]> = [];
      for (const family of FAMILIES) {
        switches.push([`toggle ${family}`, median(5, () => {
          built.setVisibility({ filter: { solidKinds: FAMILIES.filter((k) => k !== family) } });
          built.setVisibility({ filter: {} });
        })]);
      }

      const report = reportElementStatus(scene, outcomes);
      const someStatus = report.entries
        .filter((e) => e.status === report.present[0]).map((e) => e.elementId);
      const oneMember = scene.solids.find((s) => s.elementIds.length > 0)?.elementIds[0] ?? 1;

      switches.push(['status filter', median(5, () => {
        built.setVisibility({ filter: { elementIds: someStatus } });
        built.setVisibility({ filter: {} });
      })]);
      switches.push(['isolate one member', median(5, () => {
        built.setVisibility({ filter: { elementIds: [oneMember] } });
        built.setVisibility({ filter: {} });
      })]);
      switches.push(['hide all the steel', median(5, () => {
        built.setVisibility({ filter: { hideBars: true } });
        built.setVisibility({ filter: {} });
      })]);
      switches.push(['opacity', median(5, () => built.setConcreteOpacity(0.5))]);
      switches.push(['section', median(5, () => {
        built.setSection({ axis: 'z', at: 3 });
        built.setSection(undefined);
      })]);

      // ── Selection, which is a raycast and not a rebuild ──────
      built.setVisibility({ filter: {} });
      const ray = new THREE.Raycaster();
      const b = scene.bounds!;
      const centre = new THREE.Vector3(
        (b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      const from = centre.clone().add(new THREE.Vector3(
        (b.max.x - b.min.x) + 5, (b.max.y - b.min.y) + 5, (b.max.z - b.min.z) + 5));
      const shoot = () => {
        ray.set(from, centre.clone().sub(from).normalize());
        const hits = ray.intersectObjects(built.pickable(), false);
        for (const h of hits) {
          if (built.barIdAt(h.object, h.faceIndex ?? undefined)) return;
          if (built.solidIdAt(h.object, h.faceIndex ?? undefined)) return;
        }
      };
      const firstPick = median(1, shoot);
      const repeatPick = median(5, shoot);

      // ── The panel's own derived chain, timed apart from the picture ──
      const panelChain = median(3, () => {
        const visible = filterScene(scene, { solidKinds: FAMILIES.filter((k) => k !== 'column') });
        summariseScene(visible);
      });
      const statusReport = median(3, () => reportElementStatus(scene, outcomes));

      const ms = (n: number) => `${n.toFixed(2)} ms`;
      const rows = [
        ['bars', String(built.stats.tubes)],
        ['solids', String(built.stats.solids)],
        ['triangles', String(built.stats.triangles)],
        ['bar batches', String(built.stats.barBatches)],
        ['concrete batches', String(built.stats.solidBatches)],
        /**
         * The markers, counted separately and for a reason.
         *
         * Each one is a 10 × 8 sphere — about 160 triangles — so a document with tens of thousands
         * of open conflicts carries several times more marker geometry than reinforcement. It costs
         * nothing to BUILD, which is why it never showed up here, and it dominates the frame, which
         * is where the browser benchmark found it.
         */
        ['conflict markers', `${scene.conflicts.length}`
          + ` (≈ ${(scene.conflicts.length * 160).toLocaleString('en')} triangles)`],
        ['— setup —', ''],
        ['build (geometry, once)', ms(rebuild)],
        ['— toggle, BEFORE (rebuild) —', ''],
        ['filterScene + rebuild', `${ms(oldToggle)}  (${oldBuilds} tube builds)`],
        ['— toggle, AFTER (visibility) —', `0 tube builds`],
        ...switches.map(([k, v]) => [k, `${ms(v)}  (${(v / rebuild * 100).toFixed(3)} % of a rebuild)`]),
        ['— selection —', ''],
        ['first pick', ms(firstPick)],
        ['repeated pick', ms(repeatPick)],
        ['— panel —', ''],
        ['filterScene + summariseScene', ms(panelChain)],
        ['reportElementStatus', ms(statusReport)],
      ];
      const w = Math.max(...rows.map(([k]) => k.length));
      console.log(`\nviewport cost — ${label}\n${
        rows.map(([k, v]) => `  ${k.padEnd(w)}  ${v}`).join('\n')}\n`);

      /**
       * The claim, as the two things a machine's speed cannot argue with.
       *
       * Every gesture above — six family switches, a status filter, an isolate, hiding all the
       * steel, an opacity change and a section cut — and not one tube built, not one vertex buffer
       * reallocated, not one re-uploaded. Before this work, each of the family switches rebuilt all
       * 20 917 of them.
       */
      expect(rebarSceneBuilds() - buildsBefore, 'tubes rebuilt by switching and filtering')
        .toBe(0);
      expect(tubeFingerprint(built)).toEqual(buffersBefore);

      for (const [what, cost] of switches) {
        const b = COMPACTIONS.has(what) ? BUDGETS.compaction : BUDGETS.flag;
        const budget = Math.max(rebuild * b.fraction, b.floorMs);
        expect(cost, `${what}: ${cost.toFixed(2)} ms against ${budget.toFixed(2)} ms `
          + `(a full rebuild took ${rebuild.toFixed(2)} ms)`)
          .toBeLessThan(budget);
      }
      /**
       * The before and the after, as MECHANISMS rather than as milliseconds.
       *
       * The old path built the geometry once per toggle; the new one builds none. That is the whole
       * change, and it is exact — where the ratio of the two timings is not: both inflate under a
       * contended suite and the small one inflates proportionally more, so an early version of this
       * assertion compared 59 ms against 0,5 ms on a quiet machine and 60 ms against 6 ms on a busy
       * one, and flaked. The timings are printed above as evidence; this is the claim.
       */
      expect(oldBuilds, 'the old path really did rebuild to answer a toggle').toBeGreaterThan(0);
    }, 600_000);

    it('keeps every bar in its own family, and loses none of them', () => {
      built.setVisibility({ filter: {} });
      const claimed = claimedBarIds(built);
      expect(new Set(claimed).size, 'no bar claimed by two batches').toBe(claimed.length);

      /**
       * The batches and the tally must count the same steel per family.
       *
       * `summariseScene` is the number the panel puts on screen and the number the detailing
       * tests assert against. If the renderer's batches disagree with it, one of the two is
       * lying to the user about which family a bar belongs to — and that is precisely how
       * 11 340 slab bars came to be counted as column steel.
       */
      const summary = summariseScene(scene);
      for (const row of summary.byFamily) {
        const inBatches = built.bars
          .filter((x) => x.family === row.family)
          .reduce((n, x) => n + x.ranges.length, 0);
        // A degenerate one-point bar produces no tube, so the batches can hold FEWER than the
        // tally counts — never more, and never a family the tally does not know.
        expect(inBatches, `${row.family}: bars batched vs counted`)
          .toBeLessThanOrEqual(row.longitudinal + row.transverse);
      }

      // Every family the tally reports steel for has a batch to draw it in.
      for (const row of summary.byFamily) {
        if (row.longitudinal + row.transverse === 0) continue;
        expect(built.bars.some((x) => x.family === row.family),
          `${row.family} has ${row.longitudinal + row.transverse} bars and no batch`).toBe(true);
      }
    });

    it('hides one family without touching another, on the real model', () => {
      built.setVisibility({ filter: {} });
      const all = drawnFamilies(built);
      for (const family of all) {
        built.setVisibility({ filter: { solidKinds: FAMILIES.filter((k) => k !== family) } });
        const left = drawnFamilies(built);
        expect(left, `hiding ${family}`).toEqual(all.filter((f) => f !== family || f === 'unknown'));
      }
      built.setVisibility({ filter: {} });
      expect(drawnFamilies(built)).toEqual(all);
    });

    it('resolves every batch\'s first and last triangle back to the right bar', () => {
      built.setVisibility({ filter: {} });
      for (const batch of built.bars) {
        const first = batch.ranges[0];
        const last = batch.ranges[batch.ranges.length - 1];
        expect(built.barIdAt(batch.mesh, first.firstTri)).toBe(first.barId);
        expect(built.barIdAt(batch.mesh, last.firstTri + last.triCount - 1)).toBe(last.barId);
        // And one triangle past the end is nobody's, not the nearest bar's.
        expect(built.barIdAt(batch.mesh, last.firstTri + last.triCount)).toBeNull();
      }
    });
  });
}

// ─── The counts the QA session pinned ────────────────────────────

// A whole-building test: 30 s rather than Vitest's 5 s default, for the reason set out in
// `provisional-projections.test.ts` — under a full-suite pool these were failing on
// contention with every assertion passing.
describe('the 7-storey building keeps its steel where it belongs', { timeout: 30_000 }, () => {
  let scene: SceneModel;
  let built: RebarScene;

  beforeAll(async () => {
    scene = (await workspaceScene('pro-edificio-7p')).scene;
    built = createRebarScene(scene);
  }, 600_000);

  /**
   * Floors, not equalities.
   *
   * Bar counts move whenever a spacing rule or a section changes, and a test pinned to 20 917
   * would fail on every legitimate improvement while catching nothing. What must never happen is
   * a family losing its steel to another family — so the floors sit where only that can breach
   * them, and the RATIOS between families are what carry the claim.
   */
  it('draws every bar the projection produced', () => {
    expect(scene.bars.length).toBeGreaterThan(19_000);
    expect(built.stats.tubes).toBe(scene.bars.filter((b) => b.polyline.length >= 2).length);
  });

  it('keeps the slab steel in the slabs', () => {
    const slab = built.bars.filter((b) => b.family === 'slab')
      .reduce((n, b) => n + b.ranges.length, 0);
    expect(slab).toBeGreaterThan(10_000);
    // Every one of them is family-scoped: a slab bar in the frame id space is the collision.
    for (const b of built.bars.filter((x) => x.family === 'slab')) {
      for (const item of b.ranges) {
        expect(scene.bars.find((x) => x.barId === item.barId)!.ownerScope).toBe('family');
      }
    }
  });

  it('keeps the wall steel in the walls', () => {
    const wall = built.bars.filter((b) => b.family === 'wall')
      .reduce((n, b) => n + b.ranges.length, 0);
    expect(wall).toBeGreaterThan(200);
    for (const b of built.bars.filter((x) => x.family === 'wall')) {
      for (const item of b.ranges) {
        expect(scene.bars.find((x) => x.barId === item.barId)!.family).toBe('wall');
      }
    }
  });

  it('lets no column batch hold a bar that belongs to a floor family', () => {
    // The exact defect: 11 340 slab bars and 234 wall bars counted as column steel.
    for (const b of built.bars.filter((x) => x.family === 'column' || x.family === 'beam')) {
      for (const item of b.ranges) {
        const rec = scene.bars.find((x) => x.barId === item.barId)!;
        expect(rec.family, `${item.barId} is in the ${b.family} batch`).toBeUndefined();
        expect(rec.ownerScope).toBe('frame');
      }
    }
  });

  it('switching columns off leaves the slab and wall steel on screen', () => {
    built.setVisibility({
      filter: { solidKinds: ['beam', 'slab', 'wall', 'footing', 'pedestal'] },
    });
    const left = drawnFamilies(built);
    expect(left).toContain('slab');
    expect(left).toContain('wall');
    expect(left).not.toContain('column');
    built.setVisibility({ filter: {} });
  });
});
