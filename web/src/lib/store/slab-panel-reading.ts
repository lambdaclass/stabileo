/**
 * A slab panel as the floor systems read it: the shells of a physical slab group, their plan box
 * and level, the direction the system spans (the person's, else the shorter one), and along it,
 * row by row, the mean of each combination's bending moment across the width (the largest and the
 * smallest over the combinations), the largest transverse shear, and the dead and live loads the
 * panel carries by case. Shared by the joist floors and the special slabs (ribbed, hollow-core,
 * composite deck), so they read a panel one way.
 */
import { modelStore } from './model.svelte';
import { activePerCombo3D } from './active-results';
import { resultsStore } from './results.svelte';
import { concreteFc } from '../model/design-data';
import type { physicalGroups } from './physical';

type Group = ReturnType<typeof physicalGroups>[number];
type Quad = { id: number; nodes: number[]; materialId: number; thickness: number };

export interface PanelReading {
  quads: Quad[];
  box: { x0: number; x1: number; y0: number; y1: number }; z: number;
  dir: 'x' | 'y'; span: number; width: number;
  pos: Array<{ at: number; m: number }>; neg: Array<{ at: number; m: number }>;
  /** Largest transverse shear on the direction's face, kN/m (0 when the shells do not recover it). */
  vMax: number;
  /** Dead and live area loads on the panel, kPa (the shells' own weight apart). */
  dead: number; live: number;
  fc: number; Ec: number;
}

export function readSlabPanel(g: Group, direction?: 'x' | 'y'): PanelReading | null {
  const quads = (g.members.quads ?? []).map((id) => modelStore.quads.get(id)).filter(Boolean) as Quad[];
  if (!quads.length) return null;
  const pts = quads.flatMap((q) => q.nodes.map((n) => modelStore.nodes.get(n)!)).filter(Boolean);
  const box = { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
  const dir = direction ?? ((box.x1 - box.x0) <= (box.y1 - box.y0) ? 'x' : 'y');
  const span = dir === 'x' ? box.x1 - box.x0 : box.y1 - box.y0, width = dir === 'x' ? box.y1 - box.y0 : box.x1 - box.x0;
  const per = activePerCombo3D();
  const rowsBy = rowsAlong(quads, box, dir);
  const pos: Array<{ at: number; m: number }> = [], neg: Array<{ at: number; m: number }> = [];
  let vMax = 0;
  const ids = new Set(quads.map((q) => q.id));
  for (const r of per.values()) for (const s of r.quadStresses ?? []) if (ids.has(s.elementId)) vMax = Math.max(vMax, Math.abs((dir === 'x' ? s.qx : s.qy) ?? 0));
  for (const [at, rowIds] of rowsBy) {
    let hi = 0, lo = 0;
    for (const r of per.values()) {
      const mean = rowMean(r, rowIds, dir);
      if (mean === null) continue;
      hi = Math.max(hi, mean); lo = Math.min(lo, mean);
    }
    pos.push({ at, m: hi }); neg.push({ at, m: lo });
  }
  let dead = 0, live = 0;
  for (const l of modelStore.model.loads) {
    if (l.type !== 'surface3d') continue;
    const d = l.data as { quadId: number; q: number; caseId?: number };
    if (!ids.has(d.quadId)) continue;
    const type = modelStore.model.loadCases.find((c) => c.id === (d.caseId ?? 1))?.type ?? 'D';
    if (type === 'L' || type === 'Lr') live += d.q / quads.length; else if (type === 'D' || type === '') dead += d.q / quads.length;
  }
  const mat = modelStore.materials.get(quads[0]!.materialId);
  return { quads, box, z: pts[0]!.z ?? 0, dir, span, width, pos, neg, vMax, dead, live, fc: (mat ? concreteFc(mat) : undefined) ?? 25, Ec: mat?.e ?? 25000 };
}

type Results = ReturnType<typeof activePerCombo3D> extends Map<number, infer R> ? R : never;

/** The panel's shells by row across the direction, keyed by the row's distance from the box edge. */
function rowsAlong(quads: readonly Quad[], box: PanelReading['box'], dir: 'x' | 'y'): Array<[number, number[]]> {
  const centroid = (q: Quad) => { const ps = q.nodes.map((n) => modelStore.nodes.get(n)!); return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }; };
  const rowsBy = new Map<number, number[]>();
  for (const q of quads) { const c = centroid(q); const at = Math.round((dir === 'x' ? c.x - box.x0 : c.y - box.y0) * 100) / 100; rowsBy.set(at, [...(rowsBy.get(at) ?? []), q.id]); }
  return [...rowsBy].sort((a, b) => a[0] - b[0]);
}

/** Mean bending moment across a row, per metre, in one result set; null when the row has none. */
function rowMean(r: Results, rowIds: readonly number[], dir: 'x' | 'y'): number | null {
  const st = new Map((r.quadStresses ?? []).map((s) => [s.elementId, s]));
  const vals = rowIds.map((id) => st.get(id)).filter(Boolean).map((s) => (dir === 'x' ? s!.mx : s!.my));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Service moments per metre at the panel's rows, by load case: the dead cases summed, and the live
 * cases as the sum of those that sag and the sum of those that hog the row. Read by the
 * post-tensioned slabs, whose stresses are checked in service.
 */
export function panelServiceMoments(r: PanelReading): Array<{ at: number; dead: number; livePos: number; liveNeg: number }> {
  const types = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type]));
  const cases = [...resultsStore.perCase3D];
  return rowsAlong(r.quads, r.box, r.dir).map(([at, ids]) => {
    let dead = 0, livePos = 0, liveNeg = 0;
    for (const [id, res] of cases) {
      const m = rowMean(res as Results, ids, r.dir);
      if (m === null) continue;
      const t = types.get(id) ?? 'D';
      if (t === 'D' || t === '') dead += m;
      else if (t === 'L' || t === 'Lr') { if (m > 0) livePos += m; else liveNeg += m; }
    }
    return { at, dead, livePos, liveNeg };
  });
}
