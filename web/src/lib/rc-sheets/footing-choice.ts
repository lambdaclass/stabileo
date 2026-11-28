import { buildingPlan, coverPlan, footingCorners, footingOverlaps } from './footing-overlaps';

export { buildingPlan };
import { layFootings, type LayoutHooks } from './footing-layout';
import { placeMembers, summed } from './footing-group';
import type { FootingDemand, FootingGroup, FootingRow, FootingSolution, FoundationSystem, GroupKind } from './footing-types';

type Axis = 'x' | 'y';

export interface ChoiceHooks extends LayoutHooks {
  /** The row of a strip or mat for these columns. */
  group(g: FootingGroup): FootingRow;
}

export interface ChoiceOptions {
  system: FoundationSystem;
  /** Each row's own solution, by its key. */
  solutions: Readonly<Record<string, FootingSolution>>;
  /** Above this share of the building's plan covered by footings, a mat (GA §7.1; Stabileo criterion). */
  matShare: number;
}

/** The members' demands of the rows given, a group row standing for all it holds. */
const membersOf = (r: FootingRow): FootingDemand[] => r.demand.group?.members ?? (r.demand.carried ? [r.demand, r.demand.carried] : [r.demand]);

/**
 * Strips along the column lines the way that gives the fewest lines, each line of two columns or
 * more on one strip; a core joins the line it stands across.
 */
function* alongLines(rows: FootingRow[], fixed: (r: FootingRow) => boolean, pinned: (r: FootingRow) => boolean, make: (ms: FootingDemand[], kind: GroupKind, reason: FootingGroup['reason']) => FootingRow): Generator<void, FootingRow[]> {
  const free = rows.filter((r) => !fixed(r) && !pinned(r) && !r.demand.group && !r.demand.carried);
  const linesOf = (k: Axis) => {
    const across: Axis = k === 'x' ? 'y' : 'x';
    const plain = free.filter((r) => !r.demand.pier).sort((p, q) => p.demand.at[across] - q.demand.at[across]);
    const out: FootingRow[][] = [];
    for (const r of plain) { const last = out[out.length - 1]; if (last && r.demand.at[across] - last[last.length - 1]!.demand.at[across] <= 0.5) last.push(r); else out.push([r]); }
    for (const r of free.filter((x) => x.demand.pier)) {
      const half = (across === 'x' ? r.demand.column?.b ?? 0 : r.demand.column?.h ?? 0) / 2;
      const near = out.map((l) => ({ l, d: Math.abs(l[0]!.demand.at[across] - r.demand.at[across]) })).sort((p, q) => p.d - q.d)[0];
      if (near && near.d <= half + 0.5) near.l.push(r); else out.push([r]);
    }
    return out;
  };
  const all = (['x', 'y'] as const).map((k) => ({ k, lines: linesOf(k).filter((l) => l.length > 1) }));
  const ways = all.some((w) => w.lines.length) ? all.filter((w) => w.lines.length) : all;
  const best = ways.sort((p, q) => p.lines.length - q.lines.length || q.lines.reduce((s, l) => s + l.length, 0) - p.lines.reduce((s, l) => s + l.length, 0))[0]!;
  let out = [...rows];
  for (const l of best.lines) { out = [...out.filter((r) => !l.includes(r)), make(l.flatMap(membersOf), 'strip', 'project')]; yield; }
  return out;
}

/** The line a set of columns stands on, when they do: the axis they spread along, every one within half a metre across. */
export function lineOf(ms: readonly FootingDemand[]): Axis | null {
  if (ms.length < 2) return null;
  const spread = (k: Axis) => Math.max(...ms.map((m) => m.at[k])) - Math.min(...ms.map((m) => m.at[k]));
  const lean = (k: Axis) => Math.max(...ms.map((m) => (k === 'x' ? m.column?.h ?? 0 : m.column?.b ?? 0))) / 2;
  if (spread('y') <= Math.max(0.5, lean('x')) && spread('x') > spread('y')) return 'x';
  if (spread('x') <= Math.max(0.5, lean('y')) && spread('y') > spread('x')) return 'y';
  return null;
}

/**
 * The building's foundation by the selection rule (GA §15.1; criteria in `criteria.ts`): each
 * column on its own footing, held at a line and balanced as `withEdges` set it; footings that
 * overlap are first given room and then share a combined footing (two columns) or a strip
 * (columns in a line); a group that stands on no line, or a strip that does not verify, is a mat
 * under it; and when the footings would cover more than `matShare` of the building's plan, the
 * whole building stands on one mat. Groups are merged until no two foundations overlap. The
 * project may ask for a mat, for footings only or for strips along the column lines: those two
 * stay what they are, footings that overlap paired into combined footings and what still overlaps
 * said so, never merged into a mat. A row may ask for its own footing, a shared one or the mat.
 * Footings the engineer adopted or the model holds stay as they are.
 */
export function chooseFoundations(rows: readonly FootingRow[], h: ChoiceHooks, o: ChoiceOptions): FootingRow[] {
  const it = chooseFoundationsSteps(rows, h, o);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

/** `chooseFoundations` in steps: one after every strip or mat it designs, so a page can draw between them. */
export function* chooseFoundationsSteps(rows: readonly FootingRow[], h: ChoiceHooks, o: ChoiceOptions): Generator<void, FootingRow[]> {
  const solution = (r: FootingRow): FootingSolution | undefined => o.solutions[r.key] ?? membersOf(r).map((m) => o.solutions[m.key]).find(Boolean);
  const fixed = (r: FootingRow) => !!r.demand.footing || r.B <= 0 || (r.isAdopted && !r.demand.group && !r.demand.carried) || !r.demand.column && !r.demand.group;
  const pinned = (r: FootingRow) => solution(r) === 'isolated';
  const groupRow = (members: FootingDemand[], kind: GroupKind, reason: FootingGroup['reason']): FootingRow => {
    const axis = kind === 'strip' ? lineOf(members) ?? undefined : undefined;
    return h.group({ kind, members: [...members].sort((p, q) => p.nodeId - q.nodeId), ...(axis ? { axis } : {}), reason });
  };
  const plan = coverPlan(rows);
  const covered = rows.filter((r) => r.B > 0).reduce((s, r) => s + r.B * r.L, 0);
  const byCover = o.system === 'auto' && !!plan && covered / plan.area > o.matShare + 1e-9;
  const toMat = (r: FootingRow) => !fixed(r) && !pinned(r) && (o.system === 'mat' || solution(r) === 'mat' || (byCover && solution(r) !== 'combined'));
  let out: FootingRow[] = [...rows];
  const matRows = out.filter(toMat);
  if (matRows.length >= 2) {
    const reason: FootingGroup['reason'] = o.system === 'mat' ? 'project' : byCover ? 'cover' : 'row';
    const mat = groupRow(matRows.flatMap(membersOf), 'mat', reason);
    out = [...out.filter((r) => !matRows.includes(r)), mat];
    yield;
  }
  if (o.system === 'strips') out = yield* alongLines(out, fixed, pinned, groupRow);
  const merges = o.system === 'auto' || o.system === 'mat';
  if (o.system !== 'piles') out = layFootings(out, h);
  const near = (r: FootingRow) => out.filter((x) => x !== r && !fixed(x) && !pinned(x))
    .map((x) => ({ x, d: Math.hypot(x.demand.at.x - r.demand.at.x, x.demand.at.y - r.demand.at.y) }))
    .sort((p, q) => p.d - q.d)[0]?.x;
  const asked: Array<[FootingRow, FootingRow]> = out.filter((r) => solution(r) === 'combined' && !r.demand.group && !r.demand.carried && !fixed(r)).flatMap((r) => { const n = near(r); return n ? [[r, n] as [FootingRow, FootingRow]] : []; });
  if (o.system === 'piles') return out;
  if (!merges) return pairedFootings(out, asked, (r) => !fixed(r) && !pinned(r) && !r.demand.group && !r.demand.carried, h);
  for (let round = 0; round < rows.length + 2; round++) {
    const live = out.filter((r) => !fixed(r) && !pinned(r));
    const parent = new Map(live.map((r) => [r.key, r.key]));
    const root = (k: string): string => (parent.get(k) === k ? k : root(parent.get(k)!));
    const join = (a: string, b: string) => { if (parent.has(a) && parent.has(b)) parent.set(root(b), root(a)); };
    for (const [a, b] of footingOverlaps(live).pairs) join(a, b);
    if (round === 0) for (const [a, b] of asked) join(a.key, b.key);
    const comps = new Map<string, FootingRow[]>();
    for (const r of live) { const k = root(r.key); comps.set(k, [...(comps.get(k) ?? []), r]); }
    const joined = [...comps.values()].filter((c) => c.length > 1);
    if (!joined.length) break;
    for (const comp of joined) {
      const members = comp.flatMap(membersOf);
      const hasMat = comp.some((r) => r.demand.group?.kind === 'mat');
      const axis = hasMat ? null : lineOf(members);
      let next: FootingRow;
      if (members.length === 2 && !members.some((m) => m.edge) && axis) next = h.combine(members[0]!.nodeId <= members[1]!.nodeId ? members[0]! : members[1]!, members[0]!.nodeId <= members[1]!.nodeId ? members[1]! : members[0]!);
      else if (axis) {
        next = groupRow(members, 'strip', 'overlap');
        if (next.status === 'fail') { const m = groupRow(members, 'mat', 'fallback'); if (m.status !== 'fail') next = m; }
      } else next = groupRow(members, 'mat', hasMat ? (comp.find((r) => r.demand.group?.kind === 'mat')!.demand.group!.reason) : 'fallback');
      out = [...out.filter((r) => !comp.includes(r)), next];
      yield;
    }
  }
  return out;
}

/** Whether a footing stays inside the property lines the rows are held at: the building's plan on each side a footing is held at. */
function withinLines(rows: readonly FootingRow[]): (r: FootingRow) => boolean {
  const ms = rows.flatMap(membersOf), plan = buildingPlan(ms);
  if (!plan) return () => true;
  const held = (i: 0 | 1, s: number) => ms.some((m) => (m.edge?.anchor[i] ?? 0) * s > 0);
  const lo = { x: held(0, -1), y: held(1, -1) }, hi = { x: held(0, 1), y: held(1, 1) };
  return (r) => {
    const c = footingCorners(r), xs = c.map((p) => p.x), ys = c.map((p) => p.y);
    return (!lo.x || Math.min(...xs) >= plan.x0 - 1e-6) && (!hi.x || Math.max(...xs) <= plan.x1 + 1e-6) && (!lo.y || Math.min(...ys) >= plan.y0 - 1e-6) && (!hi.y || Math.max(...ys) <= plan.y1 + 1e-6);
  };
}

/**
 * Footings only, or strips: what still overlaps is paired, the nearest single footings first (and
 * those a row asked to share), into a combined footing where that one verifies, round after round
 * while a pair is left; nothing becomes a strip or a mat here, and what overlaps after that says
 * so (`withOverlaps`).
 */
function pairedFootings(rows: FootingRow[], asked: ReadonlyArray<[FootingRow, FootingRow]>, single: (r: FootingRow) => boolean, h: ChoiceHooks): FootingRow[] {
  let out = [...rows];
  const inside = withinLines(rows);
  const done = new Set<string>(), wanted = new Set(asked.map(([a, b]) => [a.key, b.key].sort().join('|')));
  for (let round = 0; round < rows.length; round++) {
    const live = out.filter(single);
    const keys = new Set(live.map((r) => r.key));
    const dist = (a: FootingRow, b: FootingRow) => Math.hypot(a.demand.at.x - b.demand.at.x, a.demand.at.y - b.demand.at.y);
    const pairs = [
      ...(round === 0 ? asked.filter(([a, b]) => keys.has(a.key) && keys.has(b.key)).map(([a, b]) => [a.key, b.key] as [string, string]) : []),
      ...footingOverlaps(live).pairs.filter(([a, b]) => !done.has([a, b].sort().join('|'))),
    ].map(([a, b]) => [live.find((r) => r.key === a)!, live.find((r) => r.key === b)!] as const)
      .sort((p, q) => dist(p[0], p[1]) - dist(q[0], q[1]));
    const used = new Set<string>();
    let any = false;
    for (const [a, b] of pairs) {
      if (used.has(a.key) || used.has(b.key)) continue;
      used.add(a.key); used.add(b.key); done.add([a.key, b.key].sort().join('|'));
      const [first, second] = a.demand.nodeId <= b.demand.nodeId ? [a, b] : [b, a];
      const c = h.combine(first.demand, second.demand);
      if (c.B <= 0 || (!wanted.has([a.key, b.key].sort().join('|')) && (c.status === 'fail' || !inside(c)))) continue;
      out = out.filter((x) => x !== second).map((x) => (x === first ? c : x));
      any = true;
    }
    if (!any) break;
  }
  return out;
}

/** A strip's or mat's demand: its first column's place, its columns' actions summed there, keyed and named by them. */
export function groupDemand(g: FootingGroup): FootingDemand {
  const ref = g.members[0]!;
  const cols = placeMembers(g, { ex: 0, ey: 0 });
  const names = g.members.map((m) => m.name);
  const byCombo = new Map(g.members.map((m) => { const own = new Map<string, FootingDemand['combos'][number]>(); for (const x of m.combos) if (!own.has(x.combo)) own.set(x.combo, x); return [m, own] as const; }));
  const combos = ref.combos.flatMap((k) => { const a = summed(cols, (d) => byCombo.get(d)?.get(k.combo), k.combo); return a ? [a] : []; });
  const model = ref.footing?.group && g.members.every((m) => new Set(m.footing?.group?.members ?? []).has(m.key)) ? ref.footing : undefined;
  return {
    key: `footing:${g.kind}:${g.members.map((m) => m.key.replace(/^footing:/, '')).join('+')}`,
    name: g.kind === 'mat' && names.length > 4 ? `${names[0]} … ${names[names.length - 1]} (${names.length})` : names.join(' + '),
    ...(ref.level ? { level: ref.level } : {}), nodeId: ref.nodeId, at: ref.at, column: ref.column,
    ...(model ? { footing: model } : {}),
    service: summed(cols, (d) => d.service, 'D + L'), lateralLeftOut: Math.max(0, ...g.members.map((m) => m.lateralLeftOut)), combos,
    soil: ref.soil, ...(ref.founding !== undefined ? { founding: ref.founding } : {}), group: g,
  };
}
