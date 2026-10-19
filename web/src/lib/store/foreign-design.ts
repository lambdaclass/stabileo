/**
 * Design to a foreign code, by material, alongside CIRSOC (`engine/design/foreign/matrix.ts` says
 * what each covers):
 *
 *  · ACI 318-19: the concrete members the CIRSOC 201-2025 design holds, each row carried to ACI
 *    318-19 by `engine/design/foreign/equivalence.ts` where the formula is the same, with ACI's
 *    clause, and left not verified where it is not.
 *  · AISC 360-10: the steel members the CIRSOC 301-2018 check holds, likewise; the profiles are
 *    proposed by the steel optimiser, which runs that same checker.
 *  · EN 1992-1-1, with recommended values or the UK National Annex: each rectangular concrete beam
 *    and column designed by `engine/design/eurocode/` from its governing demands, every one a
 *    simultaneous force tuple; columns read sway from the storey stability index and creep from
 *    Annex B and the quasi-permanent combination (both said in the rows).
 *  · EN 1993-1-1 (and BS EN with the UK NA): each catalogue steel member rated by the engine's EC3
 *    checker on every combination at every station (6.2, 6.3.2 and 6.3.3 read N, My, Mz and V
 *    together, and a tuple that is no force's peak can govern), and the lightest profile of its
 *    family that passes it with nothing left unevaluated.
 *
 * Every member a code does not design is listed in `skipped` with the reason, and reaches the
 * memoria as not verified. The forces are the active combinations', as for CIRSOC design. The
 * project's load family is compared with the code's: designing to a Eurocode with CIRSOC
 * combinations is allowed and said.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { activeCombinations, activePerCombo3D } from './active-results';
import { verificationStore } from './verification.svelte';
import { regulationsStore } from './regulations.svelte';
import { designData, patchOwnDesignData } from './design-data';
import { catalogueProfileOf } from './steel-optimise.svelte';
import { modelStoreyStability } from './storey-sway';
import { concreteCheckRows, steelCheckRows } from '../engine/design/check-rows';
import { memberContexts, runOtherCode, type CheckReading } from '../engine/design/other-codes';
import { EC3 } from '../engine/design/other-codes/steel-codes';
import type { MemberContext } from '../engine/design/other-codes/types';
import { familyByWeight } from '../engine/steel/profile-optimise';
import { materialFamilyOf } from '../engine/steel/material-family';
import { catalogueGradeFamily } from '../engine/steel/grade-family';
import { steelShapeOf } from '../engine/codes/argentina/cirsoc301';
import { extractForcesAtStation } from '../engine/station-forces';
import type { ElementForces3D } from '../engine/types-3d';
import { EC2_RECOMMENDED, EC2_UK, ec2CreepCoefficient, ec2Psi2 } from '../engine/design/eurocode/ec2-params';
import { ec2MemberDesign, type Ec2MemberInput } from '../engine/design/eurocode/ec2-member';
import { aci318Rows, aisc360Rows, steelBranches } from '../engine/design/foreign/equivalence';
import { concreteFc } from '../model/design-data';
import { profileToSectionFull, type ProfileFamily, type SteelProfile } from '../data/steel-profiles';
import { loadFamilyOf } from '../codes/families';
import { FOREIGN_MATRIX, LOAD_FAMILY_OF, type ForeignCodeId } from '../engine/design/foreign/matrix';
import { worstStatus, statusOfRatio, type CheckRow } from '../design-contract';
import type { ConcreteCodeChoice, ForeignCodes, SteelCodeChoice } from '../model/foreign-codes';

export type { ConcreteCodeChoice, SteelCodeChoice, ForeignCodes };

export const foreignCodes = (): ForeignCodes => designData().foreignCodes ?? {};
export function setForeignCodes(p: Partial<ForeignCodes>): void { patchOwnDesignData({ foreignCodes: { ...foreignCodes(), ...p } }); }

const statusOf = (rows: readonly CheckRow[]) => (rows.length ? worstStatus(rows.map((r) => r.status)) : 'notVerified');

export interface ForeignMember {
  elementId: number; family: 'concrete' | 'steel'; kind: string; rows: CheckRow[]; status: CheckRow['status'];
  /** The lightest profile of the family that passes with nothing left unevaluated. */
  proposal?: string;
  /** Where none does: the lightest that meets what is evaluated, and what it leaves out (i18n keys). Not a proposal. */
  candidate?: { profile: string; unevaluated: string[] };
  data: Array<[string, string]>;
}
export interface ForeignRun { code: ForeignCodeId; members: ForeignMember[]; skipped: Array<{ elementId: number; reasonKey: string }>; loadMismatch: boolean }

/** The project's load family against the design code's. */
export function loadMismatch(code: ForeignCodeId): boolean {
  const fam = loadFamilyOf(regulationsStore.roles as never);
  return !!fam && fam !== LOAD_FAMILY_OF[code];
}

const familyOf = (m: unknown) => materialFamilyOf(m as never, catalogueGradeFamily).family;
const familyOfElement = (id: number) => { const e = modelStore.elements.get(id); return familyOf(e ? modelStore.materials.get(e.materialId) : undefined); };

function aciRun(): ForeignRun {
  const members: ForeignMember[] = [], skipped: ForeignRun['skipped'] = [];
  const ctxs = verificationStore.contexts;
  for (const [id] of modelStore.elements) if (!ctxs.has(id) && familyOfElement(id) === 'concrete') skipped.push({ elementId: id, reasonKey: 'otherCodes.skip.noCirsocDesign' });
  for (const [id, ctx] of ctxs) {
    // Only the 2025 edition adopts ACI 318-19.
    if (ctx.codeEdition !== '2025') { skipped.push({ elementId: id, reasonKey: 'otherCodes.skip.cirsocEdition' }); continue; }
    const p = verificationStore.providedFor(id);
    if (!p || !p.hasProvided) { skipped.push({ elementId: id, reasonKey: 'otherCodes.skip.noReinforcement' }); continue; }
    const rows = aci318Rows(concreteCheckRows(p), {
      elementType: p.elementType, pendingPhi: !!ctx.flange || !!ctx.shape || p.elementType === 'wall', fc: ctx.material.fc, fy: ctx.material.fy,
    });
    members.push({ elementId: id, family: 'concrete', kind: p.elementType, rows, status: statusOf(rows), data: [] });
  }
  return { code: 'aci318', members, skipped: skipped.sort((a, b) => a.elementId - b.elementId), loadMismatch: loadMismatch('aci318') };
}

function aiscRun(): ForeignRun {
  const checked = new Set(verificationStore.steel.map((v) => v.elementId));
  const skipped: ForeignRun['skipped'] = [];
  for (const [id] of modelStore.elements) if (!checked.has(id) && familyOfElement(id) === 'steel') skipped.push({ elementId: id, reasonKey: 'otherCodes.skip.noCirsocDesign' });
  const members: ForeignMember[] = verificationStore.steel.map((v) => {
    const e = modelStore.elements.get(v.elementId), sec = e ? modelStore.sections.get(e.sectionId) : undefined;
    // The checker's family as the equivalence table names it; a family it has no row for is «other».
    const fam = steelShapeOf((sec as { shape?: string } | undefined)?.shape);
    const shape = fam === null ? undefined : (['I', 'U', 'T', 'L', 'RHS', 'CHS'] as const).find((k) => k === fam) ?? 'other';
    const rows = aisc360Rows(steelCheckRows(v), { elementType: 'member', ...(shape ? { steelShape: shape } : {}), steel: steelBranches(v) });
    return { elementId: v.elementId, family: 'steel' as const, kind: 'member', rows, status: statusOf(rows), data: [] };
  });
  return { code: 'aisc360', members, skipped, loadMismatch: loadMismatch('aisc360') };
}

function contexts(omitted?: Array<{ elementId: number; reasonKey: string }>): MemberContext[] {
  const perCombo = activePerCombo3D();
  if (!perCombo.size && !resultsStore.results3D) return [];
  const combos = activeCombinations().filter((c) => perCombo.has(c.id));
  return memberContexts(modelStore.model as never, perCombo, combos, undefined, omitted ? { omitted } : {});
}

/**
 * A code's reading as one row. Where something was left unevaluated the reading's own ratio has
 * no clause behind it (EC3's 6.3.3 sum without the interaction factors): the row is not verified,
 * with no ratio, unless a check evaluated as its clause writes it (`accredited`) already passes 1,
 * which fails the member by that clause alone.
 */
const readingRow = (code: string, edition: string, r: CheckReading, comboName: string, x: number): CheckRow => {
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const base = { code, edition, title: 'Member resistance', formula: 'utilization ≤ 1', inputs: [] };
  if (!r.unevaluated.length) {
    return { ...base, clause: r.clause ?? '6', titleKey: r.governing, demand: r3(r.ratio), capacity: 1, ratio: r3(r.ratio), status: statusOfRatio(r.ratio), combination: comboName, location: `x = ${x.toFixed(2)} m` };
  }
  const a = r.accredited;
  if (a && a.ratio > 1) {
    return { ...base, clause: a.clause ?? '6', titleKey: a.governing, demand: r3(a.ratio), capacity: 1, ratio: r3(a.ratio), status: 'fail',
      combination: a.comboName ?? comboName, location: `x = ${(a.stationX ?? x).toFixed(2)} m`, derivation: r.unevaluated };
  }
  return { ...base, clause: r.clause ?? '6', titleKey: r.governing, ratio: null, status: 'notVerified', combination: comboName, location: `x = ${x.toFixed(2)} m`, derivation: r.unevaluated };
};

/** The member with a catalogue profile in place of its section. */
const withProfile = (ctx: MemberContext, p: SteelProfile): MemberContext => ({ ...ctx, section: { ...ctx.section, ...profileToSectionFull(p), name: p.name, profileFamily: p.family } as never });

/** A gap that comes from the forces, not the section: no profile of the family closes it. */
const FORCE_GAPS = new Set(['otherCodes.check.ec3Interaction']);

/** EN 1993-1-1: every steel member rated, and the lightest profile of its family that passes. */
function ec3Run(code: 'ec3' | 'ec3-uk', cap = 200): ForeignRun {
  const codeKey = code === 'ec3' ? 'en-1993-1-1' : 'bs-en-1993-1-1';
  const omitted: ForeignRun['skipped'] = [];
  const ctxs = contexts(omitted).filter((c) => familyOf(c.material) === 'steel');
  const skipped: ForeignRun['skipped'] = omitted.filter((o) => familyOfElement(o.elementId) === 'steel');
  // Every combination at every station: 6.2, 6.3.2 and 6.3.3 read N, My, Mz and V together.
  const run = runOtherCode(EC3, ctxs, { tuples: true });
  const members: ForeignMember[] = [];
  for (const row of run.rows) {
    if (row.status === 'skipped') { skipped.push({ elementId: row.elementId, reasonKey: row.reasonKey }); continue; }
    const rows = [readingRow(codeKey, '2005', row.reading, row.comboName, row.stationX)];
    let proposal: string | undefined, candidate: ForeignMember['candidate'];
    const ctx = ctxs.find((c) => c.elementId === row.elementId)!;
    const current = catalogueProfileOf(ctx.section as never);
    if (current && members.length < cap) {
      for (const p of familyByWeight(current.family as ProfileFamily)) {
        // All the member's tuples, the governing ones first; a profile past 1 is not read further.
        const r = runOtherCode(EC3, [withProfile(ctx, p)], { tuples: true, stopAbove: 1 }).rows[0];
        // A profile past 1 on any part, the 6.3.3 sum included, is passed over. That sum is no check of
        // 6.3.3 (it lacks the interaction factors); here it only screens the candidates, so that the one
        // named is not one the sum already rules out. It verifies nothing.
        if (r?.status !== 'checked' || r.reading.ratio > 1) continue;
        // A proposal passes everything the code asks of it; one with a check left out is a candidate, named with the gap.
        if (r.reading.pass && r.reading.unevaluated.length === 0) { proposal = p.name; break; }
        candidate ??= { profile: p.name, unevaluated: r.reading.unevaluated };
        if (r.reading.unevaluated.some((k) => FORCE_GAPS.has(k))) break;
      }
    }
    members.push({ elementId: row.elementId, family: 'steel', kind: ctx.kind, rows, status: statusOf(rows), ...(proposal ? { proposal } : candidate ? { candidate } : {}), data: [] });
  }
  return { code, members, skipped: skipped.sort((a, b) => a.elementId - b.elementId), loadMismatch: loadMismatch(code) };
}

/** Moments at both ends of each combination a member's demands come from. */
function endMoments(id: number, demands: ReadonlyArray<{ comboId: number }>, perCombo: ReturnType<typeof activePerCombo3D>, index: Map<number, Map<number, ElementForces3D>>) {
  const out = new Map<number, { my: [number, number]; mz: [number, number] }>();
  for (const d of demands) {
    if (out.has(d.comboId)) continue;
    let byId = index.get(d.comboId);
    if (!byId) { byId = new Map((perCombo.get(d.comboId)?.elementForces ?? []).map((ef) => [ef.elementId, ef])); index.set(d.comboId, byId); }
    const ef = byId.get(id);
    if (!ef) continue;
    const a = extractForcesAtStation(ef, 0), b = extractForcesAtStation(ef, 1);
    out.set(d.comboId, { my: [a.my, b.my], mz: [a.mz, b.mz] });
  }
  return out;
}

/** Second-order effects of a storey past 10 % of the first-order ones, 5.8.2(6): Q/(1 − Q) ≥ 0,1. */
const SWAY_Q = 1 / 11;

/**
 * φ(∞,t0) by Annex B and M0Eqp/M0Ed of each plane (5.8.4(2)): the quasi-permanent moment at the end
 * where the member's largest first-order moment acts, over that moment (the section of the largest
 * moment, as the clause's note allows). Quasi-permanent: Σ ψ2·case by EN 1990 Table A1.1; of cases
 * that are patterns of one action, the one with the largest moment there.
 */
function creepOf(id: number, b: number, h: number, fck: number, ends: Map<number, { my: [number, number]; mz: [number, number] }>): NonNullable<Ec2MemberInput['creep']> {
  const h0 = ((2 * b * h) / (2 * (b + h))) * 1000;
  const phiInf = ec2CreepCoefficient(fck, h0);
  const perCase = resultsStore.perCase3D;
  const cases = modelStore.model.loadCases;
  const caseMoment = (caseId: number, t: 0 | 1, plane: 'my' | 'mz') => {
    const ef = perCase.get(caseId)?.elementForces.find((e) => e.elementId === id);
    return ef ? extractForcesAtStation(ef, t)[plane] : 0;
  };
  const ratio = (plane: 'my' | 'mz'): number | null => {
    let best: { M: number; t: 0 | 1 } | null = null;
    for (const e of ends.values()) for (const t of [0, 1] as const) if (!best || Math.abs(e[plane][t]) > best.M) best = { M: Math.abs(e[plane][t]), t };
    if (!best || best.M < 1e-6 || !perCase.size) return null;
    const groups = new Map<string, number[]>();
    for (const c of cases) {
      const psi = ec2Psi2(c.type);
      if (psi === 0) continue;
      const key = c.alternatives ? `${c.type}|${c.alternatives}` : `#${c.id}`;
      groups.set(key, [...(groups.get(key) ?? []), psi * caseMoment(c.id, best.t, plane)]);
    }
    let qp = 0;
    for (const v of groups.values()) qp += v.reduce((a, x) => (Math.abs(x) > Math.abs(a) ? x : a), 0);
    return Math.min(1, Math.abs(qp) / best.M);
  };
  const ry = ratio('my'), rz = ratio('mz');
  return {
    phiInf, ratioMy: ry ?? 1, ratioMz: rz ?? 1,
    basis: [
      `φ(∞,t0) = ${phiInf.toFixed(3)} by Annex B, assumed RH = 50 %, t0 = 28 days, cement class N; h0 = ${h0.toFixed(0)} mm`,
      `φef = φ(∞,t0)·M0Eqp/M0Ed (5.8.4(2)): M0Eqp/M0Ed = ${(ry ?? 1).toFixed(3)} (plane y), ${(rz ?? 1).toFixed(3)} (plane z); ψ2 of EN 1990 Table A1.1 by case type, imposed loads 0,3`,
      ...(ry === null || rz === null ? [perCase.size ? 'a plane without first-order moment takes M0Eqp/M0Ed = 1' : 'no results by case: M0Eqp/M0Ed = 1, the safe side'] : []),
    ],
  };
}

/**
 * EN 1992-1-1: each rectangular concrete beam and column designed from simultaneous force tuples,
 * the governing demands and every combination at every station (`engine/design/eurocode/ec2-member.ts`),
 * each with the end moments of its own combination. What it cannot
 * design is listed with the reason: no f'c, not rectangular, a wall (9.6.1: longer in plan than
 * four times its thickness), no demand, not designed (inactive, variable section).
 */
function ec2Run(code: 'ec2' | 'ec2-uk'): ForeignRun {
  const params = code === 'ec2' ? EC2_RECOMMENDED : EC2_UK, dd = designData();
  const bar = Math.max(...dd.longDiametersMm.filter((x) => x <= 20), 12);
  const members: ForeignMember[] = [], skipped: ForeignRun['skipped'] = [];
  const concreteLike = (f: string) => f === 'concrete' || f === 'unknown';
  const omitted: ForeignRun['skipped'] = [];
  const all = contexts(omitted);
  skipped.push(...omitted.filter((o) => concreteLike(familyOfElement(o.elementId))));
  const perCombo = activePerCombo3D(), index = new Map<number, Map<number, ElementForces3D>>();
  const verticals = all.filter((c) => c.kind !== 'beam' && concreteLike(familyOf(c.material))).map((c) => c.elementId);
  const storeyOf = new Map<number, { Q: number; combo: string | null; direction: string | null }>();
  for (const s of verticals.length ? modelStoreyStability(verticals) : []) for (const id of s.columns) storeyOf.set(id, s);
  for (const ctx of all) {
    const fam = familyOf(ctx.material);
    if (!concreteLike(fam)) continue;
    const id = ctx.elementId, skip = (reasonKey: string) => skipped.push({ elementId: id, reasonKey });
    // A material whose family cannot be read (no fy) is concrete when it states f'c.
    const fck = concreteFc(ctx.material as never);
    if (!fck) { skip('otherCodes.skip.noFc'); continue; }
    const s = ctx.section;
    if (!s.b || !s.h || (s.shape && s.shape !== 'rect')) { skip('otherCodes.skip.notRectangular'); continue; }
    const vertical = ctx.kind !== 'beam';
    if (ctx.kind === 'wall' || (vertical && Math.max(s.b, s.h) > 4 * Math.min(s.b, s.h))) { skip('otherCodes.skip.ec2Wall'); continue; }
    const input: Ec2MemberInput = {
      kind: vertical ? 'column' : 'beam', b: s.b, h: s.h, L: ctx.L,
      ...(ctx.kStrong !== undefined ? { kStrong: ctx.kStrong } : {}), ...(ctx.kWeak !== undefined ? { kWeak: ctx.kWeak } : {}),
      demands: ctx.demands, ...(ctx.tuples ? { tuples: ctx.tuples } : {}), cover: vertical ? dd.covers.column : dd.covers.beam, linkDia: dd.stirrupDiaMm, barDia: bar,
      fck, fyk: dd.rebarFy, params,
      ...((ctx.element as { reinforcement?: Ec2MemberInput['provided'] }).reinforcement ? { provided: (ctx.element as { reinforcement?: Ec2MemberInput['provided'] }).reinforcement! } : {}),
    };
    if (vertical) {
      const ends = endMoments(id, [...ctx.demands, ...(ctx.tuples ?? [])], perCombo, index);
      const st = storeyOf.get(id);
      input.ends = ends;
      input.sway = !st
        ? { braced: true, basis: 'braced: no storey to read sway from, taken as braced' }
        : st.Q >= SWAY_Q
          ? { braced: false, basis: `unbraced: storey Q = ${st.Q.toFixed(3)} ≥ 1/11${st.combo ? ` (${st.combo}, ${st.direction})` : ''}, second-order effects past 10 % of the first-order ones (5.8.2(6))` }
          : { braced: true, basis: `braced: storey Q = ${st.Q.toFixed(3)} < 1/11, second-order effects under 10 % of the first-order ones (5.8.2(6))` };
      input.creep = creepOf(id, s.b, s.h, fck, ends);
    }
    const des = ec2MemberDesign(input);
    if ('skip' in des) { skip(des.skip); continue; }
    members.push({ elementId: id, family: 'concrete', kind: vertical ? 'column' : 'beam', rows: des.rows, status: statusOf(des.rows), data: des.data });
  }
  return { code, members, skipped: skipped.sort((a, b) => a.elementId - b.elementId), loadMismatch: loadMismatch(code) };
}

/** Run the design of one foreign code. */
export function foreignRun(code: ForeignCodeId): ForeignRun {
  if (code === 'aci318') return aciRun();
  if (code === 'aisc360') return aiscRun();
  if (code === 'ec3' || code === 'ec3-uk') return ec3Run(code);
  return ec2Run(code);
}

export { FOREIGN_MATRIX };
