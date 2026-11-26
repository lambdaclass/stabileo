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
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import * as shellIntegration from '../../engine/shell-load-integration';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, createPlate, physicalPlates, planPlateMesh, preparePlatesForAnalysis } from '../physical-plates';
import { applyZoneLoadPlan, confirmZoneUse, copyZonesToLevels, createUseZone, deleteUseZones, setZoneUse, suggestUse, useZones, zoneLoadPlan } from '../use-zones';
import { addLoadZone, syncDefinedLoadsForAnalysis } from '../defined-loads';
import { serializeProject, deserializeProject } from '../file';
import { zoneOverlap, zoneStatus, zoneUnsupported, zoneUseOf } from '../../model/use-zones';
import { findOccupancy } from '../../codes/cirsoc101/live-loads';
import { tp } from '../../i18n';
import type { AnalysisResults3D } from '../../engine/types-3d';
import type { DefinitionModel } from '../../model/loads/floor-definitions';

const dm = () => modelStore.model as unknown as DefinitionModel;

function surfaceRefusal(caseId: number, quadId: number): string {
  const name = modelStore.model.loadCases.find(c => c.id === caseId)!.name;
  return tp('svc.accountingUnsupported', { case: `#${caseId} (${name})`, kind: 'surface3d', id: quadId });
}

function floor(z: number) {
  const n = (x: number, y: number) => modelStore.addNode(x, y, z);
  const a = [n(0, 0), n(6, 0), n(6, 5), n(0, 5)];
  const hole = [n(1, 1), n(2, 1), n(2, 2), n(1, 2)];
  const b = [a[1]!, n(10, 0), n(10, 5), a[2]!];
  for (const c of [...a, b[1]!, b[2]!]) if (z === 3) modelStore.addSupport(c, 'pinned3d');
  const pa = createPlate({ outline: a, holes: [hole], materialId: 1, thickness: 0.15, name: `A${z}` }) as { id: number };
  const pb = createPlate({ outline: b, materialId: 1, thickness: 0.15, name: `B${z}` }) as { id: number };
  for (const p of [pa, pb]) expect(p.id).toBeGreaterThan(0);
  return [b[1]!, b[2]!] as const;
}

function floorWithCurvedBalcony(z: number) {
  const [near, far] = floor(z);
  const start = modelStore.addNode(12, 0, z);
  const mid = modelStore.addNode(12.5, 2.5, z);
  const end = modelStore.addNode(12, 5, z);
  const balcony = createPlate({
    outline: [near, start, mid, end, far], arcMids: [2],
    materialId: 1, thickness: 0.12, name: `Bal${z}`, followArcs: false,
  }) as { id: number };
  expect(balcony.id).toBeGreaterThan(0);
}

const meshAll = (size = 0.5, element: 'quad' | 'tri' = 'quad') => applyPlateMeshes(physicalPlates().map(p =>
  planPlateMesh(p.id, { size, element, followMembers: true })!));
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
    floorWithCurvedBalcony(3); floorWithCurvedBalcony(6);
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
    floorWithCurvedBalcony(3);
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
    floorWithCurvedBalcony(3);
    meshAll(0.5);
    for (const c of modelStore.model.loadCases.filter((c) => c.type === 'D')) modelStore.removeLoadCase(c.id);
    const z1 = zone([[0, 2.5], [3, 2.5], [3, 5], [0, 5]], 3, 'Estar');
    const pkg = addFinishPackage('Piso', { layers: [{ name: 'piso', q: 1 }] });
    setZoneUse([z1], { occupancy: 'vivienda', provenance: 'confirmed', finish: String(pkg) });
    const plan = zoneLoadPlan()!;
    expect(plan.add.map((a) => a.role)).toEqual(['live']);
    expect(plan.finishNoCase).toEqual([{ zoneId: z1, zone: 'Estar' }]);
  });

  it('refuses preparation when the curved balcony leaves unmatched stations on the next slab', () => {
    floorWithCurvedBalcony(3);
    expect(preparePlatesForAnalysis()).toEqual({ ok: false, reason: 'needsMesh', plates: ['B3'] });
    expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringContaining('B3'));
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

  it.each(['tri', 'quad'] as const)('#2607 checks floor pressure after meshing with %s cells', element => {
    floor(3);
    meshAll(0.5, element);
    const z1 = zone([[0, 0], [6, 0], [6, 5], [0, 5]], 3, 'Oficina');
    setZoneUse([z1], { occupancy: 'oficina', provenance: 'confirmed' });
    applyZoneLoadPlan(zoneLoadPlan()!);
    syncDefinedLoadsForAnalysis();
    const res = modelStore.solve3D(false, false, true);
    if (element === 'quad') {
      const load = modelStore.loads.find(l => l.type === 'surface3d' && l.data.quadId === 1);
      expect(res).toBe(surfaceRefusal(load!.data.caseId!, 1));
      return;
    }
    expect(typeof res, String(res)).not.toBe('string');
    const fz = (res as AnalysisResults3D).reactions.reduce((s, x) => s + x.fz, 0);
    // The zone covers plate A less its hole: 2.5 × 29.
    expect(fz).toBeCloseTo(2.5 * 29, 5);
  });

  const reviewedTrapezoids = [
    { width: 4, topWidth: 3, height: 2, clippedWidth: 3, shares: [-3, 3, -4, 4] },
    { width: 2, topWidth: 1, height: 1, clippedWidth: 1, shares: [1, -1, 2, -2] },
  ];
  const cornerAuditRoutes = ['case', 'case async', 'linear', 'linear async', 'pdelta', 'pdelta async', 'uplift', 'uplift async', 'notional'];
  it.each([
    ...reviewedTrapezoids.flatMap(geometry => cornerAuditRoutes.map(route => ({ ...geometry, route, perturb: true }))),
    ...reviewedTrapezoids.map(geometry => ({ ...geometry, route: 'case', perturb: false })),
    { ...reviewedTrapezoids[0]!, route: 'restored project', perturb: true },
  ])('#2607 refuses clipped $width-to-$topWidth quad on $route (perturbed $perturb)', async ({
    width, topWidth, height, clippedWidth, shares, route, perturb,
  }) => {
    const corners = [[0, 0], [width, 0], [topWidth, height], [0, height]] as const;
    const nodes = corners.map(([x, y]) => modelStore.addNode(x, y, 3));
    for (const id of nodes) modelStore.addSupport(id, 'pinned3d');
    const quadId = modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
    const zoneId = zone([[0, 0], [clippedWidth, 0], [clippedWidth, height], [0, height]], 3, 'Oficina');
    setZoneUse([zoneId], { occupancy: 'oficina', provenance: 'confirmed' });
    applyZoneLoadPlan(zoneLoadPlan()!);
    if (route === 'restored project') {
      const saved = serializeProject();
      modelStore.clear();
      expect(deserializeProject(saved)).toBe(true);
    }
    syncDefinedLoadsForAnalysis();
    const load = modelStore.loads.find(l => l.type === 'surface3d' && l.data.fromDef !== undefined);
    if (load?.type !== 'surface3d') throw new Error('Expected a zone surface load');
    const caseId = load.data.caseId!;
    for (const combo of modelStore.model.combinations) modelStore.removeCombination(combo.id);
    if (route === 'notional') {
      expect(modelStore.updateLoadCaseFields(caseId, { reference: true })).toBe(true);
      const id = modelStore.addLoadCase('Notional from the zone', 'L');
      expect(modelStore.updateLoadCaseFields(id, { notional: { sourceCaseId: caseId, ratio: 0.002, dir: '+X' } })).toBe(true);
      modelStore.addCombination('Notional from the zone', [{ caseId: id, factor: 1 }]);
    } else {
      modelStore.addCombination('Zone live load', [{ caseId, factor: 2 }]);
    }
    if (route.startsWith('uplift')) modelStore.updateSupport(nodes[0]!, { uplift: true });
    modelStore.setAnalysis({ perCombination: route.startsWith('pdelta') ? 'pdelta' : 'linear' });

    const delta = shares.map(share => share / 16);
    expect(delta.reduce((sum, fz) => sum + fz, 0)).toBe(0);
    for (const axis of [0, 1] as const) {
      expect(delta.reduce((sum, fz, i) => sum + fz * corners[i]![axis], 0)).toBe(0);
    }
    const original = shellIntegration.shellLoadForces;
    let observed = false;
    const integration = vi.spyOn(shellIntegration, 'shellLoadForces').mockImplementation((kind, points, spec) => {
      const result = original(kind, points, spec);
      if (result && kind === 'quad' && spec.region) {
        observed = true;
        if (perturb) {
          result.forces.forEach((force, i) => {
            const changed = force[2] + delta[i]!;
            expect(Math.sign(changed)).toBe(Math.sign(force[2]));
            force[2] = changed;
          });
        }
      }
      return result;
    });
    try {
      const result = route === 'case' || route === 'restored project' ? modelStore.solve3D(false, false, true)
        : route === 'case async' ? await modelStore.solve3DAsync(false, false, true)
        : route.endsWith('async') ? await modelStore.solveCombinations3DParallel(false, false, true)
        : modelStore.solveCombinations3D(false, false, true);
      expect(observed).toBe(true);
      expect(result).toBe(surfaceRefusal(caseId, quadId));
    } finally {
      integration.mockRestore();
    }
  });

  it.each([
    ...['case', 'case async', 'linear', 'linear async', 'pdelta', 'pdelta async', 'uplift', 'uplift async', 'notional']
      .map(route => ({ route, delta: [47, -47, 47, -47], component: 'Fz', error: 'reversed corner direction' })),
    { route: 'case', delta: [1, -1, 1, -1], component: 'Fz', error: 'alternating corner shares on a rectangle' },
    { route: 'case', delta: [1, -1, 0, 0], component: 'My', error: 'moment about Y' },
    { route: 'case', delta: [1, 0, 0, -1], component: 'Mx', error: 'moment about X' },
    { route: 'case', delta: [1, 1, 1, 1], component: 'Fz', error: 'resultant force' },
  ])('#2607 refuses a corrupted use-zone $error in $route', async ({ route, delta, component, error }) => {
    const shell = [[0, 0], [6, 0], [6, 5], [0, 5]] as const;
    const nodes = shell.map(([x, y]) => modelStore.addNode(x, y, 3));
    for (const nodeId of nodes) modelStore.addSupport(nodeId, 'pinned3d');
    modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
    const z1 = zone([[0, 0], [3, 0], [3, 4], [0, 4]], 3, 'Oficina');
    setZoneUse([z1], { occupancy: 'oficina', provenance: 'confirmed' });
    applyZoneLoadPlan(zoneLoadPlan()!);
    syncDefinedLoadsForAnalysis();
    const load = modelStore.loads.find(l => l.type === 'surface3d' && l.data.fromDef !== undefined);
    if (load?.type !== 'surface3d') throw new Error('Expected a zone surface load');
    for (const combo of modelStore.model.combinations) modelStore.removeCombination(combo.id);
    const caseId = load.data.caseId!;
    if (route === 'notional') {
      expect(modelStore.updateLoadCaseFields(caseId, { reference: true })).toBe(true);
      const id = modelStore.addLoadCase('Notional from the zone', 'L');
      expect(modelStore.updateLoadCaseFields(id, { notional: { sourceCaseId: caseId, ratio: 0.002, dir: '+X' } })).toBe(true);
      modelStore.addCombination('Notional from the zone', [{ caseId: id, factor: 1 }]);
    } else {
      modelStore.addCombination('Zone live load', [{ caseId, factor: 2 }]);
    }
    if (route.startsWith('uplift')) modelStore.updateSupport(nodes[0]!, { uplift: true });
    modelStore.setAnalysis({ perCombination: route.startsWith('pdelta') ? 'pdelta' : 'linear' });

    const original = shellIntegration.shellLoadForces;
    if (error !== 'resultant force') expect(delta.reduce((sum, fz) => sum + fz, 0)).toBe(0);
    for (const [axis, name] of ['My', 'Mx'].entries()) {
      const firstMoment = delta.reduce((sum, fz, i) => sum + fz * shell[i]![axis]!, 0);
      if (component === name) expect(firstMoment).not.toBe(0);
      else if (error !== 'resultant force') expect(firstMoment).toBe(0);
    }
    const corrupt = vi.spyOn(shellIntegration, 'shellLoadForces').mockImplementation((kind, points, spec) => {
      const result = original(kind, points, spec);
      if (result && kind === 'quad' && spec.region) {
        result.forces.forEach((force, i) => { force[2] += delta[i]!; });
      }
      return result;
    });
    try {
      const result = route === 'case' ? modelStore.solve3D(false, false, true)
        : route === 'case async' ? await modelStore.solve3DAsync(false, false, true)
        : route.endsWith('async') ? await modelStore.solveCombinations3DParallel(false, false, true)
        : modelStore.solveCombinations3D(false, false, true);
      expect(corrupt).toHaveBeenCalled();
      expect(typeof result).toBe('string');
      expect(result).toContain('Analysis refused.');
      expect(result).toContain(component);
    } finally {
      corrupt.mockRestore();
    }
  });

  it.each(reviewedTrapezoids)('#2607 accounts for every corner of a whole $width-to-$topWidth quad',
    ({ width, topWidth, height }) => {
      const nodes = [[0, 0], [width, 0], [topWidth, height], [0, height]]
        .map(([x, y]) => modelStore.addNode(x!, y!, 3));
      for (const id of nodes) modelStore.addSupport(id, 'pinned3d');
      const quadId = modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
      const q = 1;
      modelStore.addSurfaceLoad3D(quadId, q);
      const result = modelStore.solve3D(false, false, true);
      expect(result, String(result)).toEqual(expect.objectContaining({ reactions: expect.any(Array) }));
      const { reactions } = result as AnalysisResults3D;
      const lower = q * height * (2 * width + topWidth) / 12;
      const upper = q * height * (width + 2 * topWidth) / 12;
      for (const [i, expected] of [lower, lower, upper, upper].entries()) {
        expect(reactions.find(r => r.nodeId === nodes[i])?.fz).toBeCloseTo(expected, 10);
      }
    });

  it.each([
    { topWidth: 5.875, reversed: false }, { topWidth: 5.875, reversed: true },
    { topWidth: 6, reversed: false }, { topWidth: 6, reversed: true },
  ])('#2607 accounts for overlapping openings (top width $topWidth, reversed $reversed)', ({ topWidth, reversed }) => {
    const nodes = [[0, 0], [6, 0], [topWidth, 5], [0, 5]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    for (const nodeId of nodes) modelStore.addSupport(nodeId, 'pinned3d');
    const quadId = modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
    const z = (outline: [number, number][], name: string) => zone(reversed ? outline.reverse() : outline, 3, name);
    const first = z([[1, 1], [2, 1], [2, 2], [1, 2]], 'Opening A');
    const second = z([[1.5, 1], [2.5, 1], [2.5, 2], [1.5, 2]], 'Opening B');
    const outline = [[-1, 0], [3, 0], [3, 4], [-1, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    const z1 = addLoadZone('Oficina', reversed ? outline.reverse() : outline, [], [first, second]);
    setZoneUse([z1], { occupancy: 'oficina', provenance: 'confirmed' });
    applyZoneLoadPlan(zoneLoadPlan()!);
    syncDefinedLoadsForAnalysis();

    const result = modelStore.solve3D(false, false, true);
    if (topWidth !== 6) {
      const load = modelStore.loads.find(l => l.type === 'surface3d' && l.data.quadId === quadId);
      expect(result).toBe(surfaceRefusal(load!.data.caseId!, quadId));
      return;
    }
    expect(result, String(result)).toEqual(expect.objectContaining({ reactions: expect.any(Array) }));
    const { reactions } = result as AnalysisResults3D;
    const q = 2.5, covered = 3 * 4, opening = 1.5 * 1;
    expect.soft(reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(q * (covered - opening), 5);
    expect.soft(reactions.reduce((sum, r) => sum + r.mx + modelStore.nodes.get(r.nodeId)!.y * r.fz, 0))
      .toBeCloseTo(q * (covered * 2 - opening * 1.5), 5);
    expect.soft(reactions.reduce((sum, r) => sum + r.my - modelStore.nodes.get(r.nodeId)!.x * r.fz, 0))
      .toBeCloseTo(-q * (covered * 1.5 - opening * 1.75), 5);
  });

  it.each([false, true])('#2607 accounts for a clipped use-zone force and moments (uplift %s)', async uplift => {
    const nodes = [[0, 0], [6, 0], [6, 5], [0, 5]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    for (const nodeId of nodes) modelStore.addSupport(nodeId, 'pinned3d');
    modelStore.addQuad(nodes as [number, number, number, number], 1, 0.15);
    const width = 4.25, length = 3.75;
    const z1 = zone([[0, 0], [width, 0], [width, length], [0, length]], 3, 'Oficina');
    setZoneUse([z1], { occupancy: 'oficina', provenance: 'confirmed' });
    applyZoneLoadPlan(zoneLoadPlan()!);
    syncDefinedLoadsForAnalysis();
    const load = modelStore.loads.find(l => l.type === 'surface3d' && l.data.fromDef !== undefined)!;
    expect(load.type).toBe('surface3d');
    if (load.type !== 'surface3d') throw new Error('Expected a zone surface load');
    const caseId = load.data.caseId!;
    const comboId = modelStore.addCombination('Zone live load', [{ caseId, factor: 2 }]);
    if (uplift) modelStore.updateSupport(modelStore.supports.keys().next().value!, { uplift: true });
    const check = (res: AnalysisResults3D | string | null | undefined, factor = 1) => {
      expect(res, String(res)).toEqual(expect.objectContaining({ reactions: expect.any(Array) }));
      const { reactions } = res as AnalysisResults3D;
      const q = 2.5 * factor, area = width * length;
      const right = width * width / (2 * 6), top = length * length / (2 * 5);
      const left = width - right, bottom = length - top;
      for (const [i, share] of [left * bottom, right * bottom, right * top, left * top].entries()) {
        expect.soft(reactions.find(r => r.nodeId === nodes[i])?.fz).toBeCloseTo(q * share, 10);
      }
      expect.soft(reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(q * area, 5);
      expect.soft(reactions.reduce((sum, r) => sum + r.mx + modelStore.nodes.get(r.nodeId)!.y * r.fz, 0))
        .toBeCloseTo(q * area * length / 2, 5);
      expect.soft(reactions.reduce((sum, r) => sum + r.my - modelStore.nodes.get(r.nodeId)!.x * r.fz, 0))
        .toBeCloseTo(-q * area * width / 2, 5);
    };
    check(modelStore.solve3D(false, false, true));
    check(await modelStore.solve3DAsync(false, false, true));
    for (const method of uplift ? ['linear'] as const : ['linear', 'pdelta'] as const) {
      modelStore.setAnalysis({ perCombination: method });
      for (const bundle of [
        modelStore.solveCombinations3D(false, false, true),
        await modelStore.solveCombinations3DParallel(false, false, true),
      ]) {
        expect(bundle, String(bundle)).toEqual(expect.objectContaining({ perCombo: expect.any(Map) }));
        if (!bundle || typeof bundle === 'string') continue;
        const result = bundle.perCombo.get(comboId);
        check(result, 2);
        if (method === 'pdelta') expect(result?.secondOrder?.converged).toBe(true);
        if (uplift) expect(result?.nonlinear).toBeDefined();
      }
    }
  });
});
