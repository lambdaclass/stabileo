/**
 * What the project measures, once, for the memoria's quantities and for the budget: every member,
 * shell, footing and bar mark as an item with its level, its concrete (and the material it is
 * cast in), formwork and steel; the steel members by section; the bar marks; the steel joints'
 * parts. Measuring rules: a beam's formwork is its soffit and two sides, a column's its
 * perimeter, a slab's its soffit, a wall's both faces, a footing's its sides; a steel member
 * weighs its area at 7850 kg/m³; a mark shared by several members is split between them.
 */
import { modelStore } from './model.svelte';
import { detailingStore } from './detailing.svelte';
import { jointDesignStore } from './joint-design.svelte';
import { steelJoints } from './joint-typology';
import { gridFromModel, sortedLevels } from '../model/grid';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { memberFormwork, type QtyItem } from '../report/memoria/quantities';

const TOL = 0.05;

/** Level names by elevation, from the grid or the model's own levels. */
export function levelNamer() {
  const m = modelStore.model;
  const g = m.grid ?? gridFromModel(m.nodes.values(), m.elements.values());
  const levels = sortedLevels(g);
  const name = (z: number) => levels.find((l) => Math.abs(l.z - z) < TOL)?.name ?? `+${z.toFixed(2)}`;
  return { name, order: levels.map((l) => l.name) };
}

export const isSteelMaterial = (materialId: number) => materialFamilyOf(modelStore.model.materials.get(materialId) as never, catalogueGradeFamily).family === 'steel';

/** A measured item, with what the budget prices it by: the concrete's material, the section. */
export interface MeasuredItem extends QtyItem { materialId?: number; sectionId?: number; elementId?: number; shellKey?: string }

export interface Measurement {
  items: MeasuredItem[];
  steelMembers: Array<{ id: number; L: number; sectionName: string; area: number; rho?: number }>;
  marks: (typeof detailingStore.assemblies)[number]['marks'];
  parts: Array<{ kind: string; size: number[] }>;
}

export function measure(): Measurement {
  const m = modelStore.model, lv = levelNamer(), nodes = m.nodes;
  const zOf = (id: number) => nodes.get(id)?.z ?? 0;
  const vertical = (e: { nodeI: number; nodeJ: number }) => {
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    return !!a && !!b && Math.hypot(b.x - a.x, b.y - a.y) < TOL && Math.abs((b.z ?? 0) - (a.z ?? 0)) > TOL;
  };
  const lenOf = (e: { nodeI: number; nodeJ: number }) => {
    const a = nodes.get(e.nodeI), b = nodes.get(e.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
  };
  const levelOfElement = (id: number) => { const e = m.elements.get(id); return e ? lv.name(Math.max(zOf(e.nodeI), zOf(e.nodeJ))) : undefined; };
  const items: MeasuredItem[] = [];
  const steelMembers: Measurement['steelMembers'] = [];
  for (const e of m.elements.values()) {
    const s = m.sections.get(e.sectionId); if (!s) continue;
    const L = lenOf(e), kind = vertical(e) ? 'column' : 'beam', level = levelOfElement(e.id) ?? '—';
    if (isSteelMaterial(e.materialId)) { steelMembers.push({ id: e.id, L, sectionName: s.name, area: s.a }); items.push({ kind: `steel-${kind}`, level, concrete: 0, formwork: 0, steel: s.a * L * 7850, sectionId: e.sectionId, elementId: e.id }); }
    else items.push({ kind, level, concrete: s.a * L, formwork: memberFormwork(kind, s.b ?? 0, s.h ?? 0, L), steel: 0, materialId: e.materialId, elementId: e.id });
  }
  const area = (ns: number[]) => {
    const p = ns.map((n) => nodes.get(n)).filter((x): x is NonNullable<typeof x> => !!x);
    if (p.length < 3) return 0;
    const u = { x: p[1]!.x - p[0]!.x, y: p[1]!.y - p[0]!.y, z: (p[1]!.z ?? 0) - (p[0]!.z ?? 0) }, v = { x: p[p.length - 1]!.x - p[0]!.x, y: p[p.length - 1]!.y - p[0]!.y, z: (p[p.length - 1]!.z ?? 0) - (p[0]!.z ?? 0) };
    const cr = Math.hypot(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x);
    return p.length === 3 ? cr / 2 : cr;
  };
  for (const [prefix, map] of [['q', m.quads], ['p', m.plates]] as const) for (const q of map.values()) {
    if (isSteelMaterial(q.materialId)) continue;
    const zs = q.nodes.map((n) => zOf(n)), slab = Math.max(...zs) - Math.min(...zs) < TOL, A = area([...q.nodes]);
    items.push({ kind: slab ? 'slab' : 'wall', level: lv.name(Math.max(...zs)), concrete: A * q.thickness, formwork: slab ? A : 2 * A, steel: 0, materialId: q.materialId, shellKey: `${prefix}${q.id}` });
  }
  for (const f of m.footings.values()) items.push({ kind: 'footing', level: lv.name(f.foundingElevation), concrete: f.B * f.L * f.thickness, formwork: 2 * (f.B + f.L) * f.thickness, steel: 0 });
  const marks = detailingStore.assemblies.flatMap((a) => a.marks);
  for (const mk of marks) {
    const owners = mk.ownerElementIds.length ? mk.ownerElementIds : [-1];
    for (const id of owners) items.push({ kind: 'rebar', level: levelOfElement(id) ?? '—', concrete: 0, formwork: 0, steel: mk.massKg / owners.length });
  }
  const parts = steelJoints().flatMap((j) => jointDesignStore.designFor(j.nodeId, j.elementIds).typology?.parts ?? []) as Measurement['parts'];
  return { items, steelMembers, marks, parts };
}
