/**
 * A beam line's reinforcement as bars along the line, read from its members' three regions and
 * projected back onto them, and the edits the frame editor makes on it.
 *
 * Reading (`lineFromMembers`): each region's bars become bars along the line, from the node or the
 * region boundary their continuity says, the top bars over a support merged into one bar when both
 * sides carry the same row; each region's stirrups become a zone.
 *
 * Projecting (`membersFromLine`): a member's bottom steel is the bars over the middle of its span
 * region, its top steel at each end the bars over that support's face; how far each reaches into
 * the next region is its extension, and a hook at an end inside the member is its anchorage. Its
 * support stirrups are the weaker of its two end zones, so the check never credits the stronger.
 * The round trip reproduces what the verifier reads.
 */
import type { ProvidedReinforcement, LongBarGroup, RebarLayer, StirrupDef } from '../../design-contract/reinforcement';
import { BEAM_LINE_VERSION, type BeamLineBar, type BeamLineReinforcement, type BeamStirrupZone } from '../../design-contract/beam-line';
import { resolveBarGroups, resolveLayers } from '../station-design-forces';

const EPS = 1e-6;

/** A member of the line, its regions as the verifier sees them, its bars in the line's sense. */
export interface LineMember {
  id: number;
  L: number;
  /** Start region [0, tStart], end region [1 − tEnd, 1], as fractions of L. */
  tStart: number;
  tEnd: number;
  /** Distance from each node to its support face, m. */
  faceStart: number;
  faceEnd: number;
  reinforcement?: ProvidedReinforcement;
}

/** What a member of a line is read from: its length, the verifier's critical sections, its bars. */
export interface LineMemberSource {
  L: number;
  criticalSections?: { start: { tCritShear: number; tFace: number; source: string }; end: { tCritShear: number; tFace: number; source: string } };
  reinforcement?: ProvidedReinforcement;
}

/** The members of a line in its sense: regions as the verifier cuts them, faces, bars turned. */
export function lineMembersOf(
  line: { members: readonly number[]; forward: readonly boolean[] },
  source: (id: number) => LineMemberSource,
  mirror: (r: ProvidedReinforcement) => ProvidedReinforcement,
): LineMember[] {
  return line.members.map((id, i) => {
    const { L, criticalSections: cs, reinforcement: r } = source(id);
    const userT = r?.regions?.regionT;
    const tI = cs ? cs.start.tCritShear : (userT ?? 0.25), tJ = cs ? cs.end.tCritShear : (userT ?? 0.25);
    const real = (g: { source: string }) => g.source === 'column' || g.source === 'wall';
    const fI = cs && real(cs.start) ? cs.start.tFace * L : 0;
    const fJ = cs && real(cs.end) ? cs.end.tFace * L : 0;
    const fwd = line.forward[i] !== false;
    return {
      id, L,
      tStart: fwd ? tI : tJ, tEnd: fwd ? tJ : tI,
      faceStart: fwd ? fI : fJ, faceEnd: fwd ? fJ : fI,
      ...(r ? { reinforcement: fwd ? r : mirror(r) } : {}),
    };
  });
}

const offsets = (ms: readonly { L: number }[]): number[] => {
  const o: number[] = [];
  ms.forEach((_, i) => o.push(i === 0 ? 0 : o[i - 1]! + ms[i - 1]!.L));
  return o;
};

let seq = 0;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;

/** Read a line from its members' regions. */
export function lineFromMembers(members: readonly LineMember[]): BeamLineReinforcement {
  const X = offsets(members);
  const bars: BeamLineBar[] = [];
  const stirrups: BeamStirrupZone[] = [];
  const skin: Record<string, { diameter: number; spacing: number }> = {};
  let n = 0;
  const bar = (b: Omit<BeamLineBar, 'id'>) => bars.push({ ...b, id: `b${++n}` });
  const zone = (from: number, to: number, s?: StirrupDef) => { if (s && to > from + EPS) stirrups.push({ id: `z${stirrups.length + 1}`, from, to, diameter: s.diameter, legs: s.legs, spacing: s.spacing }); };

  members.forEach((m, k) => {
    const r = m.reinforcement;
    if (!r) return;
    const reg = r.regions ?? {};
    const a = X[k]!, b = a + m.L, s = a + m.tStart * m.L, e = b - m.tEnd * m.L, mid = (s + e) / 2;
    const cont = reg.continuity;
    // ── Bottom ──
    const bottom = resolveBarGroups(reg.bottomGroups, resolveLayers(reg.bottomSpanLayers, reg.bottomSpan ?? r.bottom), cont?.bottomIntoStart !== false, cont?.bottomIntoEnd !== false);
    for (const g of bottom) {
      const from = g.continueStart === false ? s : g.extensionStart !== undefined && g.extensionStart < s - a - EPS ? s - g.extensionStart : a;
      const to = g.continueEnd === false ? e : g.extensionEnd !== undefined && g.extensionEnd < b - e - EPS ? e + g.extensionEnd : b;
      for (const l of g.layers) bar({
        face: 'bottom', row: l.row ?? 0, count: l.count, diameter: l.diameter, from, to,
        ...(g.anchorageStart === 'hook' ? { hookStart: true } : {}), ...(g.anchorageEnd === 'hook' ? { hookEnd: true } : {}),
        role: from <= a + EPS && to >= b - EPS ? 'main' : 'extra',
      });
    }
    // ── Top at each end ──
    const topAt = (side: 'start' | 'end') => {
      const layers = side === 'start' ? resolveLayers(reg.topStartLayers, reg.topStart ?? r.top) : resolveLayers(reg.topEndLayers, reg.topEnd ?? r.top);
      const into = side === 'start' ? cont?.topStartIntoSpan !== false : cont?.topEndIntoSpan !== false;
      const groups = side === 'start' ? resolveBarGroups(reg.topStartGroups, layers, true, into) : resolveBarGroups(reg.topEndGroups, layers, into, true);
      for (const g of groups) {
        const reach = side === 'start' ? g.continueEnd !== false : g.continueStart !== false;
        const ext = side === 'start' ? g.extensionEnd : g.extensionStart;
        const len = reach ? (ext !== undefined && ext < mid - s - EPS ? ext : mid - s) : 0;
        const from = side === 'start' ? a : (reach ? e - (ext !== undefined && ext < e - mid - EPS ? ext : e - mid) : e);
        const to = side === 'start' ? s + len : b;
        for (const l of g.layers) bar({ face: 'top', row: l.row ?? 0, count: l.count, diameter: l.diameter, from, to, role: 'support' });
      }
    };
    topAt('start'); topAt('end');
    // ── Stirrups ──
    zone(a, s, reg.stirrupsSupport ?? r.stirrups);
    zone(s, e, reg.stirrupsSpan ?? r.stirrups);
    zone(e, b, reg.stirrupsSupport ?? r.stirrups);
    if (reg.skin) skin[String(m.id)] = { ...reg.skin };
  });

  return {
    version: BEAM_LINE_VERSION, members: members.map((m) => m.id), lengths: members.map((m) => m.L),
    bars: mergeOverSupports(bars), stirrups: mergeZones(stirrups),
    ...(Object.keys(skin).length ? { skin } : {}),
  };
}

/** Top bars meeting at a support with the same row, count and diameter become one bar over it. */
function mergeOverSupports(bars: BeamLineBar[]): BeamLineBar[] {
  const out: BeamLineBar[] = [];
  for (const b of [...bars].sort((p, q) => p.from - q.from)) {
    const j = b.face === 'top' ? out.findIndex((o) => o.face === 'top' && o.row === b.row && o.count === b.count && o.diameter === b.diameter && Math.abs(o.to - b.from) < EPS && !o.hookEnd && !b.hookStart) : -1;
    if (j >= 0) out[j] = { ...out[j]!, to: b.to };
    else out.push({ ...b });
  }
  return out;
}

const sameZone = (p: BeamStirrupZone, q: BeamStirrupZone) => p.diameter === q.diameter && p.legs === q.legs && Math.abs(p.spacing - q.spacing) < EPS;

function mergeZones(zs: BeamStirrupZone[]): BeamStirrupZone[] {
  const out: BeamStirrupZone[] = [];
  for (const z of [...zs].sort((p, q) => p.from - q.from)) {
    const last = out[out.length - 1];
    if (last && sameZone(last, z) && Math.abs(last.to - z.from) < EPS) out[out.length - 1] = { ...last, to: z.to };
    else out.push({ ...z });
  }
  return out;
}

const covers = (b: { from: number; to: number }, x: number) => b.from <= x + EPS && b.to >= x - EPS;

/** Rows of bars as the verifier's layers: one per row and diameter. */
function layersOf(bs: readonly BeamLineBar[]): RebarLayer[] {
  const by = new Map<string, RebarLayer>();
  for (const b of bs) {
    const k = `${b.row}:${b.diameter}`;
    const l = by.get(k);
    by.set(k, l ? { ...l, count: l.count + b.count } : { count: b.count, diameter: b.diameter, row: b.row });
  }
  return [...by.values()].sort((p, q) => (p.row ?? 0) - (q.row ?? 0) || q.diameter - p.diameter);
}

const groupOfLayers = (ls: RebarLayer[]) => ({ count: ls.reduce((s, l) => s + l.count, 0), diameter: Math.max(...ls.map((l) => l.diameter)) });

const avs = (z: BeamStirrupZone) => (z.legs * Math.PI * z.diameter ** 2 / 4) / z.spacing;
const stirrupOf = (z?: BeamStirrupZone): StirrupDef | undefined => (z ? { diameter: z.diameter, legs: z.legs, spacing: z.spacing } : undefined);

/** Project a line onto its members' regions. */
export function membersFromLine(line: BeamLineReinforcement, members: readonly LineMember[]): Map<number, ProvidedReinforcement> {
  const X = offsets(members);
  const out = new Map<number, ProvidedReinforcement>();
  members.forEach((m, k) => {
    const a = X[k]!, b = a + m.L, s = a + m.tStart * m.L, e = b - m.tEnd * m.L, mid = (s + e) / 2;
    const pS = a + Math.max(m.faceStart, 1e-3), pE = b - Math.max(m.faceEnd, 1e-3);
    const regions: NonNullable<ProvidedReinforcement['regions']> = {};

    // ── Bottom: the bars over the middle of the span region ──
    const bottom = line.bars.filter((x) => x.face === 'bottom' && covers(x, mid));
    if (bottom.length) {
      const layers = layersOf(bottom);
      regions.bottomSpanLayers = layers;
      regions.bottomSpan = groupOfLayers(layers);
      const groups: LongBarGroup[] = bottom.map((x) => ({
        layers: [{ count: x.count, diameter: x.diameter, row: x.row }],
        label: x.role,
        continueStart: x.from < s - EPS,
        continueEnd: x.to > e + EPS,
        ...(x.from < s - EPS && x.from > a + EPS ? { extensionStart: s - x.from } : {}),
        ...(x.to > e + EPS && x.to < b - EPS ? { extensionEnd: x.to - e } : {}),
        ...(x.hookStart && x.from > a - 0.5 && x.from < s ? { anchorageStart: 'hook' as const } : {}),
        ...(x.hookEnd && x.to < b + 0.5 && x.to > e ? { anchorageEnd: 'hook' as const } : {}),
      }));
      if (!groups.every((g) => g.continueStart && g.continueEnd && g.extensionStart === undefined && g.extensionEnd === undefined && !g.anchorageStart && !g.anchorageEnd)) {
        regions.bottomGroups = groups;
      }
    }
    // ── Top: the bars over each support face ──
    const topSide = (side: 'start' | 'end') => {
      const p = side === 'start' ? pS : pE;
      const bs = line.bars.filter((x) => x.face === 'top' && covers(x, p));
      if (!bs.length) return;
      const layers = layersOf(bs);
      const groups: LongBarGroup[] = bs.map((x) => {
        const reach = side === 'start' ? x.to > s + EPS : x.from < e - EPS;
        const ext = side === 'start' ? x.to - s : e - x.from;
        const full = side === 'start' ? mid - s : e - mid;
        return {
          layers: [{ count: x.count, diameter: x.diameter, row: x.row }], label: x.role,
          continueStart: side === 'start' ? true : reach,
          continueEnd: side === 'start' ? reach : true,
          ...(reach && ext < full - EPS ? (side === 'start' ? { extensionEnd: ext } : { extensionStart: ext }) : {}),
        };
      });
      const plain = groups.every((g) => g.continueStart && g.continueEnd && g.extensionStart === undefined && g.extensionEnd === undefined);
      if (side === 'start') { regions.topStartLayers = layers; regions.topStart = groupOfLayers(layers); if (!plain) regions.topStartGroups = groups; }
      else { regions.topEndLayers = layers; regions.topEnd = groupOfLayers(layers); if (!plain) regions.topEndGroups = groups; }
    };
    topSide('start'); topSide('end');
    // ── Stirrups: the span zone, and the weaker of the two end zones ──
    const zAt = (x: number) => line.stirrups.find((z) => z.from <= x + EPS && z.to >= x - EPS);
    const zs = zAt((a + s) / 2), ze = zAt((e + b) / 2), zm = zAt(mid);
    const sup = zs && ze ? (avs(zs) <= avs(ze) ? zs : ze) : (zs ?? ze);
    if (sup) regions.stirrupsSupport = stirrupOf(sup);
    if (zm) regions.stirrupsSpan = stirrupOf(zm);
    const skin = line.skin?.[String(m.id)];
    if (skin) regions.skin = { ...skin };
    const prior = m.reinforcement?.regions?.regionT;
    if (prior !== undefined) regions.regionT = prior;
    out.set(m.id, { regions });
  });
  return out;
}

/**
 * Where the bars of a member end inside it, for the detailing: the cut points of the bottom bars
 * that stop short of a support, and how far the top bars at each support reach into the span,
 * all in metres from the member's start node. Absent where the bars run to the nodes.
 */
export interface MemberCuts { bottomFrom?: number; bottomTo?: number; bottomShort?: number; topI?: number; topJ?: number }

export function memberCuts(line: BeamLineReinforcement, members: readonly LineMember[]): Map<number, MemberCuts> {
  const X = offsets(members);
  const out = new Map<number, MemberCuts>();
  members.forEach((m, k) => {
    const a = X[k]!, b = a + m.L, s = a + m.tStart * m.L, e = b - m.tEnd * m.L, mid = (s + e) / 2;
    const c: MemberCuts = {};
    const short = line.bars.filter((x) => x.face === 'bottom' && covers(x, mid) && (x.from > a + EPS || x.to < b - EPS));
    if (short.length) { c.bottomFrom = Math.max(a, ...short.map((x) => x.from)) - a; c.bottomTo = Math.min(b, ...short.map((x) => x.to)) - a; c.bottomShort = short.reduce((n, x) => n + x.count, 0); }
    const tI = line.bars.filter((x) => x.face === 'top' && covers(x, a + Math.max(m.faceStart, 1e-3)) && x.to < b - EPS);
    if (tI.length) c.topI = Math.min(...tI.map((x) => x.to)) - a;
    const tJ = line.bars.filter((x) => x.face === 'top' && covers(x, b - Math.max(m.faceEnd, 1e-3)) && x.from > a + EPS);
    if (tJ.length) c.topJ = Math.max(...tJ.map((x) => x.from)) - a;
    if (Object.keys(c).length) out.set(m.id, c);
  });
  return out;
}

// ─── Edits ────────────────────────────────────────────────────────

const total = (line: BeamLineReinforcement) => line.lengths.reduce((s, l) => s + l, 0);
const clampX = (line: BeamLineReinforcement, x: number) => Math.max(0, Math.min(total(line), x));
const withBars = (line: BeamLineReinforcement, bars: BeamLineBar[]): BeamLineReinforcement => ({ ...line, bars, memberHashes: undefined });
const withZones = (line: BeamLineReinforcement, stirrups: BeamStirrupZone[]): BeamLineReinforcement => ({ ...line, stirrups: [...stirrups].sort((p, q) => p.from - q.from), memberHashes: undefined });

export function addBar(line: BeamLineReinforcement, b: Omit<BeamLineBar, 'id'>): BeamLineReinforcement {
  const from = clampX(line, Math.min(b.from, b.to)), to = clampX(line, Math.max(b.from, b.to));
  return withBars(line, [...line.bars, { ...b, from, to, id: nextId('b') }]);
}

export function removeBar(line: BeamLineReinforcement, id: string): BeamLineReinforcement {
  return withBars(line, line.bars.filter((b) => b.id !== id));
}

export function updateBar(line: BeamLineReinforcement, id: string, patch: Partial<Omit<BeamLineBar, 'id'>>): BeamLineReinforcement {
  return withBars(line, line.bars.map((b) => {
    if (b.id !== id) return b;
    const n = { ...b, ...patch };
    const from = clampX(line, Math.min(n.from, n.to)), to = clampX(line, Math.max(n.from, n.to));
    return { ...n, from, to, count: Math.max(1, Math.round(n.count)), row: Math.max(0, Math.round(n.row)) };
  }));
}

/** Stretch or shorten one end of a bar to x. */
export const stretchBar = (line: BeamLineReinforcement, id: string, end: 'from' | 'to', x: number) => updateBar(line, id, { [end]: x });

/** Cut a bar at x into two, lapped over `lap` m centred on the cut (0: butt). */
export function cutBar(line: BeamLineReinforcement, id: string, x: number, lap = 0): BeamLineReinforcement {
  const b = line.bars.find((q) => q.id === id);
  if (!b || x <= b.from + EPS || x >= b.to - EPS) return line;
  const left = { ...b, id: nextId('b'), to: Math.min(b.to, x + lap / 2), hookEnd: undefined };
  const right = { ...b, id: nextId('b'), from: Math.max(b.from, x - lap / 2), hookStart: undefined };
  return withBars(line, [...line.bars.filter((q) => q.id !== id), left, right]);
}

/** Lap two bars of one face and row: the one on the left ends `lap` past where the right one starts. */
export function lapBars(line: BeamLineReinforcement, a: string, b: string, lap: number): BeamLineReinforcement {
  const [p, q] = [line.bars.find((x) => x.id === a), line.bars.find((x) => x.id === b)].sort((u, v) => (u?.from ?? 0) - (v?.from ?? 0));
  if (!p || !q || p.face !== q.face) return line;
  const meet = (p.to + q.from) / 2;
  return withBars(line, line.bars.map((x) => x.id === p.id ? { ...x, to: clampX(line, meet + lap / 2) } : x.id === q.id ? { ...x, from: clampX(line, meet - lap / 2) } : x));
}

/** Join two bars of one face, row, count and diameter into one from the first start to the last end. */
export function joinBars(line: BeamLineReinforcement, a: string, b: string): BeamLineReinforcement {
  const p = line.bars.find((x) => x.id === a), q = line.bars.find((x) => x.id === b);
  if (!p || !q || p.face !== q.face || p.row !== q.row || p.count !== q.count || p.diameter !== q.diameter) return line;
  const [l, r] = p.from <= q.from ? [p, q] : [q, p];
  const joined: BeamLineBar = { ...l, id: nextId('b'), from: l.from, to: Math.max(l.to, r.to), hookEnd: (r.to >= l.to ? r.hookEnd : l.hookEnd) || undefined };
  return withBars(line, [...line.bars.filter((x) => x.id !== a && x.id !== b), joined]);
}

export const setHook = (line: BeamLineReinforcement, id: string, end: 'start' | 'end', on: boolean) =>
  updateBar(line, id, end === 'start' ? { hookStart: on || undefined } : { hookEnd: on || undefined });

export const changeRow = (line: BeamLineReinforcement, id: string, row: number) => updateBar(line, id, { row });

/** Split a stirrup zone in two at x. */
export function splitZone(line: BeamLineReinforcement, id: string, x: number): BeamLineReinforcement {
  const z = line.stirrups.find((q) => q.id === id);
  if (!z || x <= z.from + EPS || x >= z.to - EPS) return line;
  return withZones(line, [...line.stirrups.filter((q) => q.id !== id), { ...z, id: nextId('z'), to: x }, { ...z, id: nextId('z'), from: x }]);
}

export function updateZone(line: BeamLineReinforcement, id: string, patch: Partial<Omit<BeamStirrupZone, 'id'>>): BeamLineReinforcement {
  return withZones(line, line.stirrups.map((z) => z.id === id ? {
    ...z, ...patch,
    legs: Math.max(2, Math.min(6, Math.round(patch.legs ?? z.legs))),
    spacing: Math.max(0.05, patch.spacing ?? z.spacing),
  } : z));
}

/** Delete a zone: its neighbour on the left takes its length, else the one on the right. */
export function deleteZone(line: BeamLineReinforcement, id: string): BeamLineReinforcement {
  const zs = [...line.stirrups].sort((p, q) => p.from - q.from);
  const i = zs.findIndex((z) => z.id === id);
  if (i < 0 || zs.length < 2) return line;
  const z = zs[i]!;
  const next = zs.filter((q) => q.id !== id).map((q) => q.id === zs[i - 1]?.id ? { ...q, to: z.to } : (!zs[i - 1] && q.id === zs[i + 1]?.id ? { ...q, from: z.from } : q));
  return withZones(line, next);
}

/** Equalize zones: each takes the densest of them (the most Av/s). */
export function equalizeZones(line: BeamLineReinforcement, ids: readonly string[]): BeamLineReinforcement {
  const sel = line.stirrups.filter((z) => ids.includes(z.id));
  if (sel.length < 2) return line;
  const best = sel.reduce((p, q) => (avs(q) > avs(p) ? q : p));
  return withZones(line, line.stirrups.map((z) => ids.includes(z.id) ? { ...z, diameter: best.diameter, legs: best.legs, spacing: best.spacing } : z));
}

/** Area of a face's bars at x, cm². */
export function areaAt(line: BeamLineReinforcement, face: 'top' | 'bottom', x: number): number {
  return line.bars.filter((b) => b.face === face && covers(b, x)).reduce((s, b) => s + b.count * Math.PI * b.diameter ** 2 / 400, 0);
}

/** Where each member starts along the line. */
export const memberOffsets = (line: BeamLineReinforcement): number[] => offsets(line.lengths.map((L) => ({ L })));

/**
 * Reinforce consecutive members as one span (a predefined span): on each face and row the bars
 * inside the range become one bar over all of it, with the heaviest arrangement any of its members
 * had there; bars that leave the range are kept. Recorded in `spans`.
 */
export function uniteSpans(line: BeamLineReinforcement, i0: number, i1: number): BeamLineReinforcement {
  const [p, q] = [Math.max(0, Math.min(i0, i1)), Math.min(line.members.length - 1, Math.max(i0, i1))];
  if (q <= p) return line;
  const X = memberOffsets(line);
  const A = X[p]!, B = X[q]! + line.lengths[q]!;
  const inside = (b: BeamLineBar) => b.from >= A - EPS && b.to <= B + EPS;
  const weight = (b: BeamLineBar) => b.count * b.diameter ** 2;
  const keep = line.bars.filter((b) => !inside(b));
  const merged: BeamLineBar[] = [];
  for (const face of ['bottom', 'top'] as const) {
    const rows = new Map<number, BeamLineBar[]>();
    for (const b of line.bars.filter((x) => x.face === face && inside(x))) rows.set(b.row, [...(rows.get(b.row) ?? []), b]);
    for (const [row, bs] of rows) {
      const heavy = bs.reduce((u, v) => (weight(v) > weight(u) ? v : u));
      const from = face === 'bottom' ? Math.min(...bs.map((b) => b.from)) : Math.min(...bs.map((b) => b.from));
      const to = Math.max(...bs.map((b) => b.to));
      merged.push({
        id: nextId('b'), face, row, count: heavy.count, diameter: heavy.diameter, from, to,
        ...(bs.some((b) => b.hookStart && Math.abs(b.from - from) < EPS) ? { hookStart: true } : {}),
        ...(bs.some((b) => b.hookEnd && Math.abs(b.to - to) < EPS) ? { hookEnd: true } : {}),
        role: face === 'bottom' ? 'main' : 'support',
      });
    }
  }
  const range = Array.from({ length: q - p + 1 }, (_, k) => p + k);
  const spans = [...(line.spans ?? []).filter((s) => !s.some((i) => range.includes(i))), range];
  return { ...withBars(line, [...keep, ...merged]), spans };
}

/** Forget a predefined span (the bars stay as they are). */
export function splitSpans(line: BeamLineReinforcement, index: number): BeamLineReinforcement {
  return { ...line, spans: (line.spans ?? []).filter((s) => !s.includes(index)) };
}
