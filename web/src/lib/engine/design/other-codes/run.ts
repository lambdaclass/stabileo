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
import type { CheckReading, MemberContext, OtherCode, OtherCodeRow, OtherCodeRun } from './types';

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
): MemberContext[] {
  const { demands } = computeStationDemands(perCombo, combinations, model as never);
  const lengths = memberLengths(model as never);
  const want = ids ? new Set(ids) : null;
  const out: MemberContext[] = [];
  for (const [id, e] of model.elements) {
    if (want && !want.has(id)) continue;
    const section = model.sections.get(e.sectionId), material = model.materials.get(e.materialId);
    const d = demands.get(id);
    if (!section || !material || !d) continue;
    const len = lengths.get(id);
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    const kind = a && b
      ? classifyElement(a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0, section.b, section.h)
      : 'beam';
    out.push({
      elementId: id, element: e, section, material, kind,
      L: len?.L ?? d.length, Lb: len?.Lb ?? d.length,
      ...(e.kStrong !== undefined ? { kStrong: e.kStrong } : {}),
      ...(e.kWeak !== undefined ? { kWeak: e.kWeak } : {}),
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
    const results = code.run({
      members: batch.map((r) => r.data),
      forces: batch.map((r) => code.forces(r.ctx, r.ctx.demands[k]!, r.base)),
    });
    if (!results) return { code: code.id, rows: [...rows.values()], errorKey: 'otherCodes.error.engine' };
    for (const res of results as Array<Record<string, unknown>>) {
      const id = Number(res.elementId);
      const r = batch.find((b) => b.ctx.elementId === id);
      if (!r) continue;
      const reading = code.read(res);
      keep(id, r.extra.length ? { ...reading, unevaluated: [...reading.unevaluated, ...r.extra] } : reading, r.ctx, k);
    }
  }
  return { code: code.id, rows: [...rows.values()].sort((a, b) => a.elementId - b.elementId) };
}
