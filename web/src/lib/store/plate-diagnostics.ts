/**
 * What the diagnostics list says about the physical plates (`store/physical-plates.ts`): a plate
 * with no mesh or an out-of-date one, an outline that no longer makes a plate, and meshes with
 * poor elements. Each names its plate, so a click selects it whole where its mesh is made.
 */
import { physicalPlates, plateStatus } from './physical-plates';
import { meshBeforeAnalysis } from './mesh-policy.svelte';
import type { SolverDiagnostic } from '../engine/types';
import { modelStore } from './model.svelte';
import { planRecognition } from './physical-recognition';
import { useZones, zoneLoadPlan } from './use-zones';
import { zoneHasShells, zoneOverUnmeshedPlate, zoneOverlap, zoneStatus, zoneUnsupported, zoneUseOf } from '../model/use-zones';
import type { DefinitionModel } from '../model/loads/floor-definitions';
import { constraintNodes } from '../engine/steel/unbraced-length';
import { plateLoops } from '../model/physical/plate';

/** Nodes through which a shell takes or gives load: a member's end, a support, a constraint, or a node two shells share. */
function connectingNodes(): Set<number> {
  const s = constraintNodes(modelStore.model.constraints);
  for (const el of modelStore.elements.values()) { s.add(el.nodeI); s.add(el.nodeJ); }
  for (const sup of modelStore.supports.values()) s.add(sup.nodeId);
  const count = new Map<number, number>();
  for (const q of modelStore.quads.values()) for (const n of q.nodes) count.set(n, (count.get(n) ?? 0) + 1);
  for (const q of modelStore.plates.values()) for (const n of q.nodes) count.set(n, (count.get(n) ?? 0) + 1);
  for (const [n, c] of count) if (c >= 2) s.add(n);
  return s;
}

const at = (n: number): [number, number, number] | null => { const p = modelStore.nodes.get(n); return p ? [p.x, p.y, p.z ?? 0] : null; };

function onSide(a: [number, number, number], b: [number, number, number], p: [number, number, number]): boolean {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const L2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
  if (L2 < 1e-18) return false;
  const t = (w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!) / L2;
  return t > -1e-9 && t < 1 + 1e-9 && Math.hypot(w[0]! - t * d[0]!, w[1]! - t * d[1]!, w[2]! - t * d[2]!) < 1e-6;
}

/** A plate held along a whole side may have free corners, as a balcony's tip has; a wall's foot may not. */
function looseNodes(p: ReturnType<typeof physicalPlates>[number], connecting: ReadonlySet<number>): Set<number> {
  const nodes = new Set<number>();
  for (const q of p.group.members.quads ?? []) for (const n of modelStore.quads.get(q)?.nodes ?? []) nodes.add(n);
  for (const q of p.group.members.plates ?? []) for (const n of modelStore.plates.get(q)?.nodes ?? []) nodes.add(n);
  const loose = new Set([...nodes].filter((n) => !connecting.has(n)));
  if (!loose.size) return loose;
  const outer = plateLoops(p.group).outer;
  const heldSide = outer.some((a, i) => {
    const A = at(a), B = at(outer[(i + 1) % outer.length]!);
    return !!A && !!B && [...nodes].every((n) => { const P = at(n); return !P || !onSide(A, B, P) || connecting.has(n); });
  });
  if (!heldSide) return loose;
  const zs = [...nodes].map((n) => at(n)?.[2] ?? 0);
  const foot = Math.min(...zs);
  if (p.physical.kind !== 'wall' || Math.max(...zs) - foot < 1e-6) return new Set();
  return new Set([...loose].filter((n) => Math.abs((at(n)?.[2] ?? 0) - foot) < 1e-6));
}

export function plateDiagnostics(t: (key: string) => string): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];
  const connecting = connectingNodes();
  for (const p of physicalPlates()) {
    const loose = looseNodes(p, connecting);
    if (loose.size) out.push({ source: 'model', objects: [{ kind: 'plate', id: p.id }], severity: 'warning', code: 'PLATE_LOOSE_CORNER', message: t('plates.diag.looseCorner'), details: { plate: p.name, nodes: [...loose].sort((a, b) => a - b).join(', ') } });
  }
  const review = planRecognition().proposals.filter((x) => x.status !== 'same').length;
  if (review) out.push({ source: 'model', severity: 'info', code: 'PHYSICAL_REVIEW', message: t('physical.diag.review'), details: { n: review } });
  for (const p of physicalPlates()) {
    const s = plateStatus(p.id);
    const base = { source: 'model' as const, objects: [{ kind: 'plate' as const, id: p.id }], details: { plate: p.name } };
    // Without a mesh the analysis meshes it, or stops when told not to: a warning only then.
    if (s === 'unmeshed') out.push({ ...base, severity: meshBeforeAnalysis.value ? 'info' : 'warning', code: 'PLATE_UNMESHED', message: t('plates.diag.unmeshed') });
    else if (s === 'stale') out.push({ ...base, severity: meshBeforeAnalysis.value ? 'info' : 'warning', code: 'PLATE_MESH_STALE', message: t('plates.diag.stale') });
    else if (s === 'invalid') out.push({ ...base, severity: 'error', code: 'PLATE_INVALID', message: t('plates.diag.invalid') });
    const q = p.surface.meshed?.quality;
    if (s === 'current' && q && q.poor > 0) out.push({ ...base, severity: 'warning', code: 'PLATE_MESH_POOR', message: t('plates.diag.poor'), details: { plate: p.name, poor: q.poor, minAngle: Math.round(q.minAngle) } });
  }
  return out;
}

/**
 * What the diagnostics list says about the use zones (`store/use-zones.ts`): a zone with no use
 * stated, a suggestion not confirmed, a row with no value, two zones on one place, a zone off the
 * slab, and live loads out of step with the zones. Each names its zone.
 */
export function zoneDiagnostics(t: (key: string) => string): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];
  const m = modelStore.model as unknown as DefinitionModel;
  const zones = useZones();
  const base = (id: number, name: string) => ({ source: 'model' as const, objects: [{ kind: 'zone' as const, id }], details: { zone: name } });
  for (const z of zones) {
    const s = zoneStatus(zoneUseOf(z));
    if (s === 'unassigned') out.push({ ...base(z.id, z.name), severity: 'warning', code: 'ZONE_UNASSIGNED', message: t('useZones.diag.unassigned') });
    if (s === 'pending') out.push({ ...base(z.id, z.name), severity: 'warning', code: 'ZONE_PENDING', message: t('useZones.diag.pending') });
    if (s === 'unsupported') out.push({ ...base(z.id, z.name), severity: 'warning', code: 'ZONE_NO_VALUE', message: t('useZones.diag.unsupported') });
    const off = zoneUnsupported(m, z.id);
    if (off > 1e-3 && zoneHasShells(m, z.id) && !zoneOverUnmeshedPlate(m, z.id)) out.push({ ...base(z.id, z.name), severity: 'warning', code: 'ZONE_OFF_SLAB', message: t('useZones.diag.offSlab'), details: { zone: z.name, area: Math.round(off * 100) / 100 } });
  }
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    if (Math.abs(zones[i]!.z - zones[j]!.z) > 1e-6) continue;
    const a = zoneOverlap(m, zones[i]!.id, zones[j]!.id);
    if (a > 1e-3) out.push({ source: 'model', objects: [{ kind: 'zone', id: zones[i]!.id }, { kind: 'zone', id: zones[j]!.id }], severity: 'warning', code: 'ZONE_OVERLAP', message: t('useZones.diag.overlap'), details: { zone: `${zones[i]!.name} / ${zones[j]!.name}`, area: Math.round(a * 100) / 100 } });
  }
  const plan = zoneLoadPlan();
  if (plan?.finishNoCase.length) out.push({ source: 'model', objects: plan.finishNoCase.map((f) => ({ kind: 'zone' as const, id: f.zoneId })), severity: 'warning', code: 'ZONE_FINISH_NO_CASE', message: t('useZones.diag.finishNoCase'), details: { zone: plan.finishNoCase.map((f) => f.zone).join(', ') } });
  if (plan && plan.add.length + plan.change.length + plan.remove.length > 0) {
    out.push({ source: 'model', objects: [...new Set([...plan.add, ...plan.change].map((x) => x.zoneId))].map((id) => ({ kind: 'zone' as const, id })), severity: 'warning', code: 'ZONE_LOADS_STALE', message: t('useZones.diag.stale'), details: { add: plan.add.length, change: plan.change.length, remove: plan.remove.length } });
  }
  return out;
}
