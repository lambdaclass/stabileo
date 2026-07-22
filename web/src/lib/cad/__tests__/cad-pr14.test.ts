// PR [14] — DXF Plan upgrade: inference, diagnostics, preview, multi-floor,
// beam-polygon offsets, unit sanity.
import { describe, it, expect } from 'vitest';
import type { ArchPlan, RcDraftAssumptions, RcDraftResult, SectionScheduleEntry } from '../types';
import { parseCadDxf, suggestUnitFromExtent } from '../parse';
import { extractArchPlan, suggestLayerMappings } from '../classify';
import { buildStabileoTemplateDxf } from '../template';
import { beamAxisFromPolygon } from '../geometry';
import {
  cropDoc, panelsFromBeamGrid, snapPanelCornersToColumns,
  pruneBeamsDisconnectedFromColumns, pruneFloating, cluster,
} from '../infer';
import { diagnoseDraft } from '../diagnostics';
import { draftPreviewStats } from '../draft-preview';
import { generateRcDraft } from '../draft';
import { buildDraft } from '../draft-build';
import type { ModelSnapshot } from '../../store/history.svelte';

const SOURCE = { fileName: 'plan.dxf', importedAtIso: '2026-06-14T00:00:00.000Z' };

function emptyPlan(): ArchPlan {
  return {
    unit: 'm', mappings: [], columns: [], beams: [], walls: [], slabs: [],
    openings: [], gridLines: [], schedules: [], roomLabels: [], warnings: [], skipped: [],
  };
}

/** A 4-column square (4 m) with 4 perimeter beams; optional drawn slab. */
function gridPlan(withSlab: boolean): ArchPlan {
  const p = emptyPlan();
  p.columns = [[0, 0], [4, 0], [0, 4], [4, 4]].map(([x, y]) => ({ at: { x, y }, sizeSource: 'default' as const }));
  p.beams = [
    { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 0, y: 4 }, b: { x: 4, y: 4 } },
    { a: { x: 0, y: 0 }, b: { x: 0, y: 4 } }, { a: { x: 4, y: 0 }, b: { x: 4, y: 4 } },
  ];
  if (withSlab) p.slabs = [{ outline: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], isQuad: true, isRectilinear: true }];
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

describe('geometry.beamAxisFromPolygon (Layer 4)', () => {
  it('derives a centerline + width from a thin closed rectangle', () => {
    const axis = beamAxisFromPolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.3 }, { x: 0, y: 0.3 }]);
    expect(axis).not.toBeNull();
    expect(Math.hypot(axis!.b.x - axis!.a.x, axis!.b.y - axis!.a.y)).toBeCloseTo(4, 3);
    expect(axis!.width).toBeCloseTo(0.3, 3);
    // Centerline runs along mid-height y = 0.15.
    expect(axis!.a.y).toBeCloseTo(0.15, 3);
    expect(axis!.b.y).toBeCloseTo(0.15, 3);
  });

  it('rejects a near-square (not a beam)', () => {
    expect(beamAxisFromPolygon([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeNull();
  });
});

describe('classify — closed beam face polygon → centerline + width (Layer 4)', () => {
  it('reads a beam drawn as a closed thin rectangle on a beam layer', () => {
    // Closed POLYLINE (R12) on layer VIGAS: a 5 m × 0.25 m beam outline.
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'POLYLINE', '8', 'VIGAS', '66', '1', '70', '1',
      '0', 'VERTEX', '8', 'VIGAS', '10', '0', '20', '0',
      '0', 'VERTEX', '8', 'VIGAS', '10', '5', '20', '0',
      '0', 'VERTEX', '8', 'VIGAS', '10', '5', '20', '0.25',
      '0', 'VERTEX', '8', 'VIGAS', '10', '0', '20', '0.25',
      '0', 'SEQEND',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\r\n');
    const doc = parseCadDxf(dxf, 'b.dxf');
    // Force the layer to 'beam'.
    const mappings = doc.layers.map((l) => ({ layer: l.name, role: 'beam' as const, suggested: 'beam' as const, confidence: 'high' as const, evidence: 'test' }));
    const plan: ArchPlan = extractArchPlan(doc, mappings, 'm');
    expect(plan.beams.length).toBe(1);
    expect(plan.beams[0].geomSource).toBe('polygon');
    expect(plan.beams[0].width).toBeCloseTo(0.25, 2);
  });
});

describe('parse.suggestUnitFromExtent (Layer 1 unit sanity)', () => {
  it('flags a mm header on a metre-scale drawing', () => {
    const s = suggestUnitFromExtent({ minX: 0, minY: 0, maxX: 73, maxY: 25 }, 'mm');
    expect(s).not.toBeNull();
    expect(s!.suggested).toBe('m');
    expect(s!.suggestedExtentM).toBeCloseTo(73, 0);
  });
  it('does not nag when the unit is already plausible', () => {
    expect(suggestUnitFromExtent({ minX: 0, minY: 0, maxX: 30, maxY: 18 }, 'm')).toBeNull();
  });
  it('suggests mm — not the 10x-inflated cm — for a small plan misread as metres', () => {
    // raw 7300 units, header says metres → 7300 m implausible. cm reads 73 m
    // (closer to a "typical" 30 m) but mm reads 7.3 m, the real (finer) unit.
    const s = suggestUnitFromExtent({ minX: 0, minY: 0, maxX: 7300, maxY: 5000 }, 'm');
    expect(s).not.toBeNull();
    expect(s!.suggested).toBe('mm');
    expect(s!.suggestedExtentM).toBeCloseTo(7.3, 6);
  });
  it('keeps the closeness pick for a genuinely medium plan (no over-correction)', () => {
    // raw 5000, header metres → 5000 m implausible; cm reads 50 m (a large but
    // real building), mm reads 5 m. 50 m is within normal size, so keep cm.
    const s = suggestUnitFromExtent({ minX: 0, minY: 0, maxX: 5000, maxY: 3000 }, 'm');
    expect(s).not.toBeNull();
    expect(s!.suggested).toBe('cm');
    expect(s!.suggestedExtentM).toBeCloseTo(50, 6);
  });
});

describe('infer — cluster / cropDoc', () => {
  it('clusters near values', () => {
    const c = cluster([0, 0.1, 5, 5.05, 10], 0.3);
    expect(c.length).toBe(3);
    expect(c[0]).toBeCloseTo(0.05, 6);
    expect(c[1]).toBeCloseTo(5.025, 6);
    expect(c[2]).toBeCloseTo(10, 6);
  });
  it('cropDoc keeps only entities fully inside the window', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '8', 'A', '10', '1', '20', '1', '11', '2', '21', '2',
      '0', 'LINE', '8', 'A', '10', '90', '20', '90', '11', '95', '21', '95',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\r\n');
    const doc = parseCadDxf(dxf, 'c.dxf');
    expect(doc.entities.length).toBe(2);
    const cropped = cropDoc(doc, { x0: 0, x1: 10, y0: 0, y1: 10 });
    expect(cropped.entities.length).toBe(1);
    expect(cropped.bbox).toEqual({ minX: 1, minY: 1, maxX: 2, maxY: 2 });
  });
});

describe('infer — pruneBeamsDisconnectedFromColumns (Layer 2)', () => {
  it('drops a floating annotation beam, keeps the column-connected one', () => {
    const p = emptyPlan();
    p.columns = [{ at: { x: 0, y: 0 }, sizeSource: 'default' }, { at: { x: 4, y: 0 }, sizeSource: 'default' }];
    p.beams = [
      { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },     // connects both columns
      { a: { x: 20, y: 20 }, b: { x: 22, y: 20 } }, // floating leader stroke
    ];
    const dropped = pruneBeamsDisconnectedFromColumns(p, 0.05);
    expect(dropped).toBe(1);
    expect(p.beams.length).toBe(1);
  });
});

describe('infer — panelsFromBeamGrid + snap (Layer 2, opt-in)', () => {
  it('infers one slab panel from a 4-column / 4-beam square', () => {
    const p = gridPlan(false);
    const { slabs, xs, ys } = panelsFromBeamGrid(p.beams, p.columns);
    expect(slabs.length).toBe(1);
    expect(xs.length).toBe(2);
    expect(ys.length).toBe(2);
  });
  it('snaps a slightly-off panel corner to the column axis', () => {
    const slabs = [{ outline: [{ x: 0.1, y: 0.1 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], isQuad: true, isRectilinear: true }];
    const cols = [{ at: { x: 0, y: 0 }, sizeSource: 'default' as const }];
    const n = snapPanelCornersToColumns(slabs, cols, 0.25);
    expect(n).toBe(1);
    expect(slabs[0].outline[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('infer — pruneFloating (Layer 2)', () => {
  it('removes an island disconnected from the supported component', () => {
    const snap = {
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }], [3, { id: 3, x: 99, y: 99 }], [4, { id: 4, x: 99, y: 99, z: 3 }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }], [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
      quads: [], supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }]], loads: [],
    } as unknown as ModelSnapshot;
    const removed = pruneFloating(snap);
    expect(removed.nodes).toBe(2);
    expect(removed.elements).toBe(1);
    expect(snap.nodes.length).toBe(2);
  });
});

describe('diagnostics.diagnoseDraft (Layer 1)', () => {
  it('passes a healthy drawn-slab grid draft', () => {
    const draft = buildDraft({ plan: gridPlan(true), assumptions: assumptions(), source: SOURCE });
    const d = diagnoseDraft(draft);
    expect(d.level).not.toBe('error');
    expect(d.solvableShape).toBe(true);
  });
  it('flags a degenerate collapse (≤2 nodes)', () => {
    const fake = {
      snapshot: { nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }]], elements: [], quads: [], supports: [], loads: [] },
      counts: { columns: 0, beams: 0, slabQuads: 0, slabsIsolated: 0, slabsSkipped: 0 },
      warnings: [],
    } as unknown as RcDraftResult;
    const d = diagnoseDraft(fake);
    expect(d.level).toBe('error');
    expect(d.checks.some((c) => c.id === 'degenerate')).toBe(true);
  });
  it('flags zero slabs / no area loads', () => {
    const draft = buildDraft({ plan: gridPlan(false), assumptions: assumptions(), source: SOURCE });
    const d = diagnoseDraft(draft);
    expect(d.checks.some((c) => c.id === 'noSlabs')).toBe(true);
  });
});

describe('draft-preview.draftPreviewStats (Layer 1)', () => {
  it('categorizes a generated 2-floor draft', () => {
    const draft = buildDraft({ plan: gridPlan(true), assumptions: assumptions({ nFloors: 2, storyHeights: [3, 3] }), source: SOURCE });
    const s = draftPreviewStats(draft.snapshot);
    expect(s.columns).toBeGreaterThan(0);
    expect(s.beams).toBeGreaterThan(0);
    expect(s.slabQuads).toBeGreaterThan(0);
    expect(s.levels).toBe(3); // base + 2 floors
    expect(s.orphans).toBe(0);
  });
});

describe('draft-build.buildDraft', () => {
  it('single-plan, no inference == generateRcDraft (counts identical)', () => {
    const plan = gridPlan(true);
    const a = assumptions();
    const direct = generateRcDraft(plan, a, SOURCE);
    const built = buildDraft({ plan, assumptions: a, source: SOURCE });
    expect(built.counts).toEqual(direct.counts);
  });

  it('inferSlabPanels adds slabs to a slab-less plan and records provenance', () => {
    const built = buildDraft({
      plan: gridPlan(false),
      assumptions: assumptions(),
      source: SOURCE,
      inference: { inferSlabPanels: true, snapPanelsToColumns: true, pruneFloatingMembers: true },
    });
    expect(built.counts.slabQuads).toBeGreaterThan(0);
    expect(built.warnings.some((w) => w.message.startsWith('inferredSlabPanels:'))).toBe(true);
    expect(built.provenance.assumptions.some((s) => /INFERRED from the beam grid/.test(s))).toBe(true);
  });

  it('multi-floor: different geometry by floor range, single connected model', () => {
    // Floors 1-2 from plan A (with slab), 3-4 from plan B (also slab, same
    // column footprint so columns continue and weld between ranges).
    const a = assumptions({ nFloors: 4, storyHeights: [3, 3, 3, 3] });
    const built = buildDraft({
      floorPlans: [
        { plan: gridPlan(true), fromFloor: 1, toFloor: 2, label: 'A' },
        { plan: gridPlan(true), fromFloor: 3, toFloor: 4, label: 'B' },
      ],
      assumptions: a,
      source: SOURCE,
    });
    const s = draftPreviewStats(built.snapshot);
    expect(s.levels).toBe(5); // base + 4 floors
    expect(built.provenance.assumptions.some((x) => /Per-floor plans/.test(x))).toBe(true);
    const d = diagnoseDraft(built);
    expect(d.level).not.toBe('error'); // connected, supported
  });

  it('multi-floor: section schedules resolve against BUILDING floors, not range-local', () => {
    // Ranges A(1-2)/B(3-4). A column schedule authored for building floors 3-4
    // must land on range B. Without per-range rebasing, range B resolved its own
    // local floors 1-2 so the 3-4 row silently matched nothing (0 assignments),
    // while a 1-2 row would have leaked onto the upper block.
    const schedules: SectionScheduleEntry[] = [
      { kind: 'column', mark: '*', fromFloor: 3, toFloor: 4, b: 0.6, h: 0.6, source: 'wizard' },
    ];
    const built = buildDraft({
      floorPlans: [
        { plan: gridPlan(true), fromFloor: 1, toFloor: 2, label: 'A' },
        { plan: gridPlan(true), fromFloor: 3, toFloor: 4, label: 'B' },
      ],
      assumptions: assumptions({ nFloors: 4, storyHeights: [3, 3, 3, 3], schedules }),
      source: SOURCE,
    });
    expect(built.counts.scheduleAssignments).toBeGreaterThan(0);
    expect(built.counts.specSections.schedule).toBeGreaterThan(0);
  });

  it('multi-floor: a mid-height gap that strands an upper block is reported, not silently deleted', () => {
    // Floors 1-2 (grounded) and 4-5, floor 3 uncovered. The upper block never
    // welds to the lower one (a floor-height apart), so it is disconnected from
    // support and pruned entirely — that must surface as an error, not vanish.
    const built = buildDraft({
      floorPlans: [
        { plan: gridPlan(true), fromFloor: 1, toFloor: 2, label: 'A' },
        { plan: gridPlan(true), fromFloor: 4, toFloor: 5, label: 'B' },
      ],
      assumptions: assumptions({ nFloors: 5, storyHeights: [3, 3, 3, 3, 3] }),
      source: SOURCE,
      allowFloorGaps: true,
    });
    const pruned = built.warnings.find((w) => w.message.startsWith('floorRangePruned:'));
    expect(pruned).toBeDefined();
    expect(pruned!.message).toContain('B');
    // Only the grounded lower range survives — not all 5 floors + base.
    expect(draftPreviewStats(built.snapshot).levels).toBeLessThan(6);
  });
});

describe('cropDoc — window normalization (Layer 2)', () => {
  it('normalizes reversed bounds (x0>x1 / y0>y1) to the same region as normal order', () => {
    const doc = parseCadDxf(buildStabileoTemplateDxf(), 'stabileo-template.dxf');
    const bb = doc.bbox!;
    const normal = cropDoc(doc, { x0: bb.minX, x1: bb.maxX, y0: bb.minY, y1: bb.maxY });
    const reversed = cropDoc(doc, { x0: bb.maxX, x1: bb.minX, y0: bb.maxY, y1: bb.minY });
    expect(normal.entities.length).toBeGreaterThan(0);
    expect(reversed.entities.length).toBe(normal.entities.length); // was 0 before normalization
  });
});

describe('Stabileo template — full-capacity draft (PR [14] positive control)', () => {
  const buildFromTemplate = () => {
    const doc = parseCadDxf(buildStabileoTemplateDxf(), 'stabileo-template.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    return { doc, plan };
  };

  it('parses V-PERIM as a closed footprint polygon (Layer 4 geomSource)', () => {
    const { plan } = buildFromTemplate();
    const vp = plan.beams.find((b) => b.mark === 'V-PERIM');
    expect(vp?.geomSource).toBe('polygon');
    expect(vp?.width).toBeCloseTo(0.20, 2);
  });

  it('generates a clean (non-error, solvable) diagnostics verdict', () => {
    const { plan } = buildFromTemplate();
    const draft = buildDraft({ plan, assumptions: assumptions({ deadLoad: 3, liveLoad: 2 }), source: SOURCE });
    const d = diagnoseDraft(draft);
    expect(d.level).not.toBe('error');
    expect(d.solvableShape).toBe(true);
  });
});
