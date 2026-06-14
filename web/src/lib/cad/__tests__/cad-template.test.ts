// Stabileo DXF template round-trip: the downloadable template must parse,
// classify with zero manual mapping, extract specs/schedules/levels, detect
// the eccentric edge beam, and generate a solvable 10-floor draft.
import { describe, it, expect } from 'vitest';
import { buildStabileoTemplateDxf, STB_TEMPLATE_LAYERS } from '../template';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { generateRcDraft } from '../draft';
import type { RcDraftAssumptions } from '../types';
import { buildSolverInput3D } from '../../engine/solver-service';
import { solve3D } from '../../engine/wasm-solver';

const SOURCE = { fileName: 'stabileo-template.dxf', importedAtIso: '2026-06-11T00:00:00.000Z' };

function templatePlan() {
  const doc = parseCadDxf(buildStabileoTemplateDxf(), 'stabileo-template.dxf');
  const mappings = suggestLayerMappings(doc, 'm');
  return { doc, mappings, plan: extractArchPlan(doc, mappings, 'm') };
}

function assumptions(plan: ReturnType<typeof templatePlan>['plan'], over: Partial<RcDraftAssumptions> = {}): RcDraftAssumptions {
  return {
    nFloors: 10,
    storyHeights: plan.levelHeights ?? Array.from({ length: 10 }, () => 2.8),
    concreteGrade: 'H-30',
    columnSection: { b: 0.3, h: 0.3 },
    beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.2,
    wallThickness: 0.15,
    baseSupport: 'fixed3d',
    deadLoad: 7.15, liveLoad: 2, roofLiveLoad: 1,
    generateCombos: true,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 3, splitBeams: true,
    snapTolerance: 0.03,
    detectOffsets: true,
    ...over,
  };
}

describe('Stabileo DXF template', () => {
  const { doc, mappings, plan } = templatePlan();

  it('parses and exposes all STB layers (unit is user-confirmed = m)', () => {
    // No $INSUNITS in the R12 header (AutoCAD-safety); wizard defaults to m.
    expect(doc.suggestedUnit).toBeNull();
    for (const layer of STB_TEMPLATE_LAYERS) {
      expect(doc.layers.map((l) => l.name)).toContain(layer);
    }
  });

  it('classifies every STB layer with high confidence and zero manual mapping', () => {
    const m = new Map(mappings.map((x) => [x.layer, x]));
    expect(m.get('STB_COLUMN_OUTLINE')!.suggested).toBe('column');
    expect(m.get('STB_BEAM_FACES')!.suggested).toBe('beam');
    expect(m.get('STB_BEAM_CENTERLINE')!.suggested).toBe('beam');
    expect(m.get('STB_WALL_AXIS')!.suggested).toBe('wall');
    expect(m.get('STB_WALL_FACES')!.suggested).toBe('wall');
    expect(m.get('STB_SLAB_OUTLINE')!.suggested).toBe('slab');
    expect(m.get('STB_OPENING')!.suggested).toBe('opening');
    expect(m.get('STB_GRID')!.suggested).toBe('grid');
    expect(m.get('STB_IGNORE')!.suggested).toBe('ignore');
    expect(m.get('STB_SECTION_SCHEDULE_COLUMNS')!.suggested).toBe('text');
    for (const x of mappings.filter((x) => x.layer.startsWith('STB_'))) {
      expect(x.confidence).toBe('high');
      expect(x.evidence).toBe('name:STB');
    }
  });

  it('extracts members, marks, schedules, and level heights', () => {
    expect(plan.columns.length).toBe(12);
    expect(plan.columns.every((c) => c.mark?.startsWith('C'))).toBe(true);
    // Columns carry NO dim label now (plain "C1") — sizes come from the schedule.
    expect(plan.columns.every((c) => c.specSource !== 'label')).toBe(true);

    // 6 centerlines + 1 paired-face (eccentric) edge beam.
    expect(plan.beams.length).toBe(7);
    // Per-member beam labels: distinct widths/depths from the drawn labels.
    const byMark = new Map(plan.beams.filter((b) => b.mark).map((b) => [b.mark!, b]));
    expect(byMark.get('V-INT')).toMatchObject({ width: 0.18, depth: 0.45 });
    expect(byMark.get('V-PERIM')).toMatchObject({ width: 0.2, depth: 0.55 });
    expect(byMark.get('V3')).toMatchObject({ width: 0.25, depth: 0.6 });
    expect(byMark.get('V-BALCON')).toMatchObject({ width: 0.15, depth: 0.35 });
    expect(byMark.get('V1')).toMatchObject({ width: 0.2, depth: 0.5 }); // edge label
    // At least one beam is intentionally unlabelled (→ default at generation).
    expect(plan.beams.some((b) => b.mark === undefined)).toBe(true);

    // Walls: T1/T2/T3 single AXIS lines (label-sourced thickness) + 1 paired.
    expect(plan.walls.length).toBe(4);
    const wByMark = new Map(plan.walls.filter((w) => w.mark).map((w) => [w.mark!, w]));
    expect(wByMark.get('T1')).toMatchObject({ thickness: 0.2, specSource: 'label' });
    expect(wByMark.get('T2')).toMatchObject({ thickness: 0.15, specSource: 'label' });
    expect(wByMark.get('T3')).toMatchObject({ thickness: 0.18, specSource: 'label' });
    const paired = plan.walls.find((w) => w.thicknessSource === 'paired')!;
    expect(paired.thickness).toBeCloseTo(0.18, 6); // measured from face spacing

    expect(plan.slabs.length).toBe(2); // main floor + balcony cantilever
    const mainSlab = plan.slabs.find((s) => s.mark === 'L1')!;
    expect(mainSlab.thickness).toBeCloseTo(0.15, 6); // "L1 h=15"
    const balcony = plan.slabs.find((s) => Math.max(...s.outline.map((p) => p.x)) > 15 + 1e-6)!;
    expect(balcony).toBeDefined();
    expect(balcony.thickness).toBeCloseTo(0.15, 6); // "BALCON h=15"
    expect(plan.openings.length).toBe(1);
    expect(plan.schedules.length).toBe(6);
    expect(plan.levelHeights).toEqual([3, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8]);
  });

  it('round-trips into multiple distinct beam sections (not one uniform beam)', () => {
    const draft = generateRcDraft(plan, assumptions(plan), SOURCE);
    const beamDims = new Set(
      draft.snapshot.sections.filter(([, s]) => /Beam/.test(s.name)).map(([, s]) => `${Math.round((s.b ?? 0) * 100)}x${Math.round((s.h ?? 0) * 100)}`),
    );
    // V1 20x50, V-INT 18x45, V-PERIM 20x55, V2 15x40, V3 25x60, V-BALCON 15x35.
    expect(beamDims.size).toBeGreaterThanOrEqual(4);
    expect(beamDims).toContain('18x45');
    expect(beamDims).toContain('25x60');
    expect(beamDims).toContain('15x35');
    // The unlabelled beam falls back to the default section and is warned.
    expect(draft.counts.specSections.default).toBeGreaterThan(0);
    expect(draft.warnings.map((w) => w.message).some((m) => m.startsWith('beamsDefaulted'))).toBe(true);
    // Provenance lists beam sections by their resolving source.
    expect(draft.provenance.assumptions.join('\n')).toContain('Beam sections (per member');
  });

  it('an exact beam label/schedule wins over the default; a wildcard would not clobber it', () => {
    const draft = generateRcDraft(plan, assumptions(plan), SOURCE);
    const names = draft.snapshot.sections.filter(([, s]) => /Beam/.test(s.name)).map(([, s]) => s.name);
    // V-INT (label 18x45) and V3 (label 25x60) survive as their own sections.
    expect(names).toContain('RC Beam 18x45 (CAD)');
    expect(names).toContain('RC Beam 25x60 (CAD)');
    // Some beams resolve from labels, some from exact schedule rows (V1/V2).
    expect(draft.counts.specSections.label).toBeGreaterThan(0);
    expect(draft.counts.specSections.schedule).toBeGreaterThan(0);
  });

  it('generates floor-dependent column sections from the schedule', () => {
    const draft = generateRcDraft(plan, assumptions(plan), SOURCE);
    const names = draft.snapshot.sections.map(([, s]) => s.name);
    expect(names).toContain('RC Col 40x60 (CAD)');
    expect(names).toContain('RC Col 30x50 (CAD)');

    // Column elements on stories 1–3 use 40x60; stories 4–10 use 30x50.
    const secByName = new Map(draft.snapshot.sections.map(([, s]) => [s.name, s.id]));
    const nodeZ = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n.z ?? 0]));
    const columnsLow = draft.snapshot.elements.filter(([, e]) => {
      const zi = nodeZ.get(e.nodeI)!, zj = nodeZ.get(e.nodeJ)!;
      return Math.abs((nodeZ.get(e.nodeI) ?? 0) - (nodeZ.get(e.nodeJ) ?? 0)) > 1 && Math.max(zi, zj) <= 8.7;
    });
    const columnsHigh = draft.snapshot.elements.filter(([, e]) => {
      const zi = nodeZ.get(e.nodeI)!, zj = nodeZ.get(e.nodeJ)!;
      return Math.abs(zi - zj) > 1 && Math.min(zi, zj) >= 8.5;
    });
    expect(columnsLow.length).toBeGreaterThan(0);
    expect(columnsHigh.length).toBeGreaterThan(0);
    expect(columnsLow.every(([, e]) => e.sectionId === secByName.get('RC Col 40x60 (CAD)'))).toBe(true);
    expect(columnsHigh.every(([, e]) => e.sectionId === secByName.get('RC Col 30x50 (CAD)'))).toBe(true);
    expect(draft.counts.scheduleAssignments).toBeGreaterThan(0);
  });

  it('detects the edge-flush beam as an eccentric member offset', () => {
    const draft = generateRcDraft(plan, assumptions(plan), SOURCE);
    expect(draft.counts.beamsWithOffsets).toBeGreaterThan(0);
    const offsetElems = draft.snapshot.elements.filter(([, e]) => (e as { offset?: unknown }).offset);
    expect(offsetElems.length).toBe(draft.counts.beamsWithOffsets);
    const off = (offsetElems[0][1] as { offset: { frame: string; i: { x: number; y: number; z: number }; j: { x: number; y: number; z: number } } }).offset;
    expect(off.frame).toBe('global');
    expect(Math.abs(off.i.y)).toBeCloseTo(0.125, 3); // flush-edge eccentricity
    expect(off.i).toEqual(off.j);
    // Offset beam nodes sit ON the column-centre line (y = 0).
    const nodeById = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n]));
    const el = offsetElems[0][1];
    expect(Math.abs(nodeById.get(el.nodeI)!.y)).toBeLessThan(1e-6);
  });

  it('roof slabs are thinner per the exact L1 schedule (12 cm vs 15 cm)', () => {
    const draft = generateRcDraft(plan, assumptions(plan), SOURCE);
    const nodes = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n]));
    const topZ = 3 + 9 * 2.8;
    const wallThicknesses = new Set<number>();
    for (const [, q] of draft.snapshot.quads ?? []) {
      const ns = q.nodes.map((n) => nodes.get(n)!);
      const zs = ns.map((n) => n.z ?? 0);
      const isWall = Math.max(...zs) - Math.min(...zs) > 1;
      if (isWall) {
        // Walls now carry per-member thickness from their labels/geometry
        // (T1 20, T2 15, T3 18, T4 18 cm) — no single uniform value.
        wallThicknesses.add(Number(q.thickness.toFixed(3)));
        continue;
      }
      const isBalcony = ns.some((n) => n.x > 15 + 1e-6); // protrudes past the plan
      if (isBalcony) {
        expect(q.thickness).toBeCloseTo(0.15, 6); // balcony uniform (label)
      } else if (Math.abs(Math.max(...zs) - topZ) < 0.05) {
        expect(q.thickness).toBeCloseTo(0.12, 6); // main-slab roof (L1 10 12)
      } else {
        expect(q.thickness).toBeCloseTo(0.15, 6); // typical floor (L1 1-9 15)
      }
    }
    // Walls demonstrate varied, label/geometry-sourced thicknesses.
    expect([...wallThicknesses].sort()).toEqual([0.15, 0.18, 0.2]);
  });

  it('keeps the balcony as a supported cantilever (quads beyond the plan, no exterior columns/supports)', () => {
    const draft = generateRcDraft(plan, assumptions(plan, { detectOffsets: false }), SOURCE);
    expect(draft.counts.cantileverSlabs).toBe(1);
    expect(draft.counts.slabsIsolated).toBe(0);
    const nodes = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n]));

    // Balcony quads exist beyond the main plan bounds (x > 15).
    const balconyQuads = (draft.snapshot.quads ?? []).filter(([, q]) => {
      const zs = q.nodes.map((n) => nodes.get(n)!.z ?? 0);
      if (Math.max(...zs) - Math.min(...zs) > 1) return false; // wall
      return q.nodes.some((n) => nodes.get(n)!.x > 15 + 1e-6);
    });
    expect(balconyQuads.length).toBeGreaterThan(0);

    // No support and no column node beyond x = 15 (cantilever has no exterior support).
    for (const [, sup] of draft.snapshot.supports) {
      expect(nodes.get(sup.nodeId)!.x).toBeLessThanOrEqual(15 + 1e-6);
    }
    // Columns are vertical frame elements; none should sit beyond x = 15.
    for (const [, el] of draft.snapshot.elements) {
      const a2 = nodes.get(el.nodeI)!, b2 = nodes.get(el.nodeJ)!;
      const vertical = Math.abs(a2.x - b2.x) < 1e-6 && Math.abs(a2.y - b2.y) < 1e-6;
      if (vertical) { expect(a2.x).toBeLessThanOrEqual(15 + 1e-6); }
    }

    // The supported edge (x=15) shares nodes with the adjacent perimeter beam:
    // the beam at x=15 must have interior nodes at the balcony edge y-values,
    // i.e. beam elements with both ends on x=15 between the balcony corners.
    const edgeNodesOnBeam = [...nodes.values()].filter((n) =>
      Math.abs(n.x - 15) < 1e-6 && (n.y ?? 0) > 4 - 1e-6 && (n.y ?? 0) < 8 + 1e-6 && (n.z ?? 0) > 0);
    expect(edgeNodesOnBeam.length).toBeGreaterThan(0);
  });

  it('balcony solves as part of the connected model (single component, no disconnected gate)', () => {
    const draft = generateRcDraft(plan, assumptions(plan, { detectOffsets: false }), SOURCE);
    // Single connected component from one support (the app's pre-solve gate).
    const nodes = new Map(draft.snapshot.nodes); const elements = new Map(draft.snapshot.elements);
    const quads = new Map(draft.snapshot.quads ?? []);
    const adj = new Map<number, number[]>();
    const link = (x: number, y: number) => { (adj.get(x) ?? adj.set(x, []).get(x)!).push(y); (adj.get(y) ?? adj.set(y, []).get(y)!).push(x); };
    for (const [, el] of elements) link(el.nodeI, el.nodeJ);
    for (const [, q] of quads) for (let i = 0; i < 4; i++) link(q.nodes[i], q.nodes[(i + 1) % 4]);
    const seen = new Set<number>(); const stack = [([...new Map(draft.snapshot.supports).values()][0] as { nodeId: number }).nodeId];
    while (stack.length) { const x = stack.pop()!; if (seen.has(x)) continue; seen.add(x); for (const y of adj.get(x) ?? []) if (!seen.has(y)) stack.push(y); }
    expect(seen.size).toBe(nodes.size); // balcony reachable → no disconnected-structure gate

    const model = {
      name: '', nodes: new Map(draft.snapshot.nodes), materials: new Map(draft.snapshot.materials),
      sections: new Map(draft.snapshot.sections), elements: new Map(draft.snapshot.elements),
      supports: new Map(draft.snapshot.supports), loads: draft.snapshot.loads,
      loadCases: draft.snapshot.loadCases ?? [], combinations: draft.snapshot.combinations ?? [],
      plates: new Map(), quads: new Map(draft.snapshot.quads ?? []), constraints: [], connectors: new Map(),
    };
    const input = buildSolverInput3D(model as never);
    expect(input).not.toBeNull();
    const res = solve3D(input!);
    const minUz = Math.min(...res.displacements.map((d) => d.uz ?? 0));
    expect(minUz).toBeLessThan(0);
    expect(Number.isFinite(minUz)).toBe(true);
  }, 60000);

  it('room-based live loads: ≥3 use categories from the template room labels', () => {
    // Template STB_ROOMS: DORMITORIO/BAÑO/COCINA (private), ESTAR (living),
    // BALCON (balcony) → 3 named categories; balcony 5.0 ≠ rooms 2.0.
    expect(plan.roomLabels.length).toBeGreaterThanOrEqual(5);
    const draft = generateRcDraft(plan, assumptions(plan, { detectOffsets: false, roomBasedLiveLoads: true }), SOURCE);
    const cats = Object.keys(draft.counts.liveLoadByCategory);
    expect(cats.length).toBeGreaterThanOrEqual(3);
    expect(cats).toEqual(expect.arrayContaining(['private', 'living', 'balcony']));
    // Distinct live-load values appear on the slabs (balcony 5.0 vs rooms 2.0).
    const nodes = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n]));
    const Lq = new Set<number>();
    for (const l of draft.snapshot.loads as Array<{ data: { quadId: number; q: number; caseId: number } }>) {
      if (l.data.caseId !== 2) continue;
      Lq.add(l.data.q);
    }
    expect(Lq.has(2.0)).toBe(true);
    expect(Lq.has(5.0)).toBe(true);
    expect(draft.provenance.assumptions.join('\n')).toContain('Live loads assigned by ROOM LABELS');
    void nodes;
  });

  it('cuts the slab opening out of the shell (an actual hole)', () => {
    const draft = generateRcDraft(plan, assumptions(plan), SOURCE);
    expect(draft.counts.openingsDetected).toBe(1);
    expect(draft.counts.openingsCutFromSlabs).toBe(1);
    const nodes = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n]));
    // Template opening is [6.5,8]-[8,10]; no slab quad centroid may sit inside.
    for (const [, q] of draft.snapshot.quads ?? []) {
      const zs = q.nodes.map((n) => nodes.get(n)!.z ?? 0);
      if (Math.max(...zs) - Math.min(...zs) > 1) continue; // wall quad
      const cx = q.nodes.reduce((s, n) => s + nodes.get(n)!.x, 0) / 4;
      const cy = q.nodes.reduce((s, n) => s + nodes.get(n)!.y, 0) / 4;
      expect(cx > 6.5 && cx < 8 && cy > 8 && cy < 10).toBe(false);
    }
  });

  it('generates a solvable draft with Lr on the roof and the slab hole', () => {
    // Gravity-model solvability + hole: detectOffsets OFF keeps this fast
    // (the offset constrained-solve path is exercised by browser QA and the
    // dedicated offset test above, which does not solve).
    const draft = generateRcDraft(plan, assumptions(plan, { detectOffsets: false }), SOURCE);
    expect((draft.snapshot.loadCases ?? []).map((c) => c.type).sort()).toEqual(['D', 'L', 'Lr']);
    expect(draft.counts.openingsCutFromSlabs).toBe(1);
    const model = {
      name: '', nodes: new Map(draft.snapshot.nodes),
      materials: new Map(draft.snapshot.materials),
      sections: new Map(draft.snapshot.sections),
      elements: new Map(draft.snapshot.elements),
      supports: new Map(draft.snapshot.supports),
      loads: draft.snapshot.loads,
      loadCases: draft.snapshot.loadCases ?? [], combinations: draft.snapshot.combinations ?? [],
      plates: new Map(), quads: new Map(draft.snapshot.quads ?? []),
      constraints: [], connectors: new Map(),
    };
    const input = buildSolverInput3D(model as never);
    expect(input).not.toBeNull();
    const res = solve3D(input!);
    const minUz = Math.min(...res.displacements.map((d) => d.uz ?? 0));
    expect(minUz).toBeLessThan(0);
    expect(minUz).toBeGreaterThan(-0.2);
  }, 60000);
});

describe('offset detection honesty', () => {
  it('does NOT apply an offset for a skewed (ambiguous) beam', () => {
    const { plan } = templatePlan();
    // Synthetic: two columns + one beam skewed relative to their centre line.
    const skewed = {
      ...plan,
      beams: [{ a: { x: 0, y: 0.05 }, b: { x: 15, y: 0.18 } }],
      walls: [], slabs: [], openings: [], schedules: [],
    };
    const a = { ...assumptions(plan), meshSlabs: false, splitBeams: false };
    const draft = generateRcDraft(skewed, a, SOURCE);
    expect(draft.counts.beamsWithOffsets).toBe(0);
    expect(draft.counts.offsetsAmbiguous).toBeGreaterThan(0);
    expect(draft.warnings.map((w) => w.message).some((m) => m.startsWith('offsetsAmbiguous'))).toBe(true);
  });

  it('does not detect offsets when the toggle is off', () => {
    const { plan } = templatePlan();
    const a = { ...assumptions(plan), detectOffsets: false };
    const draft = generateRcDraft(plan, a, SOURCE);
    expect(draft.counts.beamsWithOffsets).toBe(0);
  });
});
