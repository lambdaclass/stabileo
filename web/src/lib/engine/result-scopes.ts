/**
 * Which combinations count, and named envelopes over them.
 *
 * ── The problem ───────────────────────────────────────────────────
 *
 * A real project generates hundreds of combinations, and until now every one of them fed the
 * envelope, the governing search, every design step and every report. There was no way to say
 * "design with these", or to keep a service envelope apart from a strength one.
 *
 * ── The two definitions ───────────────────────────────────────────
 *
 *   · The ACTIVE LIST: the combinations that feed design, detailing, the governing search, the
 *     default envelope and the reports. Unstated, it is all of them — what the app always did.
 *   · NAMED ENVELOPES: a name, a purpose (strength, service or other), a set of combinations and,
 *     if wanted, load cases on their own (a service envelope of D and L alone, a wind envelope of
 *     the wind cases). Each can be shown like a case, and a service envelope is what the deflection
 *     check reads.
 *
 * Both are project definitions: stored on the model, saved with it, and carried by the model
 * code. Every combination still solves; the lists decide what is READ, not what is computed.
 */

import { computeEnvelope3D } from './wasm-solver';
import { envelopeShellStresses } from './shell-combos';
import { reexpandVariableResults, collapseVariableEnvelope } from './variable-members';
import { t } from '../i18n';
import type { AnalysisResults3D, FullEnvelope3D } from './types-3d';

export type EnvelopePurpose = 'strength' | 'service' | 'other';

export interface NamedEnvelope {
  id: number;
  name: string;
  purpose: EnvelopePurpose;
  comboIds: number[];
  /** Load cases taken as they are, unfactored. Absent: none. */
  caseIds?: number[];
}

/** What the project states. Absent: every combination is active and there are no named envelopes. */
export interface ResultScopes {
  /** The active list, or absent for "all". */
  active?: number[];
  envelopes?: NamedEnvelope[];
}

/** The active combination ids: the stated list, pruned to combinations that exist, or all. */
export function activeComboIds(scopes: ResultScopes | undefined, combinations: ReadonlyArray<{ id: number }>): number[] {
  const all = combinations.map((c) => c.id);
  if (!scopes?.active) return all;
  const exist = new Set(all);
  return scopes.active.filter((id) => exist.has(id));
}

/** `perCombo` narrowed to the given ids, in their order. */
export function narrowPerCombo<T>(perCombo: ReadonlyMap<number, T>, ids: readonly number[]): Map<number, T> {
  const out = new Map<number, T>();
  for (const id of ids) { const r = perCombo.get(id); if (r !== undefined) out.set(id, r); }
  return out;
}

/** The result sets a named envelope reads: its combinations, then its load cases, those solved. */
export function envelopeMembers(
  env: Pick<NamedEnvelope, 'comboIds' | 'caseIds'>,
  perCombo: ReadonlyMap<number, AnalysisResults3D>,
  perCase: ReadonlyMap<number, AnalysisResults3D>,
): Array<{ kind: 'combo' | 'case'; id: number; results: AnalysisResults3D }> {
  return [
    ...env.comboIds.flatMap((id) => { const r = perCombo.get(id); return r ? [{ kind: 'combo' as const, id, results: r }] : []; }),
    ...(env.caseIds ?? []).flatMap((id) => { const r = perCase.get(id); return r ? [{ kind: 'case' as const, id, results: r }] : []; }),
  ];
}

/** The envelope of a set of combinations (and, with `perCase`, load cases), or null when none of them solved. */
export function envelopeOver(
  perCombo: ReadonlyMap<number, AnalysisResults3D>, ids: readonly number[],
  perCase?: ReadonlyMap<number, AnalysisResults3D>, caseIds: readonly number[] = [],
): FullEnvelope3D | null {
  const results = [
    ...ids.map((id) => perCombo.get(id)),
    ...(perCase ? caseIds.map((id) => perCase.get(id)) : []),
  ].filter((r): r is AnalysisResults3D => !!r);
  if (results.length === 0) return null;
  // Members of variable section piece by piece, as the solve took its own envelope
  // (`variable-members.ts`): the engine's envelope of the members alone drops their pieces.
  const expanded = results.map(reexpandVariableResults);
  const exp = expanded.find((x) => x.exp)?.exp;
  const raw = computeEnvelope3D(expanded.map((x) => x.results));
  if (!raw) return null;
  const envelope = collapseVariableEnvelope(raw, exp);
  // The engine's envelope drops shell stresses; they are recombined from the combinations'.
  if (envelope.maxAbsResults3D && results.some((r) => (r.plateStresses?.length ?? 0) > 0 || (r.quadStresses?.length ?? 0) > 0)) {
    const env = envelopeShellStresses(results);
    envelope.maxAbsResults3D.plateStresses = env.plateStresses;
    envelope.maxAbsResults3D.quadStresses = env.quadStresses;
  }
  return envelope;
}

/** A scopes value with ids that no longer name a combination removed. */
export function pruneScopes(scopes: ResultScopes | undefined, combinationIds: ReadonlySet<number>, caseIds?: ReadonlySet<number>): ResultScopes | undefined {
  if (!scopes) return undefined;
  const keep = (ids: number[]) => ids.filter((id) => combinationIds.has(id));
  const keepCases = (ids: number[] | undefined) => (ids && caseIds ? ids.filter((id) => caseIds.has(id)) : ids);
  return {
    ...(scopes.active ? { active: keep(scopes.active) } : {}),
    ...(scopes.envelopes ? { envelopes: scopes.envelopes.map((e) => {
      const cases = keepCases(e.caseIds);
      return { ...e, comboIds: keep(e.comboIds), ...(cases ? { caseIds: cases } : {}) };
    }) } : {}),
  };
}

type Bundle3D = { perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D };

/**
 * A solved combination bundle with its envelope taken over the active list only.
 *
 * Every combination stays in `perCombo` — each can still be shown on its own — but the envelope
 * the viewport and the tables call "Envelope" is the one the project stated. With no active list
 * the bundle is returned as solved. An active list that names no solved combination is an error,
 * not an empty envelope: a design reading it would find no demand and pass everything.
 */
export function scopeBundle3D<B extends Bundle3D>(
  bundle: B | string | null,
  scopes: ResultScopes | undefined,
  combinations: ReadonlyArray<{ id: number }>,
): B | string | null {
  if (!bundle || typeof bundle === 'string' || !scopes?.active) return bundle;
  const ids = activeComboIds(scopes, combinations).filter((id) => bundle.perCombo.has(id));
  if (ids.length === bundle.perCombo.size) return bundle;
  const envelope = envelopeOver(bundle.perCombo, ids);
  if (!envelope) return t('scopes.noneActive');
  return { ...bundle, envelope };
}
