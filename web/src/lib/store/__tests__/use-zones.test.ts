/**
 * Use zones over two floors (z = 3 and 6), each with two plates side by side (A: 0–6 × 0–5 with a
 * 1 × 1 m hole at 1–2 × 1–2; B: 6–10 × 0–5) and a balcony with a curved edge off B. On floor 1:
 * a living room and a bedroom inside A, a corridor crossing from A into B, the balcony, a storage
 * room drawn without a slab under part of it, and one labelled room read from a template.
 *  - a suggestion stays pending (no load) until confirmed; a corridor's label offers several rows;
 *  - loads go onto the shells inside each zone, the hole carries none, the corridor loads both
 *    plates, and the total is q·area zone by zone;
 *  - generating twice adds nothing; changing a use replaces its load and keeps a manual one;
 *  - copied to floor 2, an exception changed there leaves floor 1 alone;
 *  - meshing again keeps the totals; saved and opened, zones and loads are back;
 *  - a row with no value is unresolved, a zone said to carry none carries none.
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, createPlate, physicalPlates, planPlateMesh, preparePlatesForAnalysis } from '../physical-plates';
import { applyZoneLoadPlan, confirmZoneUse, copyZonesToLevels, createUseZone, deleteUseZones, setZoneUse, suggestUse, useZones, zoneLoadPlan } from '../use-zones';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { serializeProject, deserializeProject } from '../file';
import { zoneOverlap, zoneStatus, zoneUnsupported, zoneUseOf } from '../../model/use-zones';
import { findOccupancy } from '../../codes/cirsoc101/live-loads';
import type { AnalysisResults3D } from '../../engine/types-3d';
import type { DefinitionModel } from '../../model/loads/floor-definitions';

const dm = () => modelStore.model as unknown as DefinitionModel;

function floor(z: number) {
  const n = (x: number, y: number) => modelStore.addNode(x, y, z);
  const a = [n(0, 0), n(6, 0), n(6, 5), n(0, 5)];
  const hole = [n(1, 1), n(2, 1), n(2, 2), n(1, 2)];
  const b = [a[1]!, n(10, 0), n(10, 5), a[2]!];
  const bal = [b[1]!, n(12, 0), n(12, 5), b[2]!];
  const mid = n(12 + 0.5, 2.5);
  for (const c of [...a, b[1]!, b[2]!]) if (z === 3) modelStore.addSupport(c, 'pinned3d');
  const pa = createPlate({ outline: a, holes: [hole], materialId: 1, thickness: 0.15, name: `A${z}` }) as { id: number };
  const pb = createPlate({ outline: b, materialId: 1, thickness: 0.15, name: `B${z}` }) as { id: number };
  // The balcony: its far side an arc through (12.5, 2.5).
  const pc = createPlate({ outline: [bal[0]!, bal[1]!, mid, bal[2]!, bal[3]!], arcMids: [2], materialId: 1, thickness: 0.12, name: `Bal${z}`, followArcs: false }) as { id: number };
  for (const p of [pa, pb, pc]) expect(p.id).toBeGreaterThan(0);
  // Columns between the floors keep the structure in one piece.
  return { pa: pa.id, pb: pb.id, pc: pc.id };
}
const meshAll = (size = 0.5) => applyPlateMeshes(physicalPlates().map((p) => planPlateMesh(p.id, { size, element: 'quad', followMembers: true })!));
const zone = (pts: Array<[number, number]>, z: number, name: string) => createUseZone(pts.map(([x, y]) => ({ x, y })), z, name);
/** The live loads the zones wrote, as total force per zone (q × the shell area each load covers). */
function zoneTotals(): Map<number, number> {
  syncDefinedLoadsForAnalysis();
  const out = new Map<number, number>();
  const defs = new Map([...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad').map((g) => [g.id, (g.data as { fromZone?: number }).fromZone]));
  for (const l of modelStore.loads) {
    const d = l.data as { fromDef?: number; quadId?: number; on?: string; q?: number; region?: unknown };
    if (l.type !== 'surface3d' || d.fromDef === undefined) continue;
    const z = defs.get(d.fromDef);
    if (z === undefined) continue;
    out.set(z, (out.get(z) ?? 0) + loadedForce(l.data as never));
  }
  return out;
}
function loadedForce(d: { quadId: number; on?: string; q: number; region?: { normal: [number, number, number]; points: Array<[number, number, number]>; holes?: Array<Array<[number, number, number]>> } }): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const shell = d.on === 'plate' ? modelStore.plates.get(d.quadId)! : modelStore.quads.get(d.quadId)!;
  const pts = shell.nodes.map((id) => modelStore.nodes.get(id)!);
  return d.q * (shellArea(d.on === 'plate' ? 'plate' : 'quad', pts, d.region));
}
let shellArea: (kind: 'quad' | 'plate', pts: Array<{ x: number; y: number; z?: number }>, region?: unknown) => number;

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
  const { shellLoadForces } = await import('../../engine/shell-load-integration');
  shellArea = (kind, pts, region) => shellLoadForces(kind, pts, { q: 1, ...(region ? { region: region as never } : {}) })?.loadedArea ?? 0;
});

describe('use zones over two floors', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; });

  it('suggests, assigns, loads the right surfaces, copies, changes, remeshes and opens again', () => {
    floor(3); floor(6);
    meshAll(0.5);
    const living = zone([[0, 2.5], [3, 2.5], [3, 5], [0, 5]], 3, 'Estar');
    const bedroom = zone([[3, 2.5], [6, 2.5], [6, 5], [3, 5]], 3, 'Dormitorio');
    const corridor = zone([[0, 0], [8, 0], [8, 2.5], [0, 2.5]], 3, 'Pasillo');
    const balcony = zone([[10, 0], [12.5, 0], [12.5, 5], [10, 5]], 3, 'Balcón');
    const storage = zone([[8, 0], [10, 0], [10, -2], [8, -2]], 3, 'Depósito');
    for (const z of [living, bedroom, corridor, balcony, storage]) expect(z).toBeGreaterThan(0);
    expect(useZones()).toHaveLength(5);

    // A label suggests, it does not decide: the corridor offers several rows and stays pending.
    const sug = suggestUse('PASILLO')!;
    expect(sug.provenance).toBe('suggested');
    expect(sug.candidates!.length).toBeGreaterThan(1);
    for (const k of sug.candidates!) expect(findOccupancy(k), k).toBeDefined();
    setZoneUse([corridor], sug);
    expect(zoneStatus(zoneUseOf(modelStore.model.groups.get(corridor)))).toBe('pending');
    setZoneUse([living], { occupancy: 'vivienda', provenance: 'confirmed', name: 'ESTAR' });
    setZoneUse([bedroom], { occupancy: 'vivienda_dormitorio', provenance: 'confirmed' });
    setZoneUse([balcony], { occupancy: 'balcon_otros', provenance: 'confirmed' });
    setZoneUse([storage], { none: true, provenance: 'manual' });

    let plan = zoneLoadPlan()!;
    expect(plan.add.map((a) => a.zoneId).sort()).toEqual([living, bedroom].sort());
    expect(plan.unresolved.map((u) => [u.zoneId, u.status]).sort()).toEqual([[corridor, 'pending'], [balcony, 'unsupported']].sort());
    applyZoneLoadPlan(plan);

    // Confirm the corridor (its first candidate, a dwelling's), and give the balcony the value it needs.
    confirmZoneUse([corridor]);
    setZoneUse([balcony], { manualQ: 5, manualNote: 'balcón de vivienda en altura' });
    plan = zoneLoadPlan()!;
    expect(plan.add.map((a) => a.zoneId).sort()).toEqual([corridor, balcony].sort());
    applyZoneLoadPlan(plan);
    // Twice: nothing to do.
    const again = zoneLoadPlan()!;
    expect(again.add.length + again.change.length + again.remove.length).toBe(0);

    // Each zone loads q times its area on the slab: the corridor less the hole, across both plates.
    const t = zoneTotals();
    expect(t.get(living)).toBeCloseTo(2 * 7.5, 6);
    expect(t.get(bedroom)).toBeCloseTo(2 * 7.5, 6);
    expect(t.get(corridor)).toBeCloseTo(2 * (8 * 2.5 - 1), 6);
    expect(t.get(storage)).toBeUndefined();
    // The storage zone hangs off the slab: reported, not loaded.
    expect(zoneUnsupported(dm(), storage)).toBeCloseTo(4, 6);
    expect(zoneOverlap(dm(), living, bedroom)).toBeCloseTo(0, 9);
    expect(zoneOverlap(dm(), living, corridor)).toBeCloseTo(0, 9);

    // A manual load on a shell is kept through a change of use.
    const anyQuad = [...modelStore.quads.keys()][0]!;
    modelStore.addSurfaceLoad3D(anyQuad, 1, 2);
    setZoneUse([bedroom], { occupancy: 'oficina', provenance: 'confirmed' });
    plan = zoneLoadPlan()!;
    expect(plan.change.map((c) => [c.zoneId, c.from.q, c.q])).toEqual([[bedroom, 2, 2.5]]);
    applyZoneLoadPlan(plan);
    expect(zoneTotals().get(bedroom)).toBeCloseTo(2.5 * 7.5, 6);
    expect(modelStore.loads.some((l) => l.type === 'surface3d' && (l.data as { fromDef?: number }).fromDef === undefined && l.data.quadId === anyQuad)).toBe(true);

    // Copied to floor 2; an exception there leaves floor 1 alone.
    const r = copyZonesToLevels([living, bedroom, corridor], [6]);
    expect(r.copied).toBe(3);
    expect(copyZonesToLevels([living], [6]).skipped).toBe(1);
    const up = useZones().filter((z) => Math.abs(z.z - 6) < 1e-9);
    const upBedroom = up.find((z) => z.name === 'Dormitorio')!.id;
    setZoneUse([upBedroom], { occupancy: 'deposito_liviano', provenance: 'confirmed' });
    applyZoneLoadPlan(zoneLoadPlan()!);
    const t2 = zoneTotals();
    expect(t2.get(upBedroom)).toBeCloseTo(6 * 7.5, 6);
    expect(t2.get(bedroom)).toBeCloseTo(2.5 * 7.5, 6);

    // Meshed again at another size: the zones' totals do not change.
    // Exact on straight edges; on the balcony's arc the mesh's chords change with the element size,
    // and with them the area under the zone, by much less than the chord error allows (0.1 %).
    const before = zoneTotals();
    meshAll(0.4);
    const after = zoneTotals();
    for (const [z, v] of before) {
      if (z === balcony) expect(Math.abs(after.get(z)! - v), `zone ${z}`).toBeLessThanOrEqual(1e-3 * v);
      else expect(after.get(z), `zone ${z}`).toBeCloseTo(v, 5);
    }

    // Saved and opened.
    const text = serializeProject();
    modelStore.clear();
    expect(deserializeProject(text)).toBe(true);
    expect(useZones()).toHaveLength(8);
    expect(zoneUseOf(modelStore.model.groups.get(upBedroom))?.occupancy).toBe('deposito_liviano');
    const reopened = zoneTotals();
    for (const [z, v] of after) expect(reopened.get(z)).toBeCloseTo(v, 5);
    expect(zoneLoadPlan()!.add.length).toBe(0);

    // Deleting a zone takes its load with it.
    deleteUseZones([living]);
    expect(zoneTotals().get(living)).toBeUndefined();
  }, 60_000);

  it('gives zones a package of finishes as a dead load of its own', async () => {
    const { addFinishPackage, setFinishPackage } = await import('../use-zones');
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    floor(3);
    meshAll(0.5);
    const z1 = zone([[0, 2.5], [3, 2.5], [3, 5], [0, 5]], 3, 'Estar');
    setZoneUse([z1], { occupancy: 'vivienda', provenance: 'confirmed' });
    // 5 cm of screed at 20 kN/m³ and 2 cm of floor at 22: 1.44 kN/m².
    const pkg = addFinishPackage('Piso', { layers: [{ name: 'contrapiso', thickness: 0.05, unitWeight: 20 }, { name: 'piso', thickness: 0.02, unitWeight: 22 }] });
    setZoneUse([z1], { finish: String(pkg) });
    let plan = zoneLoadPlan()!;
    const fin = plan.add.find((a) => a.role === 'finish')!;
    expect(fin.q).toBeCloseTo(1.44, 9);
    expect(fin.caseId).toBe(modelStore.model.loadCases.find((c) => c.type === 'D')!.id);
    expect(plan.add.filter((a) => a.role === 'live')).toHaveLength(1);
    applyZoneLoadPlan(plan);
    const deadDefs = [...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad' && (g.data as { role?: string }).role === 'finish');
    expect(deadDefs).toHaveLength(1);
    // The package changed: the finish load changes, the live one does not.
    setFinishPackage(pkg, { layers: [{ name: 'contrapiso', thickness: 0.08, unitWeight: 20 }] });
    plan = zoneLoadPlan()!;
    expect(plan.change.map((c) => [c.role, c.q])).toEqual([['finish', 1.6]]);
    applyZoneLoadPlan(plan);
    // Taken off the zone: its finish load goes, the live load stays.
    setZoneUse([z1], { finish: undefined });
    plan = zoneLoadPlan()!;
    expect(plan.remove).toHaveLength(1);
    expect(plan.add.length + plan.change.length).toBe(0);
  });

  it('says when finishes cannot be applied for want of a dead-load case', async () => {
    const { addFinishPackage } = await import('../use-zones');
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    floor(3);
    meshAll(0.5);
    for (const c of modelStore.model.loadCases.filter((c) => c.type === 'D')) modelStore.removeLoadCase(c.id);
    const z1 = zone([[0, 2.5], [3, 2.5], [3, 5], [0, 5]], 3, 'Estar');
    const pkg = addFinishPackage('Piso', { layers: [{ name: 'piso', q: 1 }] });
    setZoneUse([z1], { occupancy: 'vivienda', provenance: 'confirmed', finish: String(pkg) });
    const plan = zoneLoadPlan()!;
    expect(plan.add.map((a) => a.role)).toEqual(['live']);
    expect(plan.finishNoCase).toEqual([{ zoneId: z1, zone: 'Estar' }]);
  });

  it('puts a zone drawn before its plate is meshed onto the slab, not onto the members', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    floor(3);
    const z1 = zone([[0, 0], [6, 0], [6, 5], [0, 5]], 3, 'Oficina');
    setZoneUse([z1], { occupancy: 'oficina', provenance: 'confirmed' });
    const plan = zoneLoadPlan()!;
    expect(plan.add.map((i) => i.distribution)).toEqual(['slab']);
    applyZoneLoadPlan(plan);
    expect(preparePlatesForAnalysis().ok).toBe(true);
    expect(zoneTotals().get(z1)).toBeCloseTo(2.5 * 29, 6);
    expect(zoneLoadPlan()!.change).toHaveLength(0);
  });

  it('solves with the zones loading the floor, and the reactions add up to their loads', () => {
    modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro';
    floor(3);
    meshAll(0.5);
    const z1 = zone([[0, 0], [6, 0], [6, 5], [0, 5]], 3, 'Oficina');
    setZoneUse([z1], { occupancy: 'oficina', provenance: 'confirmed' });
    applyZoneLoadPlan(zoneLoadPlan()!);
    syncDefinedLoadsForAnalysis();
    const res = modelStore.solve3D(false, false, true);
    expect(typeof res, String(res)).not.toBe('string');
    const fz = (res as AnalysisResults3D).reactions.reduce((s, x) => s + x.fz, 0);
    // The zone covers plate A less its hole: 2.5 × 29.
    expect(fz).toBeCloseTo(2.5 * 29, 5);
  });
});
