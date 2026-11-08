/**
 * Shells already in a model made physical plates: an example, an older project, an imported file,
 * elements drawn corner by corner, a slab the solve was to mesh. Each panel of shells (touching,
 * in one plane, of one material and thickness, one physical member's or else not across a member)
 * becomes one plate whose
 * outline and holes are the panel's boundary. Its shells stay as its current mesh, so nothing the
 * analysis reads changes until the plate is meshed again; a uniform area load on every shell of a
 * slab becomes the plate's load, which follows any mesh.
 */
import { modelStore } from './model.svelte';
import { physicalDataOf, type PhysicalData } from '../model/physical';
import { DEFAULT_PLATE_MESH, frameOfLoop, plateGeometry, plateKindOf, type PlateSurface } from '../model/physical/plate';
import type { Vec3 } from '../model/edit/affine';
import { addPlateLoad, adoptCurrentMesh, physicalPlates, plateOfShell, plateStatus } from './physical-plates';
import type { SurfaceLoad3D } from './model.svelte';

const TOL = 1e-6;
type Shell = { key: string; kind: 'quad' | 'plate'; id: number; nodes: number[]; materialId: number; thickness: number; n: Vec3; o: Vec3 };

const pos = (id: number): Vec3 => { const p = modelStore.nodes.get(id)!; return [p.x, p.y, p.z ?? 0]; };
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

function shellOf(key: string): Shell | null {
  const kind = key[0] === 'q' ? 'quad' : key[0] === 'p' ? 'plate' : null;
  const id = Number(key.slice(1));
  const sh = kind === 'quad' ? modelStore.quads.get(id) : kind === 'plate' ? modelStore.plates.get(id) : undefined;
  if (!kind || !sh || sh.nodes.some((n) => !modelStore.nodes.has(n))) return null;
  const f = frameOfLoop(sh.nodes.map(pos));
  if (!f) return null;
  return { key, kind, id, nodes: [...sh.nodes], materialId: sh.materialId, thickness: sh.thickness, n: f.n, o: f.o };
}

/** Whether the segment a–b lies along a member, which a panel does not cross. */
function onMember(a: Vec3, b: Vec3, members: Array<[Vec3, Vec3]>): boolean {
  const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const ab = sub(b, a);
  return members.some(([p, q]) => {
    const pq = sub(q, p), L2 = dot(pq, pq);
    if (L2 < 1e-18 || len(cross(pq, ab)) > 1e-6 * Math.sqrt(L2) * len(ab)) return false;
    const t = dot(sub(m, p), pq) / L2;
    return t > -TOL && t < 1 + TOL && len(sub(m, [p[0] + pq[0] * t, p[1] + pq[1] * t, p[2] + pq[2] * t])) < 1e-6;
  });
}

/** The panels of shells that make one plate each. */
export function shellPanels(keys: readonly string[]): Shell[][] {
  const shells = keys.map(shellOf).filter((s): s is Shell => !!s && plateOfShell(s.key) === null);
  const members: Array<[Vec3, Vec3]> = [...modelStore.elements.values()].filter((e) => modelStore.nodes.has(e.nodeI) && modelStore.nodes.has(e.nodeJ)).map((e) => [pos(e.nodeI), pos(e.nodeJ)]);
  const groupOf = new Map<string, number>();
  for (const g of modelStore.model.groups.values()) {
    if (!physicalDataOf(g)) continue;
    for (const q of g.members.quads ?? []) groupOf.set(`q${q}`, g.id);
    for (const p of g.members.plates ?? []) groupOf.set(`p${p}`, g.id);
  }
  const parent = shells.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const edges = new Map<string, number[]>();
  shells.forEach((s, i) => s.nodes.forEach((a, k) => {
    const b = s.nodes[(k + 1) % s.nodes.length]!;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    (edges.get(key) ?? edges.set(key, []).get(key)!).push(i);
  }));
  for (const [key, list] of edges) {
    if (list.length !== 2) continue;
    const [i, j] = list as [number, number], s = shells[i]!, t = shells[j]!;
    const [a, b] = key.split('-').map(Number) as [number, number];
    const coplanar = Math.abs(dot(s.n, t.n)) > 1 - 1e-6 && Math.abs(dot(sub(t.o, s.o), s.n)) < 1e-4;
    const gs = groupOf.get(s.key), gt = groupOf.get(t.key);
    const same = s.materialId === t.materialId && Math.abs(s.thickness - t.thickness) < 1e-9 && gs === gt;
    if (coplanar && same && (gs !== undefined || !onMember(pos(a), pos(b), members))) parent[find(i)] = find(j);
  }
  const sets = new Map<number, Shell[]>();
  shells.forEach((s, i) => (sets.get(find(i)) ?? sets.set(find(i), []).get(find(i))!).push(s));
  return [...sets.values()];
}

/** The boundary of a panel as loops of nodes, the outline first, each without its straight-through nodes. */
export function panelLoops(panel: readonly Shell[]): number[][] | null {
  const count = new Map<string, number>();
  const dir = new Map<string, [number, number]>();
  for (const s of panel) s.nodes.forEach((a, k) => {
    const b = s.nodes[(k + 1) % s.nodes.length]!;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    count.set(key, (count.get(key) ?? 0) + 1);
    dir.set(key, [a, b]);
  });
  const next = new Map<number, number[]>();
  for (const [key, c] of count) if (c === 1) { const [a, b] = dir.get(key)!; (next.get(a) ?? next.set(a, []).get(a)!).push(b); }
  const loops: number[][] = [];
  const used = new Set<string>();
  for (const [start, outs] of next) for (const first of outs) {
    if (used.has(`${start}>${first}`)) continue;
    const loop = [start];
    let cur = first;
    used.add(`${start}>${first}`);
    for (let guard = 0; cur !== start && guard < 100000; guard++) {
      loop.push(cur);
      const options = (next.get(cur) ?? []).filter((x) => !used.has(`${cur}>${x}`));
      if (!options.length) return null;
      const nx = options[0]!;
      used.add(`${cur}>${nx}`);
      cur = nx;
    }
    if (cur !== start) return null;
    loops.push(loop);
  }
  if (!loops.length) return null;
  const n = panel[0]!.n;
  const area = (l: number[]) => { let s: Vec3 = [0, 0, 0]; for (let i = 0; i < l.length; i++) { const c = cross(pos(l[i]!), pos(l[(i + 1) % l.length]!)); s = [s[0] + c[0], s[1] + c[1], s[2] + c[2]]; } return Math.abs(dot(s, n)) / 2; };
  const corners = (l: number[]) => l.filter((id, i) => {
    const a = pos(l[(i + l.length - 1) % l.length]!), p = pos(id), b = pos(l[(i + 1) % l.length]!);
    const u = sub(p, a), v = sub(b, p);
    return len(cross(u, v)) > 1e-6 * len(u) * len(v) || dot(u, v) < 0;
  });
  return loops.sort((p, q) => area(q) - area(p)).map(corners).filter((l) => l.length >= 3);
}

/** Plain uniform area loads on every shell of a slab, case by case, made the plate's own load. */
function liftUniformLoads(plate: number, panel: readonly Shell[]): void {
  const keys = new Set(panel.map((s) => s.key));
  const plain = (d: SurfaceLoad3D) => Object.keys(d).every((k) => ['id', 'quadId', 'on', 'q', 'caseId'].includes(k));
  const byCase = new Map<number, Array<{ id: number; key: string; q: number }>>();
  for (const l of modelStore.loads) {
    if (l.type !== 'surface3d') continue;
    const d = l.data as SurfaceLoad3D;
    const key = `${d.on === 'plate' ? 'p' : 'q'}${d.quadId}`;
    if (!keys.has(key)) continue;
    const c = d.caseId ?? -1;
    (byCase.get(c) ?? byCase.set(c, []).get(c)!).push({ id: d.id, key, q: plain(d) ? d.q : NaN });
  }
  for (const [caseId, list] of byCase) {
    if (caseId < 0 || list.length !== keys.size || new Set(list.map((x) => x.key)).size !== keys.size) continue;
    const q = list[0]!.q;
    if (!Number.isFinite(q) || list.some((x) => Math.abs(x.q - q) > 1e-12)) continue;
    for (const x of list) modelStore.removeLoad(x.id);
    addPlateLoad(plate, caseId, q);
  }
}

/**
 * Make each panel of the shells given a physical plate, keeping its shells as its mesh (`keepMesh`,
 * the default) or taking them out so the plate waits for its own (a slab the solve was to mesh).
 * A panel whose shells are one physical member's (a slab or wall recognised or placed) becomes that
 * member's plate, with its kind, levels and typology; others become new plates. One undo step.
 */
export function platesFromShells(keys: readonly string[], opts: { keepMesh?: boolean; size?: number } = {}): number[] {
  const out: number[] = [];
  const current = physicalPlates().filter((p) => plateStatus(p.id) === 'current').map((p) => p.id);
  modelStore.batch(() => {
    for (const panel of shellPanels(keys)) {
      const loops = panelLoops(panel);
      if (!loops) continue;
      const [outer, ...holes] = loops as [number[], ...number[][]];
      const inLoops = new Set(loops.flat());
      const owned = opts.keepMesh === false ? [] : [...new Set(panel.flatMap((s) => s.nodes))].filter((n) => !inLoops.has(n));
      const edge = panel.flatMap((s) => s.nodes.map((a, k) => len(sub(pos(s.nodes[(k + 1) % s.nodes.length]!), pos(a)))));
      const size = opts.size ?? Math.max(0.05, Math.round((edge.reduce((a, b) => a + b, 0) / edge.length) / 0.05) * 0.05);
      const surface: PlateSurface = { loops: loops.map((l) => l.length), materialId: panel[0]!.materialId, thickness: panel[0]!.thickness, mesh: { ...DEFAULT_PLATE_MESH, size } };
      const members = { nodes: [...outer, ...holes.flat(), ...owned], quads: opts.keepMesh === false ? [] : panel.filter((s) => s.kind === 'quad').map((s) => s.id), plates: opts.keepMesh === false ? [] : panel.filter((s) => s.kind === 'plate').map((s) => s.id) };
      const geo = plateGeometry({ nodes: modelStore.nodes, elements: modelStore.elements }, { id: 0, members, data: { surface } });
      if (!geo) continue;
      const host = modelStore.model.groups.get([...modelStore.model.groups.values()].find((g) => physicalDataOf(g) && panel.every((s) => (s.kind === 'quad' ? g.members.quads : g.members.plates)?.includes(s.id)))?.id ?? -1);
      const own = host ? physicalDataOf(host) : null;
      const { meshAtSolve: _m, ...kept } = (own ?? {}) as PhysicalData;
      const physical = { ...(own ? kept : { kind: plateKindOf(geo), provenance: 'declared' as const }), surface };
      let id: number;
      if (host && own && (host.members.quads?.length ?? 0) + (host.members.plates?.length ?? 0) === panel.length) {
        id = host.id;
        modelStore.setGroupMembers(id, { ...host.members, ...members });
        modelStore.setGroupData(id, physical as unknown as Record<string, unknown>);
      } else {
        if (host) {
          const qs = new Set(members.quads), ps = new Set(members.plates);
          modelStore.setGroupMembers(host.id, { ...host.members, quads: (host.members.quads ?? []).filter((q) => !qs.has(q)), plates: (host.members.plates ?? []).filter((q) => !ps.has(q)) });
        }
        const taken = new Set(physicalPlates().map((e) => e.name));
        let k = physicalPlates().length + 1;
        while (taken.has(`P${k}`)) k++;
        id = modelStore.addGroup(`P${k}`, 'physicalMember', members, { data: physical as unknown as Record<string, unknown> });
      }
      if (physical.kind === 'slab') liftUniformLoads(id, panel);
      if (opts.keepMesh === false) {
        for (const s of panel) {
          for (const l of [...modelStore.loads]) if (l.type === 'surface3d' || l.type === 'thermalQuad3d') {
            const d = l.data as { quadId: number; on?: string; id: number };
            if (d.quadId === s.id && (d.on === 'plate') === (s.kind === 'plate')) modelStore.removeLoad(d.id);
          }
          if (s.kind === 'quad') modelStore.removeQuad(s.id); else modelStore.removePlate(s.id);
        }
      }
      out.push(id);
    }
    // A plate's signature reads the nodes every plate's mesh owns, so each conversion can put the others out of date: settled once all are in.
    if (opts.keepMesh !== false) for (const id of out) adoptCurrentMesh(id);
    for (const id of current) if (plateStatus(id) === 'stale') adoptCurrentMesh(id);
  });
  return out;
}

/** Every shell of the model that no plate holds. */
export function looseShells(): string[] {
  const held = new Set(physicalPlates().flatMap((p) => [...(p.group.members.quads ?? []).map((q) => `q${q}`), ...(p.group.members.plates ?? []).map((q) => `p${q}`)]));
  return [...[...modelStore.quads.keys()].map((q) => `q${q}`), ...[...modelStore.plates.keys()].map((p) => `p${p}`)].filter((k) => !held.has(k));
}

/**
 * Slabs placed to be meshed by the solve, as projects before plates kept them (`meshAtSolve`): each
 * made the plate it is, waiting for its mesh or with the one the solve gave it. Returns how many.
 */
export function platesFromMeshAtSolve(): number {
  let n = 0;
  if (![...modelStore.model.groups.values()].some((g) => (physicalDataOf(g) as { meshAtSolve?: unknown } | null)?.meshAtSolve)) return n;
  modelStore.batch(() => {
    for (const g of [...modelStore.model.groups.values()]) {
      const d = physicalDataOf(g) as (PhysicalData & { meshAtSolve?: { size: number; meshed: boolean } }) | null;
      if (!d?.meshAtSolve) continue;
      const keys = [...(g.members.quads ?? []).map((q) => `q${q}`), ...(g.members.plates ?? []).map((p) => `p${p}`)];
      if (platesFromShells(keys, { keepMesh: d.meshAtSolve.meshed, size: d.meshAtSolve.size }).length) n++;
      else { const { meshAtSolve: _m, ...rest } = d; modelStore.setGroupData(g.id, rest as unknown as Record<string, unknown>); }
    }
  });
  return n;
}
