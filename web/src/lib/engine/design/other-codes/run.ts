/**
 * Run a code's checker over the members, one governing demand at a time.
 *
 * Every checker indexes its force rows by member and reads the FIRST row for each, so a member
 * can be checked against one force tuple per call. A member's governing demands (largest +My,
 * largest −My, largest compression, largest shear… each with the forces that act with it) are
 * therefore sent in rounds: round k carries every member's k-th demand. The worst reading over
 * the rounds is the member's, with the combination and station it came from. Simultaneous
 * forces, never the maximum of each taken apart — that would be safe, and wrong.
 */
import { computeStationDemands } from '../../verification-service';
import { memberLengths } from '../../steel/unbraced-length';
import type { AnalysisResults3D } from '../../types-3d';
import type { LoadCombination, Element, Section, Material, Node, Support } from '../../../store/model.svelte';
import { classifyElement } from '../../codes/argentina/cirsoc201';
import type { CheckReading, MemberContext, OtherCode, OtherCodeRow, OtherCodeRun, MemberCertificate, StationBound3D, DemandBound } from './types';
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
  opts: { unitK?: boolean } = {},
): MemberContext[] {
  const { demands } = computeStationDemands(perCombo, combinations, model as never);
  const lengths = memberLengths(model as never);
  const want = ids ? new Set(ids) : null;
  const out: MemberContext[] = [];
  for (const [id, e] of model.elements) {
    if (want && !want.has(id)) continue;
    const section = model.sections.get(e.sectionId), material = model.materials.get(e.materialId);
    const behaviour = (e as { behaviour?: string }).behaviour;
    const raw = demands.get(id);
    if (!section || !material || !raw || !isDesignedMember(e as never, model.sections as never)) continue;
    // Design follows the member's behaviour, as the CIRSOC check does.
    const d = maskDemands(raw, behaviour);
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
    });
  }
  return out;
}

/** Check `contexts` under `code`. Members the code cannot describe come back as skipped, with why. */
export function runOtherCode(code: OtherCode, contexts: MemberContext[]): OtherCodeRun {
  const rows = new Map<number, OtherCodeRow>();
  const ready: Array<{ ctx: MemberContext; data: Record<string, unknown>; flags: string[] }> = [];
  for (const ctx of contexts) {
    const m = code.member(ctx);
    if ('skip' in m) rows.set(ctx.elementId, { elementId: ctx.elementId, status: 'skipped', reasonKey: m.skip });
    else if (ctx.demands.length === 0) rows.set(ctx.elementId, { elementId: ctx.elementId, status: 'skipped', reasonKey: 'otherCodes.skip.noDemand' });
    else ready.push({ ctx, data: m.data, flags: m.unevaluated ?? [] });
  }
  const keep = (id: number, reading: CheckReading, ctx: MemberContext, k: number) => {
    // A check the engine could not evaluate is never a pass, whatever the ratio of the rest.
    const r = reading.unevaluated.length > 0 ? { ...reading, pass: false } : reading;
    const prev = rows.get(id);
    const worse = !prev || prev.status !== 'checked'
      || r.ratio > prev.reading.ratio
      || (r.ratio === prev.reading.ratio && !r.pass && prev.reading.pass);
    if (worse) {
      const d = ctx.demands[k]!;
      rows.set(id, { elementId: id, status: 'checked', reading: r, comboName: d.comboName, stationX: d.stationX });
    }
  };
  const rounds = ready.reduce((n, r) => Math.max(n, r.ctx.demands.length), 0);
  for (let k = 0; k < rounds; k++) {
    const batch: Array<{ ctx: MemberContext; base: Record<string, unknown>; data: Record<string, unknown>; extra: string[] }> = [];
    for (const r of ready) {
      const d = r.ctx.demands[k];
      if (!d) continue;
      if (!code.at) { batch.push({ ctx: r.ctx, base: r.data, data: r.data, extra: r.flags }); continue; }
      const at = code.at(r.ctx, d, r.data);
      if ('reading' in at) keep(r.ctx.elementId, at.reading, r.ctx, k);
      else batch.push({ ctx: r.ctx, base: r.data, data: at.data, extra: [...r.flags, ...(at.unevaluated ?? [])] });
    }
    if (batch.length === 0) continue;
    let results: unknown[];
    try {
      results = code.run({
        members: batch.map((r) => r.data),
        forces: batch.map((r) => code.forces(r.ctx, r.ctx.demands[k]!, r.base)),
      });
    } catch (err) {
      // The engine's reason travels with the failure, and nothing of this run counts as checked:
      // a member read in an earlier round was not read under this round's demand, so the rows
      // it already has are withdrawn rather than shown as a verdict.
      const errorKey = isEngineUnavailable(err) ? 'engine.unavailable' : 'otherCodes.error.engine';
      const withdrawn: OtherCodeRow[] = [...rows.values()].map((r) => r.status === 'checked' ? { elementId: r.elementId, status: 'skipped', reasonKey: errorKey } : r);
      for (const r of ready) if (!rows.has(r.ctx.elementId)) withdrawn.push({ elementId: r.ctx.elementId, status: 'skipped', reasonKey: errorKey });
      return { code: code.id, rows: withdrawn.sort((a, b) => a.elementId - b.elementId), errorKey, errorMessage: engineFailureText(err) };
    }
    // By id, once per round: a scan of the batch per result was quadratic in the members.
    const byId = new Map(batch.map((b) => [b.ctx.elementId, b]));
    for (const res of results as Array<Record<string, unknown>>) {
      const id = Number(res.elementId);
      const r = byId.get(id);
      if (!r) continue;
      const reading = code.read(res);
      keep(id, r.extra.length ? { ...reading, unevaluated: [...reading.unevaluated, ...r.extra] } : reading, r.ctx, k);
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
 * whose combinations is not certified, is `uncertified` with why. Codes without a certified
 * checker give an empty map.
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
    if (m.unevaluated && m.unevaluated.length > 0) {
      refuse(ctx.elementId, m.unevaluated[0]!);
      continue;
    }
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
        if (at.unevaluated && at.unevaluated.length > 0) { refuse(id, at.unevaluated[0]!); continue; }
        data = at.data;
      }
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
