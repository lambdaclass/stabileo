import { buildingPlan, footingOverlaps } from './footing-overlaps';

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
function alongLines(rows: FootingRow[], fixed: (r: FootingRow) => boolean, pinned: (r: FootingRow) => boolean, make: (ms: FootingDemand[], kind: GroupKind, reason: FootingGroup['reason']) => FootingRow): FootingRow[] {
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
  const ways = (['x', 'y'] as const).map((k) => ({ k, lines: linesOf(k).filter((l) => l.length > 1) }));
  const best = ways.sort((p, q) => p.lines.length - q.lines.length || q.lines.reduce((s, l) => s + l.length, 0) - p.lines.reduce((s, l) => s + l.length, 0))[0]!;
  let out = [...rows];
  for (const l of best.lines) out = [...out.filter((r) => !l.includes(r)), make(l.flatMap(membersOf), 'strip', 'project')];
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
 * whole building stands on one mat. The project may ask for footings only or for a mat, and a row
 * for its own footing, a shared one or the mat. Groups are merged until no two foundations
 * overlap. Footings the engineer adopted or the model holds stay as they are.
 */
export function chooseFoundations(rows: readonly FootingRow[], h: ChoiceHooks, o: ChoiceOptions): FootingRow[] {
  const solution = (r: FootingRow): FootingSolution | undefined => o.solutions[r.key] ?? membersOf(r).map((m) => o.solutions[m.key]).find(Boolean);
  const fixed = (r: FootingRow) => !!r.demand.footing || r.B <= 0 || (r.isAdopted && !r.demand.group && !r.demand.carried) || !r.demand.column && !r.demand.group;
  const pinned = (r: FootingRow) => solution(r) === 'isolated';
  const groupRow = (members: FootingDemand[], kind: GroupKind, reason: FootingGroup['reason']): FootingRow => {
    const axis = kind === 'strip' ? lineOf(members) ?? undefined : undefined;
    return h.group({ kind, members: [...members].sort((p, q) => p.nodeId - q.nodeId), ...(axis ? { axis } : {}), reason });
  };
  const plan = buildingPlan(rows.flatMap(membersOf));
  const covered = rows.filter((r) => r.B > 0).reduce((s, r) => s + r.B * r.L, 0);
  const byCover = o.system === 'auto' && !!plan && covered / plan.area > o.matShare + 1e-9;
  const toMat = (r: FootingRow) => !fixed(r) && !pinned(r) && (o.system === 'mat' || solution(r) === 'mat' || (byCover && solution(r) !== 'combined'));
  let out: FootingRow[] = [...rows];
  const matRows = out.filter(toMat);
  if (matRows.length >= 2) {
    const reason: FootingGroup['reason'] = o.system === 'mat' ? 'project' : byCover ? 'cover' : 'row';
    const mat = groupRow(matRows.flatMap(membersOf), 'mat', reason);
    out = [...out.filter((r) => !matRows.includes(r)), mat];
  }
  if (o.system === 'strips') out = alongLines(out, fixed, pinned, groupRow);
  out = layFootings(out, h);
  const near = (r: FootingRow) => out.filter((x) => x !== r && !fixed(x) && !pinned(x))
    .map((x) => ({ x, d: Math.hypot(x.demand.at.x - r.demand.at.x, x.demand.at.y - r.demand.at.y) }))
    .sort((p, q) => p.d - q.d)[0]?.x;
  const asked: Array<[FootingRow, FootingRow]> = out.filter((r) => solution(r) === 'combined' && !r.demand.group && !r.demand.carried && !fixed(r)).flatMap((r) => { const n = near(r); return n ? [[r, n] as [FootingRow, FootingRow]] : []; });
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
    }
  }
  return out;
}

/** A strip's or mat's demand: its first column's place, its columns' actions summed there, keyed and named by them. */
export function groupDemand(g: FootingGroup): FootingDemand {
  const ref = g.members[0]!;
  const cols = placeMembers(g, { ex: 0, ey: 0 });
  const names = g.members.map((m) => m.name);
  const combos = ref.combos.flatMap((k) => { const a = summed(cols, (d) => d.combos.find((x) => x.combo === k.combo), k.combo); return a ? [a] : []; });
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
