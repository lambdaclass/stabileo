/**
 * The typologies of the model's steel joints: what each joint reads of the members meeting there
 * (their role, direction, section and end forces over the combinations), the proposal for every
 * joint, plates made equal across joints alike, and every joint's state.
 */
import { modelStore } from './model.svelte';
import { jointDesignStore } from './joint-design.svelte';
import { activePerCombo3D } from './active-results';
import { resultsStore } from './results.svelte';
import { resolveConcreteProperties } from './detailing-project-inputs';
import { detectJoints } from '../engine/connection-design';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { proposeAndSize, type JointMember, type JointSection, type TypologyContext, type TypologyParams } from '../connection/typology';

const P = (id: number) => modelStore.nodes.get(id) as { x: number; y: number; z?: number } | undefined;

function sectionOf(elementId: number): JointSection | null {
  const e = modelStore.elements.get(elementId);
  const s = e ? modelStore.sections.get(e.sectionId) as { name: string; shape?: string; h?: number; b?: number; tf?: number; tw?: number; t?: number; a?: number; r?: number } | undefined : undefined;
  const m = e ? modelStore.materials.get(e.materialId) as { fy?: number; fu?: number } | undefined : undefined;
  // An angle or a tube has one wall thickness, which is both its «flange» and its «web».
  const tf = s?.tf ?? s?.t, tw = s?.tw ?? s?.t;
  if (!s?.h || !s.b || !tf || !tw || !s.a) return null;
  return { name: s.name, ...(s.shape ? { shape: s.shape } : {}), d: s.h * 1000, bf: s.b * 1000, tf: tf * 1000, tw: tw * 1000, ...(s.r ? { r: s.r * 1000 } : {}), A: s.a * 1e6, Fy: m?.fy ?? 240, Fu: m?.fu ?? 370 };
}

/** The members of a joint as the typologies read them. */
export function typologyContext(nodeId: number, elementIds: readonly number[]): TypologyContext | null {
  const n = P(nodeId);
  if (!n) return null;
  const forces = [...(activePerCombo3D().size ? activePerCombo3D().values() : resultsStore.results3D ? [resultsStore.results3D] : [])];
  const members: JointMember[] = [];
  for (const id of elementIds) {
    const e = modelStore.elements.get(id);
    if (!e) continue;
    const atI = e.nodeI === nodeId, o = P(atI ? e.nodeJ : e.nodeI);
    if (!o) continue;
    const d = { x: o.x - n.x, y: o.y - n.y, z: (o.z ?? 0) - (n.z ?? 0) }, L = Math.hypot(d.x, d.y, d.z) || 1;
    const dir = { x: d.x / L, y: d.y / L, z: d.z / L }, inclination = (Math.asin(Math.max(-1, Math.min(1, dir.z))) * 180) / Math.PI;
    const kind: JointMember['kind'] = Math.abs(inclination) > 70 ? 'column' : (e.type === 'truss' || (Math.abs(inclination) > 20)) ? 'brace' : 'beam';
    let N = 0, V = 0, M = 0;
    for (const r of forces) {
      const f = r.elementForces?.find((x) => x.elementId === id);
      if (!f) continue;
      const n0 = atI ? f.nStart : f.nEnd, v0 = atI ? Math.hypot(f.vyStart, f.vzStart) : Math.hypot(f.vyEnd, f.vzEnd), m0 = Math.abs(atI ? f.myStart : f.myEnd);
      if (Math.abs(n0) > Math.abs(N)) N = n0;
      V = Math.max(V, v0); M = Math.max(M, m0);
    }
    const el = e as { releaseMyStart?: boolean; releaseMyEnd?: boolean; hingeStart?: boolean; hingeEnd?: boolean };
    const released = atI ? !!(el.releaseMyStart || el.hingeStart) : !!(el.releaseMyEnd || el.hingeEnd);
    members.push({ id, kind, dir, inclination, section: sectionOf(id), N, V, M, released });
  }
  const sup = [...modelStore.supports.values()].find((s) => s.nodeId === nodeId) as { type?: string } | undefined;
  const support = sup ? (/fixed/i.test(sup.type ?? '') ? 'fixed' : 'pinned') : null;
  const fc = resolveConcreteProperties().fc;
  return { nodeId, origin: { x: n.x, y: n.y, z: n.z ?? 0 }, members, support, ...(fc > 0 ? { concreteFc: fc } : {}) };
}

const steelJoint = (elementIds: readonly number[]) => elementIds.length > 0 && elementIds.every((id) => {
  const e = modelStore.elements.get(id), m = e ? modelStore.materials.get(e.materialId) : undefined;
  return !!m && materialFamilyOf(m as never, catalogueGradeFamily).family === 'steel';
});

export function steelJoints() {
  return detectJoints(modelStore.nodes as never, modelStore.elements as never, modelStore.supports as never).filter((j) => steelJoint(j.elementIds));
}

/** Propose and size a typology at every steel joint (or those given) that has none. Returns how many. */
export function proposeAllJoints(nodeIds?: readonly number[], overwrite = false): { proposed: number; unresolved: Array<{ nodeId: number; reasonKey: string }> } {
  let proposed = 0;
  const unresolved: Array<{ nodeId: number; reasonKey: string }> = [];
  for (const j of steelJoints()) {
    if (nodeIds && !nodeIds.includes(j.nodeId)) continue;
    if (!overwrite && jointDesignStore.choicesFor(j.nodeId).typology) continue;
    const ctx = typologyContext(j.nodeId, j.elementIds);
    if (!ctx) continue;
    const r = proposeAndSize(ctx);
    if (!r.kind) { unresolved.push({ nodeId: j.nodeId, reasonKey: r.reasonKey }); continue; }
    jointDesignStore.set(j.nodeId, { typology: { kind: r.kind, params: r.params, ...(r.mainId !== undefined ? { mainId: r.mainId } : {}) } });
    if (r.state === 'unresolved' || r.unresolvedKey) unresolved.push({ nodeId: j.nodeId, reasonKey: r.unresolvedKey ?? 'joint.typ.unresolved.limits' });
    proposed++;
  }
  return { proposed, unresolved };
}

/**
 * Make the plates equal across joints alike: the same typology between the same sections takes the
 * largest of each parameter among them, so one detail serves them all. Returns the groups changed.
 */
export function equalizeJointPlates(): number {
  const groups = new Map<string, Array<{ nodeId: number; params: Partial<TypologyParams> }>>();
  for (const j of steelJoints()) {
    const t = jointDesignStore.choicesFor(j.nodeId).typology;
    if (!t?.params) continue;
    const key = `${t.kind}|${j.elementIds.map((id) => sectionOf(id)?.name ?? '?').sort().join('+')}`;
    groups.set(key, [...(groups.get(key) ?? []), { nodeId: j.nodeId, params: t.params }]);
  }
  let changed = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const max: Partial<TypologyParams> = {};
    for (const k of ['plateT', 'boltD', 'rows', 'weldLeg', 'plateN', 'plateB', 'anchorD', 'anchors'] as const) {
      const vals = g.map((x) => x.params[k]).filter((v): v is number => typeof v === 'number');
      if (vals.length) (max as Record<string, number>)[k] = Math.max(...vals);
    }
    if (g.some((x) => x.params.stiffeners)) max.stiffeners = true;
    for (const x of g) {
      const t = jointDesignStore.choicesFor(x.nodeId).typology!;
      jointDesignStore.set(x.nodeId, { typology: { ...t, params: { ...t.params, ...max } } });
    }
    changed++;
  }
  return changed;
}

/** Every steel joint with its typology and state, for the list. */
export function jointsReport() {
  return steelJoints().map((j) => {
    const c = jointDesignStore.choicesFor(j.nodeId);
    const d = c.typology ? jointDesignStore.designFor(j.nodeId, j.elementIds) : null;
    const worst = d?.typology ? Math.max(0, ...d.typology.checks.map((x) => x.ratio)) : null;
    return { nodeId: j.nodeId, elementIds: j.elementIds, kind: c.typology?.kind ?? null, state: d?.typology?.state ?? null, worst, unresolvedKey: d?.typology?.unresolvedKey ?? null };
  });
}
