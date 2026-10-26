/**
 * Run a code's checker over the members, one force tuple at a time.
 *
 * A member's governing demands (largest +My, largest −My, largest compression, largest shear…
 * each with the forces that act with it) and, when asked, every combination at every station are
 * each checked as they act together. The worst reading is the member's, with the combination and
 * station it came from. Simultaneous forces, never the maximum of each taken apart — that would
 * be safe, and wrong.
 */
import { computeStationDemands } from '../../verification-service';
import { memberLengths } from '../../steel/unbraced-length';
import type { AnalysisResults3D } from '../../types-3d';
import type { LoadCombination, Element, Section, Material, Node, Support } from '../../../store/model.svelte';
import { classifyElement } from '../../codes/argentina/cirsoc201';
import { gov, type CheckReading, type MemberContext, type OtherCode, type OtherCodeRow, type OtherCodeRun, type StationTuple, type MemberCertificate, type StationBound3D, type DemandBound } from './types';
import type { CertifiedMemberCheck } from '../../certificate-types';
import { isDesignedMember, maskDemands } from '../behaviour-demands';
import { isEngineUnavailable, engineFailureText } from '../../engine-unavailable';

export interface RunModel {
  nodes: Map<number, Node>;
  elements: Map<number, Element>;
  sections: Map<number, Section>;
  materials: Map<number, Material>;
  supports: Map<number, Support>;
}

/** The members `code` is asked about, with their lengths and governing demands. */
export function memberContexts(
  model: RunModel,
  perCombo: Map<number, AnalysisResults3D>,
  combinations: LoadCombination[],
  ids?: Iterable<number>,
  /**
   * The forces come from a direct analysis (AISC 360 C1): every member is designed with K = 1,
   * whatever effective length factor it carries, since the analysis already holds the
   * second-order and stiffness effects that K stood for.
   */
  opts: {
    unitK?: boolean;
    /** Collects the members left out before any code sees them, with why (i18n key). */
    omitted?: Array<{ elementId: number; reasonKey: string }>;
    /**
     * The project's design data the concrete checks read: the clear cover of beams and columns
     * (m) and the bar steel's fy (MPa). Without it they read the CIRSOC design's defaults.
     */
    designData?: { cover: { beam: number; column: number }; rebarFy: number };
  } = {},
): MemberContext[] {
  const { demands, stations } = computeStationDemands(perCombo, combinations, model as never);
  const lengths = memberLengths(model as never);
  const want = ids ? new Set(ids) : null;
  const out: MemberContext[] = [];
  for (const [id, e] of model.elements) {
    if (want && !want.has(id)) continue;
    const section = model.sections.get(e.sectionId), material = model.materials.get(e.materialId);
    const behaviour = (e as { behaviour?: string }).behaviour;
    const raw = demands.get(id);
    const reasonKey = !section || !material ? 'otherCodes.skip.noProperties'
      : !isDesignedMember(e as never, model.sections as never) ? 'otherCodes.skip.notDesigned'
      : !raw ? 'otherCodes.skip.noDemand' : null;
    if (reasonKey) { opts.omitted?.push({ elementId: id, reasonKey }); continue; }
    if (!section || !material || !raw) continue;
    // Design follows the member's behaviour, as the CIRSOC check does.
    const d = maskDemands(raw, behaviour);
    // The axial force the behaviour excludes, as `maskDemands` reads it, left out of the tuples too.
    const kept = new Set(d.demands.map((x) => x.category));
    const dropC = raw.demands.some((x) => x.category === 'N_compression') && !kept.has('N_compression');
    const dropT = raw.demands.some((x) => x.category === 'N_tension') && !kept.has('N_tension');
    const tuples: StationTuple[] = (stations.get(id)?.comboResults ?? []).flatMap((cr) => cr.stations
      .filter((s) => !(dropC && s.n < 0) && !(dropT && s.n > 0))
      .map((s) => ({ comboId: cr.comboId, comboName: cr.comboName, stationT: s.t, stationX: s.x, forces: s })));
    const len = lengths.get(id);
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    const kind = a && b
      ? classifyElement(a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0, section.b, section.h)
      : 'beam';
    out.push({
      elementId: id, element: e, section, material, kind,
      L: len?.L ?? d.length, Lb: len?.Lb ?? d.length,
      ...(opts.unitK ? { kStrong: 1, kWeak: 1 } : {
        ...(e.kStrong !== undefined ? { kStrong: e.kStrong } : {}),
        ...(e.kWeak !== undefined ? { kWeak: e.kWeak } : {}),
      }),
      demands: d.demands,
      tuples,
      ...(opts.designData ? { cover: kind === 'beam' ? opts.designData.cover.beam : opts.designData.cover.column, rebarFy: opts.designData.rebarFy } : {}),
    });
  }
  return out;
}

/** How `runOtherCode` reads each member. */
export interface RunOptions {
  /**
   * Every combination at every station (`MemberContext.tuples`) besides the governing demands. A
   * check that combines N, My, Mz and V (6.2, 6.3.2, 6.3.3) can be governed by a tuple that is no
   * single force's peak: a moderate axial force with a moderate moment.
   */
  tuples?: boolean;
  /**
   * Stop reading a member once its ratio passes this: the governing demands are read first, then
   * the tuples in chunks, and a member already past it is not read further (a profile the search
   * will reject either way).
   */
  stopAbove?: number;
}

/** Tuples read per member in one engine call after the governing demands. */
const CHUNK = 48;

/**
 * Check `contexts` under `code`. Members the code cannot describe come back as skipped, with why.
 *
 * The checkers index their force rows by member and read the first row of each, so each (member,
 * demand) pair goes to the engine as a member of its own: the member's data under a synthetic id,
 * with that demand's force row. One call per phase (the governing demands, then each chunk of
 * tuples) carries every member's pairs.
 */
export function runOtherCode(code: OtherCode, contexts: MemberContext[], opts: RunOptions = {}): OtherCodeRun {
  const rows = new Map<number, OtherCodeRow>();
  const ready: Array<{ ctx: MemberContext; data: Record<string, unknown>; flags: string[]; list: StationTuple[] }> = [];
  for (const ctx of contexts) {
    const m = code.member(ctx);
    if ('skip' in m) { rows.set(ctx.elementId, { elementId: ctx.elementId, status: 'skipped', reasonKey: m.skip }); continue; }
    if (ctx.demands.length === 0) { rows.set(ctx.elementId, { elementId: ctx.elementId, status: 'skipped', reasonKey: 'otherCodes.skip.noDemand' }); continue; }
    // The governing demands first, then every other combination and station, each pair once.
    const seen = new Set(ctx.demands.map((d) => `${d.comboId}|${d.stationT}`));
    const rest = opts.tuples ? (ctx.tuples ?? []).filter((t) => { const k = `${t.comboId}|${t.stationT}`; if (seen.has(k)) return false; seen.add(k); return true; }) : [];
    ready.push({ ctx, data: m.data, flags: m.unevaluated ?? [], list: [...ctx.demands, ...rest] });
  }
  /*
   * The member's reading is its worst ratio, and it carries every check the engine left out at
   * ANY of its demands: the union, whichever demand governs the ratio. Keeping only the
   * governing demand's list let a demand with a gap and a lower ratio be replaced by one
   * without, and the member read as passing.
   */
  const keep = (id: number, reading: CheckReading, d: StationTuple) => {
    const prev = rows.get(id);
    const before = prev?.status === 'checked' ? prev.reading.unevaluated : [];
    const unevaluated = [...new Set([...before, ...reading.unevaluated])];
    // What this demand evaluated as its clauses write it, and the worst of that over the demands.
    const off = new Set(reading.unevaluated.flatMap((k) => code.disables?.[k] ?? []));
    const own = reading.parts?.filter((p) => !off.has(p.kind)).reduce<CheckReading['accredited']>((a, p) => (!a || p.ratio > a.ratio ? { ratio: p.ratio, ...gov(p.kind, p.clause), comboName: d.comboName, stationX: d.stationX } : a), undefined);
    const prevAcc = prev?.status === 'checked' ? prev.reading.accredited : undefined;
    const accredited = !own ? prevAcc : !prevAcc || own.ratio > prevAcc.ratio ? own : prevAcc;
    // A check the engine could not evaluate is never a pass, whatever the ratio of the rest.
    const r = { ...reading, unevaluated, pass: reading.pass && unevaluated.length === 0, ...(accredited ? { accredited } : {}) };
    const worse = !prev || prev.status !== 'checked'
      || r.ratio > prev.reading.ratio
      || (r.ratio === prev.reading.ratio && !r.pass && prev.reading.pass);
    if (worse) {
      rows.set(id, { elementId: id, status: 'checked', reading: r, comboName: d.comboName, stationX: d.stationX, comboId: d.comboId, stationT: d.stationT });
    } else if (prev?.status === 'checked') {
      rows.set(id, { ...prev, reading: { ...prev.reading, unevaluated, pass: prev.reading.pass && unevaluated.length === 0, ...(accredited ? { accredited } : {}) } });
    }
  };
  const past = (id: number) => {
    const r = rows.get(id);
    return opts.stopAbove !== undefined && r?.status === 'checked' && r.reading.ratio > opts.stopAbove;
  };
  const phases = ready.reduce((n, r) => Math.max(n, 1 + Math.ceil((r.list.length - r.ctx.demands.length) / CHUNK)), 0);
  for (let phase = 0; phase < phases; phase++) {
    const pairs: Array<{ r: (typeof ready)[number]; d: StationTuple; data: Record<string, unknown>; base: Record<string, unknown>; extra: string[] }> = [];
    for (const r of ready) {
      if (past(r.ctx.elementId)) continue;
      const g = r.ctx.demands.length;
      const slice = phase === 0 ? r.list.slice(0, g) : r.list.slice(g + (phase - 1) * CHUNK, g + phase * CHUNK);
      for (const d of slice) {
        if (!code.at) { pairs.push({ r, d, data: r.data, base: r.data, extra: r.flags }); continue; }
        const at = code.at(r.ctx, d, r.data);
        if ('reading' in at) keep(r.ctx.elementId, at.reading, d);
        else pairs.push({ r, d, data: at.data, base: r.data, extra: [...r.flags, ...(at.unevaluated ?? [])] });
      }
    }
    if (pairs.length === 0) continue;
    let results: unknown[];
    try {
      results = code.run({
        members: pairs.map((q, k) => ({ ...q.data, elementId: k + 1 })),
        forces: pairs.map((q, k) => ({ ...code.forces(q.r.ctx, q.d, q.base), elementId: k + 1 })),
      });
    } catch (err) {
      // The engine's reason travels with the failure, and nothing of this run counts as checked:
      // a member read in an earlier phase was not read under this phase's demands, so the rows
      // it already has are withdrawn rather than shown as a verdict.
      const errorKey = isEngineUnavailable(err) ? 'engine.unavailable' : 'otherCodes.error.engine';
      const withdrawn: OtherCodeRow[] = [...rows.values()].map((r) => r.status === 'checked' ? { elementId: r.elementId, status: 'skipped', reasonKey: errorKey } : r);
      for (const r of ready) if (!rows.has(r.ctx.elementId)) withdrawn.push({ elementId: r.ctx.elementId, status: 'skipped', reasonKey: errorKey });
      return { code: code.id, rows: withdrawn.sort((a, b) => a.elementId - b.elementId), errorKey, errorMessage: engineFailureText(err) };
    }
    for (const res of results as Array<Record<string, unknown>>) {
      const q = pairs[Number(res.elementId) - 1];
      if (!q) continue;
      let reading = code.read(res);
      const extra = code.extraParts?.(q.r.ctx, q.d, q.base) ?? [];
      if (extra.length) {
        const parts = [...(reading.parts ?? []), ...extra];
        const top = parts.reduce((a, p) => (p.ratio > a.ratio ? p : a));
        reading = { ...reading, parts, pass: reading.pass && extra.every((p) => p.ratio <= 1),
          ...(top.ratio > reading.ratio ? { ratio: top.ratio, ...gov(top.kind, top.clause) } : {}) };
      }
      keep(q.r.ctx.elementId, q.extra.length ? { ...reading, unevaluated: [...reading.unevaluated, ...q.extra] } : reading, q.d);
    }
  }
  return { code: code.id, rows: [...rows.values()].sort((a, b) => a.elementId - b.elementId) };
}

/**
 * Certify the check `runOtherCode` made (docs/verification/CERTIFY.md, "Certified design checks"):
 * the same members and governing demands, each force with its bound from the certified station
 * bounds of its combination (`stationBound`, null when that combination is not certified), sent
 * to the code's certified checker, which encloses every utilization in interval arithmetic.
 * `call` runs the export (`runCertify`); rounds as in `runOtherCode`, a member's enclosure the
 * hull over its rounds.
 *
 * A member whose demand settled without the engine (no steel on a face in tension), or one of
 * whose combinations is not certified, is `uncertified` with why. So is a member whose reading has
 * a part the certified checker does not enclose: a check this adapter computes itself
 * (`extraParts`, EC3 6.3.1.4) or one it flags as not evaluated (`at(…).unevaluated`). The
 * enclosure would then be of a part of the check, and «certified OK» would read as the whole.
 * Codes without a certified checker give an empty map.
 */
export async function certifyOtherCode(
  code: OtherCode,
  contexts: MemberContext[],
  stationBound: (comboId: number, elementId: number) => StationBound3D | null,
  call: (name: string, args: unknown[]) => Promise<unknown>,
): Promise<Map<number, MemberCertificate>> {
  const out = new Map<number, MemberCertificate>();
  const cert = code.certify;
  if (!cert) return out;
  const acc = new Map<number, { lower: number; upper: number }>();
  const refuse = (id: number, reason: string, combo?: string) => {
    if (out.get(id)?.status !== 'uncertified') out.set(id, { status: 'uncertified', reason, ...(combo !== undefined ? { combo } : {}) });
  };
  const ready: Array<{ ctx: MemberContext; data: Record<string, unknown> }> = [];
  for (const ctx of contexts) {
    const m = code.member(ctx);
    if ('skip' in m || ctx.demands.length === 0) continue;
    if ((m.unevaluated ?? []).length > 0) { refuse(ctx.elementId, 'otherCodes.cert.partial'); continue; }
    ready.push({ ctx, data: m.data });
  }
  const rounds = ready.reduce((n, r) => Math.max(n, r.ctx.demands.length), 0);
  for (let k = 0; k < rounds; k++) {
    const members: Record<string, unknown>[] = [];
    const demands: Array<{ forces: Record<string, unknown>; bound: DemandBound }> = [];
    for (const r of ready) {
      const id = r.ctx.elementId;
      const d = r.ctx.demands[k];
      if (!d || out.has(id)) continue;
      let data = r.data;
      if (code.at) {
        const at = code.at(r.ctx, d, r.data);
        if ('reading' in at) { refuse(id, 'otherCodes.cert.noEngineCheck'); continue; }
        if ((at.unevaluated ?? []).length > 0) { refuse(id, 'otherCodes.cert.partial'); continue; }
        data = at.data;
      }
      if ((code.extraParts?.(r.ctx, d, r.data) ?? []).length > 0) { refuse(id, 'otherCodes.cert.partial'); continue; }
      const sb = stationBound(d.comboId, id);
      if (!sb) { refuse(id, 'otherCodes.cert.comboUncertified', d.comboName); continue; }
      members.push(data);
      demands.push({ forces: code.forces(r.ctx, d, r.data), bound: cert.bound(r.ctx, d, r.data, sb) });
    }
    if (members.length === 0) continue;
    let results: CertifiedMemberCheck[];
    try {
      results = (await call(cert.name, [JSON.stringify({ members, demands })])) as CertifiedMemberCheck[];
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      for (const m of members) refuse(Number((m as { elementId?: unknown }).elementId), reason);
      continue;
    }
    for (const res of results ?? []) {
      const id = Number(res.elementId);
      if (out.has(id)) continue;
      if (!res.certified) { refuse(id, res.reason ?? 'not certified'); continue; }
      const prev = acc.get(id);
      acc.set(id, prev
        ? { lower: Math.max(prev.lower, res.utilizationLower), upper: Math.max(prev.upper, res.utilizationUpper) }
        : { lower: res.utilizationLower, upper: res.utilizationUpper });
    }
  }
  for (const [id, { lower, upper }] of acc) {
    if (out.has(id)) continue;
    out.set(id, { status: upper < 1 ? 'ok' : lower > 1 ? 'fail' : 'inconclusive', lower, upper });
  }
  return out;
}
