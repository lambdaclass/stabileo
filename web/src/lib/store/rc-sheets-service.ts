/**
 * The unfactored response the sheets' deflection checks read (`rc-sheets/deflection.ts`), by load
 * group: the dead cases, the live cases, and the roof live, snow and rain cases, each at 1.0 from
 * the cases solved apart. A beam span's comes from its own moment diagram; a slab panel's from its
 * shells' vertical displacements, measured from its supporting edges when beams or walls hold all
 * four, from its root when it is a cantilever, else from its corners. A member on the ground (a
 * mat, a beam on springs) is not checked.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { combineResults3D } from '../engine/wasm-solver';
import { isCompositeCase } from '../engine/loads/combination-cases';
import { uzAt, type DeflectionModel } from '../engine/detailing/slab-deflection';
import { beamDemands, slabDemands, type DemandGroup, type DemandInput, type DemandSet } from '../rc-sheets/demands';
import { cantileverRoot, chordDeflectionEI, slabEdges, type LoadState, type Serviceable, type ServiceSpan, type SlabEdges } from '../rc-sheets/deflection';
import type { BeamDemand } from '../rc-sheets/beam-row';
import type { SlabDemand, SlabFace } from '../rc-sheets/slab-row';
import type { LevelGeometry } from '../rc-sheets/slab-plan';
import type { AnalysisResults3D } from '../engine/types-3d';

type Group = 'dead' | 'live' | 'roof';
const GROUPS: readonly Group[] = ['dead', 'live', 'roof'];
const TYPES: Record<Group, readonly string[]> = { dead: ['D'], live: ['L'], roof: ['LR', 'S', 'R'] };

export interface ServiceGroups {
  results: Partial<Record<Group, AnalysisResults3D>>;
  names: Record<Group, string>;
  psiCombo?: number;
}

/**
 * The live load's share in the project's sustained service combination: a service combination
 * with only dead cases at 1.0 and live cases at one factor below 1.0 (EN 1990's quasi-permanent
 * G + ψ2·Q, ASCE 7's D + 0.5L). Undefined where the project has none.
 */
export function sustainedShare(): number | undefined {
  const caseType = new Map(modelStore.loadCases.map((c) => [c.id, (c.type || '').toUpperCase()]));
  const serviceIds = new Set((modelStore.resultScopes?.envelopes ?? []).filter((e) => e.purpose === 'service').flatMap((e) => e.comboIds));
  const found: number[] = [];
  for (const c of modelStore.combinations) {
    if (c.origin?.purpose !== 'service' && !serviceIds.has(c.id)) continue;
    const used = c.factors.filter((f) => f.factor !== 0);
    const live = used.filter((f) => caseType.get(f.caseId) === 'L');
    const dead = used.filter((f) => caseType.get(f.caseId) === 'D');
    if (!live.length || !dead.length || live.length + dead.length !== used.length) continue;
    if (dead.some((f) => Math.abs(f.factor - 1) > 1e-6)) continue;
    const psi = live[0]!.factor;
    if (psi > 0 && psi < 1 - 1e-6 && live.every((f) => Math.abs(f.factor - psi) < 1e-6)) found.push(psi);
  }
  return found.length ? Math.min(...found) : undefined;
}

/** Each load group summed at 1.0 from the cases solved apart; null without them or without a dead case. */
export function serviceGroups(): ServiceGroups | null {
  const perCase = resultsStore.perCase3D;
  if (!perCase.size) return null;
  const results: ServiceGroups['results'] = {};
  const names = { dead: '', live: '', roof: '' };
  for (const g of GROUPS) {
    const cases = modelStore.loadCases.filter((c) => TYPES[g].includes((c.type || '').toUpperCase()) && !isCompositeCase(c) && perCase.has(c.id));
    if (!cases.length) continue;
    const sum = cases.length === 1 ? perCase.get(cases[0]!.id)! : combineResults3D(cases.map((c) => ({ caseId: c.id, factor: 1 })), perCase, modelStore.plates);
    if (!sum) continue;
    results[g] = sum as AnalysisResults3D;
    names[g] = cases.map((c) => c.name).join(' + ');
  }
  if (!results.dead) return null;
  const psi = sustainedShare();
  return { results, names, ...(psi !== undefined ? { psiCombo: psi } : {}) };
}

const ZERO: LoadState = { k: 0, m: 0 };

/** Nodes of the slabs that rest on the ground: half or more of their nodes supported. */
function groundSlabs(groups: readonly DemandGroup[], input: DemandInput): { keys: Set<string>; nodes: Set<number> } {
  const keys = new Set<string>(), nodes = new Set<number>();
  for (const g of groups) {
    const ns = new Set([...g.quads.flatMap((id) => input.shells.quads?.get(id)?.nodes ?? []), ...g.plates.flatMap((id) => input.shells.plates?.get(id)?.nodes ?? [])]);
    if (!ns.size) continue;
    const held = [...ns].filter((n) => input.supportNodes.has(n)).length;
    if (held >= 0.5 * ns.size) { keys.add(`slab:${g.id}`); for (const n of ns) nodes.add(n); }
  }
  return { keys, nodes };
}

const onSprings = (n: number) => [...modelStore.supports.values()].some((s) => s.nodeId === n && (s.type === 'spring' || s.type === 'spring3d'));

/** The value at `x` of a curve sampled at `xs`, linearly between samples. */
function interp(xs: readonly number[], ys: readonly number[], x: number): number {
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]! + 1e-9) return xs[i]! - xs[i - 1]! > 1e-12 ? ys[i - 1]! + ((ys[i]! - ys[i - 1]!) * (x - xs[i - 1]!)) / (xs[i]! - xs[i - 1]!) : ys[i]!;
  }
  return ys.length ? ys[ys.length - 1]! : 0;
}

/**
 * A span's load groups where the total sags most: each group's chord deflection times EI there,
 * and its moment where the total sagging moment peaks (at the root of a cantilever, as hogging).
 */
function beamService(d: BeamDemand, own: Partial<Record<Group, BeamDemand>>, names: ServiceGroups['names'], psiCombo: number | undefined): ServiceSpan | null {
  const root = d.ends?.start.kind === 'free' ? 'end' : d.ends?.end.kind === 'free' ? 'start' : undefined;
  const curve = (g: Group) => {
    const env = own[g]?.env;
    if (!env?.length) return null;
    const xs = env.map((e) => e.x), ms = env.map((e) => e.pos - e.neg);
    return { xs, ms, ks: chordDeflectionEI(xs, ms, d.length, root) };
  };
  const curves = GROUPS.map(curve);
  if (!curves[0]) return null;
  const grid = Array.from({ length: 65 }, (_, i) => (i / 64) * d.length);
  const total = (pick: 'ks' | 'ms', x: number) => curves.reduce((s, c) => s + (c ? interp(c.xs, c[pick], x) : 0), 0);
  const argmax = (f: (x: number) => number) => grid.reduce((b, x) => (f(x) > f(b) ? x : b), grid[0]!);
  const xk = argmax((x) => total('ks', x));
  const xm = root === 'start' ? 0 : root === 'end' ? d.length : argmax((x) => total('ms', x));
  const state = (i: number): LoadState => {
    const c = curves[i];
    if (!c) return ZERO;
    const m = interp(c.xs, c.ms, xm);
    return { k: interp(c.xs, c.ks, xk), m: root ? -m : m };
  };
  return { dead: state(0), live: state(1), roof: state(2), names, ...(psiCombo !== undefined ? { psiCombo } : {}) };
}

/** A panel's sag at each of its nodes, m, positive down, from the reference its edges call for. */
function panelSag(m: DeflectionModel, nodes: readonly number[], box: { x0: number; x1: number; y0: number; y1: number }, reference: 'edges' | 'corners' | 'root', root: keyof SlabEdges | null): Map<number, number> {
  const near = (x: number, y: number) => {
    let best: number | null = null, dist = Infinity;
    for (const id of nodes) { const p = m.nodes.get(id); if (!p) continue; const r = Math.hypot(p.x - x, p.y - y); if (r < dist) { dist = r; best = id; } }
    return best !== null ? m.uz.get(best) ?? 0 : 0;
  };
  const uz = (x: number, y: number) => uzAt(m, { x, y }) ?? near(x, y);
  const lx = Math.max(box.x1 - box.x0, 1e-9), ly = Math.max(box.y1 - box.y0, 1e-9);
  const c00 = uz(box.x0, box.y0), c10 = uz(box.x1, box.y0), c11 = uz(box.x1, box.y1), c01 = uz(box.x0, box.y1);
  const out = new Map<number, number>();
  for (const id of nodes) {
    const p = m.nodes.get(id), w = m.uz.get(id);
    if (!p || w === undefined) continue;
    const u = (p.x - box.x0) / lx, v = (p.y - box.y0) / ly;
    const plane = (1 - u) * (1 - v) * c00 + u * (1 - v) * c10 + u * v * c11 + (1 - u) * v * c01;
    let ref = plane;
    if (reference === 'edges') {
      ref = (1 - v) * uz(p.x, box.y0) + v * uz(p.x, box.y1) + (1 - u) * uz(box.x0, p.y) + u * uz(box.x1, p.y) - plane;
    } else if (reference === 'root' && root) {
      ref = root === 'x0' ? uz(box.x0, p.y) : root === 'x1' ? uz(box.x1, p.y) : root === 'y0' ? uz(p.x, box.y0) : uz(p.x, box.y1);
    }
    out.set(id, ref - w);
  }
  return out;
}

function slabService(
  d: SlabDemand, g: DemandGroup, input: DemandInput, edges: SlabEdges | undefined, sets: ServiceGroups, own: Partial<Record<Group, SlabDemand>>,
): ServiceSpan | null {
  const shells = [...g.quads.map((id) => input.shells.quads?.get(id)), ...g.plates.map((id) => input.shells.plates?.get(id))].filter((s): s is NonNullable<typeof s> => !!s);
  if (!shells.length || !d.bounds) return null;
  const mat = modelStore.materials.get((shells[0] as { materialId?: number }).materialId ?? -1);
  if (!mat || !(mat.e > 0)) return null;
  const nodes = [...new Set(shells.flatMap((s) => s.nodes))];
  const root = edges ? cantileverRoot(edges) : null;
  const held = !!edges && Object.values(edges).every((e) => e.kind === 'beam' || e.kind === 'wall');
  const reference = root ? 'root' : held ? 'edges' : 'corners';
  const xy = new Map(nodes.map((id) => [id, { x: input.nodes.get(id)?.x ?? 0, y: input.nodes.get(id)?.y ?? 0 }]));
  const sags = Object.fromEntries(GROUPS.map((k) => {
    const r = sets.results[k];
    if (!r) return [k, null];
    const uz = new Map(r.displacements.map((x) => [x.nodeId, x.uz]));
    return [k, panelSag({ nodes: xy, shells, uz }, nodes, d.bounds!, reference, root)];
  })) as Record<Group, Map<number, number> | null>;
  if (!sags.dead) return null;
  let at = nodes[0]!, best = -Infinity;
  for (const id of nodes) {
    const tot = GROUPS.reduce((s, k) => s + (sags[k]?.get(id) ?? 0), 0);
    if (tot > best) { best = tot; at = id; }
  }
  const dir = root ? (root.startsWith('x') ? 'X' : 'Y') : null;
  const totalOf = (f: SlabFace) => GROUPS.reduce((s, k) => s + (own[k]?.m[f].value ?? 0), 0);
  const face: SlabFace = dir ? (`top${dir}` as SlabFace) : totalOf('bottomX') >= totalOf('bottomY') ? 'bottomX' : 'bottomY';
  const eiPerM = mat.e * 1000 * (d.h ** 3) / 12;
  const state = (k: Group): LoadState => (sags[k] ? { k: (sags[k]!.get(at) ?? 0) * eiPerM, m: own[k]?.m[face].value ?? 0 } : ZERO);
  return { dead: state('dead'), live: state('live'), roof: state('roof'), names: sets.names, ...(sets.psiCombo !== undefined ? { psiCombo: sets.psiCombo } : {}), strip: { face, reference } };
}

/**
 * Each demand with what its deflection check reads: the service response by load group and, for a
 * slab, its edges; or marked as on the ground. Without the cases solved apart a demand gets edges
 * only, and its check reads the depth tables alone.
 */
export function attachService(input: DemandInput, beams: readonly BeamDemand[], slabs: readonly SlabDemand[], levels: readonly LevelGeometry[], thickness: (g: DemandGroup) => number | null): void {
  const sets = serviceGroups();
  const ground = groundSlabs(input.groups.filter((g) => g.kind !== 'wall'), input);
  const one = (g: Group): DemandSet[] => (sets?.results[g] ? [{ name: g, result: sets.results[g]! }] : []);
  const byKey = <T extends { key: string }>(list: readonly T[]) => new Map(list.map((x) => [x.key, x]));
  const beamBy = Object.fromEntries(GROUPS.map((g) => [g, one(g).length ? byKey(beamDemands({ ...input, sets: one(g), faces: false })) : new Map()])) as Record<Group, Map<string, BeamDemand>>;
  for (const d of beams) {
    const s = d as BeamDemand & Serviceable;
    const ends = [d.line?.startNode, d.line?.endNode].filter((n): n is number => n !== undefined);
    if (ends.length === 2 && ends.every((n) => ground.nodes.has(n) || onSprings(n))) { s.serviceOff = true; continue; }
    const sv = sets ? beamService(d, Object.fromEntries(GROUPS.map((g) => [g, beamBy[g].get(d.key)])) as Partial<Record<Group, BeamDemand>>, sets.names, sets.psiCombo) : null;
    if (sv) s.service = sv;
  }
  const slabBy = Object.fromEntries(GROUPS.map((g) => [g, one(g).length ? byKey(slabDemands({ ...input, sets: one(g) }, thickness)) : new Map()])) as Record<Group, Map<string, SlabDemand>>;
  const groupOf = new Map(input.groups.map((g) => [`slab:${g.id}`, g]));
  for (const d of slabs) {
    const s = d as SlabDemand & Serviceable;
    if (ground.keys.has(d.key)) { s.serviceOff = true; continue; }
    const geom = levels.find((l) => l.level === (d.level ?? ''));
    const b = d.bounds;
    if (b && geom) {
      const others = slabs.filter((o) => o !== d && (o.level ?? '') === (d.level ?? '') && o.bounds && Math.abs(o.bounds.z - b.z) < 0.05).map((o) => o.bounds!);
      s.edges = slabEdges(b, d.h, others, geom);
    }
    const g = groupOf.get(d.key);
    const sv = sets && g ? slabService(d, g, input, s.edges, sets, Object.fromEntries(GROUPS.map((k) => [k, slabBy[k].get(d.key)])) as Partial<Record<Group, SlabDemand>>) : null;
    if (sv) s.service = sv;
  }
}
