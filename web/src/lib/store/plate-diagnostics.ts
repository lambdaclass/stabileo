/**
 * What the diagnostics list says about the physical plates (`store/physical-plates.ts`): a plate
 * with no mesh or an out-of-date one, an outline that no longer makes a plate, and meshes with
 * poor elements. Each names its plate, so a click selects it whole where its mesh is made.
 */
import { physicalPlates, plateStatus } from './physical-plates';
import { meshBeforeAnalysis } from './mesh-policy.svelte';
import type { SolverDiagnostic } from '../engine/types';
import { modelStore } from './model.svelte';
import { useZones, zoneLoadPlan } from './use-zones';
import { zoneHasShells, zoneOverUnmeshedPlate, zoneOverlap, zoneStatus, zoneUnsupported, zoneUseOf } from '../model/use-zones';
import type { DefinitionModel } from '../model/loads/floor-definitions';

export function plateDiagnostics(t: (key: string) => string): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];
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
