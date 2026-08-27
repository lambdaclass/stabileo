/**
 * Every switch in the rail, driven the way the rail drives it, asserted against the SCENE.
 *
 * ── Why this file exists next to `rebar-batching.test.ts` ──────────
 *
 * That file proves the renderer obeys a `SceneFilter`. It does, and it always did. What broke
 * was everything between the checkbox and that call: the store changed, the derived filter
 * recomputed, the tally beside the canvas updated, and `setVisibility` was never reached, so
 * all eight switches governed nothing while the whole suite stayed green.
 *
 * The gap was that no test ever crossed the two boundaries where the defect lived:
 *
 *   1. `switch position → SceneFilter`. That translation was four lines inside
 *      `RebarWorkspace.svelte`, and a component cannot be mounted in this project's test
 *      environment — so every existing test hand-wrote the filter it wanted. A test that
 *      restates the translation cannot fail when the translation is wrong. It is now
 *      `workspaceFilter`, a pure function, and this file drives it rather than a literal.
 *
 *   2. `SceneFilter → what is on screen`. Asserted here through `census()`, which is read off
 *      `mesh.visible` and `drawn`, not off the filter. The remaining boundary — the Svelte
 *      effect that carries one to the other — is only observable in a browser, and
 *      `e2e/rebar-toggles.spec.ts` is where it is asserted.
 *
 * So: this file owns "the switch means what it says", the spec owns "the switch is wired", and
 * `rebar-viewport-effects.test.ts` owns "it cannot be unwired the same way twice".
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createRebarScene, rebarSceneBuilds, REBAR_FAMILIES,
  type RebarScene, type RebarSceneCensus,
} from '../rebar-scene';
import {
  SCENE_SOLID_KINDS,
  type SceneBar, type SceneConflictMarker, type SceneModel, type SceneSolid,
} from '../../engine/detailing/scene-model';
import {
  workspaceFilter, type WorkspaceLayerState,
} from '../../store/rebar-workspace.svelte';

// ─── A model with every switchable thing in it ───────────────────

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

function conflict(over: Partial<SceneConflictMarker>): SceneConflictMarker {
  return {
    assemblyId: 'a', at: { x: 0.5, y: 0, z: 0 }, barIds: ['col-1:main', 'col-1:ties'],
    clearance: 0.01, required: 0.025, shortfall: 0.015, severity: 'clearance',
    pairClass: 'long-tie', elementIds: [1],
    ...over,
  };
}

/**
 * Every family, with the id collision the real model has, plus a pedestal and two conflicts.
 *
 * Column steel names frame element 1 and slab steel names panel 1. Both are "1", and nothing in
 * the number says which — 11 340 slab bars and 234 wall bars were once counted as column steel
 * through exactly that collision, so the fixture reproduces it rather than using tidy distinct
 * numbers that could never catch it.
 *
 * Two conflicts and not one, because a conflict is drawn while EITHER of its bars is drawn, and
 * one conflict inside a single family cannot tell "the marker followed its family" from "the
 * markers all went away".
 */
function everyFamily(): SceneModel {
  const bars: SceneBar[] = [
    bar({ barId: 'col-1:main', elementIds: [1], conflicted: true, polyline: line(0, 0, 0) }),
    bar({
      barId: 'col-1:ties', elementIds: [1], role: 'transverse', piece: 'closedTie',
      conflicted: true, polyline: line(0, 0, 1),
    }),
    bar({ barId: 'beam-2:bottom', elementIds: [2], polyline: line(0, 1, 0) }),
    bar({
      barId: 'beam-2:stirrups', elementIds: [2], role: 'transverse', piece: 'stirrup',
      polyline: line(0, 1, 1),
    }),
    bar({
      barId: 'slab-1:x', ownerScope: 'family', family: 'slab', elementIds: [1],
      polyline: line(0, 2, 0),
    }),
    bar({
      barId: 'wall-1:v', ownerScope: 'family', family: 'wall', elementIds: [1],
      polyline: line(0, 3, 0),
    }),
    // Footing steel: the mat and the starter bars the column above lands on. Both answer the
    // foundations switch, which is the property the spec calls "zapatas … y esperas".
    bar({
      barId: 'footing-7:mat', ownerScope: 'family', family: 'footing', elementIds: [7],
      polyline: line(0, 4, 0),
    }),
    bar({
      barId: 'footing-7:dowels', ownerScope: 'family', family: 'footing', elementIds: [7],
      polyline: line(0, 4, 1),
    }),
  ];
  const solids: SceneSolid[] = [
    solid({ id: 'slab:1', kind: 'slab', elementIds: [] }),
    solid({ id: 'wall:1', kind: 'wall', elementIds: [] }),
    solid({ id: 'footing:7', kind: 'footing', elementIds: [7] }),
    solid({ id: 'pedestal:7', kind: 'pedestal', elementIds: [] }),
    // Member solids last, exactly as `buildSceneModel` appends them, so a frame member wins any
    // number it shares with a footing.
    solid({ id: 'member:1', kind: 'column', elementIds: [1] }),
    solid({ id: 'member:2', kind: 'beam', elementIds: [2] }),
    // The member the app could not design: concrete, no steel. It is what `hideUnreinforced`
    // governs and it must be on screen by default.
    solid({ id: 'member:3', kind: 'beam', elementIds: [3], reinforced: false }),
  ];
  return {
    seriesId: 'S', revision: 1, readiness: 'ISSUED',
    bars,
    solids,
    conflicts: [
      conflict({}),
      conflict({
        at: { x: 0.5, y: 2, z: 0 }, barIds: ['slab-1:x', 'wall-1:v'], elementIds: [1],
        pairClass: 'slab-wall',
      }),
    ],
    facets: {
      assemblies: [], families: ['slab', 'wall', 'footing'],
      roles: ['longitudinal', 'transverse'], layers: [],
    },
    bounds: { min: { x: 0, y: -0.1, z: -0.2 }, max: { x: 2, y: 4, z: 1 } },
    unresolvedMembers: [], unreinforcedMembers: [3], provisionalMembers: [], lockedMembers: [],
    torsionUnevaluatedMembers: [],
  };
}

// ─── Driving the switches the way the rail does ──────────────────

/** Every switch in its default position, which is what a freshly opened workspace shows. */
const DEFAULTS: WorkspaceLayerState = {
  hiddenKinds: [], showBars: true, hideUnreinforced: false,
  isolated: [], statusElementIds: null,
};

/**
 * Apply a set of switch positions to a built scene.
 *
 * Goes through `workspaceFilter` — the same function the rail's `$derived` calls — so what is
 * under test is the app's own translation and not this file's opinion of it.
 */
function apply(
  built: RebarScene,
  layers: Partial<WorkspaceLayerState> = {},
  opts: { concrete?: boolean; conflicts?: boolean } = {},
): RebarSceneCensus {
  built.setVisibility({
    filter: workspaceFilter({ ...DEFAULTS, ...layers }),
    concrete: opts.concrete ?? true,
    conflicts: opts.conflicts ?? true,
  });
  return built.census();
}

/** The families other than the one under test, so "nothing else moved" is one assertion. */
function others<T extends string>(
  counts: Record<T, number>, except: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts) as Array<[string, number]>) {
    if (!except.includes(k)) out[k] = v;
  }
  return out;
}

/** A fingerprint of every tube buffer: identity proves no reallocation, version no re-upload. */
function tubeFingerprint(built: RebarScene) {
  return built.bars.map((b) => {
    const pos = b.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = b.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    return {
      family: b.family, category: b.category,
      posArray: pos.array, posVersion: pos.version,
      norArray: nor.array, norVersion: nor.version,
    };
  });
}

// ─── The census itself ───────────────────────────────────────────

describe('the census reports the scene, not the filter', () => {
  it('has a key for every family the renderer can batch, zero included', () => {
    const built = createRebarScene(everyFamily());
    const c = built.census();
    // Absent and zero must not be distinguishable by a caller comparing before with after.
    expect(Object.keys(c.bars).sort()).toEqual([...REBAR_FAMILIES].sort());
    expect(Object.keys(c.solids).sort()).toEqual([...SCENE_SOLID_KINDS].sort());
    // This fixture has no steel the renderer cannot place, so `unknown` is present and zero.
    expect(c.bars.unknown).toBe(0);
    built.dispose();
  });

  it('counts what is drawn, and stops counting a batch that is switched off', () => {
    const built = createRebarScene(everyFamily());
    const before = built.census();
    expect(before.bars.column).toBe(2);
    expect(before.solids.column).toBe(1);
    expect(before.triangles).toBeGreaterThan(0);

    const after = apply(built, { hiddenKinds: ['column'] });
    // A hidden batch keeps its ranges. Counting those would report steel that is not on screen,
    // which is the exact lie this census exists to make impossible.
    expect(after.bars.column).toBe(0);
    expect(after.triangles).toBeLessThan(before.triangles);
    built.dispose();
  });
});

// ─── The six family switches ─────────────────────────────────────

/**
 * What each family switch owns, stated as data.
 *
 * `bars` is the steel that must go with the concrete — the property the spec states family by
 * family, and the one that was wrong before the batches were split: turning off `Columns` once
 * removed 84 prisms and left 9 311 column bars floating in place.
 */
const FAMILIES = [
  { kind: 'column', bars: 2, solids: 1 },
  { kind: 'beam', bars: 2, solids: 2 },
  { kind: 'slab', bars: 1, solids: 1 },
  { kind: 'wall', bars: 1, solids: 1 },
  { kind: 'footing', bars: 2, solids: 1 },
  { kind: 'pedestal', bars: 0, solids: 1 },
] as const;

describe('a family switch takes its own family and nothing else', () => {
  for (const { kind, bars, solids } of FAMILIES) {
    it(`${kind}: off hides its concrete AND its steel, on restores both`, () => {
      const built = createRebarScene(everyFamily());
      const before = built.census();
      expect(before.bars[kind], `${kind} steel present to begin with`).toBe(bars);
      expect(before.solids[kind], `${kind} concrete present to begin with`).toBe(solids);

      const off = apply(built, { hiddenKinds: [kind] });
      expect(off.bars[kind], `${kind} steel hidden`).toBe(0);
      expect(off.solids[kind], `${kind} concrete hidden`).toBe(0);
      // And no other family moved — the assertion the spec makes six times over.
      expect(others(off.bars, [kind]), 'other families\' steel')
        .toEqual(others(before.bars, [kind]));
      expect(others(off.solids, [kind]), 'other families\' concrete')
        .toEqual(others(before.solids, [kind]));

      const on = apply(built, { hiddenKinds: [] });
      expect(on, `${kind} restored exactly`).toEqual(before);
      built.dispose();
    });
  }

  it('switching every family off empties the picture, and back on restores it exactly', () => {
    const built = createRebarScene(everyFamily());
    const before = built.census();
    const off = apply(built, { hiddenKinds: [...SCENE_SOLID_KINDS] });
    expect(Object.values(off.bars).reduce((a, b) => a + b, 0)).toBe(0);
    expect(Object.values(off.solids).reduce((a, b) => a + b, 0)).toBe(0);
    expect(off.triangles).toBe(0);
    expect(off.pickable).toBe(0);
    expect(apply(built, { hiddenKinds: [] })).toEqual(before);
    built.dispose();
  });

  it('an empty family is a switch that governs nothing, not a switch that hides everything', () => {
    // A model with no footings still has a footings switch. Turning it off must not disturb the
    // families that ARE there — "no foundations in this model" reading as "the viewer lost them"
    // is the failure this states.
    const s = everyFamily();
    s.bars = s.bars.filter((b) => b.family !== 'footing');
    s.solids = s.solids.filter((x) => x.kind !== 'footing' && x.kind !== 'pedestal');
    const built = createRebarScene(s);
    const before = built.census();
    expect(before.solids.footing).toBe(0);
    expect(apply(built, { hiddenKinds: ['footing'] }).bars).toEqual(before.bars);
    expect(apply(built, { hiddenKinds: ['footing'] }).solids).toEqual(before.solids);
    built.dispose();
  });
});

// ─── Reinforcement, concrete and conflicts ───────────────────────

describe('reinforcement and concrete are independent switches', () => {
  it('hiding reinforcement leaves every piece of concrete on screen', () => {
    const built = createRebarScene(everyFamily());
    const before = built.census();
    const off = apply(built, { showBars: false });
    expect(Object.values(off.bars).reduce((a, b) => a + b, 0)).toBe(0);
    // "Hide reinforcement" hides reinforcement. It does not hide the building.
    expect(off.solids).toEqual(before.solids);
    expect(apply(built, { showBars: true })).toEqual(before);
    built.dispose();
  });

  it('hiding concrete leaves every bar on screen', () => {
    const built = createRebarScene(everyFamily());
    const before = built.census();
    const off = apply(built, {}, { concrete: false });
    expect(Object.values(off.solids).reduce((a, b) => a + b, 0)).toBe(0);
    expect(off.bars).toEqual(before.bars);
    expect(apply(built, {}, { concrete: true })).toEqual(before);
    built.dispose();
  });

  it('the two together empty the picture and neither one alone does', () => {
    const built = createRebarScene(everyFamily());
    const both = apply(built, { showBars: false }, { concrete: false });
    expect(both.triangles).toBe(0);
    expect(apply(built, { showBars: false }, { concrete: true }).triangles)
      .toBeGreaterThan(0);
    expect(apply(built, { showBars: true }, { concrete: false }).triangles)
      .toBeGreaterThan(0);
    built.dispose();
  });

  it('hiding the unreinforced members leaves the reinforced concrete alone', () => {
    const built = createRebarScene(everyFamily());
    const before = built.census();
    const off = apply(built, { hideUnreinforced: true });
    // Member 3 is the beam the app could not design: one solid, no steel.
    expect(off.solids.beam).toBe(before.solids.beam - 1);
    expect(off.bars).toEqual(before.bars);
    expect(apply(built, { hideUnreinforced: false })).toEqual(before);
    built.dispose();
  });
});

describe('the conflict markers are a switch of their own', () => {
  it('are on by default, and every one of them is drawn', () => {
    const built = createRebarScene(everyFamily());
    expect(built.census().markers).toBe(2);
    built.dispose();
  });

  it('off hides every marker and leaves the steel and the concrete untouched', () => {
    const built = createRebarScene(everyFamily());
    const before = built.census();
    const off = apply(built, {}, { conflicts: false });
    expect(off.markers).toBe(0);
    expect(off.bars).toEqual(before.bars);
    expect(off.solids).toEqual(before.solids);
    // Not merely invisible: out of the raycaster's list, because `Mesh.raycast` does not consult
    // `visible` and a hidden marker left in it would let a click select a switched-off conflict.
    expect(built.pickableConflicts()).toEqual([]);
    built.dispose();
  });

  it('on again restores the markers, their positions and their identities', () => {
    const s = everyFamily();
    const built = createRebarScene(s);
    const read = () => {
      const m = built.markers!;
      const at = new THREE.Matrix4();
      return Array.from({ length: m.count }, (_, i) => {
        m.getMatrixAt(i, at);
        return {
          conflict: built.conflictAt(i)?.pairClass ?? null,
          position: new THREE.Vector3().setFromMatrixPosition(at).toArray(),
        };
      });
    };
    const before = read();
    apply(built, {}, { conflicts: false });
    apply(built, {}, { conflicts: true });
    expect(read()).toEqual(before);
    expect(built.pickableConflicts()).toHaveLength(1);
    built.dispose();
  });

  it('does not remove the conflicts from the scene it was built from', () => {
    // The switch is a view operation. A conflict the user stopped looking at is still open, and
    // the document must be identical either side of the click.
    const s = everyFamily();
    const built = createRebarScene(s);
    apply(built, {}, { conflicts: false });
    expect(s.conflicts).toHaveLength(2);
    built.dispose();
  });

  it('a marker follows its own family off the screen and back', () => {
    const built = createRebarScene(everyFamily());
    // One conflict is between two column bars, the other between a slab bar and a wall bar.
    // Hiding columns must take the first and leave the second.
    expect(apply(built, { hiddenKinds: ['column'] }).markers).toBe(1);
    expect(apply(built, { hiddenKinds: ['slab', 'wall'] }).markers).toBe(1);
    expect(apply(built, { hiddenKinds: ['column', 'slab', 'wall'] }).markers).toBe(0);
    expect(apply(built, { hiddenKinds: [] }).markers).toBe(2);
    built.dispose();
  });
});

// ─── Isolation, and the switches together ────────────────────────

describe('isolation and the switches compose', () => {
  it('isolating a member cannot bring back a family the user switched off', () => {
    const built = createRebarScene(everyFamily());
    // Column 1 is isolated AND columns are off. The user turned columns off; nothing but the
    // user turning them back on may undo that.
    const c = apply(built, { hiddenKinds: ['column'], isolated: [1] });
    expect(c.bars.column).toBe(0);
    expect(c.solids.column).toBe(0);
    built.dispose();
  });

  it('a switch cannot permanently hide a family that was visible', () => {
    const built = createRebarScene(everyFamily());
    const before = built.census();
    // Isolate, switch a family off, switch it on, clear the isolation: back where it started.
    apply(built, { isolated: [1] });
    apply(built, { hiddenKinds: ['slab'], isolated: [1] });
    apply(built, { isolated: [1] });
    expect(apply(built, {})).toEqual(before);
    built.dispose();
  });

  it('isolation narrows within the families still switched on', () => {
    const built = createRebarScene(everyFamily());
    const c = apply(built, { hiddenKinds: ['slab', 'wall'], isolated: [1] });
    // Element 1 names a column, a slab panel and a wall. Only the column survives, because the
    // other two are switched off — and the slab bar does not sneak in through the shared number.
    expect(c.bars.column).toBe(2);
    expect(c.bars.slab).toBe(0);
    expect(c.bars.wall).toBe(0);
    built.dispose();
  });

  it('a status filter that matches nothing shows nothing, and is not "no filter"', () => {
    const built = createRebarScene(everyFamily());
    // `[]` means "no member matches". Reading it as "no restriction" is how a filter UI shows
    // the whole floor the moment the user deselects the last item.
    expect(apply(built, { statusElementIds: [] }).triangles).toBe(0);
    expect(apply(built, { statusElementIds: null }).triangles).toBeGreaterThan(0);
    built.dispose();
  });
});

// ─── What a switch must NOT cost ─────────────────────────────────

describe('a switch is a flag, not a rebuild', () => {
  it('walks all eight controls without building a tube or re-uploading a buffer', () => {
    const built = createRebarScene(everyFamily());
    const buildsBefore = rebarSceneBuilds();
    const buffersBefore = tubeFingerprint(built);

    for (const { kind } of FAMILIES) {
      apply(built, { hiddenKinds: [kind] });
      apply(built, { hiddenKinds: [] });
    }
    apply(built, { showBars: false });
    apply(built, { showBars: true });
    apply(built, {}, { concrete: false });
    apply(built, {}, { concrete: true });
    apply(built, {}, { conflicts: false });
    apply(built, {}, { conflicts: true });

    // Not a timing: the property itself. A build counter that did not move cannot be explained
    // away as a fast machine, and a version that did not move proves no buffer was re-uploaded.
    expect(rebarSceneBuilds(), 'no tube rebuilt').toBe(buildsBefore);
    expect(tubeFingerprint(built), 'no vertex buffer touched').toEqual(buffersBefore);
    built.dispose();
  });

  it('leaves picking correct at the first and last triangle of everything drawn', () => {
    const built = createRebarScene(everyFamily());
    for (const layers of [
      {}, { hiddenKinds: ['column'] as const }, { hiddenKinds: ['slab', 'wall'] as const },
      { isolated: [1] }, { isolated: [2] }, { hideUnreinforced: true },
      { hiddenKinds: ['beam'] as const, isolated: [1] },
    ] as Array<Partial<WorkspaceLayerState>>) {
      apply(built, layers);
      const label = JSON.stringify(layers);
      for (const b of built.bars.filter((x) => x.mesh.visible)) {
        for (const r of b.drawn) {
          // A picking map that was not re-expressed after a compaction does not LOOK wrong. It
          // reports the neighbouring bar's mark, and the user has no way to know.
          expect(built.barIdAt(b.mesh, r.firstTri), `first tri of ${r.barId} under ${label}`)
            .toBe(r.barId);
          expect(built.barIdAt(b.mesh, r.firstTri + r.triCount - 1), `last tri under ${label}`)
            .toBe(r.barId);
        }
      }
      for (const s of built.solids.filter((x) => x.mesh.visible)) {
        for (const r of s.drawn) {
          expect(built.solidIdAt(s.mesh, r.firstTri), `first tri of ${r.solidId} under ${label}`)
            .toBe(r.solidId);
        }
      }
    }
    built.dispose();
  });

  it('takes a hidden family out of the raycaster entirely', () => {
    const built = createRebarScene(everyFamily());
    const slab = built.bars.find((b) => b.family === 'slab')!;
    expect(built.pickable()).toContain(slab.mesh);
    apply(built, { hiddenKinds: ['slab'] });
    expect(built.pickable()).not.toContain(slab.mesh);
    expect(built.barIdAt(slab.mesh, slab.ranges[0].firstTri)).toBeNull();
    apply(built, { hiddenKinds: [] });
    expect(built.pickable()).toContain(slab.mesh);
    expect(built.barIdAt(slab.mesh, slab.ranges[0].firstTri)).toBe('slab-1:x');
    built.dispose();
  });
});

// ─── The switch positions themselves ─────────────────────────────

describe('the filter a switch position produces', () => {
  it('says nothing at all when every switch is in its default position', () => {
    // Absent means "no restriction", and `needsPerBar` reads it that way. Writing the full
    // family list instead would turn every default open into an index rewrite over 20 917 bars.
    expect(workspaceFilter(DEFAULTS)).toEqual({});
  });

  it('names the families to DRAW, not the ones the user hid', () => {
    const f = workspaceFilter({ ...DEFAULTS, hiddenKinds: ['column', 'slab'] });
    expect(f.solidKinds).toEqual(['beam', 'wall', 'footing', 'pedestal']);
  });

  it('distinguishes "every family hidden" from "no family filter"', () => {
    expect(workspaceFilter({ ...DEFAULTS, hiddenKinds: [...SCENE_SOLID_KINDS] }).solidKinds)
      .toEqual([]);
  });

  it('lets isolation win over the status filter', () => {
    const f = workspaceFilter({
      ...DEFAULTS, isolated: [12], statusElementIds: [3, 4, 5],
    });
    // The more specific gesture, performed more recently.
    expect(f.elementIds).toEqual([12]);
  });

  it('keeps an empty status filter as a real restriction', () => {
    expect(workspaceFilter({ ...DEFAULTS, statusElementIds: [] }).elementIds).toEqual([]);
  });

  it('copies the member lists rather than aliasing the store\'s arrays', () => {
    const isolated = [1, 2];
    const f = workspaceFilter({ ...DEFAULTS, isolated });
    expect(f.elementIds).toEqual([1, 2]);
    expect(f.elementIds).not.toBe(isolated);
  });
});
