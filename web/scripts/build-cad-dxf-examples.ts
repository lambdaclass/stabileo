// Build the two CAD → RC draft PRO examples from Bauti's real DXFs.
//
//   1. cad-arch-structure-dxf  ← V1-Architecture-plus-structure.dxf
//      The drawing carries an annotated structural plan (CGC/R&S layers:
//      column rects drawn as LINEs, beam faces as double lines, slab
//      thickness callouts). Slab outlines are NOT drawn as closed polylines,
//      so slab panels are derived deterministically from the beam grid —
//      recorded as an assumption.
//
//   2. cad-arch-only-dxf       ← V2-Architecture.dxf
//      Architecture only. The RC layout (column grid, beams, slab panels,
//      end-wall tabiques) is a hand-made engineering PROPOSAL derived from
//      the plan footprint and the drawing's leftover column reference tags.
//      Every proposed quantity is recorded as an assumption "to verify".
//
// Both: 10 floors (base 3.0 m + 9 × 2.8 m), one plan replicated to all
// floors, roof slabs carry Lr instead of L, loads from the implemented
// CIRSOC 101 tables in lib/engine/auto-loads.ts (recorded as code-derived).
//
// Run: npx vite-node scripts/build-cad-dxf-examples.ts
// Deterministic: same DXF input → same fixture output (timestamp pinned).

import { readFileSync, writeFileSync } from 'fs';
import { parseCadDxf } from '../src/lib/cad/parse';
import { suggestLayerMappings, extractArchPlan } from '../src/lib/cad/classify';
import { generateRcDraft } from '../src/lib/cad/draft';
// Real-DXF inference is now SHIPPED (src/lib/cad/infer.ts); the curated example
// fixtures are built from the same code the wizard uses (PR [14] Layer 2).
import {
  cropDoc, panelsFromBeamGrid, snapPanelCornersToColumns,
  pruneBeamsDisconnectedFromColumns, pruneFloating,
} from '../src/lib/cad/infer';
import type { ArchPlan, ArchSlab, CadDocument, CadPt, LayerRole, RcDraftAssumptions } from '../src/lib/cad/types';
import type { ModelSnapshot } from '../src/lib/store/history.svelte';
import { OCCUPANCY_TABLE, DEAD_LOAD_DEFAULTS } from '../src/lib/engine/auto-loads';

const FIXTURE_DIR = 'src/lib/cad/__tests__/fixtures';
const OUT_DIR = 'src/lib/templates/fixtures';
// Pinned so re-running the script does not churn the fixture diff.
const IMPORTED_AT = '2026-06-11T00:00:00.000Z';

// ── CIRSOC 101 table values (implemented in the app — code-derived) ──
const L_VIVIENDA = OCCUPANCY_TABLE.find((o) => o.key === 'vivienda')!.q;            // 2.0 kN/m²
const LR_ROOF = OCCUPANCY_TABLE.find((o) => o.key === 'cubierta_inaccesible')!.q;   // 1.0 kN/m²
const D_SUPERIMPOSED = DEAD_LOAD_DEFAULTS.reduce((s, d) => s + d.q, 0);             // 3.4 kN/m²
const SLAB_T = 0.15;                       // m — from V1 slab callouts (L1/L3 "15")
const D_SLAB_SELF = SLAB_T * 25;           // 3.75 kN/m² — slab self-weight, explicit
const D_TOTAL = +(D_SUPERIMPOSED + D_SLAB_SELF).toFixed(2);

const STOREYS = [3.0, ...Array.from({ length: 9 }, () => 2.8)];

function baseAssumptions(): RcDraftAssumptions {
  return {
    nFloors: 10,
    storyHeights: STOREYS,
    concreteGrade: 'H-30',
    columnSection: { b: 0.2, h: 0.4 },
    beamSection: { b: 0.15, h: 0.4 },
    slabThickness: SLAB_T,
    wallThickness: 0.2,
    baseSupport: 'fixed3d',
    deadLoad: D_TOTAL,
    liveLoad: L_VIVIENDA,
    roofLiveLoad: LR_ROOF,
    generateCombos: true,
    meshSlabs: true,
    // Target-size meshing: ~uniform element size across small + large panels,
    // mesh lines snapped to beams/openings/walls/columns. 1.4 m keeps these
    // 10-floor examples tractable while staying visibly uniform.
    meshMode: 'targetSize',
    meshTargetSize: 1.4,
    meshDivisions: 2,
    splitBeams: true,
    snapTolerance: 0.03,
    detectOffsets: true,
    offsetTolerance: 0.03,
  };
}

const LOAD_ASSUMPTIONS = [
  `Loads from the app's implemented CIRSOC 101 tables (lib/engine/auto-loads.ts): L = ${L_VIVIENDA} kN/m² ('vivienda' residential), Lr = ${LR_ROOF} kN/m² ('cubierta_inaccesible' inaccessible roof).`,
  `D = ${D_TOTAL} kN/m² on slabs = ${D_SUPERIMPOSED} superimposed (CIRSOC 101 dead-load defaults: screed + finish + ceiling + MEP + light partitions) + ${D_SLAB_SELF} slab self-weight (t = ${SLAB_T} m × 25 kN/m³), entered explicitly. Beam/column self-weight NOT included — to verify.`,
  'No wind/seismic/snow loads. Gravity-only draft; the lateral system is NOT designed here.',
];

function withRoles(doc: CadDocument, unit: 'm', overrides: Record<string, LayerRole>) {
  return suggestLayerMappings(doc, unit).map((m) =>
    overrides[m.layer] !== undefined ? { ...m, role: overrides[m.layer], evidence: 'override:script' } : m,
  );
}

/** ModelSnapshot → loadable example fixture (JSONModel shape + provenance). */
function snapshotToFixture(snap: ModelSnapshot, name: string) {
  return {
    name,
    materials: snap.materials.map(([, m]) => m),
    sections: snap.sections.map(([, s]) => s),
    nodes: snap.nodes.map(([, n]) => ({ id: n.id, x: n.x, y: n.y, z: n.z ?? 0 })),
    elements: snap.elements.map(([, e]) => ({
      id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
      materialId: e.materialId, sectionId: e.sectionId,
      ...((e as { offset?: Record<string, unknown> }).offset ? { offset: (e as { offset?: Record<string, unknown> }).offset } : {}),
    })),
    supports: snap.supports.map(([, s]) => s),
    loads: snap.loads,
    plates: [],
    quads: (snap.quads ?? []).map(([, q]) => q),
    constraints: [],
    loadCases: snap.loadCases ?? [],
    combinations: snap.combinations ?? [],
    provenance: snap.provenance,
  };
}

// ════════════════════════════════════════════════════════════════
// Example 1 — V1: architecture + annotated structure
// ════════════════════════════════════════════════════════════════
{
  const file = `${FIXTURE_DIR}/V1-Architecture-plus-structure.dxf`;
  const full = parseCadDxf(readFileSync(file, 'utf8'), 'V1-Architecture-plus-structure.dxf');
  // The modelspace holds several drawings (plan, sections, schedules). The
  // structural plan cluster was located by inspection — recorded below.
  const win = { x0: 188.5, x1: 211, y0: 55.5, y1: 67 };
  const doc = cropDoc(full, win);

  const mappings = withRoles(doc, 'm', {
    'CGC COLUMNAS': 'column',
    'CGC VIGAS': 'beam',
    // Axis crosses / reference marks / sections — geometry that must not
    // become structure:
    'R&S COLUMNAS EJES': 'ignore',
    'R&S COLUMNAS REF': 'ignore',
    'R&S LOSAS REF': 'ignore',
    'R&S VIGAS REF': 'ignore',
    'CGC ÁREAS DE INFLUENCIA': 'ignore',
    'CGC - TRAPECIOS': 'ignore',
    'CGC UNIDIRECCIONALES': 'ignore',
    'R&S CORTES': 'ignore',
    'R&S ESCALERAS': 'ignore',
    'Carpinterias y Herrerías - Marcos y Hojas': 'ignore', // door frames, false column hint
    'T - Locales': 'ignore',
  });

  const plan = extractArchPlan(doc, mappings, 'm');
  // Annotation strokes on the beam layer would float in the air — keep only
  // beam fragments connected (through other beams) to a column.
  const prunedBeams = pruneBeamsDisconnectedFromColumns(plan, 0.05);
  // Slab outlines are not drawn as closed polylines in this file — derive
  // panels from the beam grid (deterministic sweep, recorded as assumption).
  const { slabs, xs, ys, dropped } = panelsFromBeamGrid(plan.beams, plan.columns);
  const snappedCorners = snapPanelCornersToColumns(slabs, plan.columns);
  plan.slabs = slabs;

  const draft = generateRcDraft(plan, baseAssumptions(), {
    fileName: 'V1-Architecture-plus-structure.dxf',
    importedAtIso: IMPORTED_AT,
  });

  const floating = pruneFloating(draft.snapshot);

  draft.snapshot.provenance!.assumptions.push(
    `Source modelspace holds several drawings; the structural plan was cropped to window x∈[${win.x0}, ${win.x1}], y∈[${win.y0}, ${win.y1}] (m).`,
    'DXF $INSUNITS header says mm but the drawing is authored in metres (plan extents ~20.8 × 9.8 m) — unit overridden to m.',
    'Column rectangles reconstructed from bare LINE outlines; beam centerlines from paired face lines (width = face gap).',
    `Slab outlines are not drawn as closed polylines in this file: ${slabs.length} slab panels were derived from the beam grid (${xs.length} x-lines × ${ys.length} y-lines, cells with ≥2 beam-covered edges; ${dropped} cells dropped; ${snappedCorners} panel corners snapped to the nearest column axis ≤ 0.25 m — the column layout is irregular/stepped). To verify against the architectural plan.`,
    'Stair/elevator voids (R&S PASES / ESCALERAS layers) are NOT subtracted from slabs — to verify.',
    `${prunedBeams} beam-layer fragments not connected to any column (annotation strokes / leader lines) were dropped, plus ${floating.elements} members (${floating.nodes} nodes) disconnected from the main structure after generation — off-axis face-line stubs and ${floating.supports} isolated column stack(s) not tied into the slab/beam network. Review the CGC VIGAS / CGC COLUMNAS layers if members are missing.`,
    'Member sizes from drawing annotations: columns 20×40 cm (refs "C# (40x20)"), beams 15×40 cm (tags "V-10x: 15x40"), slab t = 15 cm (callouts "L1/L3 … 15"; stair slabs 11–14 cm not differentiated).',
    ...LOAD_ASSUMPTIONS,
  );

  const fixture = snapshotToFixture(draft.snapshot, 'Architecture plus structure DXF (CAD draft)');
  writeFileSync(`${OUT_DIR}/cad-arch-structure-dxf.json`, JSON.stringify(fixture) + '\n');
  console.log('[V1] counts:', JSON.stringify(draft.counts));
  console.log('[V1] warnings:', JSON.stringify(draft.warnings));
  console.log('[V1] grid xs:', xs.map((v) => v.toFixed(2)).join(','));
  console.log('[V1] grid ys:', ys.map((v) => v.toFixed(2)).join(','));
}

// ════════════════════════════════════════════════════════════════
// Example 2 — V2: architecture only, RC layout PROPOSED
// ════════════════════════════════════════════════════════════════
{
  const file = `${FIXTURE_DIR}/V2-Architecture.dxf`;
  const full = parseCadDxf(readFileSync(file, 'utf8'), 'V2-Architecture.dxf');
  const win = { x0: 188.5, x1: 210.5, y0: 66.0, y1: 78.5 };
  const doc = cropDoc(full, win);

  // Architecture-only reading: masonry walls give the footprint; everything
  // else is ignored. The leftover structural residue (CGC COLUMNAS, 2 rects)
  // is deliberately ignored — the point of this example is inference.
  const mappings = withRoles(doc, 'm', {
    'A - Mamp.': 'wall',
    'A - Pases y Vacíos': 'opening',
    'CGC COLUMNAS': 'ignore',
    'CGC VIGAS': 'ignore',
    'R&S COLUMNAS EJES': 'ignore',
    'R&S VIGAS REF': 'ignore',
    'T - Locales': 'ignore',
  });
  const archPlan = extractArchPlan(doc, mappings, 'm');

  // Footprint from the masonry walls.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of archPlan.walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  }

  // PROPOSED column grid (engineering proposal, to verify):
  //  - x lines from the drawing's own column reference tags C1..C5, plus one
  //    proposed intermediate line splitting the 8.1 m middle gap;
  //  - y lines: facades + two proposed interior lines (3 roughly equal bays).
  const xRefs = [189.46, 193.82, 196.66, 204.76, 208.13];
  const xMid = (196.66 + 204.76) / 2;
  const xs = [...xRefs.slice(0, 3), xMid, ...xRefs.slice(3)].sort((a, b) => a - b);
  const ys = [minY, minY + (maxY - minY) / 3, minY + (2 * (maxY - minY)) / 3, maxY];

  const plan: ArchPlan = {
    unit: 'm',
    mappings: archPlan.mappings,
    columns: xs.flatMap((x) => ys.map((y) => ({ at: { x, y }, sizeSource: 'default' as const }))),
    beams: [
      ...ys.flatMap((y) => xs.slice(0, -1).map((x, i) => ({ a: { x, y }, b: { x: xs[i + 1], y } }))),
      ...xs.flatMap((x) => ys.slice(0, -1).map((y, j) => ({ a: { x, y }, b: { x, y: ys[j + 1] } }))),
    ],
    // End-wall tabiques proposed as the lateral system stub (gravity-only here).
    walls: [
      { a: { x: xs[0], y: ys[0] }, b: { x: xs[0], y: ys[ys.length - 1] }, thickness: 0.2, thicknessSource: 'default' },
      { a: { x: xs[xs.length - 1], y: ys[0] }, b: { x: xs[xs.length - 1], y: ys[ys.length - 1] }, thickness: 0.2, thicknessSource: 'default' },
    ],
    slabs: xs.slice(0, -1).flatMap((x, i) =>
      ys.slice(0, -1).map((y, j): ArchSlab => ({
        outline: [
          { x, y }, { x: xs[i + 1], y }, { x: xs[i + 1], y: ys[j + 1] }, { x, y: ys[j + 1] },
        ],
        isQuad: true,
        isRectilinear: true,
      })),
    ),
    openings: archPlan.openings,
    gridLines: [],
    schedules: archPlan.schedules,
    roomLabels: archPlan.roomLabels,
    // The masonry-wall reading was only used for the footprint; its pairing
    // warnings do not apply to the proposed RC layout.
    warnings: [],
    skipped: archPlan.skipped,
  };

  const a = baseAssumptions();
  a.columnSection = { b: 0.2, h: 0.45 };
  const draft = generateRcDraft(plan, a, {
    fileName: 'V2-Architecture.dxf',
    importedAtIso: IMPORTED_AT,
  });

  pruneFloating(draft.snapshot); // expected no-op for the proposed regular grid

  draft.snapshot.provenance!.assumptions.push(
    `Source modelspace holds several drawings; the architectural plan was cropped to window x∈[${win.x0}, ${win.x1}], y∈[${win.y0}, ${win.y1}] (m). Unit overridden to m ($INSUNITS header says mm).`,
    'This DXF contains NO structural layout. The entire RC layout below is an engineering PROPOSAL inferred from the architecture — every item must be verified by the engineer.',
    `PROPOSED column grid: x lines from the drawing's column reference tags C1..C5 (${xRefs.map((v) => v.toFixed(1)).join(', ')}) plus one proposed intermediate line at ${xMid.toFixed(2)}; y lines at the facades and two proposed interior lines (3 bays over the ${(maxY - minY).toFixed(1)} m depth). Footprint from the masonry-wall extent (${(maxX - minX).toFixed(1)} × ${(maxY - minY).toFixed(1)} m).`,
    'PROPOSED members: columns 20×45 cm, beams 15×40 cm on every grid line, slab panels = grid cells (t = 15 cm).',
    'PROPOSED lateral-system stub: two RC end-wall tabiques (t = 20 cm) at the first and last column lines; NO lateral loads are applied in this draft.',
    'Masonry partitions are NOT modeled as structure; their weight is inside the D superimposed allowance.',
    'Room labels in the plan (ESTAR/COCINA/BAÑO/VESTIDOR) confirm residential occupancy for the live-load table entry.',
    ...LOAD_ASSUMPTIONS,
  );

  const fixture = snapshotToFixture(draft.snapshot, 'Architecture without structure DXF (CAD draft)');
  writeFileSync(`${OUT_DIR}/cad-arch-only-dxf.json`, JSON.stringify(fixture) + '\n');
  console.log('[V2] counts:', JSON.stringify(draft.counts));
  console.log('[V2] warnings:', JSON.stringify(draft.warnings));
  console.log('[V2] footprint:', (maxX - minX).toFixed(2), 'x', (maxY - minY).toFixed(2));
}
