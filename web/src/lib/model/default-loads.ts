export interface DefaultCase { id: number; type: 'D' | 'L' | 'W' | 'E'; name: string }
export interface DefaultCombination { id: number; name: string; factors: Array<{ caseId: number; factor: number }> }

const ENGLISH: Record<DefaultCase['type'], string> = { D: 'Dead Load', L: 'Live Load', W: 'Wind', E: 'Earthquake' };

/** The keys their names are translated with (`exData.case.*`, shared with the examples). */
export const DEFAULT_CASE_NAME_KEYS: Record<DefaultCase['type'], string> = { D: 'exData.case.dead', L: 'exData.case.live', W: 'exData.case.wind', E: 'exData.case.earthquake' };

/** `nameOf`: the name in the app's language; the English one when absent, as projects were saved before. */
export function defaultLoadCases(nameOf?: (type: DefaultCase['type']) => string): DefaultCase[] {
  return (['D', 'L', 'W', 'E'] as const).map((type, i) => ({ id: i + 1, type, name: nameOf?.(type) ?? ENGLISH[type] }));
}

export function defaultCombinations(): DefaultCombination[] {
  return [
    { id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
    { id: 2, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
    { id: 3, name: '1.2D + L + 1.6W', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
    { id: 4, name: '1.2D + L + E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 4, factor: 1.0 }] },
  ];
}

type CaseLike = { id: number; type: string; name: string };
type ComboLike = { id: number; name?: string; origin?: unknown; factors?: ReadonlyArray<{ caseId: number; factor: number }> };
type LoadLike = { data: { caseId?: number } };

const sameFactors = (a: ReadonlyArray<{ caseId: number; factor: number }>, b: ReadonlyArray<{ caseId: number; factor: number }>) =>
  a.length === b.length && a.every((f, i) => f.caseId === b[i]!.caseId && Math.abs(f.factor - b[i]!.factor) < 1e-12);

/** A renamed case, a case with a load or an edited combination is the user's and is never listed. */
export function untouchedDefaults(
  cases: readonly CaseLike[], combinations: readonly ComboLike[], loads: readonly LoadLike[],
  nameOf?: (type: DefaultCase['type']) => string,
): { cases: number[]; combinations: number[] } {
  const combos = defaultCombinations().filter((d) => combinations.some((c) =>
    c.id === d.id && c.name === d.name && !c.origin && sameFactors(c.factors ?? [], d.factors)));
  const comboIds = new Set(combos.map((c) => c.id));
  const loaded = new Set(loads.map((l) => l.data.caseId ?? 1));
  const usedElsewhere = new Set(combinations.filter((c) => !comboIds.has(c.id))
    .flatMap((c) => (c.factors ?? []).filter((f) => f.factor !== 0).map((f) => f.caseId)));
  const named = (d: DefaultCase, name: string) => name === d.name || name === nameOf?.(d.type);
  const caseIds = defaultLoadCases().filter((d) => cases.some((c) => c.id === d.id && c.type === d.type && named(d, c.name))
    && !loaded.has(d.id) && !usedElsewhere.has(d.id)).map((d) => d.id);
  return { cases: caseIds, combinations: [...comboIds] };
}
