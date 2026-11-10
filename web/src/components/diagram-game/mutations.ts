import type { SupportType } from '../../lib/store/ui.svelte';
import { memberLength, solveGame, type GameModel, type Solved } from './game-model';
import { diagramOf, memberAxis, peak, sampleDiagram, forceValue, type Diagram, type DiagramKind, type Trace, type Vec } from './traces';

export const PHYSICAL_TAGS = ['loadMoved', 'loadFlipped', 'supportChanged', 'supportsMirrored', 'hingeToggled', 'rollerTurned', 'resultantLoad', 'pointAsUniform'] as const;
export const MATH_TAGS = ['signFlipped', 'degreeLowered', 'degreeRaised', 'vertexWrongEnd', 'jumpMissing', 'nonZeroAtRelease', 'inflectionMisplaced', 'supportDisplaced', 'memberSignFlipped', 'zeroForceLoaded', 'loadedShownZero'] as const;
export type PhysicalTag = typeof PHYSICAL_TAGS[number];
export type MathTag = typeof MATH_TAGS[number];
export type Tag = PhysicalTag | MathTag;

export interface MutationContext {
  solved: Solved;
  correct: Diagram;
  kind: DiagramKind;
  next: () => number;
}

const pick = <T>(items: T[], next: () => number): T | undefined => items.length ? items[Math.floor(next() * items.length)] : undefined;
const clone = (m: GameModel): GameModel => JSON.parse(JSON.stringify(m));
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + k * b[0], a[1] + k * b[1]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const norm = (a: Vec) => Math.hypot(a[0], a[1]);
const EPS = 1e-6;

function segments(tr: Trace): Array<[number, number]> {
  const cuts = [0, ...[...tr.breaks].sort((a, b) => a - b), 1];
  const out: Array<[number, number]> = [];
  for (let k = 0; k < cuts.length - 1; k++) if (cuts[k + 1]! - cuts[k]! > 1e-4) out.push([cuts[k]!, cuts[k + 1]!]);
  return out;
}

function segmentOf(tr: Trace, t: number): [number, number] {
  return segments(tr).find(([a, b]) => t >= a && t <= b) ?? [0, 1];
}

interface SegmentShape { f0: Vec; f1: Vec; mid: Vec; curved: boolean; sloped: boolean }

function shapeOf(tr: Trace, [a, b]: [number, number], ref: number): SegmentShape {
  const f0 = tr.at(a + EPS), f1 = tr.at(b - EPS), mid = tr.at((a + b) / 2);
  const chordMid = scale(add(f0, f1), 0.5);
  return { f0, f1, mid, curved: norm(add(mid, chordMid, -1)) > 0.04 * ref, sloped: norm(add(f1, f0, -1)) > 0.04 * ref };
}

function perSegment(d: Diagram, f: (tr: Trace, seg: [number, number], shape: SegmentShape, e: number) => ((t: number) => Vec) | null): Diagram | null {
  const ref = peak(sampleDiagram(d));
  let changed = false;
  const traces = d.traces.map((tr, e): Trace => {
    const replaced = segments(tr).map((seg) => ({ seg, g: f(tr, seg, shapeOf(tr, seg, ref), e) }));
    if (replaced.some((r) => r.g)) changed = true;
    return {
      breaks: tr.breaks,
      at: (t) => {
        const hit = replaced.find(({ seg: [a, b] }) => t >= a && t <= b && (t < b || b === 1));
        return hit?.g ? hit.g(t) : tr.at(t);
      },
    };
  });
  return changed ? { kind: d.kind, traces } : null;
}

function supportAt(m: GameModel, node: number) {
  return m.supports.find((s) => s.node === node);
}

function membersAt(m: GameModel, node: number): number[] {
  return m.elements.flatMap(([i, j], e) => (i === node || j === node ? [e] : []));
}

function physical(ctx: MutationContext, mutate: (m: GameModel) => GameModel | null): Diagram | null {
  const mutated = mutate(clone(ctx.solved.model));
  if (!mutated) return null;
  const s = solveGame(mutated);
  return s ? diagramOf(s, ctx.kind) : null;
}

type LoadRef = { list: 'nodalLoads' | 'distributedLoads' | 'pointLoads'; index: number };

function loadRefs(m: GameModel): LoadRef[] {
  return (['nodalLoads', 'distributedLoads', 'pointLoads'] as const).flatMap((list) => (m[list] ?? []).map((_, index) => ({ list, index })));
}

function freeNodes(m: GameModel): number[] {
  return m.nodes.map((_, k) => k).filter((k) => !supportAt(m, k));
}

const MUTATORS: Record<PhysicalTag, (m: GameModel, next: () => number) => GameModel | null> = {
  loadMoved(m, next) {
    const ref = pick(loadRefs(m), next);
    if (!ref) return null;
    if (ref.list === 'pointLoads') {
      const l = m.pointLoads![ref.index]!, L = memberLength(m, l.element);
      const mirrored = L - l.a;
      l.a = Math.abs(mirrored - l.a) > 0.25 * L ? mirrored : Math.min(0.9 * L, Math.max(0.1 * L, l.a + (l.a < L / 2 ? 0.35 : -0.35) * L));
      return m;
    }
    if (ref.list === 'nodalLoads') {
      const l = m.nodalLoads![ref.index]!;
      const target = pick(freeNodes(m).filter((k) => k !== l.node), next);
      if (target === undefined) return null;
      l.node = target;
      return m;
    }
    const l = m.distributedLoads![ref.index]!;
    const loaded = new Set(m.distributedLoads!.map((d) => d.element));
    const target = pick(m.elements.map((_, e) => e).filter((e) => !loaded.has(e)), next);
    if (target === undefined) return null;
    l.element = target;
    return m;
  },
  loadFlipped(m, next) {
    const ref = pick(loadRefs(m), next);
    if (!ref) return null;
    if (ref.list === 'nodalLoads') {
      const l = m.nodalLoads![ref.index]!;
      if (l.fx) l.fx = -l.fx;
      if (l.fy) l.fy = -l.fy;
      if (l.mz) l.mz = -l.mz;
    } else if (ref.list === 'pointLoads') {
      const l = m.pointLoads![ref.index]!;
      if (l.p) l.p = -l.p;
      if (l.m) l.m = -l.m;
    } else {
      const l = m.distributedLoads![ref.index]!;
      l.qI = -l.qI;
      if (l.qJ !== undefined) l.qJ = -l.qJ;
    }
    return m;
  },
  supportChanged(m, next) {
    const s = pick(m.supports.filter((s) => s.type === 'fixed' || s.type === 'pinned'), next);
    if (!s) return null;
    s.type = s.type === 'fixed' ? 'pinned' : 'fixed';
    return m;
  },
  supportsMirrored(m) {
    if (m.supports.length === 1) {
      const s = m.supports[0]!;
      const ends = m.nodes.map((_, k) => k).filter((k) => membersAt(m, k).length === 1 && k !== s.node);
      const far = ends.sort((a, b) => dist(m, b, s.node) - dist(m, a, s.node))[0];
      if (far === undefined) return null;
      s.node = far;
      return m;
    }
    const byX = [...m.supports].sort((a, b) => m.nodes[a.node]![0] - m.nodes[b.node]![0]);
    const first = byX[0]!, last = byX[byX.length - 1]!;
    if (first.type === last.type) return null;
    [first.type, last.type] = [last.type, first.type];
    return m;
  },
  hingeToggled(m, next) {
    if (m.truss) return null;
    if (m.hinges?.length) {
      m.hinges.splice(Math.floor(next() * m.hinges.length), 1);
      return m;
    }
    const k = pick(m.nodes.map((_, k) => k).filter((k) => membersAt(m, k).length >= 2), next);
    if (k === undefined) return null;
    m.hinges = [k];
    return m;
  },
  rollerTurned(m, next) {
    const s = pick(m.supports.filter((s) => s.type === 'rollerX' || s.type === 'rollerY'), next);
    if (!s) return null;
    s.type = (s.type === 'rollerX' ? 'rollerY' : 'rollerX') as SupportType;
    return m;
  },
  resultantLoad(m, next) {
    const index = pick((m.distributedLoads ?? []).map((_, i) => i), next);
    if (index === undefined) return null;
    const [d] = m.distributedLoads!.splice(index, 1);
    const L = memberLength(m, d!.element), qJ = d!.qJ ?? d!.qI;
    const total = (d!.qI + qJ) * L / 2;
    if (Math.abs(total) < 1e-9) return null;
    const a = Math.abs(d!.qI + qJ) < 1e-9 ? L / 2 : L * (d!.qI + 2 * qJ) / (3 * (d!.qI + qJ));
    (m.pointLoads ??= []).push({ element: d!.element, a, p: total });
    return m;
  },
  pointAsUniform(m, next) {
    const index = pick((m.pointLoads ?? []).map((_, i) => i).filter((i) => m.pointLoads![i]!.p), next);
    if (index === undefined) return null;
    const [p] = m.pointLoads!.splice(index, 1);
    const q = p!.p! / memberLength(m, p!.element);
    (m.distributedLoads ??= []).push({ element: p!.element, qI: q, qJ: q });
    return m;
  },
};

function dist(m: GameModel, a: number, b: number): number {
  return Math.hypot(m.nodes[a]![0] - m.nodes[b]![0], m.nodes[a]![1] - m.nodes[b]![1]);
}

function releasedEnds(ctx: MutationContext): Array<{ e: number; end: 0 | 1 }> {
  const m = ctx.solved.model;
  const ref = peak(sampleDiagram(ctx.correct));
  const out: Array<{ e: number; end: 0 | 1 }> = [];
  m.elements.forEach(([i, j], e) => {
    for (const [end, node] of [[0, i], [1, j]] as const) {
      if (norm(ctx.correct.traces[e]!.at(end)) > 1e-6 * ref) continue;
      const s = supportAt(m, node);
      const hinge = m.hinges?.includes(node);
      const free = !s && membersAt(m, node).length === 1;
      const pin = s && s.type !== 'fixed' && membersAt(m, node).length === 1;
      if (hinge || free || pin) out.push({ e, end });
    }
  });
  return out;
}

function outwardSign(tr: Trace, normal: Vec): number {
  const v = [0.25, 0.5, 0.75].reduce((s, t) => { const p = tr.at(t); return s + p[0] * normal[0] + p[1] * normal[1]; }, 0);
  return v < 0 ? -1 : 1;
}

function chainNeighbour(m: GameModel, e: number): number | undefined {
  const [, j] = m.elements[e]!;
  const { dir } = memberAxis(m, e);
  return m.elements.findIndex(([i2], e2) => {
    if (e2 === e || i2 !== j) return false;
    const d2 = memberAxis(m, e2).dir;
    return Math.abs(dir[0] * d2[0] + dir[1] * d2[1] - 1) < 1e-6;
  });
}

const MATH: Record<MathTag, (ctx: MutationContext) => Diagram | null> = {
  signFlipped: ({ correct }) => ({ kind: correct.kind, traces: correct.traces.map((tr) => ({ breaks: tr.breaks, at: (t) => scale(tr.at(t), -1) })) }),
  degreeLowered: ({ correct }) => perSegment(correct, (_tr, [a, b], s) => {
    if (s.curved) return (t) => add(s.f0, add(s.f1, s.f0, -1), (t - a) / (b - a));
    if (s.sloped) return () => scale(add(s.f0, s.f1), 0.5);
    return null;
  }),
  degreeRaised: (ctx) => {
    if (ctx.kind === 'D') return null;
    const ref = peak(sampleDiagram(ctx.correct));
    return perSegment(ctx.correct, (tr, [a, b], s, e) => {
      if (s.curved) return null;
      if (!s.sloped) {
        if (norm(s.f0) < 0.05 * ref) return null;
        return (t) => scale(s.f0, 1.7 - 1.4 * (t - a) / (b - a));
      }
      const { normal } = memberAxis(ctx.solved.model, e);
      const h = 0.8 * ref * outwardSign(tr, normal);
      return (t) => { const u = (t - a) / (b - a); return add(tr.at(t), normal, 4 * u * (1 - u) * h); };
    });
  },
  vertexWrongEnd: ({ correct }) => correct.kind === 'D' ? null : perSegment(correct, (tr, [a, b], s) => {
    if (!s.curved) return null;
    const d = 0.08 * (b - a);
    const s0 = norm(add(tr.at(a + d), s.f0, -1)), s1 = norm(add(s.f1, tr.at(b - d), -1));
    if (Math.min(s0, s1) > 0.3 * Math.max(s0, s1)) return null;
    return (t) => add(add(s.f0, s.f1), tr.at(a + b - t), -1);
  }),
  jumpMissing: (ctx) => {
    const { correct, solved } = ctx;
    const m = solved.model;
    const ref = peak(sampleDiagram(correct));
    const inside = correct.traces.flatMap((tr, e) => tr.breaks.map((b) => ({ e, b, jump: add(tr.at(b + EPS), tr.at(b - EPS), -1) })));
    const across = m.elements.flatMap((_, e) => {
      const n = chainNeighbour(m, e);
      if (n === undefined || n < 0) return [];
      return [{ e: n, b: 0, jump: add(correct.traces[n]!.at(0), correct.traces[e]!.at(1), -1) }];
    });
    const jump = pick([...inside, ...across].filter((j) => norm(j.jump) > 0.1 * ref), ctx.next);
    if (!jump) return null;
    const after = new Set<number>([jump.e]);
    for (let e = jump.e, n = chainNeighbour(m, e); n !== undefined && n >= 0 && !after.has(n); e = n, n = chainNeighbour(m, e)) after.add(n);
    return {
      kind: correct.kind,
      traces: correct.traces.map((tr, e) => !after.has(e) ? tr : ({
        breaks: e === jump.e ? tr.breaks.filter((b) => b !== jump.b) : tr.breaks,
        at: (t) => (e !== jump.e || t > jump.b ? add(tr.at(t), jump.jump, -1) : tr.at(t)),
      })),
    };
  },
  nonZeroAtRelease: (ctx) => {
    if (ctx.kind !== 'M') return null;
    const end = pick(releasedEnds(ctx), ctx.next);
    if (!end) return null;
    const ref = peak(sampleDiagram(ctx.correct));
    const tr = ctx.correct.traces[end.e]!;
    const { normal } = memberAxis(ctx.solved.model, end.e);
    const h = 0.8 * ref * outwardSign(tr, normal);
    const [a, b] = segmentOf(tr, end.end);
    return {
      kind: 'M',
      traces: ctx.correct.traces.map((t0, e) => e !== end.e ? t0 : ({
        breaks: t0.breaks,
        at: (t) => {
          if (t < a || t > b) return t0.at(t);
          const u = (t - a) / (b - a);
          return add(t0.at(t), normal, h * (end.end === 1 ? u : 1 - u));
        },
      })),
    };
  },
  inflectionMisplaced: (ctx) => {
    if (ctx.kind !== 'D' || ctx.solved.model.truss) return null;
    const changes = ctx.solved.forces.some((ef) => {
      const vs = Array.from({ length: 21 }, (_, k) => forceValue('M', ef, k / 20));
      const big = Math.max(...vs.map(Math.abs));
      return vs.some((v) => v > 0.05 * big) && vs.some((v) => v < -0.05 * big);
    });
    if (!changes) return null;
    const beta = ctx.next() < 0.5 ? 0.8 : -0.8;
    return { kind: 'D', traces: ctx.correct.traces.map((tr) => ({ breaks: tr.breaks, at: (t) => tr.at(t + beta * t * (1 - t)) })) };
  },
  supportDisplaced: (ctx) => {
    if (ctx.kind !== 'D') return null;
    const m = ctx.solved.model;
    const support = pick(m.supports, ctx.next);
    if (!support) return null;
    const node = support.node;
    const along: Vec = support.type === 'rollerX' ? [0, 1] : support.type === 'rollerY' ? [1, 0] : memberAxis(m, membersAt(m, node)[0]!).normal;
    const ref = peak(sampleDiagram(ctx.correct));
    const mean = ctx.correct.traces.reduce((s, tr) => { const p = tr.at(0.5); return s + p[0] * along[0] + p[1] * along[1]; }, 0);
    const h = 0.9 * ref * (mean < 0 ? -1 : 1);
    return {
      kind: 'D',
      traces: ctx.correct.traces.map((tr, e) => {
        const [i, j] = m.elements[e]!;
        if (i !== node && j !== node) return tr;
        return { breaks: tr.breaks, at: (t) => add(tr.at(t), along, h * (i === node ? 1 - t : t)) };
      }),
    };
  },
  memberSignFlipped: (ctx) => {
    if (!ctx.solved.model.truss) return null;
    const ref = peak(sampleDiagram(ctx.correct));
    const loaded = ctx.correct.traces.map((tr, e) => ({ e, v: norm(tr.at(0.5)) })).filter((x) => x.v > 0.1 * ref).map((x) => x.e);
    if (loaded.length < 2) return null;
    const flipped = new Set(loaded.filter(() => ctx.next() < 0.4));
    if (flipped.size === 0) flipped.add(pick(loaded, ctx.next)!);
    if (flipped.size === loaded.length) flipped.delete(loaded[0]!);
    return { kind: 'N', traces: ctx.correct.traces.map((tr, e) => flipped.has(e) ? { breaks: [], at: (t) => scale(tr.at(t), -1) } : tr) };
  },
  zeroForceLoaded: (ctx) => {
    if (!ctx.solved.model.truss) return null;
    const ref = peak(sampleDiagram(ctx.correct));
    const zero = ctx.correct.traces.map((tr, e) => ({ e, v: norm(tr.at(0.5)) })).filter((x) => x.v < 1e-6 * ref).map((x) => x.e);
    if (!zero.length) return null;
    const m = ctx.solved.model;
    return {
      kind: 'N',
      traces: ctx.correct.traces.map((tr, e) => {
        if (!zero.includes(e)) return tr;
        const { normal } = memberAxis(m, e);
        const v = (ctx.next() < 0.5 ? -0.6 : 0.6) * ref;
        return { breaks: [], at: () => scale(normal, v) };
      }),
    };
  },
  loadedShownZero: (ctx) => {
    if (!ctx.solved.model.truss) return null;
    const ref = peak(sampleDiagram(ctx.correct));
    const loaded = ctx.correct.traces.map((tr, e) => ({ e, v: norm(tr.at(0.5)) })).filter((x) => x.v > 0.2 * ref && x.v < 0.999 * ref).map((x) => x.e);
    const chosen = new Set([pick(loaded, ctx.next), pick(loaded, ctx.next)].filter((e): e is number => e !== undefined));
    if (!chosen.size) return null;
    return { kind: 'N', traces: ctx.correct.traces.map((tr, e) => chosen.has(e) ? { breaks: [], at: (): Vec => [0, 0] } : tr) };
  },
};

export function isPhysical(tag: Tag): tag is PhysicalTag {
  return (PHYSICAL_TAGS as readonly string[]).includes(tag);
}

export function mutate(tag: Tag, ctx: MutationContext): Diagram | null {
  return isPhysical(tag) ? physical(ctx, (m) => MUTATORS[tag](m, ctx.next)) : MATH[tag](ctx);
}
