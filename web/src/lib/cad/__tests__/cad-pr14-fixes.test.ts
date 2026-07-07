// PR [14] — regression tests for the audit blockers (Fable review):
//   [2] unit suggestion must not nag a plausible unit toward a "more typical" one
//   [3] beam-polygon interpretation must reject non-rectangular / too-wide outlines
//   [4] multi-floor plan ranges must be validated (overlap/gap/coverage/empty)
//   [5] pruneFloating must keep the SUPPORTED component, not merely the largest
import { describe, it, expect } from 'vitest';
import type { ArchPlan, RcDraftAssumptions } from '../types';
import { suggestUnitFromExtent, parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { beamAxisFromPolygon } from '../geometry';
import { pruneFloating } from '../infer';
import { buildDraft, validateFloorRanges, type FloorPlanSpec } from '../draft-build';
import { buildDxf, dxfLwPolyline } from './dxf-fixture';
import type { ModelSnapshot } from '../../store/history.svelte';

const SOURCE = { fileName: 'plan.dxf', importedAtIso: '2026-06-14T00:00:00.000Z' };

function emptyPlan(): ArchPlan {
  return {
    unit: 'm', mappings: [], columns: [], beams: [], walls: [], slabs: [],
    openings: [], gridLines: [], schedules: [], roomLabels: [], warnings: [], skipped: [],
  };
}

/** A 4-column square (4 m) with 4 perimeter beams and a drawn slab. */
function gridPlan(): ArchPlan {
  const p = emptyPlan();
  p.columns = [[0, 0], [4, 0], [0, 4], [4, 4]].map(([x, y]) => ({ at: { x, y }, sizeSource: 'default' as const }));
  p.beams = [
    { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 0, y: 4 }, b: { x: 4, y: 4 } },
    { a: { x: 0, y: 0 }, b: { x: 0, y: 4 } }, { a: { x: 4, y: 0 }, b: { x: 4, y: 4 } },
  ];
  p.slabs = [{ outline: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], isQuad: true, isRectilinear: true }];
  return p;
}

function assumptions(over: Partial<RcDraftAssumptions> = {}): RcDraftAssumptions {
  return {
    nFloors: 1, storyHeights: [3], concreteGrade: 'H-30',
    columnSection: { b: 0.3, h: 0.3 }, beamSection: { b: 0.2, h: 0.4 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 3, liveLoad: 2, generateCombos: true, meshSlabs: true,
    meshMode: 'fixedDivisions', meshDivisions: 2, splitBeams: true, snapTolerance: 0.02,
    ...over,
  };
}

const spec = (fromFloor: number, toFloor: number, label: string): FloorPlanSpec => ({ plan: emptyPlan(), fromFloor, toFloor, label });

// ── Blocker 2: unit suggestion only when current unit is implausible ──
describe('parse.suggestUnitFromExtent — no false unit nag (blocker 2)', () => {
  it('does NOT push a plausible mm plan toward cm (avoids 10× inflation)', () => {
    // raw 3000 mm → 3 m: a small-but-real plan. cm would read 30 m (more
    // "typical"), but mm is already plausible, so we must NOT suggest.
    const s = suggestUnitFromExtent({ minX: 0, maxX: 3000, minY: 0, maxY: 2000 }, 'mm');
    expect(s).toBeNull();
  });

  it('does NOT push a plausible cm plan toward m', () => {
    // raw 3000 cm → 30 m: already a sensible building size in cm.
    const s = suggestUnitFromExtent({ minX: 0, maxX: 3000, minY: 0, maxY: 2000 }, 'cm');
    expect(s).toBeNull();
  });

  it('STILL suggests m when the mm unit is implausibly tiny (metres-drawn file)', () => {
    // raw 30 with a mm header → 0.03 m (implausible); the file is really metres.
    const s = suggestUnitFromExtent({ minX: 0, maxX: 30, minY: 0, maxY: 20 }, 'mm');
    expect(s).not.toBeNull();
    expect(s!.suggested).toBe('m');
    expect(s!.suggestedExtentM).toBeCloseTo(30, 6);
  });
});

// ── Blocker 3: beam polygon must be a rectangular, sensible-width footprint ──
describe('geometry.beamAxisFromPolygon — rectangularity + width cap (blocker 3)', () => {
  it('accepts a thin closed rectangle', () => {
    const axis = beamAxisFromPolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.3 }, { x: 0, y: 0.3 }]);
    expect(axis).not.toBeNull();
    expect(axis!.width).toBeCloseTo(0.3, 6);
  });

  it('rejects an over-wide rectangle (> 0.60 m) — not a beam', () => {
    const axis = beamAxisFromPolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.8 }, { x: 0, y: 0.8 }]);
    expect(axis).toBeNull();
  });

  it('rejects a non-rectangular outline that under-fills its bounding box', () => {
    // A thin bar with a triangular bite: aspect + width pass, but the area is
    // only ~70% of the oriented bbox → not a solid rectangular footprint.
    const axis = beamAxisFromPolygon([
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.5 }, { x: 2, y: 0.2 }, { x: 0, y: 0.5 },
    ]);
    expect(axis).toBeNull();
  });

  it('classify skips a beam-layer L-polyline as beamShape (no fake beam)', () => {
    const dxf = buildDxf({
      entities: dxfLwPolyline('VIGAS', [[0, 0], [4, 0], [4, 4], [0.5, 4], [0.5, 0.5], [0, 0.5]], true),
    });
    const doc = parseCadDxf(dxf, 'l.dxf');
    const mappings = suggestLayerMappings(doc, 'm').map((m) => (m.layer === 'VIGAS' ? { ...m, role: 'beam' as const } : m));
    const plan = extractArchPlan(doc, mappings, 'm');
    expect(plan.beams.length).toBe(0);
    expect(plan.skipped.some((s) => s.reason === 'beamShape')).toBe(true);
  });
});

// ── Blocker 4: multi-floor range validation ──
describe('draft-build.validateFloorRanges (blocker 4)', () => {
  it('accepts contiguous, in-range, non-overlapping ranges', () => {
    const issues = validateFloorRanges([spec(1, 2, 'A'), spec(3, 4, 'B')], 4);
    expect(issues.length).toBe(0);
  });

  it('errors on overlapping ranges', () => {
    const issues = validateFloorRanges([spec(1, 3, 'A'), spec(2, 4, 'B')], 4);
    expect(issues.some((i) => i.severity === 'error' && i.message.startsWith('floorRangeOverlap:'))).toBe(true);
  });

  it('errors on an out-of-range floor', () => {
    const issues = validateFloorRanges([spec(1, 5, 'A')], 4);
    expect(issues.some((i) => i.severity === 'error' && i.message.startsWith('floorRangeInvalid:'))).toBe(true);
  });

  it('errors on an uncovered gap by default, warns when gaps are allowed', () => {
    const strict = validateFloorRanges([spec(1, 2, 'A')], 4);
    expect(strict.some((i) => i.severity === 'error' && i.message.startsWith('floorRangeGap:'))).toBe(true);
    const lax = validateFloorRanges([spec(1, 2, 'A')], 4, true);
    expect(lax.some((i) => i.severity === 'warn' && i.message.startsWith('floorRangeGap:'))).toBe(true);
  });
});

describe('draft-build.buildDraft — multi-floor guards (blocker 4)', () => {
  const A3 = assumptions({ nFloors: 3, storyHeights: [3, 3, 3] });

  it('throws on overlapping floor plans', () => {
    expect(() => buildDraft({
      floorPlans: [
        { plan: gridPlan(), fromFloor: 1, toFloor: 2, label: 'A' },
        { plan: gridPlan(), fromFloor: 2, toFloor: 3, label: 'B' },
      ],
      assumptions: A3, source: SOURCE,
    })).toThrow(/Invalid floor ranges|floorRangeOverlap/);
  });

  it('throws on an uncovered gap unless allowFloorGaps', () => {
    const input = { floorPlans: [{ plan: gridPlan(), fromFloor: 1, toFloor: 1, label: 'A' }], assumptions: A3, source: SOURCE };
    expect(() => buildDraft(input)).toThrow(/Invalid floor ranges|floorRangeGap/);
    const ok = buildDraft({ ...input, allowFloorGaps: true });
    expect(ok.warnings.some((w) => w.message.startsWith('floorRangeGap:'))).toBe(true);
  });

  it('emits an error-severity warning when a plan contributes 0 members', () => {
    const draft = buildDraft({
      floorPlans: [
        { plan: gridPlan(), fromFloor: 1, toFloor: 1, label: 'Grid' },
        { plan: emptyPlan(), fromFloor: 2, toFloor: 2, label: 'Empty' },
      ],
      assumptions: assumptions({ nFloors: 2, storyHeights: [3, 3] }), source: SOURCE,
    });
    expect(draft.warnings.some((w) => w.severity === 'error' && w.message.startsWith('emptyFloorRange:'))).toBe(true);
  });
});

// ── Blocker 5: pruneFloating keeps the supported component ──
describe('infer.pruneFloating — keeps supported component (blocker 5)', () => {
  it('keeps a small SUPPORTED component over a larger unsupported blob', () => {
    const snap = {
      nodes: [
        [1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }],
        [3, { id: 3, x: 99, y: 99 }], [4, { id: 4, x: 99, y: 99, z: 3 }],
        [5, { id: 5, x: 99, y: 90 }], [6, { id: 6, x: 99, y: 90, z: 3 }],
      ],
      elements: [
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
        [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
        [3, { id: 3, type: 'frame', nodeI: 5, nodeJ: 6, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
        [4, { id: 4, type: 'frame', nodeI: 3, nodeJ: 5, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
        [5, { id: 5, type: 'frame', nodeI: 4, nodeJ: 6, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
      ],
      quads: [], supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]], loads: [],
    } as unknown as ModelSnapshot;
    const removed = pruneFloating(snap);
    // The 4-node blob (nodes 3–6) is larger but has no support → dropped.
    expect(removed.nodes).toBe(4);
    const kept = new Set(snap.nodes.map(([, n]) => n.id));
    expect(kept.has(1)).toBe(true);
    expect(kept.has(2)).toBe(true);
    expect(kept.has(3)).toBe(false);
    expect(snap.supports.length).toBe(1);
  });

  it('falls back to the largest component when nothing is supported', () => {
    const snap = {
      nodes: [
        [1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }],
        [3, { id: 3, x: 99, y: 99 }], [4, { id: 4, x: 99, y: 99, z: 3 }], [5, { id: 5, x: 99, y: 90 }],
      ],
      elements: [
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
        [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
        [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 5, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
      ],
      quads: [], supports: [], loads: [],
    } as unknown as ModelSnapshot;
    pruneFloating(snap);
    const kept = new Set(snap.nodes.map(([, n]) => n.id));
    expect(kept.has(3)).toBe(true); // largest (3-node) component survives
    expect(kept.has(1)).toBe(false);
  });
});
