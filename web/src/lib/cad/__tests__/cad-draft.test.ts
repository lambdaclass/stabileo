import { describe, it, expect, vi } from 'vitest';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { generateRcDraft, rectJ } from '../draft';
import { buildDraft } from '../draft-build';
import type { ArchPlan, RcDraftAssumptions } from '../types';
import { simplePlanDxf } from './dxf-fixture';
import { beamThrough } from '../../engine/mesh-weld';
import { buildSolverInput3D } from '../../engine/solver-service';
import { solve3D } from '../../engine/wasm-solver';
import * as shellMesh from '../../engine/shell-mesh-gen';

const SOURCE = { fileName: 'plan.dxf', importedAtIso: '2026-06-09T12:00:00.000Z' };

function fixturePlan(): ArchPlan {
  const doc = parseCadDxf(simplePlanDxf(), 'plan.dxf');
  const mappings = suggestLayerMappings(doc, 'm');
  return extractArchPlan(doc, mappings, 'm');
}

function assumptions(over: Partial<RcDraftAssumptions> = {}): RcDraftAssumptions {
  return {
    nFloors: 2,
    storyHeights: [3, 3],
    concreteGrade: 'H-30',
    columnSection: { b: 0.35, h: 0.35 },
    beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.15,
    wallThickness: 0.2,
    baseSupport: 'fixed3d',
    deadLoad: 3,
    liveLoad: 2,
    generateCombos: true,
    meshSlabs: true,
    meshMode: 'fixedDivisions', meshDivisions: 2,
    splitBeams: true,
    snapTolerance: 0.01,
    ...over,
  };
}

/** Snapshot → the Map-shaped model object the 3D solver input builder takes. */
function snapshotToModelShape(snap: ReturnType<typeof generateRcDraft>['snapshot']) {
  return {
    name: snap.name ?? '',
    nodes: new Map(snap.nodes),
    materials: new Map(snap.materials),
    sections: new Map(snap.sections),
    elements: new Map(snap.elements),
    supports: new Map(snap.supports),
    loads: snap.loads,
    loadCases: snap.loadCases ?? [],
    combinations: snap.combinations ?? [],
    plates: new Map(snap.plates ?? []),
    quads: new Map(snap.quads ?? []),
    constraints: snap.constraints ?? [],
    connectors: new Map(snap.connectors ?? []),
  };
}

describe('generateRcDraft — golden test on the simple architectural plan', () => {
  const plan = fixturePlan();
  const a = assumptions();
  const draft = generateRcDraft(plan, a, SOURCE);

  it('generates columns for every plan column on every story', () => {
    // 5 columns (4 rects + 1 insert) × 2 stories.
    expect(draft.counts.columns).toBe(10);
  });

  it('generates beams split at columns, then at shell mesh nodes', () => {
    // 10 base beam segments (perimeter split at the mid-bottom column). The
    // opening forces extra slab mesh lines (x at 4,5; y at 3.5,4.5) so more
    // slab edge nodes land on the perimeter beams → 26 splits; 10 + 26 = 36.
    expect(draft.counts.beamsSplit).toBe(26);
    expect(draft.counts.beams).toBe(36);
  });

  it('meshes each slab with its opening and subdivides the wall at the shared stations', () => {
    expect(draft.counts.slabQuads).toBe(38);
    expect(draft.counts.openingsCutFromSlabs).toBe(1);
    expect(draft.counts.wallQuads).toBe(8);
  });

  it('uses CAD column sizes where detected and defaults elsewhere', () => {
    const sectionNames = draft.snapshot.sections.map(([, s]) => s.name);
    expect(sectionNames).toContain('RC Col 35x35');        // default
    expect(sectionNames).toContain('RC Beam 20x50');       // default
    expect(sectionNames).toContain('RC Col 30x30 (CAD)');  // corner rects
    expect(sectionNames).toContain('RC Col 40x40 (CAD)');  // block insert
    // Section properties follow the rectangle formulas.
    const cad30 = draft.snapshot.sections.find(([, s]) => s.name === 'RC Col 30x30 (CAD)')![1];
    expect(cad30.a).toBeCloseTo(0.09, 9);
    expect(cad30.iy).toBeCloseTo((0.3 * 0.3 ** 3) / 12, 12);
    expect(cad30.j).toBeCloseTo(rectJ(0.3, 0.3), 12);
  });

  it('supports every base-level column and wall node, nothing else', () => {
    expect(draft.counts.supports).toBe(10);
    const nodeZ = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n.z ?? 0]));
    for (const [, sup] of draft.snapshot.supports) {
      expect(nodeZ.get(sup.nodeId)).toBe(0);
      expect(sup.type).toBe('fixed3d');
    }
  });

  it('applies only explicit user D/L area loads on slab quads', () => {
    expect(draft.counts.loads).toBe(76);
    for (const load of draft.snapshot.loads) {
      expect(load.type).toBe('surface3d');
      expect([1, 2]).toContain((load.data as { caseId: number }).caseId);
    }
    // Only D and L cases; never wind/seismic/snow.
    expect((draft.snapshot.loadCases ?? []).map((c) => c.type).sort()).toEqual(['D', 'L']);
  });

  it('generates only the two simple explicit combinations', () => {
    expect(draft.snapshot.combinations!.map((c) => c.name)).toEqual(['1.4 D', '1.2 D + 1.6 L']);
  });

  it('marks the snapshot as a CAD-derived unreviewed draft with the replicated-plan assumption', () => {
    expect(draft.provenance.status).toBe('cad-draft-unreviewed');
    expect(draft.snapshot.provenance).toEqual(draft.provenance);
    expect(draft.provenance.assumptions.some((s) =>
      s.includes('One architectural floor plan replicated across all 2 floor(s)'))).toBe(true);
    expect(draft.provenance.assumptions.some((s) => s.includes('Self-weight is NOT included'))).toBe(true);
    expect(draft.provenance.layerMappings.length).toBe(plan.mappings.length);
  });

  it('reports the opening cut from the slab and the coarse wall mesh', () => {
    const msgs = draft.warnings.map((w) => w.message);
    expect(msgs).toContain('openingsCut:1');
    expect(msgs).toContain('wallsCoarseMesh');
    // No quad centroid lies inside the opening [4,3.5]-[5,4.5].
    const nodes = new Map(draft.snapshot.nodes.map(([id, nn]) => [id, nn]));
    for (const [, q] of draft.snapshot.quads ?? []) {
      const cx = q.nodes.reduce((s, nid) => s + (nodes.get(nid)!.x), 0) / 4;
      const cy = q.nodes.reduce((s, nid) => s + (nodes.get(nid)!.y), 0) / 4;
      const inOpening = cx > 4 && cx < 5 && cy > 3.5 && cy < 4.5;
      expect(inOpening).toBe(false);
    }
  });

  it('reinforcement is never generated', () => {
    for (const [, el] of draft.snapshot.elements) {
      expect((el as { reinforcement?: unknown }).reinforcement).toBeUndefined();
    }
  });
});

describe('generateRcDraft — node sharing', () => {
  it('with splitBeams: no beam passes through any shell node unsplit', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions(), SOURCE);
    const nodes = new Map(draft.snapshot.nodes);
    const elements = [...new Map(draft.snapshot.elements).values()];
    for (const [, quad] of draft.snapshot.quads!) {
      for (const nid of quad.nodes) {
        const n = nodes.get(nid)!;
        const hit = beamThrough((id) => nodes.get(id), elements, n.x, n.y, n.z ?? 0, 0.01);
        expect(hit).toBeNull();
      }
    }
  });

  it('without splitBeams: shell edge nodes do sit on beam interiors (and stay unsplit)', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions({ splitBeams: false }), SOURCE);
    expect(draft.counts.beamsSplit).toBe(0);
    const nodes = new Map(draft.snapshot.nodes);
    const elements = [...new Map(draft.snapshot.elements).values()];
    let through = 0;
    for (const [, quad] of draft.snapshot.quads!) {
      for (const nid of quad.nodes) {
        const n = nodes.get(nid)!;
        if (beamThrough((id) => nodes.get(id), elements, n.x, n.y, n.z ?? 0, 0.01)) through++;
      }
    }
    expect(through).toBeGreaterThan(0);
  });

  it('slab corner nodes weld to column nodes (no duplicate nodes)', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions(), SOURCE);
    const seen = new Set<string>();
    for (const [, n] of draft.snapshot.nodes) {
      const key = `${n.x.toFixed(4)}|${n.y.toFixed(4)}|${(n.z ?? 0).toFixed(4)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('generateRcDraft — honesty paths', () => {
  it.each([1e-308, Number.MIN_VALUE])('caps overflowing bilinear divisions for a finite target %s', (meshTargetSize) => {
    // A rotated square takes the bilinear path. Inspect the requested density
    // at the mesher boundary without allocating a 65,536-cell draft.
    const outline = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 20 }, { x: -10, y: 10 }];
    const plan: ArchPlan = {
      ...fixturePlan(), columns: [], walls: [], openings: [],
      beams: [{ a: outline[0], b: outline[1] }],
      slabs: [{ outline, isQuad: true, isRectilinear: false }],
    };
    const mesh = vi.spyOn(shellMesh, 'buildBilinearQuadGrid').mockReturnValue({ nodeGrid: [], newNodes: 0, quadCount: 0 });
    try {
      const draft = generateRcDraft(plan, assumptions({
        nFloors: 1, storyHeights: [3], meshMode: 'targetSize', meshTargetSize, splitBeams: false,
      }), SOURCE);
      expect(mesh).toHaveBeenCalledTimes(1);
      expect(mesh.mock.calls[0].slice(1, 3)).toEqual([shellMesh.MAX_DIVISIONS_PER_AXIS, shellMesh.MAX_DIVISIONS_PER_AXIS]);
      expect(draft.warnings.map(w => w.message)).toContain('meshCapped:2');
    } finally {
      mesh.mockRestore();
    }
  });

  it('unmeshed slabs stay coarse but the opening is still cut, and no beams are split', () => {
    const draft = generateRcDraft(
      fixturePlan(),
      assumptions({ meshSlabs: false, splitBeams: false }),
      SOURCE,
    );
    // With an opening present even an "unmeshed" slab must split into the
    // minimal cells that leave the hole (a single quad cannot have a hole):
    // 3×3 breakpoint cells minus the 1 in the opening = 8 × 2 floors = 16.
    expect(draft.counts.slabQuads).toBe(16);
    expect(draft.counts.openingsCutFromSlabs).toBe(1);
    expect(draft.counts.beamsSplit).toBe(0);
  });

  it('without openings, an unmeshed slab is a single quad per floor', () => {
    const plan = fixturePlan();
    plan.openings = [];
    const draft = generateRcDraft(plan, assumptions({ meshSlabs: false, splitBeams: false }), SOURCE);
    expect(draft.counts.slabQuads).toBe(2); // 1 per floor, no hole
    expect(draft.counts.openingsDetected).toBe(0);
  });

  it('zero loads → no load entries (nothing invented)', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions({ deadLoad: 0, liveLoad: 0 }), SOURCE);
    expect(draft.counts.loads).toBe(0);
  });

  it('roof live load Lr: top floor slabs carry Lr, lower floors carry L', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions({ roofLiveLoad: 1.0 }), SOURCE);
    expect((draft.snapshot.loadCases ?? []).map((c) => c.type).sort()).toEqual(['D', 'L', 'Lr']);

    const nodeZ = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n.z ?? 0]));
    const quadTopZ = new Map(
      (draft.snapshot.quads ?? []).map(([id, q]) => [id, Math.max(...q.nodes.map((n) => nodeZ.get(n) ?? 0))]),
    );
    for (const load of draft.snapshot.loads) {
      const d = load.data as { quadId: number; caseId: number };
      const z = quadTopZ.get(d.quadId) ?? 0;
      if (d.caseId === 3) expect(z).toBeCloseTo(6, 6);       // Lr only on roof (z = 3+3)
      if (d.caseId === 2) expect(z).toBeCloseTo(3, 6);       // L only on floor 1
    }
    // Roof slabs have NO L load; floor slabs have NO Lr load.
    const caseIds = draft.snapshot.loads.map((l) => (l.data as { caseId: number }).caseId);
    expect(caseIds).toContain(2);
    expect(caseIds).toContain(3);

    // Lr combos generated.
    expect(draft.snapshot.combinations!.map((c) => c.name)).toEqual([
      '1.4 D', '1.2 D + 1.6 L + 0.5 Lr', '1.2 D + 0.5 L + 1.6 Lr',
    ]);
    expect(draft.provenance.assumptions.some((s) => s.includes('roof Lr = 1'))).toBe(true);
  });

  it('without roofLiveLoad the behavior is unchanged (L everywhere, 2 combos)', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions(), SOURCE);
    expect((draft.snapshot.loadCases ?? []).length).toBe(2);
    expect(draft.snapshot.combinations!.length).toBe(2);
  });

  it('combos off → no combinations', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions({ generateCombos: false }), SOURCE);
    expect(draft.snapshot.combinations).toEqual([]);
    expect(draft.provenance.assumptions).toContain('No load combinations generated.');
  });

  it('rectilinear non-quad slabs are decomposed deterministically; others skipped', () => {
    const base = fixturePlan();
    const lShape: ArchPlan = {
      ...base,
      walls: [],
      slabs: [
        {
          outline: [
            { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 },
            { x: 3, y: 3 }, { x: 3, y: 5 }, { x: 0, y: 5 },
          ],
          isQuad: false,
          isRectilinear: true,
        },
        {
          outline: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }],
          isQuad: false,
          isRectilinear: false,
        },
      ],
    };
    const draft = generateRcDraft(lShape, assumptions({ nFloors: 1, storyHeights: [3] }), SOURCE);
    expect(draft.counts.slabsSkipped).toBe(1);
    expect(draft.warnings.map((w) => w.message)).toContain('slabsSkippedNonRect:1');
    expect(draft.warnings.map((w) => w.message)).toContain('slabsDecomposed:1');
    // L-shape = 2 rects × 2×2 mesh = 8 quads on the single floor.
    expect(draft.counts.slabQuads).toBe(8);
  });

  it('circular columns produce the flagged warning', () => {
    const base = fixturePlan();
    const withCircle: ArchPlan = {
      ...base,
      columns: [...base.columns, { at: { x: 2, y: 4 }, b: 0.35, h: 0.35, sizeSource: 'circle' }],
    };
    const draft = generateRcDraft(withCircle, assumptions(), SOURCE);
    expect(draft.warnings.map((w) => w.message)).toContain('circularColumnsAsSquare');
  });
});

describe('generateRcDraft — the draft solves', () => {
  it('solves in the 3D engine with finite displacements and reactions', () => {
    const draft = generateRcDraft(fixturePlan(), assumptions(), SOURCE);
    const model = snapshotToModelShape(draft.snapshot);
    const input = buildSolverInput3D(model as never);
    expect(input).not.toBeNull();
    const results = solve3D(input!);
    expect(results).toBeDefined();
    const disp = results.displacements ?? [];
    expect(disp.length).toBeGreaterThan(0);
    for (const d of disp) {
      for (const v of Object.values(d)) {
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
    // Sanity: slab area loads produce downward deflection somewhere.
    const minUz = Math.min(...disp.map((d: { uz?: number }) => d.uz ?? 0));
    expect(minUz).toBeLessThan(0);
  });

  it('a degenerate target-size mesh (0) generates and still solves — no crash', () => {
    // REGRESSION: target 0 used to make the slab mesher loop unbounded and
    // crash the tab on Generate Draft. It must now terminate (fall back to the
    // default cell size) and still produce a finite, solvable model.
    const draft = generateRcDraft(
      fixturePlan(),
      assumptions({ meshSlabs: true, meshMode: 'targetSize', meshTargetSize: 0 }),
      SOURCE,
    );
    expect(draft.counts.slabQuads).toBeGreaterThan(0);
    const input = buildSolverInput3D(snapshotToModelShape(draft.snapshot) as never);
    expect(input).not.toBeNull();
    const results = solve3D(input!);
    for (const d of results.displacements ?? []) {
      for (const v of Object.values(d)) {
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

it.each([
  { meshMode: 'fixedDivisions' },
  { meshMode: 'targetSize', meshTargetSize: 0 },
] as const)('#2409 a CAD draft shares its slab and wall stations in $meshMode mode', options => {
  const draft = generateRcDraft(fixturePlan(), assumptions(options), SOURCE);
  const model = snapshotToModelShape(draft.snapshot);
  const ids = (quads: typeof draft.snapshot.quads) => new Set((quads ?? []).flatMap(([, q]) => q.nodes)
    .filter(id => model.nodes.get(id)!.z === 3 && model.nodes.get(id)!.y === 2.1));
  const slabs = ids(draft.snapshot.quads!.slice(0, draft.counts.slabQuads));
  const walls = ids(draft.snapshot.quads!.slice(draft.counts.slabQuads));
  expect(slabs.size).toBeGreaterThan(2);
  expect(slabs).toEqual(walls);
  const input = buildSolverInput3D(model as never);
  expect(input).not.toBeNull();
  expect(solve3D(input!).reactions.reduce((sum, support) => sum + support.fz, 0)).toBeCloseTo((6 * 5 - 1) * 2 * (3 + 2), 8);
});

it('#2429 refuses an oblique CAD wall when slab meshing is disabled', () => {
  const outline = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  const plan: ArchPlan = {
    ...fixturePlan(), columns: outline.map(at => ({ at, sizeSource: 'default' })), openings: [],
    beams: [{ a: outline[0]!, b: outline[1]! }],
    walls: [{ a: outline[0]!, b: outline[2]!, thicknessSource: 'default' }],
    slabs: [{ outline, isQuad: true, isRectilinear: true }],
  };
  for (const meshMode of ['fixedDivisions', 'targetSize'] as const) {
    const draft = generateRcDraft(plan, assumptions({
      nFloors: 1, storyHeights: [3], meshMode, meshTargetSize: 2, meshSlabs: false, deadLoad: 1, liveLoad: 0, roofLiveLoad: 0,
    }), SOURCE);
    expect(draft.counts.slabQuads).toBe(1);
    const quads = draft.snapshot.quads!;
    const slabs = quads.slice(0, 1), walls = quads.slice(1);
    const slabNodes = new Set(slabs.flatMap(([, q]) => q.nodes));
    const wallNodes = new Set(walls.flatMap(([, q]) => q.nodes));
    const edges = (cells: typeof quads) => cells.flatMap(([, { nodes }]) => nodes.map((a, i) => {
      const b = nodes[(i + 1) % nodes.length]!;
      return [Math.min(a, b), Math.max(a, b)].join(':');
    }));
    expect([...wallNodes].filter(id => slabNodes.has(id)).length).toBeGreaterThanOrEqual(2);
    const slabEdges = new Set(edges(slabs));
    expect(edges(walls).some(edge => slabEdges.has(edge))).toBe(false);
    let refusal: string | undefined;
    try {
      const input = buildSolverInput3D(snapshotToModelShape(draft.snapshot) as never);
      expect(input).not.toBeNull();
      const result = solve3D(input!);
      expect(result.reactions.reduce((sum, support) => sum + support.fz, 0)).toBeCloseTo(4 * 4, 8);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      refusal = error.message;
    }
    expect.soft(refusal ?? 'returned a result', meshMode).toMatch(/wall.*slab/i);
  }
});

function checkWallTrace(meshMode: 'fixedDivisions' | 'targetSize', trace: 'diagonal' | 'interior') {
  const outline = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  const start = trace === 'diagonal' ? outline[0]! : { x: 1, y: 1 };
  const end = trace === 'diagonal' ? outline[2]! : { x: 3, y: 2 };
  const plan: ArchPlan = {
    ...fixturePlan(),
    columns: trace === 'diagonal' ? outline.map(at => ({ at, sizeSource: 'default' })) : [],
    openings: [],
    beams: [{ a: outline[0]!, b: outline[1]! }],
    walls: [{ a: start, b: end, thicknessSource: 'default' }],
    slabs: [{ outline, isQuad: true, isRectilinear: true }],
  };
  const draft = generateRcDraft(plan, assumptions({
    nFloors: 1, storyHeights: [3], meshMode, meshTargetSize: 2, deadLoad: 1, liveLoad: 0, roofLiveLoad: 0,
  }), SOURCE);
  const model = snapshotToModelShape(draft.snapshot);
  const quads = draft.snapshot.quads!;
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const slabCells = [...quads.slice(0, draft.counts.slabQuads), ...(draft.snapshot.plates ?? [])];
  const slabEdges = new Set(slabCells.flatMap(([, { nodes }]) =>
    nodes.map((a, i) => key(a, nodes[(i + 1) % nodes.length]!))));
  const wallCells = quads.slice(draft.counts.slabQuads);
  const topEdges = wallCells.map(([, { nodes }]) => nodes.slice(2));
  for (const [a, b] of topEdges) expect.soft(slabEdges.has(key(a!, b!))).toBe(true);
  expect(topEdges.reduce((sum, [a, b]) => {
    const p = model.nodes.get(a!)!, q = model.nodes.get(b!)!;
    return sum + Math.hypot(p.x - q.x, p.y - q.y);
  }, 0)).toBeCloseTo(Math.hypot(end.x - start.x, end.y - start.y), 8);

  const input = buildSolverInput3D(model as never);
  expect(input).not.toBeNull();
  const { reactions } = solve3D(input!);
  const total = reactions.reduce((sum, r) => sum + r.fz, 0);
  const mx = reactions.reduce((sum, r) => sum + r.mx + model.nodes.get(r.nodeId)!.y * r.fz, 0);
  const my = reactions.reduce((sum, r) => sum + r.my - model.nodes.get(r.nodeId)!.x * r.fz, 0);
  expect(total).toBeCloseTo(4 * 4, 8);
  expect(mx).toBeCloseTo(4 * 4 * 2, 8);
  expect(my).toBeCloseTo(-4 * 4 * 2, 8);
  if (trace === 'interior') {
    const base = new Set(wallCells.flatMap(([, { nodes }]) => nodes.slice(0, 2)));
    expect(new Set(reactions.map(r => r.nodeId))).toEqual(base);
    expect(reactions.reduce((sum, r) => sum + (base.has(r.nodeId) ? r.fz : 0), 0)).toBeCloseTo(4 * 4, 8);
  }
}

describe('Continuous shared edges resolve the former refusal', () => {
  it('#2429 refuses an oblique CAD wall supported by isolated shared nodes', () => {
    for (const meshMode of ['fixedDivisions', 'targetSize'] as const) checkWallTrace(meshMode, 'diagonal');
  });
});

it.each(['fixedDivisions', 'targetSize'] as const)('#2429 %s meshes the full interior wall trace before transferring pressure', meshMode => {
  checkWallTrace(meshMode, 'interior');
});

const reviewOutline = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
const reviewSettings = assumptions({ nFloors: 1, storyHeights: [3], liveLoad: 0, generateCombos: false });

function reviewPlan(): ArchPlan {
  return {
    ...fixturePlan(), openings: [],
    columns: [reviewOutline[0]!, reviewOutline[1]!].map(at => ({ at, sizeSource: 'default' })),
    beams: [{ a: reviewOutline[0]!, b: reviewOutline[1]! }],
    walls: [{ a: { x: 1, y: 1 }, b: { x: 3, y: 3 }, thicknessSource: 'default' }],
    slabs: [{ outline: reviewOutline, isQuad: true, isRectilinear: true }],
  };
}

it.each([0, 0.002, 0.009, 0.011])('#2607 range columns join at CAD tolerance with offset %s', offset => {
  const lower = reviewPlan();
  const end = { x: 4 + offset, y: 0 };
  const upper: ArchPlan = {
    ...lower, slabs: [], walls: [],
    columns: [reviewOutline[0]!, end].map(at => ({ at, sizeSource: 'default' })),
    beams: [{ a: reviewOutline[0]!, b: end }],
  };
  const draft = buildDraft({
    floorPlans: [{ plan: lower, fromFloor: 1, toFloor: 1 }, { plan: upper, fromFloor: 2, toFloor: 2 }],
    assumptions: { ...reviewSettings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
  });
  const model = snapshotToModelShape(draft.snapshot);
  const columns = [...model.elements.values()].filter(e =>
    model.nodes.get(e.nodeI)!.z !== model.nodes.get(e.nodeJ)!.z && model.nodes.get(e.nodeJ)!.x > 3);
  const bottom = columns.find(e => model.nodes.get(e.nodeJ)!.z === 3);
  const top = columns.find(e => model.nodes.get(e.nodeJ)!.z === 6);
  expect(draft.counts.columns).toBe(4);
  expect(bottom).toBeDefined();
  expect(top).toBeDefined();
  if (offset < reviewSettings.snapTolerance) expect(top!.nodeI).toBe(bottom!.nodeJ);
  else expect(top!.nodeI).not.toBe(bottom!.nodeJ);
});

it('#2607 range assembly preserves mesh vertices within CAD snap distance', () => {
  const lower = reviewPlan();
  lower.walls[0]!.a = { x: 0.002, y: 1 };
  const upper = reviewPlan();
  upper.walls = [];
  upper.slabs = [];
  const settings = { ...reviewSettings, meshMode: 'targetSize' as const, meshTargetSize: 1 };
  const single = generateRcDraft(lower, settings, SOURCE);
  const combined = buildDraft({
    floorPlans: [{ plan: lower, fromFloor: 1, toFloor: 1 }, { plan: upper, fromFloor: 2, toFloor: 2 }],
    assumptions: { ...settings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
  });
  const cells = (draft: typeof single) => {
    const model = snapshotToModelShape(draft.snapshot);
    return [...model.plates.values()].map(p => p.nodes.map(id => {
      const { x, y } = model.nodes.get(id)!;
      return [x, y];
    }));
  };
  const lowerCells = cells(single);
  expect(lowerCells.flat()).toEqual(expect.arrayContaining([[0, 1], [0.002, 1]]));
  expect(cells(combined)).toEqual(lowerCells);
});

it.each(['fixedDivisions', 'targetSize'] as const)('#2607 %s follows the welded endpoints of the slab beam', meshMode => {
  const plan = reviewPlan();
  const left = { x: 0, y: 2.002 }, right = { x: 4, y: 2 };
  plan.columns = [left, right].map(at => ({ at, sizeSource: 'default' }));
  plan.beams.push({ a: { x: 0, y: 2 }, b: right });
  const result = generateRcDraft(plan, { ...reviewSettings, meshMode, meshTargetSize: 1 }, SOURCE);
  const model = snapshotToModelShape(result.snapshot);
  const edgeKey = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)].join(':');
  const slabEdges = new Set([...model.plates.values()].flatMap(({ nodes }) =>
    nodes.map((a, i) => edgeKey(a, nodes[(i + 1) % nodes.length]!))));
  const beams = [...model.elements.values()].filter(e => {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return a.z === b.z && a.y >= 2 && b.y >= 2;
  });
  expect(result.counts.slabTriangles).toBeGreaterThan(0);
  expect(beams.length).toBeGreaterThan(1);
  expect(beams.every(e => slabEdges.has(edgeKey(e.nodeI, e.nodeJ)))).toBe(true);
  const lengths = beams.map(e => {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
  expect(lengths.reduce((a, b) => a + b, 0)).toBeCloseTo(Math.hypot(right.x - left.x, right.y - left.y), 8);
});

it.each([0, 0.002, 0.011])('#2607 wall end outside a conforming slab snaps at offset %s', offset => {
  const plan = reviewPlan();
  const end = { x: 5, y: 3 };
  plan.columns.push({ at: { x: end.x + offset, y: end.y }, sizeSource: 'default' });
  plan.walls = [{ a: { x: 1, y: 1 }, b: end, thicknessSource: 'default' }];
  const draft = generateRcDraft(plan, reviewSettings, SOURCE);
  const model = snapshotToModelShape(draft.snapshot);
  const column = [...model.elements.values()].find(e => model.nodes.get(e.nodeJ)!.x === end.x + offset)!;
  const wallNodes = new Set([...model.quads.values()].flatMap(q => q.nodes));
  expect(wallNodes.has(column.nodeJ)).toBe(offset < reviewSettings.snapTolerance);
  expect(draft.counts.slabTriangles).toBeGreaterThan(0);
  const slabNodes = new Set([...model.plates.values()].flatMap(p => p.nodes));
  expect([...wallNodes].filter(id => slabNodes.has(id)).length).toBeGreaterThan(1);
});

it.each([0.0201, 0.0211])('#2607 floor interface pairs two close column stacks at %s m', last => {
  const plan = (xs: number[]): ArchPlan => ({
    ...reviewPlan(), slabs: [], walls: [],
    columns: xs.map(x => ({ at: { x, y: 0 }, sizeSource: 'default' })),
    beams: xs.slice(0, -1).map(x => ({ a: { x, y: 0 }, b: { x: xs.at(-1)!, y: 0 } })),
  });
  const draft = buildDraft({
    floorPlans: [{ plan: plan([0, 0.011, 4]), fromFloor: 1, toFloor: 1 }, { plan: plan([0.009, last, 4]), fromFloor: 2, toFloor: 2 }],
    assumptions: { ...reviewSettings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
  });
  const model = snapshotToModelShape(draft.snapshot);
  const columns = [...model.elements.values()].filter(({ nodeI, nodeJ }) => model.nodes.get(nodeI)!.z !== model.nodes.get(nodeJ)!.z);
  const lower = new Map(columns.filter(e => model.nodes.get(e.nodeJ)!.z === 3).map(e => [model.nodes.get(e.nodeJ)!.x, e.nodeJ]));
  const upper = new Map(columns.filter(e => model.nodes.get(e.nodeJ)!.z === 6).map(e => [model.nodes.get(e.nodeJ)!.x, e.nodeI]));
  expect(upper.get(4)).toBe(lower.get(4));
  if (last - 0.011 < reviewSettings.snapTolerance) {
    expect(upper.get(0.009)).toBe(lower.get(0));
    expect(upper.get(last)).toBe(lower.get(0.011));
  } else {
    expect(upper.get(0.009)).toBe(lower.get(0.011));
    expect(upper.get(last)).not.toBe(lower.get(0.011));
  }
});

it.each(['fixedDivisions', 'targetSize'] as const)('#2607 %s snaps physical wall ends inside the slab', meshMode => {
  for (const offset of [0, 0.002, 0.011]) {
    const plan = reviewPlan();
    const end = { x: 2, y: 3 };
    plan.columns.push({ at: { x: end.x + offset, y: end.y }, sizeSource: 'default' });
    plan.walls = [{ a: { x: 1, y: 1 }, b: end, thicknessSource: 'default' }];
    const draft = generateRcDraft(plan, { ...reviewSettings, meshMode }, SOURCE);
    const model = snapshotToModelShape(draft.snapshot);
    const column = [...model.elements.values()].find(e => model.nodes.get(e.nodeJ)!.x === end.x + offset)!;
    const slabs = [...model.plates.values(), ...[...model.quads.values()].slice(0, draft.counts.slabQuads)];
    const wallQuads = [...model.quads.values()].slice(draft.counts.slabQuads);
    const wallNodes = new Set(wallQuads.flatMap(q => q.nodes));
    const slabNodes = new Set(slabs.flatMap(p => p.nodes));
    if (offset < reviewSettings.snapTolerance) expect(draft.counts.slabTriangles).toBeGreaterThan(0);
    expect(slabNodes.has(column.nodeJ)).toBe(true);
    expect.soft(wallNodes.has(column.nodeJ), String(offset)).toBe(offset < reviewSettings.snapTolerance);
    if (offset < reviewSettings.snapTolerance) expect([...wallNodes].filter(id => slabNodes.has(id)).length).toBeGreaterThan(1);
  }
});

function bentWallPlan(corner: { x: number; y: number }, secondEnd = corner) {
  const plan = reviewPlan();
  plan.walls = [
    { a: { x: 1, y: 1 }, b: corner, thicknessSource: 'default' },
    { a: secondEnd, b: { x: 3, y: 3 }, thicknessSource: 'default' },
  ];
  return plan;
}

it('#2607 conforming slab meshes preserve authored wall joints within CAD snap tolerance', () => {
  const corner = { x: 2, y: 1.8 };
  for (const meshMode of ['fixedDivisions', 'targetSize'] as const) for (const offset of [0, 0.002, 0.009, 0.011]) {
    const plan = bentWallPlan(corner, { x: corner.x + offset, y: corner.y });
    const settings = { ...reviewSettings, meshMode, meshTargetSize: 2 };
    for (const draft of [generateRcDraft(plan, settings, SOURCE), buildDraft({ plan, assumptions: settings, source: SOURCE })]) {
      expect(draft.counts.slabTriangles, `${meshMode}, offset=${offset}`).toBeGreaterThan(0);
      const model = snapshotToModelShape(draft.snapshot);
      const walls = [...model.quads.values()].slice(draft.counts.slabQuads);
      const incidence = new Map<number, number>();
      for (const wall of walls) for (const id of wall.nodes) incidence.set(id, (incidence.get(id) ?? 0) + 1);
      const near = [...model.nodes.values()].filter(p => Math.hypot(p.x - corner.x, p.y - corner.y) <= offset + 1e-10);
      const plateNodes = new Set([...model.plates.values()].flatMap(plate => plate.nodes));
      for (const z of [0, 3]) {
        const joints = near.filter(p => (p.z ?? 0) === z && (incidence.get(p.id) ?? 0) > 1);
        expect.soft(joints, `${meshMode}, ${offset}, z=${z}`).toHaveLength(offset < settings.snapTolerance ? 1 : 0);
        if (z === 3) for (const joint of joints) expect(plateNodes.has(joint.id)).toBe(true);
      }
    }
  }
});

it('#2607 an upper column prefers a bent wall corner to a closer slab station', () => {
  for (const meshMode of ['fixedDivisions', 'targetSize'] as const) for (const x of [2.006, 2.013]) {
    const corner = { x, y: 2 };
    const lower = bentWallPlan(corner);
    lower.walls[0]!.a = { x: 3, y: 1 };
    const station = { x: 2, y: 2 };
    lower.beams.push({ a: { x: 0, y: 2 }, b: station });
    const at = { x: 2.002, y: 2 };
    const upper = { ...reviewPlan(), walls: [], slabs: [] };
    upper.columns.push({ at, sizeSource: 'default' });
    upper.beams.push({ a: at, b: reviewOutline[0]! });
    const draft = buildDraft({
      floorPlans: [{ plan: lower, fromFloor: 1, toFloor: 1 }, { plan: upper, fromFloor: 2, toFloor: 2 }],
      assumptions: { ...reviewSettings, meshMode, meshTargetSize: 2, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
    });
    const model = snapshotToModelShape(draft.snapshot);
    const upperColumn = [...model.elements.values()].find(({ nodeI, nodeJ }) => {
      const a = model.nodes.get(nodeI)!, b = model.nodes.get(nodeJ)!;
      return a.z === 3 && b.z === 6 && b.y === at.y;
    })!;
    const cornerNode = [...model.nodes.values()].find(p => Math.hypot(p.x - x, p.y - at.y) < 1e-10 && p.z === 3);
    expect(cornerNode, `${meshMode}, corner x=${x}`).toBeDefined();
    const cornerId = cornerNode!.id;
    const slabId = [...model.nodes.values()].find(p => p.x === station.x && p.y === station.y && p.z === 3)!.id;
    expect([...model.quads.values()].filter(q => q.nodes.includes(cornerId))).toHaveLength(2);
    expect([...model.quads.values()].some(q => q.nodes.includes(slabId))).toBe(false);
    expect([...model.plates.values()].some(p => p.nodes.includes(slabId))).toBe(true);
    expect.soft(upperColumn.nodeI, `${meshMode}, corner x=${x}`).toBe(x - at.x < reviewSettings.snapTolerance ? cornerId : slabId);
  }
});

it('#2607 floor ranges join only within the plan distance', () => {
  const plan = (end: { x: number; y: number }): ArchPlan => ({
    ...reviewPlan(), slabs: [], walls: [],
    columns: [end, { x: 4, y: 0 }].map(at => ({ at, sizeSource: 'default' })),
    beams: [{ a: end, b: { x: 4, y: 0 } }],
  });
  for (const [offset, joins] of [[0, true], [0.007, true], [0.008, false]] as const) {
    const draft = buildDraft({
      floorPlans: [
        { plan: plan({ x: 0, y: 0 }), fromFloor: 1, toFloor: 1 },
        { plan: plan({ x: offset, y: offset }), fromFloor: 2, toFloor: 2 },
      ],
      assumptions: { ...reviewSettings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
    });
    const model = snapshotToModelShape(draft.snapshot);
    const columns = [...model.elements.values()].filter(e => model.nodes.get(e.nodeI)!.z !== model.nodes.get(e.nodeJ)!.z);
    const lower = columns.find(e => model.nodes.get(e.nodeJ)!.z === 3 && model.nodes.get(e.nodeJ)!.x === 0)!;
    const upper = columns.find(e => model.nodes.get(e.nodeJ)!.z === 6 && model.nodes.get(e.nodeJ)!.x === offset)!;
    expect.soft(upper.nodeI === lower.nodeJ, String(offset)).toBe(joins);
  }
});

it('#2607 nearby authored wall ends retain their joint at a column', () => {
  const columnAt = { x: 2, y: 1.8 };
  const near = { x: columnAt.x + 0.008, y: columnAt.y };
  for (const meshMode of ['fixedDivisions', 'targetSize'] as const) for (const reverse of [false, true]) {
    for (const [far, joins] of [[0.012, true], [0.019, false]] as const) {
      const plan = bentWallPlan(near, { x: columnAt.x + far, y: columnAt.y });
      plan.columns.push({ at: columnAt, sizeSource: 'default' });
      if (reverse) plan.walls.reverse();
      const settings = { ...reviewSettings, meshMode, meshTargetSize: 2 };
      for (const draft of [generateRcDraft(plan, settings, SOURCE), buildDraft({ plan, assumptions: settings, source: SOURCE })]) {
        const model = snapshotToModelShape(draft.snapshot);
        const column = [...model.elements.values()].find(e => {
          const node = model.nodes.get(e.nodeJ)!;
          return node.x === columnAt.x && node.y === columnAt.y && node.z === 3;
        })!;
        const walls = [...model.quads.values()].slice(draft.counts.slabQuads);
        for (const id of [column.nodeI, column.nodeJ]) {
          expect.soft(walls.filter(wall => wall.nodes.includes(id)), `${meshMode}, reverse=${reverse}, offset=${far}`)
            .toHaveLength(joins ? 2 : 1);
        }
        expect(draft.counts.slabTriangles).toBeGreaterThan(0);
        expect([...model.plates.values()].some(plate => plate.nodes.includes(column.nodeJ))).toBe(true);
      }
    }
  }
});

it.each(['fixedDivisions', 'targetSize'] as const)(
  '#2607 %s preserves the certified beam edges beside an off-line wall end', meshMode => {
    for (const offset of [0, 0.005, 0.011]) {
      const plan = reviewPlan();
      const x = offset === 0 ? 2 : 1.7;
      plan.walls.push({ a: { x, y: -offset }, b: { x, y: -1 }, thicknessSource: 'default' });
      const settings = { ...reviewSettings, meshMode, meshTargetSize: 1 };
      const lower = generateRcDraft(plan, settings, SOURCE);
      const upper = { ...reviewPlan(), slabs: [], walls: [] };
      const stacked = buildDraft({
        floorPlans: [{ plan, fromFloor: 1, toFloor: 1 }, { plan: upper, fromFloor: 2, toFloor: 2 }],
        assumptions: { ...settings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
      });
      for (const draft of [lower, stacked]) {
        const model = snapshotToModelShape(draft.snapshot);
        const key = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)].join(':');
        const slabEdges = [...model.plates.values()].flatMap(({ nodes }) => nodes.flatMap((id, i) => {
          const next = nodes[(i + 1) % nodes.length]!;
          return [id, next].every(n => model.nodes.get(n)!.y === 0) ? [key(id, next)] : [];
        }));
        const beamEdges = [...model.elements.values()].flatMap(({ nodeI, nodeJ }) => {
          const a = model.nodes.get(nodeI)!, b = model.nodes.get(nodeJ)!;
          return a.z === 3 && b.z === 3 && a.y === 0 && b.y === 0 ? [key(nodeI, nodeJ)] : [];
        });
        expect(slabEdges.length).toBeGreaterThan(1);
        expect.soft(beamEdges.sort(), `offset ${offset}`).toEqual(slabEdges.sort());
        const wallNodes = new Set([...model.quads.values()].flatMap(({ nodes }) => nodes));
        const beamStations = [...model.elements.values()].filter(e => {
          const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
          return a.z === 3 && b.z === 3;
        }).flatMap(e => [e.nodeI, e.nodeJ]);
        expect.soft(beamStations.some(id => wallNodes.has(id) && model.nodes.get(id)!.x === x), `offset ${offset}`).toBe(offset === 0);
      }
    }
  },
);

it.each(['fixedDivisions', 'targetSize'] as const)(
  '#2607 %s snaps wall ends beyond the certified portion of the same beam', meshMode => {
    for (const offset of [0, 0.005, 0.009, 0.011]) {
      const plan = reviewPlan();
      const left = { x: -4, y: 0 };
      plan.columns[0] = { at: left, sizeSource: 'default' };
      plan.beams[0] = { a: left, b: reviewOutline[1]! };
      plan.walls.push({ a: { x: -2, y: -offset }, b: { x: -2, y: -2 }, thicknessSource: 'default' });
      const settings = { ...reviewSettings, meshMode, meshTargetSize: 1 };
      const upper = { ...reviewPlan(), slabs: [], walls: [] };
      for (const draft of [
        generateRcDraft(plan, settings, SOURCE),
        buildDraft({
          floorPlans: [{ plan, fromFloor: 1, toFloor: 1 }, { plan: upper, fromFloor: 2, toFloor: 2 }],
          assumptions: { ...settings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
        }),
      ]) {
        const model = snapshotToModelShape(draft.snapshot);
        const wallNodes = new Set([...model.quads.values()].flatMap(({ nodes }) => nodes));
        const hasJoint = [...model.elements.values()].some(({ nodeI, nodeJ }) => {
          const a = model.nodes.get(nodeI)!, b = model.nodes.get(nodeJ)!;
          return a.z === 3 && b.z === 3 && [nodeI, nodeJ].some(id => wallNodes.has(id) && model.nodes.get(id)!.x === -2);
        });
        expect(draft.counts.slabTriangles).toBeGreaterThan(0);
        expect.soft(hasJoint, String(offset)).toBe(offset < settings.snapTolerance);
      }
    }
  },
);

it('#2607 alternating floor matches minimize the total distance', () => {
  const A = { x: 0, y: -0.004 }, B = { x: 0.002, y: 0.006 };
  const L = { x: 0.008, y: 0 }, M = { x: -0.006, y: 0.003 };
  const remote = { x: 0, y: 4 };
  const plan = (points: Array<{ x: number; y: number }>): ArchPlan => ({
    ...reviewPlan(), slabs: [], walls: [],
    columns: [...points, remote].map(at => ({ at, sizeSource: 'default' })),
    beams: points.map(a => ({ a, b: remote })),
  });
  const draft = buildDraft({
    floorPlans: [{ plan: plan([L, M]), fromFloor: 1, toFloor: 1 }, { plan: plan([A, B]), fromFloor: 2, toFloor: 2 }],
    assumptions: { ...reviewSettings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
  });
  const model = snapshotToModelShape(draft.snapshot);
  const joint = (at: { x: number; y: number }, z: number) => {
    const node = [...model.nodes.values()].find(p => p.x === at.x && p.y === at.y && p.z === z);
    expect(node).toBeDefined();
    return node!.id;
  };
  const upperBase = (at: { x: number; y: number }) => {
    const column = [...model.elements.values()].find(e => e.nodeJ === joint(at, 6));
    expect(column).toBeDefined();
    return column!.nodeI;
  };
  expect(upperBase(A)).toBe(joint(L, 3));
  expect(upperBase(B)).toBe(joint(M, 3));
});

it('#2607 an alternating path keeps the only physical floor joint', () => {
  const L = { x: 0, y: 0 }, M = { x: 0.018, y: 0 };
  const A = { x: -0.008, y: 0 }, B = { x: 0.009, y: 0 };
  const remote = { x: 0, y: 4 };
  const plan = (physical: typeof L, station: typeof M): ArchPlan => ({
    ...reviewPlan(), slabs: [], walls: [],
    columns: [physical, remote].map(at => ({ at, sizeSource: 'default' })),
    beams: [physical, station].map(a => ({ a, b: remote })),
  });
  const draft = buildDraft({
    floorPlans: [{ plan: plan(L, M), fromFloor: 1, toFloor: 1 }, { plan: plan(B, A), fromFloor: 2, toFloor: 2 }],
    assumptions: { ...reviewSettings, nFloors: 2, storyHeights: [3, 3] }, source: SOURCE,
  });
  const model = snapshotToModelShape(draft.snapshot);
  const node = (x: number, z: number) => [...model.nodes.values()].find(p => p.x === x && p.y === 0 && p.z === z)!.id;
  const upper = [...model.elements.values()].find(e => e.nodeJ === node(B.x, 6))!;
  expect(upper.nodeI).toBe(node(L.x, 3));
  expect(upper.nodeI).not.toBe(node(M.x, 3));
});
