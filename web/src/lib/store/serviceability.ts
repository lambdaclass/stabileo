/**
 * The deflection check, in one place, for every member a limit covers: concrete and steel.
 *
 * It ran for concrete beams only, inside the verification tab, while the report computed its
 * own; steel beams had no deflection check anywhere. Now the verification tab, the report and
 * the Deflections table all read this: the service deflection relative to the chord
 * (`store/service-deflection.ts`) against the span limit, with the long-term multiplier of the
 * member's material — none for steel, which does not creep; for a reinforced concrete beam the
 * cracked section's Ie and ξ/(1 + 50ρ′) (`store/cracked-deflection.ts`), λΔ = 2 on the gross
 * section for one with no bars.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { combineResults3D } from '../engine/wasm-solver';
import type { AnalysisResults3D } from '../engine/types-3d';
import { serviceSets, serviceDeflections, type MemberDeflection, type DeflectionBasis } from './service-deflection';
import { checkDeflection, type DeflectionResult } from '../engine/codes/argentina/serviceability';
import { crackedBasis, type CrackedBasis } from './cracked-deflection';
import { materialFamilyOf } from '../engine/steel/material-family';
import { memberKindOf } from '../engine/design/member-grouping';
import { ruleFor, readDeflection, DEFAULT_BEAM_RULE, type DeflectionRule, type RuleContext } from '../engine/deflection-limits';

/** The span limit a beam is checked against when the project states none. */
export const DEFLECTION_LIMIT = `L/${DEFAULT_BEAM_RULE.n}` as const;
/** Long-term multiplier per material family. */
export const LONG_TERM_FACTOR = { concrete: 2.0, steel: 0, other: 0 } as const;

/**
 * Which deflection a concrete member's limit reads, CIRSOC 201-2025 Tabla 24.2.2
 * (docs/codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-24-…md:120-140), by the row the project's
 * L/n names:
 *   ℓ/180  flat roofs not attached to damageable elements: the immediate deflection due to Lr, S, R;
 *   ℓ/360  floors not attached to damageable elements: the immediate deflection due to L;
 *   ℓ/480, ℓ/240  roofs or floors attached to non-structural elements likely, or not likely, to be
 *          damaged: «la suma de la flecha a largo plazo debida a todas las cargas de larga duración,
 *          y la flecha inmediata debida a cualquier sobrecarga adicional» (λΔ by §24.2.4.1.1);
 *   any other n is not a row of the table: the total long-term deflection, (1 + λΔ)·δ, is read
 *          against it, on the safe side, and the row says so.
 */
export type DeflectionReading = 'immediateLive' | 'immediateRoof' | 'afterAttachment' | 'projectTotal';
export function tableReadingOf(n: number): DeflectionReading {
  return n === 360 ? 'immediateLive' : n === 180 ? 'immediateRoof' : n === 480 || n === 240 ? 'afterAttachment' : 'projectTotal';
}

export interface MemberServiceability {
  elementId: number;
  family: 'concrete' | 'steel' | 'other';
  /** Concrete: the deflection its limit read (Tabla 24.2.2). */
  reading?: DeflectionReading;
  deflection: MemberDeflection;
  /** The rule it is checked against, and the deflection that rule reads. */
  rule: DeflectionRule;
  measured: number;
  check: DeflectionResult;
  /** The cracked section it was checked on, when the beam has bars. */
  cracked?: CrackedBasis;
}

export interface ServiceabilityRun { basis: DeflectionBasis; names: string[]; rows: Map<number, MemberServiceability> }

/** How the project's rules see a member: its kind and its groups. */
export function ruleContext(): RuleContext {
  const groupsOf = new Map<number, number[]>();
  for (const g of modelStore.model.groups.values()) {
    for (const id of g.members.elements ?? []) groupsOf.set(id, [...(groupsOf.get(id) ?? []), g.id]);
  }
  return {
    kindOf: (id) => memberKindOf(modelStore.model as never, id),
    groupsOf: (id) => groupsOf.get(id) ?? [],
  };
}

/**
 * The deflection check of `ids`, or of every member a rule covers (every beam, when the project
 * states no rule), against the rule that applies to each: L/n on the direction it reads, over
 * 2L for a cantilever, with the long-term multiplier of the member's material.
 */
export function deflectionChecks(ids?: Iterable<number>): ServiceabilityRun {
  const svc = serviceSets();
  const ctx = ruleContext();
  const limits = modelStore.deflectionLimits;
  const candidates = ids ? [...ids] : [...modelStore.elements.values()].filter((e) => e.type === 'frame').map((e) => e.id);
  const ruled = new Map<number, DeflectionRule>();
  for (const id of candidates) { const r = ruleFor(id, limits, ctx); if (r) ruled.set(id, r); }
  const loads = loadSets();
  const rows = new Map<number, MemberServiceability>();
  for (const [id, d] of serviceDeflections(ruled.keys(), svc.sets)) {
    const rule = ruled.get(id);
    if (!rule || d.L <= 0) continue;
    const e = modelStore.elements.get(id)!;
    const fam = materialFamilyOf(modelStore.materials.get(e.materialId) as never).family;
    const family = fam === 'concrete' ? 'concrete' : fam === 'steel' ? 'steel' : 'other';
    const measured = readDeflection(d, rule.direction);
    // The length the limit is taken over: the span, or twice it for a cantilever.
    const over = (d.cantilever ? 2 : 1) * d.L;
    if (family === 'concrete') {
      const row = concreteRow(id, d, rule, over, svc, loads);
      rows.set(id, { elementId: id, family, deflection: d, rule, measured, ...row });
      continue;
    }
    const check = checkDeflection(d.L, measured, rule.n, LONG_TERM_FACTOR[family], over);
    rows.set(id, { elementId: id, family, deflection: d, rule, measured, check });
  }
  return { basis: svc.basis, names: svc.names, rows };
}

/** The unfactored load sets Tabla 24.2.2 reads, from the cases solved apart: D, D + L, D + Lr/S/R, D + all. */
interface LoadSets { D: AnalysisResults3D; DL: AnalysisResults3D | null; DR: AnalysisResults3D | null; Dall: AnalysisResults3D; names: { D: string; L: string; R: string } }
function loadSets(): LoadSets | null {
  const perCase = resultsStore.perCase3D;
  if (!perCase.size) return null;
  const of = (types: string[]) => modelStore.loadCases.filter((c) => types.includes((c.type || '').toUpperCase()) && perCase.has(c.id));
  const D = of(['D']), L = of(['L']), R = of(['LR', 'S', 'R']);
  if (!D.length) return null;
  const sum = (cs: typeof D) => combineResults3D(cs.map((c) => ({ caseId: c.id, factor: 1 })), perCase);
  const sD = sum(D), sAll = sum([...D, ...L, ...R]);
  if (!sD || !sAll) return null;
  const nm = (cs: typeof D) => cs.map((c) => c.name).join(' + ');
  return { D: sD, DL: L.length ? sum([...D, ...L]) : null, DR: R.length ? sum([...D, ...R]) : null, Dall: sAll, names: { D: nm(D), L: nm(L), R: nm(R) } };
}

/**
 * A concrete member's row: the deflection its Tabla 24.2.2 row reads. Each immediate deflection on
 * the effective inertia of its own load level (§24.2.3.5, Ma of that level): the deflection due to
 * a load is δ(D + load) − δ(D), each on its own Ie. The long-term part is λΔ = ξ/(1 + 50ρ′) times
 * the immediate deflection under the sustained loads (§24.2.4.1.1), plus the immediate deflection
 * of the live load applied after attachment; the project states no sustained share of the live
 * load, so all of it is taken as sustained, on the safe side: λΔ·δ(all) + [δ(all) − δ(D)].
 */
function concreteRow(id: number, d: MemberDeflection, rule: DeflectionRule, over: number, svc: ReturnType<typeof serviceSets>, loads: LoadSets | null):
  { reading: DeflectionReading; check: DeflectionResult; cracked?: CrackedBasis } {
  const reading = tableReadingOf(rule.n);
  const at = (results: AnalysisResults3D) => {
    const dd = serviceDeflections([id], [{ id: 0, name: '', results }]).get(id);
    if (!dd) return null;
    const cr = crackedBasis(dd.span, new Map(results.elementForces.map((f) => [f.elementId, f])));
    return { delta: readDeflection(dd, rule.direction) * (cr?.scale ?? 1), cr };
  };
  const total = (why: string) => {
    // (1 + λΔ)·δ under the service set that governs, as before: not a Tabla 24.2.2 reading.
    const set = svc.sets.find((x) => x.name === d.setName);
    const cracked = set ? crackedBasis(d.span, new Map(set.results.elementForces.map((f) => [f.elementId, f]))) : null;
    const m = readDeflection(d, rule.direction);
    const check = cracked ? checkDeflection(d.L, m * cracked.scale, rule.n, cracked.lambda, over) : checkDeflection(d.L, m, rule.n, LONG_TERM_FACTOR.concrete, over);
    check.steps.unshift(why);
    if (cracked) check.steps.unshift(ieLine(cracked));
    return { reading: 'projectTotal' as const, check, ...(cracked ? { cracked } : {}) };
  };
  if (reading === 'projectTotal') return total(`L/${rule.n} no es una fila de la Tabla 24.2.2: se lee la flecha total a largo plazo (1 + λΔ)·δ`);
  if (!loads) return total('los casos de carga no están resueltos por separado: se lee la flecha total a largo plazo (1 + λΔ)·δ, del lado seguro');
  const D = at(loads.D);
  if (!D) return total('sin flecha bajo la carga permanente sola: se lee la flecha total a largo plazo');
  const steps: string[] = [];
  let demand = 0;
  let governing: CrackedBasis | null | undefined = D.cr;
  if (reading === 'immediateLive' || reading === 'immediateRoof') {
    const live = reading === 'immediateLive' ? loads.DL : loads.DR;
    const name = reading === 'immediateLive' ? loads.names.L : loads.names.R;
    const DX = live ? at(live) : null;
    demand = DX ? Math.max(0, DX.delta - D.delta) : 0;
    if (DX?.cr) governing = DX.cr;
    steps.push(DX
      ? `flecha inmediata debida a ${name} (Tabla 24.2.2): δ(D + ${reading === 'immediateLive' ? 'L' : 'Lr, S, R'}) − δ(D) = ${(DX.delta * 1000).toFixed(2)} − ${(D.delta * 1000).toFixed(2)} = ${(demand * 1000).toFixed(2)} mm`
      : `sin casos de ${reading === 'immediateLive' ? 'sobrecarga L' : 'Lr, S ni R'}: flecha inmediata nula`);
    if (D.cr) steps.push(`Ie(D) = ${D.cr.Ie.toExponential(3)} m⁴ con Ma = ${D.cr.Ma.toFixed(1)} kN·m`);
    if (DX?.cr) steps.push(`Ie(D + ${reading === 'immediateLive' ? 'L' : 'Lr, S, R'}) = ${DX.cr.Ie.toExponential(3)} m⁴ con Ma = ${DX.cr.Ma.toFixed(1)} kN·m (Mcr = ${DX.cr.Mcr.toFixed(1)} kN·m)`);
  } else {
    const A = at(loads.Dall);
    const lambda = (A?.cr ?? D.cr)?.lambda ?? LONG_TERM_FACTOR.concrete;
    const all = A?.delta ?? D.delta;
    const live = Math.max(0, all - D.delta);
    demand = lambda * all + live;
    if (A?.cr) governing = A.cr;
    steps.push(`parte de la flecha posterior a la unión de los elementos no estructurales (Tabla 24.2.2): λΔ = ${lambda.toFixed(2)}`);
    steps.push(`sin fracción de larga duración declarada para la sobrecarga, se la toma toda de larga duración: λΔ·δ(todas) + [δ(todas) − δ(D)] = ${lambda.toFixed(2)}·${(all * 1000).toFixed(2)} + ${(live * 1000).toFixed(2)} = ${(demand * 1000).toFixed(2)} mm`);
  }
  const check = checkDeflection(d.L, demand, rule.n, 0, over);
  check.deltaImm = demand; check.deltaLT = 0; check.deltaTotal = demand;
  check.steps = [...steps, ...check.steps.filter((x) => x.startsWith('δ_admisible') || x.startsWith('Ratio'))];
  return { reading, check, ...(governing ? { cracked: governing } : {}) };
}

const ieLine = (c: CrackedBasis) => `Ie = ${c.Ie.toExponential(3)} m⁴ (Ig = ${c.Ig.toExponential(3)}, Icr = ${c.Icr.toExponential(3)}, Mcr = ${c.Mcr.toFixed(1)} kN·m, Ma = ${c.Ma.toFixed(1)} kN·m); λΔ = ${c.lambda.toFixed(2)} con ρ′ = ${c.rhoPrime.toFixed(4)}`;
