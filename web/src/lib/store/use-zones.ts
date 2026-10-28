/**
 * Use zones in the model (`model/use-zones.ts`): drawn on a level, read from a template's closed
 * outlines, told their use, copied to other levels, and turned into live loads by a plan the
 * engineer reviews. Each command is one undo step.
 */
import { modelStore } from './model.svelte';
import { addLoadZone, removeLoadZone, syncDefinedLoads } from './defined-loads';
import { planZoneLoads, zoneDefinition, zoneUseOf, type FinishPackage, type UseData, type ZonePlan, type ZoneUse } from '../model/use-zones';
import { zoneOutline, zoneOutlineProblem, type DefinitionModel } from '../model/loads/floor-definitions';
import { classifyRoomLabel, roomOccupancyCandidates } from '../cad/rooms';
import { laidPoint, type Underlay } from '../model/underlay';
import type { ModelGroup } from './model.svelte';

const dm = (): DefinitionModel => modelStore.model as unknown as DefinitionModel;

/** Every use zone (load zone) of the model, with its level. */
export function useZones(): Array<ModelGroup & { z: number }> {
  const out: Array<ModelGroup & { z: number }> = [];
  for (const g of modelStore.model.groups.values()) {
    if (g.kind !== 'loadZone') continue;
    const o = zoneOutline(dm(), g.id);
    out.push({ ...g, z: o ? o.outer[0]![2] : 0 });
  }
  return out;
}

/** The live case zones load: the first case of type L. */
export function liveCaseId(): number | null {
  return modelStore.model.loadCases.find((c) => c.type === 'L')?.id ?? null;
}

/** A node at a point of a level: the one already there, or a new one. */
function nodeAt(x: number, y: number, z: number, tol = 1e-4): number {
  for (const [id, n] of modelStore.nodes) if (Math.abs((n.z ?? 0) - z) <= tol && Math.hypot(n.x - x, n.y - y) <= tol) return id;
  return modelStore.addNode(x, y, z);
}

/** A zone from points of a level (its outline in order), with a name and a use; -1 when they make no zone. */
export function createUseZone(points: Array<{ x: number; y: number }>, z: number, name: string, use?: ZoneUse): number {
  let id = -1;
  modelStore.batch(() => {
    const outline = points.map((p) => nodeAt(p.x, p.y, z));
    if (zoneOutlineProblem(dm(), outline)) return;
    id = addLoadZone(name, outline);
    if (id >= 0 && use) setZoneUse([id], use);
  });
  return id;
}

/** A zone from model nodes already picked, in order. */
export function createUseZoneFromNodes(outline: number[], name: string, use?: ZoneUse): number {
  let id = -1;
  modelStore.batch(() => {
    id = addLoadZone(name, outline);
    if (id >= 0 && use) setZoneUse([id], use);
  });
  return id;
}

/** State the use of several zones at once (a patch over each one's use). */
export function setZoneUse(ids: readonly number[], patch: Partial<ZoneUse>): void {
  modelStore.batch(() => {
    for (const id of ids) {
      const g = modelStore.model.groups.get(id);
      if (!g || g.kind !== 'loadZone') continue;
      const d = (g.data ?? {}) as UseData;
      const use: ZoneUse = { provenance: 'manual', ...(d.use ?? {}), ...patch };
      // A stated value or decision replaces what contradicts it.
      if (patch.none) { delete use.occupancy; delete use.manualQ; }
      if (patch.occupancy !== undefined || patch.manualQ !== undefined) delete use.none;
      modelStore.setGroupData(id, { ...d, use } as unknown as Record<string, unknown>);
    }
  });
}

/** Confirm the suggestion of each zone: its use becomes the engineer's. */
export function confirmZoneUse(ids: readonly number[]): void {
  setZoneUse(ids, { provenance: 'confirmed' });
}

/**
 * The closed outlines of a template on a level, as zone candidates: each closed polyline on the
 * layers given, with the room label inside it, if any (texts are not kept as shapes: labels come
 * from `labels`, already laid).
 */
export function templateOutlines(u: Underlay, layers: readonly string[], labels: Array<{ x: number; y: number; text: string }> = templateLabels(u)): Array<{ points: Array<{ x: number; y: number }>; label?: string }> {
  const L = new Set(layers.map((l) => (u.layers ?? []).indexOf(l)));
  const out: Array<{ points: Array<{ x: number; y: number }>; label?: string }> = [];
  for (const sh of u.shapes ?? []) {
    if (sh.k !== 'p' || !sh.closed || sh.pts.length < 3 || !L.has(sh.L)) continue;
    const pts = sh.pts.map(([x, y]) => { const [lx, ly] = laidPoint(u, x, y); return { x: lx, y: ly }; });
    const inside = labels.find((t) => pointIn(t, pts));
    out.push({ points: pts, ...(inside ? { label: inside.text } : {}) });
  }
  return out;
}

/** A template's texts, laid on the model: the labels its closed outlines may hold. */
export function templateLabels(u: Underlay): Array<{ x: number; y: number; text: string }> {
  return (u.shapes ?? []).flatMap((sh) => (sh.k === 't' ? [{ ...(([x, y]) => ({ x, y }))(laidPoint(u, sh.at[0], sh.at[1])), text: sh.text }] : []));
}

function pointIn(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** What a label suggests for a zone: its name and the table rows it may be, pending confirmation. */
export function suggestUse(label: string): ZoneUse | undefined {
  const room = classifyRoomLabel(label);
  if (!room) return { name: label.trim(), provenance: 'suggested', candidates: [] };
  const candidates = roomOccupancyCandidates(room.raw);
  return { name: room.raw, provenance: 'suggested', candidates, ...(candidates[0] ? { occupancy: candidates[0] } : {}) };
}

/** Remove zones with the loads they generated; one undo step. */
export function deleteUseZones(ids: readonly number[]): void {
  modelStore.batch(() => {
    for (const id of ids) {
      for (const g of [...modelStore.model.groups.values()]) if (g.kind === 'floorLoad' && (g.data as { fromZone?: number } | undefined)?.fromZone === id) modelStore.removeGroup(g.id);
      removeLoadZone(id);
    }
  });
}

/** The dead case finishes load: the first case of type D. */
export function deadCaseId(): number | null {
  return modelStore.model.loadCases.find((c) => c.type === 'D')?.id ?? null;
}

/** The plan of the zones' live loads and finishes against the definitions there are. Null without a live case. */
export function zoneLoadPlan(zoneIds?: readonly number[]): ZonePlan | null {
  const live = liveCaseId();
  return live === null ? null : planZoneLoads(dm(), live, zoneIds, deadCaseId());
}

// ─── Finishes ────────────────────────────────────────────────────

export function finishPackages(): ModelGroup[] {
  return [...modelStore.model.groups.values()].filter((g) => g.kind === 'finishPackage');
}

/** A package of finishes; its id. */
export function addFinishPackage(name: string, pkg: FinishPackage): number {
  return modelStore.addGroup(name, 'finishPackage', {}, { data: pkg as unknown as Record<string, unknown> });
}

export function setFinishPackage(id: number, pkg: FinishPackage): void {
  modelStore.setGroupData(id, pkg as unknown as Record<string, unknown>);
}

/** Remove a package; the zones it was given to lose it (their finish loads go at the next plan). */
export function removeFinishPackage(id: number): void {
  modelStore.batch(() => {
    for (const z of useZones()) if (zoneUseOf(z)?.finish === String(id)) setZoneUse([z.id], { finish: undefined });
    modelStore.removeGroup(id);
  });
}

/** Write a reviewed plan: definitions added, changed and removed, the loads rewritten; one undo step. */
export function applyZoneLoadPlan(plan: ZonePlan): { added: number; changed: number; removed: number } {
  modelStore.batch(() => {
    for (const r of plan.remove) if (modelStore.model.groups.has(r.defId)) modelStore.removeGroup(r.defId);
    for (const c of plan.change) modelStore.setGroupData(c.defId!, zoneDefinition(c) as unknown as Record<string, unknown>);
    for (const a of plan.add) modelStore.addGroup(`${a.zone} · ${a.role === 'finish' ? 'D' : 'L'}`, 'floorLoad', {}, { data: zoneDefinition(a) as unknown as Record<string, unknown> });
    syncDefinedLoads();
  });
  return { added: plan.add.length, changed: plan.change.length, removed: plan.remove.length };
}

/**
 * Copy zones to other levels, each one's outline at the same plan position: a level whose slab
 * does not reach under a copied zone is reported for it (`fit`), and nothing is copied twice onto
 * a zone of the same outline already there. One undo step.
 */
export function copyZonesToLevels(ids: readonly number[], levelZs: readonly number[]): { copied: number; skipped: number } {
  let copied = 0, skipped = 0;
  modelStore.batch(() => {
    for (const id of ids) {
      const g = modelStore.model.groups.get(id);
      const o = zoneOutline(dm(), id);
      if (!g || !o) continue;
      for (const z of levelZs) {
        if (Math.abs(z - o.outer[0]![2]) < 1e-6) continue;
        const same = useZones().some((x) => Math.abs(x.z - z) < 1e-6 && sameOutline(zoneOutline(dm(), x.id)?.outer ?? [], o.outer));
        if (same) { skipped++; continue; }
        const nz = createUseZone(o.outer.map((p) => ({ x: p[0], y: p[1] })), z, g.name, zoneUseOf(g));
        if (nz >= 0) copied++;
      }
    }
  });
  return { copied, skipped };
}

function sameOutline(a: ReadonlyArray<readonly number[]>, b: ReadonlyArray<readonly number[]>): boolean {
  if (a.length !== b.length) return false;
  return a.every((p) => b.some((q) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!) < 1e-4));
}
