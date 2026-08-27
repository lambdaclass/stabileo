/**
 * The 3-D scene is a projection, and these tests are what makes that a fact rather than a
 * claim in a comment.
 *
 * The interesting assertions are not "a bar came out". They are the ones that would fail if
 * this module ever started deciding something for itself: that the polyline it hands the
 * renderer is byte-for-byte what `samplePath` gives the elevation and the clash check, that
 * the marks are the schedule's, and that concrete it was not given is REPORTED rather than
 * quietly omitted.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSceneModel, filterScene, summariseScene, barMatchesFilter,
  type MemberGeometry, type SceneBar,
} from '../scene-model';
import { buildDocumentModel, type CertificateEntry } from '../document-model';
import type { DetailingAssembly } from '../assembly';
import type { BarConflict } from '../collision';
import type { FootingDesignRecord } from '../family-record';
import { buildStraightBarWithHooks, samplePath, type BarPath }
  from '../../../codes/cirsoc201/bar-geometry';

const X = { x: 1, y: 0, z: 0 };
const UP = { x: 0, y: 0, z: 1 };

function bar(id: string, over: Partial<Parameters<typeof buildStraightBarWithHooks>[0]> = {}):
BarPath {
  return buildStraightBarWithHooks({
    id, diameterMm: 16, role: 'longitudinal',
    start: { x: 0, y: 0, z: 0.05 }, end: { x: 5, y: 0, z: 0.05 },
    axis: X, hookNormal: UP,
    ownerElementIds: [1], layerId: 'e1:bottom:0',
    ...over,
  });
}

function assembly(over: Partial<DetailingAssembly> = {}): DetailingAssembly {
  return {
    id: 'level-3.20', labelKey: 'detailing.assembly.level', labelParams: { level: '3.20' },
    kind: 'beamLine', elementIds: [1, 2],
    bars: [bar('b1', { endHook: 90 }), bar('b2')],
    joints: [], conflicts: [], unsupported: [],
    marks: [{
      mark: 'B1', diameterMm: 16, cuttingLength: 5.34, quantity: 2,
      shape: 'L90', massKg: 16.9, barIds: ['b1', 'b2'],
    }],
    state: 'CONSTRUCTIBLE', stateBlockers: [], detailingRevision: 7,
    maturity: 'VALIDATED',
    provenance: { edition: '2025', verifierId: 'cirsoc201.v2', trace: [], assumptions: [] },
    ...over,
  } as DetailingAssembly;
}

const CERT: CertificateEntry = {
  elementId: 1, certifiedHash: 'h', currentHash: 'h', matches: true,
  verifierId: 'cirsoc201.v2', status: 'ok',
};

const CONFLICT = {
  severity: 'blocking', barA: 'b1', barB: 'b2', at: { x: 2, y: 0, z: 0.05 },
  clearance: -0.006, required: 0.025, shortfall: 0.031,
  elementIds: [1, 2], pairClass: 'prohibitedOverlap',
} as unknown as BarConflict;

function doc(over: { assemblies?: DetailingAssembly[] } = {}) {
  return buildDocumentModel({
    seriesId: 'S',
    revision: {
      number: 5, at: '2026-07-27T09:00:00Z', author: 'Bauti',
      detailingRevision: 7, demandRevision: 4,
    },
    regulations: [{ id: 'cirsoc-201', edition: '2025' }],
    assemblies: over.assemblies ?? [assembly({ state: 'ISSUED' })],
    laps: [], certificates: [CERT],
  });
}

const MEMBERS: MemberGeometry[] = [
  {
    elementId: 1, kind: 'beam',
    start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 },
    width: 0.2, depth: 0.5,
  },
  {
    elementId: 2, kind: 'column',
    start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 3 },
    width: 0.4, depth: 0.4,
  },
];

// ─── The projection rule ─────────────────────────────────────────

describe('the scene reads the document and nothing else', () => {
  const scene = buildSceneModel(doc(), { members: MEMBERS });

  it('samples every bar with the SAME function the elevation and the clash check use', () => {
    // Not "close to": identical. Two samplings of one hook that differ by a chord tolerance
    // are two hooks, and the whole point of the projection is that there is one.
    const source = assembly().bars;
    for (const src of source) {
      const drawn = scene.bars.find((b) => b.barId === src.id) as SceneBar;
      expect(drawn.polyline).toEqual(samplePath(src));
    }
  });

  it('carries the schedule mark, not a mark of its own', () => {
    expect(scene.bars.map((b) => b.mark)).toEqual(['B1', 'B1']);
  });

  it('states which document it is showing, and what that document may claim', () => {
    expect(scene.seriesId).toBe('S');
    expect(scene.revision).toBe(5);
    expect(scene.readiness).toBe('ISSUED');
  });

  it('is deterministic: two builds of one document are the same scene', () => {
    expect(buildSceneModel(doc(), { members: MEMBERS }))
      .toEqual(buildSceneModel(doc(), { members: MEMBERS }));
  });

  /*
   * Objective 6. A pin is not a note the detailing panel keeps to itself: `runDetailing` is
   * handed `lockedBars` and never regenerates them, and the repair loop is handed every member
   * a pinned bar owns and never repairs those. The viewer is where a continuous bar's second
   * owner is actually visible, so the flag has to reach it — and by being COPIED, not inferred.
   */
  it('carries the engineer’s pin verbatim from the document', () => {
    const pinned = assembly({
      bars: [bar('b1', { endHook: 90 }), bar('b2')].map(
        (b) => (b.id === 'b1' ? { ...b, locked: true } : b)),
    });
    const scene = buildSceneModel(doc({ assemblies: [pinned] }), { members: MEMBERS });
    expect(scene.bars.find((b) => b.barId === 'b1')?.locked).toBe(true);
  });

  /*
   * `locked: false` on 20 917 scene bars is 20 917 fields carrying no information, and the
   * field means "set when pinned". An unpinned bar is silent about it, exactly as it is about
   * `provisional`.
   */
  it('says nothing about a bar nobody pinned', () => {
    expect(scene.bars.every((b) => b.locked === undefined)).toBe(true);
  });
});

// ─── Concrete ────────────────────────────────────────────────────

describe('concrete the caller did not supply is reported, not omitted', () => {
  it('resolves the members it was given', () => {
    const scene = buildSceneModel(doc(), { members: MEMBERS });
    expect(scene.solids.map((s) => s.id).sort()).toEqual(['member:1', 'member:2']);
    expect(scene.unresolvedMembers).toEqual([]);
  });

  it('names the members it was NOT given', () => {
    const scene = buildSceneModel(doc(), { members: [MEMBERS[0]] });
    expect(scene.unresolvedMembers).toEqual([2]);
  });

  it('reports every member the ASSEMBLY claims, not only the ones with steel on them', () => {
    // Element 2 owns no bar in this fixture. A scene that decided membership from bar
    // owners would call the floor complete while a whole member was missing from it.
    const scene = buildSceneModel(doc(), { members: [] });
    expect(scene.unresolvedMembers).toEqual([1, 2]);
  });

  it('draws a member the caller supplied even when NO assembly claims it', () => {
    /**
     * The member whose design was refused.
     *
     * It carries no steel, so it joins no assembly, so nothing in the document names it —
     * and the view used to show 22 of `rc-qa-diagnostic`'s 26 members with no sign that four
     * were missing. Supplying it must be enough to draw it.
     */
    const orphan: MemberGeometry = {
      elementId: 99, kind: 'column',
      start: { x: 9, y: 9, z: 0 }, end: { x: 9, y: 9, z: 3 },
      width: 0.3, depth: 0.3,
    };
    const scene = buildSceneModel(doc(), { members: [...MEMBERS, orphan] });
    const solid = scene.solids.find((s) => s.id === 'member:99');
    expect(solid, 'the orphan member is drawn').toBeDefined();
    expect(solid!.assemblyId, 'and belongs to no assembly').toBeUndefined();
    expect(solid!.reinforced).toBe(false);
    expect(scene.unreinforcedMembers).toEqual([2, 99]);
  });

  it('marks a member as reinforced only when a bar actually sits in it', () => {
    const scene = buildSceneModel(doc(), { members: MEMBERS });
    // Element 1 owns both bars; element 2 owns none, though the assembly spans it.
    expect(scene.solids.find((s) => s.id === 'member:1')!.reinforced).toBe(true);
    expect(scene.solids.find((s) => s.id === 'member:2')!.reinforced).toBe(false);
  });

  it('builds a column section in the plane normal to a VERTICAL axis', () => {
    const scene = buildSceneModel(doc(), { members: MEMBERS });
    const col = scene.solids.find((s) => s.id === 'member:2')!;
    // All four base corners sit at the column foot, and the sweep is the 3 m height.
    expect(col.base.every((p) => p.z === 0)).toBe(true);
    expect(col.extrude).toEqual({ x: 0, y: 0, z: 3 });
    // 0.40 × 0.40 about the axis at x = 5.
    expect(col.base.map((p) => Math.round(p.x * 1000) / 1000).sort())
      .toEqual([4.8, 4.8, 5.2, 5.2]);
  });

  it('builds a beam section in the plane normal to a HORIZONTAL axis', () => {
    const scene = buildSceneModel(doc(), { members: MEMBERS });
    const beam = scene.solids.find((s) => s.id === 'member:1')!;
    expect(beam.extrude).toEqual({ x: 5, y: 0, z: 0 });
    // The 0.5 m depth is vertical and the 0.2 m width is across — not the other way round.
    const zs = beam.base.map((p) => Math.round(p.z * 1000) / 1000);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.5, 6);
    const ys = beam.base.map((p) => Math.round(p.y * 1000) / 1000);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.2, 6);
  });
});

describe('a footing solid comes from its record, and is placed by its dowels', () => {
  const dowel = bar('d1', {
    diameterMm: 20, start: { x: 3, y: 2, z: -0.6 }, end: { x: 3, y: 2, z: 1.2 },
    axis: UP, hookNormal: X, ownerElementIds: [9], layerId: 'f1:dowel:0',
  });

  const record = {
    family: 'footing', ownerId: 'F1', ownerElementIds: [9], barIds: ['d1'],
    // Enough certificate for `buildDocumentModel` to ask its freshness question. The answer
    // is not what this describe block is about; the geometry it carries is.
    certificate: {
      family: 'footing', recordId: 'footing:F1', ownerId: 'F1', ownerElementIds: [9],
      inputHash: 'i', geometryHash: 'g',
      revisions: { analysis: 1, loads: 1, regulation: 1, entity: 1 },
      edition: '2025', governingChecks: [], status: 'CERTIFIED', maturity: 'VALIDATED',
      assumptions: [], reinforcementHash: 'r', finalGeometryHash: 'f',
    },
    geometryHash: 'g', inputHash: 'i',
    geometry: {
      footingId: 9, name: 'Z1', kind: 'isolated', B: 2.5, L: 2.0, thickness: 0.6,
      rotationDeg: 0, eccentricityB: 0, eccentricityL: 0, cover: 0.05,
      foundingElevation: -1.2, d: 0.52,
    },
    dowels: { count: 1, diameterMm: 20, ldFooting: 0.5, lapAbove: 0.6, hooked: false, barIds: ['d1'] },
  } as unknown as FootingDesignRecord;

  const scene = buildSceneModel(doc({
    assemblies: [assembly({
      id: 'FLOOR', elementIds: [], bars: [dowel], marks: [], families: [record],
    })],
  }));

  it('sits at the founding elevation and rises by its own thickness', () => {
    const f = scene.solids.find((s) => s.kind === 'footing')!;
    expect(f.base.every((p) => p.z === -1.2)).toBe(true);
    expect(f.extrude).toEqual({ x: 0, y: 0, z: 0.6 });
  });

  it('is centred on the dowel it starts, not on the origin', () => {
    const f = scene.solids.find((s) => s.kind === 'footing')!;
    const xs = f.base.map((p) => p.x);
    const ys = f.base.map((p) => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(3, 9);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(2, 9);
    // B along x, L along y — swapping them is the classic silent footing bug.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2.5, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2.0, 9);
  });

  it('tags the bar with the family that owns it', () => {
    expect(scene.bars[0].family).toBe('footing');
  });
});

// ─── Conflicts ───────────────────────────────────────────────────

describe('conflicts are placed in space, not only listed', () => {
  const scene = buildSceneModel(
    doc({ assemblies: [assembly({ conflicts: [CONFLICT], state: 'COORDINATED' })] }),
    { members: MEMBERS });

  it('flags both bars named by the conflict', () => {
    expect(scene.bars.filter((b) => b.conflicted).map((b) => b.barId)).toEqual(['b1', 'b2']);
  });

  it('carries what was measured and what was required, unchanged', () => {
    expect(scene.conflicts).toHaveLength(1);
    expect(scene.conflicts[0].clearance).toBe(-0.006);
    expect(scene.conflicts[0].required).toBe(0.025);
    expect(scene.conflicts[0].at).toEqual({ x: 2, y: 0, z: 0.05 });
  });

  it('drops the readiness to a draft, so the view cannot render a clean cage', () => {
    expect(scene.readiness).toBe('REVIEW_DRAFT');
  });
});

// ─── Filtering ───────────────────────────────────────────────────

describe('an absent filter and an empty filter are different states', () => {
  const scene = buildSceneModel(doc(), { members: MEMBERS });

  it('absent means no restriction', () => {
    expect(filterScene(scene, {}).bars).toHaveLength(2);
  });

  it('empty means nothing matches', () => {
    // The state a UI reaches when the user deselects the last checkbox. Showing the whole
    // floor there is the bug this distinction exists to prevent.
    expect(filterScene(scene, { roles: [] }).bars).toHaveLength(0);
  });

  it('hides frame steel when the user narrows to a floor family', () => {
    // Beam and column bars belong to no family. "Show me the footings" must not answer
    // "this bar has no family, so it is not excluded" and put the frame back on screen.
    expect(barMatchesFilter(scene.bars[0], { families: ['footing'] })).toBe(false);
  });

  it('keeps a conflict marker only while a bar it names is visible', () => {
    const withConflict = buildSceneModel(
      doc({ assemblies: [assembly({ conflicts: [CONFLICT] })] }), { members: MEMBERS });
    expect(filterScene(withConflict, { conflictedOnly: true }).conflicts).toHaveLength(1);
    expect(filterScene(withConflict, { roles: [] }).conflicts).toHaveLength(0);
  });

  it('keeps unreinforced concrete visible through an assembly filter', () => {
    /**
     * The regression this pins.
     *
     * A refused member belongs to no assembly, so an assembly filter can neither include nor
     * exclude it. Dropping it — which a naive `visibleAssemblies.has(s.assemblyId)` does,
     * because `undefined` is in no set — would put it back in the dark the instant the user
     * touched a checkbox.
     */
    const orphan: MemberGeometry = {
      elementId: 99, kind: 'column',
      start: { x: 9, y: 9, z: 0 }, end: { x: 9, y: 9, z: 3 },
      width: 0.3, depth: 0.3,
    };
    const s = buildSceneModel(doc(), { members: [...MEMBERS, orphan] });
    const narrowed = filterScene(s, { assemblyIds: ['level-3.20'] });
    expect(narrowed.solids.some((x) => x.id === 'member:99')).toBe(true);
  });

  it('hides it only when the user asks, and that switch is off by default', () => {
    const orphan: MemberGeometry = {
      elementId: 99, kind: 'column',
      start: { x: 9, y: 9, z: 0 }, end: { x: 9, y: 9, z: 3 },
      width: 0.3, depth: 0.3,
    };
    const s = buildSceneModel(doc(), { members: [...MEMBERS, orphan] });
    expect(filterScene(s, {}).solids.some((x) => x.id === 'member:99')).toBe(true);
    expect(filterScene(s, { hideUnreinforced: true }).solids.some((x) => x.id === 'member:99'))
      .toBe(false);
  });

  it('keeps the concrete a visible bar sits in, whatever the bar filter says', () => {
    // Narrowing to a ROLE is a question about steel. Answering it by also hiding the beam
    // the steel is in would leave bars floating in space, which is a different picture from
    // the one the user asked for.
    const all = buildSceneModel(doc(), { members: MEMBERS });
    expect(filterScene(all, { roles: ['longitudinal'] }).solids).toHaveLength(2);
  });

  it('hiding every bar leaves the concrete shell, not an empty screen', () => {
    /**
     * This used to empty the picture completely, and that was wrong.
     *
     * Solid visibility was derived from the assemblies the surviving BARS belonged to, so
     * turning the last bar off took the building with it. "Hide reinforcement" hides
     * reinforcement; a user who wants to look at the concrete on its own is asking a normal
     * question and used to get a blank canvas.
     */
    const all = buildSceneModel(doc(), { members: MEMBERS });
    const noBars = filterScene(all, { roles: [] });
    expect(noBars.bars).toHaveLength(0);
    expect(noBars.solids).toHaveLength(2);
    expect(noBars.bounds).not.toBeNull();
  });

  it('frames nothing as null when there is genuinely nothing', () => {
    const all = buildSceneModel(doc(), { members: MEMBERS });
    expect(all.bounds!.max.z).toBeCloseTo(3, 9);
    // A camera cannot frame nothing, and this is the only way to reach nothing.
    const empty = filterScene(all, { roles: [], solidKinds: [] });
    expect(empty.solids).toEqual([]);
    expect(empty.bounds).toBeNull();
  });
});

// ─── Layers ──────────────────────────────────────────────────────

describe('concrete families are layers of one model', () => {
  const dowel = bar('d1', {
    diameterMm: 20, start: { x: 3, y: 2, z: -0.6 }, end: { x: 3, y: 2, z: 1.2 },
    axis: UP, hookNormal: X, ownerElementIds: [9], layerId: 'f1:dowel:0',
  });
  const record = {
    family: 'footing', ownerId: 'F1', ownerElementIds: [9], barIds: ['d1'],
    certificate: {
      family: 'footing', recordId: 'footing:F1', ownerId: 'F1', ownerElementIds: [9],
      inputHash: 'i', geometryHash: 'g',
      revisions: { analysis: 1, loads: 1, regulation: 1, entity: 1 },
      edition: '2025', governingChecks: [], status: 'CERTIFIED', maturity: 'VALIDATED',
      assumptions: [], reinforcementHash: 'r', finalGeometryHash: 'f',
    },
    geometryHash: 'g', inputHash: 'i',
    geometry: {
      footingId: 9, name: 'Z1', kind: 'isolated', B: 2.5, L: 2.0, thickness: 0.6,
      rotationDeg: 0, eccentricityB: 0, eccentricityL: 0, cover: 0.05,
      foundingElevation: -1.2, d: 0.52,
    },
    dowels: { count: 1, diameterMm: 20, ldFooting: 0.5, lapAbove: 0.6, hooked: false, barIds: ['d1'] },
  } as unknown as FootingDesignRecord;

  const scene = buildSceneModel(
    doc({
      assemblies: [
        assembly({ state: 'ISSUED' }),
        assembly({ id: 'FLOOR', elementIds: [], bars: [dowel], marks: [], families: [record] }),
      ],
    }),
    { members: MEMBERS });

  it('puts the footing in the SAME scene as the frame it carries', () => {
    // Not a separate view: a user checking that dowels line up with the column above them
    // needs both, and a foundations-only route makes that question impossible to ask.
    expect(scene.solids.map((s) => s.kind).sort())
      .toEqual(['beam', 'column', 'footing']);
  });

  it('takes a family’s STEEL with it, and leaves every other family alone', () => {
    /**
     * A layer switch that moved only the concrete is what "the toggles do not work" meant.
     *
     * Turning `Columns` off removed 84 prisms and left 9 311 column bars hanging in place, and
     * because the steel never went away there was no way to isolate slabs or walls and see
     * them — which is why they were reported missing.
     */
    const noFoundations = filterScene(scene, { solidKinds: ['beam', 'column'] });
    expect(noFoundations.solids.map((s) => s.kind).sort()).toEqual(['beam', 'column']);
    // The footing's dowel goes with the footing.
    expect(noFoundations.bars.some((b) => b.family === 'footing')).toBe(false);
    // And the frame's own steel is untouched: hiding one family must not hide another.
    expect(noFoundations.bars.length).toBe(scene.bars.filter((b) => !b.family).length);
    expect(noFoundations.bars.length).toBeGreaterThan(0);
  });

  it('keeps a bar whose family cannot be resolved rather than dropping it', () => {
    // Silently hiding steel the scene could not classify would be the same omission in a new
    // place. A bar owned by no drawn member survives every layer switch.
    const orphan = buildSceneModel(doc(), { members: [] });
    expect(filterScene(orphan, { solidKinds: ['footing'] }).bars.length)
      .toBe(orphan.bars.length);
  });

  it('isolates one member, keeping a bar that is continuous into another', () => {
    const only1 = filterScene(scene, { elementIds: [1] });
    expect(only1.solids.map((s) => s.id)).toEqual(['member:1']);
    // Both frame bars are owned by element 1, so both survive.
    expect(only1.bars.every((b) => b.elementIds.includes(1))).toBe(true);
    expect(only1.bars.length).toBeGreaterThan(0);
  });

  it('hides all reinforcement with one switch, keeping every solid', () => {
    const shell = filterScene(scene, { hideBars: true });
    expect(shell.bars).toEqual([]);
    expect(shell.solids).toHaveLength(scene.solids.length);
  });
});

// ─── Facets and summary ──────────────────────────────────────────

describe('the view offers what exists and counts what it shows', () => {
  const scene = buildSceneModel(doc(), { members: MEMBERS });

  it('lists every assembly in document order, with its bar count', () => {
    expect(scene.facets.assemblies).toEqual([
      { id: 'level-3.20', label: { key: 'detailing.assembly.level', params: { level: '3.20' } }, barCount: 2 },
    ]);
  });

  it('offers only the layers and roles actually present', () => {
    expect(scene.facets.layers).toEqual(['e1:bottom:0']);
    expect(scene.facets.roles).toEqual(['longitudinal']);
    expect(scene.facets.families).toEqual([]);
  });

  it('totals the same cutting lengths the schedule bills', () => {
    const s = summariseScene(scene);
    expect(s.barCount).toBe(2);
    expect(s.totalLength).toBeCloseTo(
      assembly().bars.reduce((n, b) => n + b.cuttingLength, 0), 9);
    expect(s.byDiameter).toEqual([
      { diameterMm: 16, count: 2, lengthM: s.totalLength },
    ]);
  });

  it('summarises what is FILTERED, not what was built', () => {
    expect(summariseScene(filterScene(scene, { roles: [] })).barCount).toBe(0);
  });
});
