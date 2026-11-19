import { shiftAt } from './footing-balance';
import { lineRowStatus, type LineLayout } from './beam-line';
import type { BeamContext, BeamComboForces, BeamDemand, BeamRow, SectionEnv } from './beam-row';
import type { Fmt } from './format';
import type { FootingAdopted, FootingDemand, FootingRow, StrapResult } from './footing-types';
import type { SheetRules } from './codes';
import { designKey, designMemo } from './design-memo';

/** One footing's offset taken by a strap: its column's loads, the offset along the strap and its length, m, and whether the beam runs from the partner to it. */
export interface StrapLoad { demand: FootingDemand; lever: number; along: number; u: 1 | -1; axis: 'x' | 'y'; L: number; reversed: boolean }

/**
 * The strap's moment and shear from one combination of one footing, at x from its column: the
 * column's moment |w| and load P1 hog it to M = P1·e + |w| over the footing's centre, then the
 * end force V = M/(L − e) brings it back to nothing at the partner. The shear over the footing is
 * the footing's own, read by its one-way shear and punching; the beam takes V.
 */
export function strapAt(P: number, w: number, e: number, L: number, x: number): { m: number; v: number } {
  const M = P * e + Math.abs(w), V = M / (L - e);
  return { m: x <= e ? -(Math.abs(w) + P * x) : -V * (L - x), v: V };
}

const sectionAt = (x: number, neg: number, combo: string | null, pos = 0): SectionEnv =>
  ({ x, pos: { value: pos }, neg: { value: neg, ...(combo ? { source: { combo, x } } : {}) }, nPos: 0, nNeg: 0 });

/**
 * The strap's demand: its statics from every footing it balances, each combination by name, over
 * what the analysis already puts on the member when the model has one (`base`), whose key, line
 * and ends it keeps. Over a member the envelopes add, the larger hogging with the larger hogging.
 * Its deflection is not checked, as no member on the ground is (`rc-sheets-service.ts`): it
 * follows the footings it ties, which the soil's pressure checks.
 */
export function strapDemand(o: { key: string; name: string; level?: string; L: number; b: number; h: number; halves: [number, number]; base?: BeamDemand; loads: readonly StrapLoad[] }): BeamDemand {
  const { L, base } = o;
  const xs = [...new Set([...Array.from({ length: 33 }, (_, i) => (i / 32) * L), ...o.loads.map((l) => (l.reversed ? L - l.along : l.along)), o.halves[0], L - o.halves[1]].map((x) => Math.round(x * 1e4) / 1e4))].sort((p, q) => p - q);
  const names = [...new Set(o.loads.flatMap((l) => l.demand.combos.map((k) => k.combo)))];
  const at = (combo: string, x: number) => o.loads.reduce((acc, l) => {
    const k = l.demand.combos.find((q) => q.combo === combo);
    if (!k) return acc;
    const w = (l.axis === 'x' ? shiftAt(k, l.lever).x : shiftAt(k, l.lever).y) * l.u;
    const s = strapAt(Math.abs(k.N), w, l.along, l.L, l.reversed ? L - x : x);
    return { m: acc.m + s.m, v: acc.v + s.v };
  }, { m: 0, v: 0 });
  const baseAt = (x: number) => {
    const env = base?.env ?? [];
    if (!env.length) return { pos: 0, neg: 0, v: 0 };
    const j = env.findIndex((e) => e.x >= x - 1e-9);
    if (j <= 0) return env[0]!;
    const a = env[j - 1]!, b = env[j]!, t = (x - a.x) / Math.max(b.x - a.x, 1e-9);
    return { pos: a.pos + t * (b.pos - a.pos), neg: a.neg + t * (b.neg - a.neg), v: a.v + t * (b.v - a.v) };
  };
  const env = xs.map((x) => {
    const own = names.map((n) => at(n, x));
    const bx = baseAt(x);
    const neg = Math.max(0, ...own.map((s) => -s.m)), v = Math.max(0, ...own.map((s) => s.v));
    return { x, pos: bx.pos, neg: neg + bx.neg, v: v + bx.v };
  });
  const x0 = o.halves[0], x1 = L - o.halves[1];
  const governing = (x: number) => names.reduce<{ combo: string | null; m: number }>((g, n) => { const m = -at(n, x).m; return m > g.m ? { combo: n, m } : g; }, { combo: null, m: 0 });
  const peak = env.reduce((p, q) => (q.neg > p.neg ? q : p), env[0]!);
  const envAt = (x: number) => env.reduce((p, q) => (Math.abs(q.x - x) < Math.abs(p.x - x) ? q : p), env[0]!);
  const combos: BeamComboForces[] = names.map((n) => {
    const own = base?.combos.find((c) => c.combo === n);
    const s0 = at(n, x0).m, sm = at(n, peak.x).m, s1 = at(n, x1).m;
    const mNeg = Math.max(0, ...xs.map((x) => -at(n, x).m));
    return {
      combo: n, mStart: s0 + (own?.mStart ?? 0), mSpan: sm + (own?.mSpan ?? 0), mEnd: s1 + (own?.mEnd ?? 0),
      mPos: own?.mPos ?? 0, mNeg: mNeg + (own?.mNeg ?? 0), xNeg: peak.x, nStart: 0, nSpan: 0, nEnd: 0, v: at(n, x1).v + (own?.v ?? 0), nV: 0, t: own?.t ?? 0,
    };
  });
  const vu = env.reduce((p, q) => (q.v > p.v ? q : p), env[0]!);
  const g = governing(peak.x);
  const shared = {
    length: L, b: o.b, h: o.h,
    start: sectionAt(x0, envAt(x0).neg, governing(x0).combo, envAt(x0).pos), span: sectionAt(peak.x, peak.neg, g.combo, peak.pos), end: sectionAt(x1, envAt(x1).neg, governing(x1).combo, envAt(x1).pos),
    negAny: { value: peak.neg, ...(g.combo ? { source: { combo: g.combo, x: peak.x } } : {}) }, nNegAny: 0,
    vu: { value: vu.v }, nAtV: 0, tu: base?.tu ?? { value: 0 }, combos, env,
    supportHalf: { start: o.halves[0], end: o.halves[1] },
  };
  if (base) {
    const { service: _s, ...rest } = base as BeamDemand & { service?: unknown };
    return { ...rest, ...shared, faces: undefined, serviceOff: true } as BeamDemand;
  }
  return {
    key: o.key, name: o.name, ...(o.level ? { level: o.level } : {}), ...shared,
    ends: { start: { kind: 'column', half: o.halves[0], corner: true }, end: { kind: 'column', half: o.halves[1] } },
    serviceOff: true,
  } as BeamDemand;
}

const up5 = (v: number) => Math.round(Math.ceil(v / 0.05 - 1e-9) * 0.05 * 1000) / 1000;

/**
 * The strap designed as a beam, by the code's own beam rules: its bars and stirrups as a one-span
 * line, every check of a beam. A section the model or the engineer gives stays; the one proposed
 * takes the shallowest depth, in steps of 5 cm as far as L/3 or twice itself, at which the beam
 * verifies: its section found by halving (a deeper strap carries more), its bars laid out there
 * and deeper while the line does not verify, or the deepest where none does.
 */
const strapMemos = new WeakMap<object, ReturnType<typeof designMemo<StrapDesigned>>>();
type StrapDesigned = { beam: BeamRow; line: LineLayout; b: number; h: number };

export function designStrap(rules: Pick<SheetRules, 'beamRow' | 'beamLine'>, ctx: BeamContext, demand: (b: number, h: number) => BeamDemand, section: { b: number; h: number }, fixed: boolean, fmt: Fmt, adopted?: unknown): StrapDesigned {
  let memo = strapMemos.get(rules);
  if (!memo) { memo = designMemo<StrapDesigned>(500); strapMemos.set(rules, memo); }
  return memo(designKey(fmt, demand(section.b, section.h), ctx, section, fixed, adopted ?? null), () => sizeStrap(rules, ctx, demand, section, fixed, fmt, adopted));
}

function sizeStrap(rules: Pick<SheetRules, 'beamRow' | 'beamLine'>, ctx: BeamContext, demand: (b: number, h: number) => BeamDemand, section: { b: number; h: number }, fixed: boolean, fmt: Fmt, adopted?: unknown): StrapDesigned {
  const run = (h: number) => {
    const d = demand(section.b, h);
    const beam = rules.beamRow(d, ctx, undefined, fmt);
    const line = rules.beamLine([beam], ctx, adopted as never, fmt);
    const spanned = rules.beamRow(d, ctx, line.spanAdopted[0], fmt);
    return { beam: spanned, line, b: section.b, h };
  };
  const ok = (r: ReturnType<typeof run>) => lineRowStatus(r.line, [r.beam]) !== 'fail';
  const holds = (h: number) => rules.beamRow(demand(section.b, h), ctx, undefined, fmt).status !== 'fail';
  if (fixed) return run(section.h);
  if (holds(section.h)) { const first = run(section.h); if (ok(first)) return first; }
  const limit = Math.max(section.h, Math.min(2 * section.h, demand(section.b, section.h).length / 3, 2));
  const hs: number[] = [];
  for (let h = up5(section.h + 0.05); h <= limit + 1e-9; h = up5(h + 0.05)) hs.push(h);
  if (!hs.length || !holds(hs[hs.length - 1]!)) return run(hs.length ? hs[hs.length - 1]! : section.h);
  const search = (from: number, pass: (i: number) => boolean) => { let lo = from - 1, hi = hs.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pass(mid)) hi = mid; else lo = mid; } return hi; };
  const runs = new Map<number, ReturnType<typeof run>>();
  const full = (i: number) => { if (!runs.has(i)) runs.set(i, run(hs[i]!)); return runs.get(i)!; };
  const i = search(0, (k) => holds(hs[k]!));
  return full(ok(full(i)) ? i : search(i + 1, (k) => ok(full(k))));
}

/** The footing's row with its straps' beams (a strip's, one from each column): each strap's line and span, and a line on the footing for each that says whether its beam verifies. */
export function withStrapBeams(row: FootingRow, beams: ReadonlyMap<string, { beam: BeamRow; line: LineLayout; b: number; h: number }>, keyOf: (s: StrapResult) => string): FootingRow {
  if (!row.edge?.straps.length && !row.group?.straps.length) return row;
  const fit = <T extends StrapResult>(s: T): T => {
    const k = beams.get(keyOf(s));
    return k ? { ...s, b: k.b, h: k.h, beam: k.beam, line: k.line } : s;
  };
  const edge = row.edge ? { ...row.edge, straps: row.edge.straps.map(fit) } : undefined;
  const group = row.group ? { ...row.group, straps: row.group.straps.map(fit) } : undefined;
  const lines = [...(edge?.straps ?? []), ...(group?.straps ?? [])].filter((s) => s.line).map((s) => {
    const st = lineRowStatus(s.line!, [s.beam!]);
    return { label: 'rcSheets.v.footStrapBeam', ok: st !== 'fail', demand: `${s.line!.name} ${Math.round(s.b * 100)}×${Math.round(s.h * 100)}`, ratio: s.line!.utilization };
  });
  const fail = lines.some((l) => !l.ok);
  return { ...row, ...(edge ? { edge } : {}), ...(group ? { group } : {}), verifications: [...row.verifications, ...lines], status: fail ? 'fail' : row.status };
}

/**
 * A strap beam's section where the model has none: as wide as the column across it (20 cm at
 * least), and as deep as L/8 and 10 cm over the footing, 40 cm at least. Deeper than the footing
 * it balances, it turns with it as one rather than bending under it, as the statics of
 * `strap-footing.ts` assume; L/8 keeps its own deflection, which the footing would follow, small.
 */
export function strapDefault(d: FootingDemand, a: Pick<FootingAdopted, 'h'>, axis: 'x' | 'y'): { b: number; h: number } {
  const p = d.edge?.partners.find((x) => x.axis === axis);
  const across = axis === 'x' ? d.column?.h ?? 0.2 : d.column?.b ?? 0.2;
  return { b: Math.round(Math.max(0.2, up5(across)) * 1000) / 1000, h: Math.round(Math.max(0.4, up5((p?.L ?? 0) / 8), up5(a.h + 0.1)) * 1000) / 1000 };
}
