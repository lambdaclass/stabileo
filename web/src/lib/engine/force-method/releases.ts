/**
 * The releases a reader can choose to build the primary (fundamental)
 * structure by hand, and the checks a chosen set must pass before it is
 * solved: as many releases as GH, none twice, and none that releases a
 * condition the structure does not have.
 *
 * A release is named by a short key, so the picker, the store and the tests
 * speak of it the same way:
 *
 *   r:<node>:<c>    a support reaction (0 horizontal, 1 vertical, 2 moment)
 *   s:<node>:<c>    a spring's force (0, 1) or moment (2)
 *   b:<element>     a biela, removed (its axial force is the redundant)
 *   c:<element>:<I|J>  a frame member cut at that end: N, V and M
 *   h:<element>:<I|J>  a hinge put at that end: M only
 */
import type { SolverInput } from '../types';
import { restrainedComponents, type Redundant } from './primary';
import { numbered } from './redundants';
import { ForceMethodError } from './errors';

export type ReleaseGroup = 'reaction' | 'spring' | 'biela' | 'member';

export interface ReleaseOption {
  key: string;
  group: ReleaseGroup;
  kind: 'reaction' | 'spring' | 'biela' | 'cut' | 'hinge';
  nodeId: number;
  elementId?: number;
  end?: 'I' | 'J';
  component?: number;
  /** How many redundants it adds: 3 for a cut (2 at a hinged end), 1 otherwise. */
  count: number;
}

type Item = Omit<Redundant, 'index'>;

const frameEndsAt = (input: SolverInput, nodeId: number) => {
  let rigid = 0, all = 0;
  for (const e of input.elements.values()) {
    if (e.type !== 'frame') continue;
    if (e.nodeI === nodeId) { all++; if (!e.hingeStart) rigid++; }
    if (e.nodeJ === nodeId) { all++; if (!e.hingeEnd) rigid++; }
  }
  return { rigid, all };
};

const degree = (input: SolverInput, nodeId: number) => {
  let d = 0;
  for (const e of input.elements.values()) if (e.nodeI === nodeId || e.nodeJ === nodeId) d++;
  return d;
};

/** A frame member hinged at both ends with no load across it carries axial force only: a biela. */
export function isFrameBiela(input: SolverInput, elementId: number): boolean {
  const e = input.elements.get(elementId);
  if (!e || e.type !== 'frame' || !e.hingeStart || !e.hingeEnd) return false;
  return !input.loads.some((l) => (l.type === 'distributed' && l.data.elementId === elementId)
    || (l.type === 'pointOnElement' && l.data.elementId === elementId && (Math.abs(l.data.p ?? 0) > 0 || Math.abs(l.data.my ?? 0) > 0))
    || (l.type === 'thermal' && l.data.elementId === elementId && Math.abs(l.data.dtGradient ?? 0) > 0));
}

export const isBiela = (input: SolverInput, elementId: number) =>
  input.elements.get(elementId)?.type === 'truss' || isFrameBiela(input, elementId);

/** Does the node hold its rotation: a support that restrains it, or a rotational spring. */
function holdsRotation(input: SolverInput, nodeId: number): boolean {
  for (const s of input.supports.values()) {
    if (s.nodeId !== nodeId) continue;
    if (s.type === 'spring' ? (s.kz ?? 0) > 0 : restrainedComponents(s)[2]) return true;
  }
  return false;
}

/** Every release the structure offers, in the order they are listed. */
export function releaseOptions(input: SolverInput): ReleaseOption[] {
  const out: ReleaseOption[] = [];
  const sups = [...input.supports.values()].sort((a, b) => a.nodeId - b.nodeId);
  for (const s of sups) {
    if (s.type === 'spring') continue;
    restrainedComponents(s).forEach((on, c) => {
      if (on) out.push({ key: `r:${s.nodeId}:${c}`, group: 'reaction', kind: 'reaction', nodeId: s.nodeId, component: c, count: 1 });
    });
  }
  for (const s of sups) {
    if (s.type !== 'spring') continue;
    [s.kx, s.ky, s.kz].forEach((k, c) => {
      if ((k ?? 0) > 0) out.push({ key: `s:${s.nodeId}:${c}`, group: 'spring', kind: 'spring', nodeId: s.nodeId, component: c, count: 1 });
    });
  }
  const elems = [...input.elements.values()].sort((a, b) => a.id - b.id);
  for (const e of elems) {
    if (isBiela(input, e.id)) out.push({ key: `b:${e.id}`, group: 'biela', kind: 'biela', nodeId: e.nodeI, elementId: e.id, count: 1 });
  }
  for (const e of elems) {
    if (e.type !== 'frame' || isFrameBiela(input, e.id)) continue;
    for (const end of ['I', 'J'] as const) {
      const nodeId = end === 'J' ? e.nodeJ : e.nodeI;
      const hinged = end === 'J' ? e.hingeEnd : e.hingeStart;
      const otherHinged = end === 'J' ? e.hingeStart : e.hingeEnd;
      if (!hinged) {
        const ends = frameEndsAt(input, nodeId);
        if (ends.rigid >= 2 || (ends.rigid >= 1 && holdsRotation(input, nodeId))) {
          out.push({ key: `h:${e.id}:${end}`, group: 'member', kind: 'hinge', nodeId, elementId: e.id, end, count: 1 });
        }
      }
      if (!otherHinged && degree(input, nodeId) >= 2) {
        out.push({ key: `c:${e.id}:${end}`, group: 'member', kind: 'cut', nodeId, elementId: e.id, end, count: hinged ? 2 : 3 });
      }
    }
  }
  return out;
}

const prescribedOf = (input: SolverInput, nodeId: number, c: number) => {
  const s = [...input.supports.values()].find((q) => q.nodeId === nodeId);
  return (c === 0 ? s?.dx : c === 1 ? s?.dz : s?.dry) ?? 0;
};

/** The redundants a list of keys stands for, numbered in the order given. */
export function redundantsFromKeys(input: SolverInput, keys: string[]): Redundant[] {
  const items: Item[] = [];
  const ends = new Set<string>();
  for (const key of keys) {
    const [t, a, b] = key.split(':');
    if (t === 'r') items.push({ kind: 'reaction', nodeId: +a, component: +b, prescribed: prescribedOf(input, +a, +b) });
    else if (t === 's') items.push({ kind: 'spring', nodeId: +a, component: +b });
    else if (t === 'b') {
      const e = input.elements.get(+a);
      if (!e) throw new ForceMethodError('nothing');
      items.push({ kind: 'barForce', nodeId: e.nodeI, elementId: e.id });
    } else if (t === 'c' || t === 'h') {
      const e = input.elements.get(+a);
      const end = b as 'I' | 'J';
      if (!e || e.type !== 'frame') throw new ForceMethodError('nothing');
      if (ends.has(`${e.id}:${end}`)) throw new ForceMethodError('clash', [], 0, { elementId: e.id, end });
      ends.add(`${e.id}:${end}`);
      const nodeId = end === 'J' ? e.nodeJ : e.nodeI;
      const hinged = end === 'J' ? e.hingeEnd : e.hingeStart;
      if (t === 'h') {
        if (hinged) throw new ForceMethodError('nothing');
        items.push({ kind: 'cutM', nodeId, elementId: e.id, end, hinge: true });
      } else {
        items.push({ kind: 'cutN', nodeId, elementId: e.id, end }, { kind: 'cutV', nodeId, elementId: e.id, end });
        if (!hinged) items.push({ kind: 'cutM', nodeId, elementId: e.id, end });
      }
    } else throw new ForceMethodError('nothing');
  }
  return numbered(items);
}

/**
 * Nodes whose rotation nothing holds: every frame end there is hinged and no
 * support or spring restrains it. The solver gives such a node a vanishing
 * spring, so a release that leaves one behind would not show as unstable.
 */
export function orphanRotations(input: SolverInput): Set<number> {
  const out = new Set<number>();
  for (const id of input.nodes.keys()) {
    const ends = frameEndsAt(input, id);
    if (ends.all > 0 && ends.rigid === 0 && !holdsRotation(input, id)) out.add(id);
  }
  return out;
}

/**
 * The checks that need no solve: the count against GH, nothing released
 * twice, and no moment release where the moment is already zero (one more
 * hinge at a node where every other bar already arrives hinged: a hinge
 * joining k bars releases k − 1 conditions, not k).
 */
export function checkCount(rs: Redundant[], gh: number): void {
  const seen = new Set<string>();
  for (const r of rs) {
    const k = r.kind === 'reaction' || r.kind === 'spring' ? `${r.kind}:${r.nodeId}:${r.component}` : `${r.kind}:${r.elementId}:${r.end ?? ''}`;
    if (seen.has(k)) throw new ForceMethodError('clash');
    seen.add(k);
  }
  if (rs.length !== gh) throw new ForceMethodError('count', [], gh, { chosen: rs.length });
}

export function checkOrphans(original: SolverInput, primary: SolverInput): void {
  const before = orphanRotations(original);
  const after = orphanRotations(primary);
  const added = [...after].filter((n) => !before.has(n) && original.nodes.has(n));
  if (added.length === 0) return;
  const k = frameEndsAt(original, added[0]).all;
  throw new ForceMethodError('hingeAll', [], 0, { nodes: added, k });
}
