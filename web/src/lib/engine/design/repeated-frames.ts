/**
 * Repeated beam lines: the frames of a building that are the same frame again, on another level
 * or another axis. A beam line is a horizontal frame line (`groupByFrameLine`), its members
 * ordered along it; two lines repeat when their members have the same lengths and sections in
 * the same order, read either way along the line. Copying one line's bars onto another maps
 * member to member and turns a member's bars end for end where the two run opposite ways.
 */
import { groupByFrameLine } from './member-grouping';
import type { ContextModelData } from './member-context';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';

export interface BeamLine {
  id: string;
  label: string;
  /** Members in order along the line. */
  members: number[];
  /** Per member: true when it runs i → j along the line's direction. */
  forward: boolean[];
  /** `length:section` per member, in order. */
  signature: string[];
}

export interface RepeatedFrames {
  /** The lines that repeat one another, each group with two or more. */
  key: string;
  lines: BeamLine[];
}

const MM = (v: number) => Math.round(v * 1000);

/** The model's beam lines, members ordered, with their signatures. */
export function beamLines(model: ContextModelData, isBeam: (id: number) => boolean = () => true): BeamLine[] {
  const g = groupByFrameLine(model);
  if (!g.available) return [];
  const out: BeamLine[] = [];
  for (const l of g.lines) {
    if (l.direction !== 'horizontal') continue;
    const ids = l.elementIds.filter((id) => isBeam(id) && model.elements.has(id));
    if (ids.length === 0) continue;
    const ends = ids.map((id) => { const e = model.elements.get(id)!; return [model.nodes.get(e.nodeI)!, model.nodes.get(e.nodeJ)!] as const; });
    if (ends.some(([a, b]) => !a || !b)) continue;
    // The line's direction, pointing to +X, else +Y, so lines laid the same way read the same.
    const all = ends.flat();
    const a0 = all[0]!, far = all.reduce((f, p) => (Math.hypot(p.x - a0.x, p.y - a0.y) > Math.hypot(f.x - a0.x, f.y - a0.y) ? p : f), a0);
    let dx = far.x - a0.x, dy = far.y - a0.y;
    const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    if (dx < -1e-6 || (Math.abs(dx) <= 1e-6 && dy < 0)) { dx = -dx; dy = -dy; }
    const along = (p: { x: number; y: number }) => p.x * dx + p.y * dy;
    const order = ids.map((id, k) => ({ id, k, s: (along(ends[k]![0]) + along(ends[k]![1])) / 2 })).sort((p, q) => p.s - q.s);
    const members = order.map((o) => o.id);
    const forward = order.map((o) => along(ends[o.k]![1]) >= along(ends[o.k]![0]));
    const signature = order.map((o) => {
      const [a, b] = ends[o.k]!;
      return `${MM(Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)))}:${model.elements.get(o.id)!.sectionId}`;
    });
    out.push({ id: l.id, label: l.label, members, forward, signature });
  }
  return out;
}

/** The groups of lines that repeat, read either way; single lines are left out. */
export function repeatedFrames(lines: readonly BeamLine[]): RepeatedFrames[] {
  const by = new Map<string, BeamLine[]>();
  for (const l of lines) {
    const fwd = l.signature.join('|'), rev = [...l.signature].reverse().join('|');
    const key = fwd <= rev ? fwd : rev;
    by.set(key, [...(by.get(key) ?? []), l]);
  }
  return [...by].filter(([, ls]) => ls.length > 1).map(([key, ls]) => ({ key, lines: ls }));
}

/**
 * How `target`'s members take `source`'s: per target member, the source member and whether its
 * bars turn end for end. Null when the two lines do not repeat.
 */
export function mapLines(source: BeamLine, target: BeamLine): Array<{ target: number; source: number; mirror: boolean }> | null {
  const n = source.members.length;
  if (target.members.length !== n) return null;
  const same = source.signature.every((s, i) => s === target.signature[i]);
  const reversed = source.signature.every((s, i) => s === target.signature[n - 1 - i]);
  if (!same && !reversed) return null;
  const flip = !same;
  return target.members.map((id, i) => {
    const k = flip ? n - 1 - i : i;
    return { target: id, source: source.members[k]!, mirror: source.forward[k] !== target.forward[i] !== flip };
  });
}

/** A member's bars turned end for end: every start field trades with its end field. */
export function mirrorReinforcement(r: ProvidedReinforcement): ProvidedReinforcement {
  const swap = (k: string) => k.includes('Start') ? k.replace('Start', 'End') : k.includes('End') ? k.replace('End', 'Start') : k;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [swap(k), walk(x)]));
    return v;
  };
  return walk(r) as ProvidedReinforcement;
}

/** The longitudinal steel of a member's bars, cm²·m: what «the most reinforced» weighs. */
export function steelOf(r: ProvidedReinforcement | undefined, length: number): number {
  if (!r) return 0;
  const area = (ls?: Array<{ count: number; diameter: number }>) => (ls ?? []).reduce((s, l) => s + l.count * Math.PI * l.diameter ** 2 / 400, 0);
  const g = r.regions;
  const one = (layers?: Array<{ count: number; diameter: number }>, group?: { count: number; diameter: number }) => layers?.length ? area(layers) : group ? area([group]) : 0;
  const top = (one(g?.topStartLayers, g?.topStart ?? r.top) + one(g?.topEndLayers, g?.topEnd ?? r.top)) / 2;
  const bottom = one(g?.bottomSpanLayers, g?.bottomSpan ?? r.bottom);
  return (top + bottom) * length;
}
