export interface DefaultCase { id: number; type: 'D' | 'L' | 'W' | 'E'; name: string }
export interface DefaultCombination { id: number; name: string; factors: Array<{ caseId: number; factor: number }> }

export function defaultLoadCases(): DefaultCase[] {
  return [
    { id: 1, type: 'D', name: 'Dead Load' },
    { id: 2, type: 'L', name: 'Live Load' },
    { id: 3, type: 'W', name: 'Wind' },
    { id: 4, type: 'E', name: 'Earthquake' },
  ];
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
): { cases: number[]; combinations: number[] } {
  const combos = defaultCombinations().filter((d) => combinations.some((c) =>
    c.id === d.id && c.name === d.name && !c.origin && sameFactors(c.factors ?? [], d.factors)));
  const comboIds = new Set(combos.map((c) => c.id));
  const loaded = new Set(loads.map((l) => l.data.caseId ?? 1));
  const usedElsewhere = new Set(combinations.filter((c) => !comboIds.has(c.id))
    .flatMap((c) => (c.factors ?? []).filter((f) => f.factor !== 0).map((f) => f.caseId)));
  const caseIds = defaultLoadCases().filter((d) => cases.some((c) => c.id === d.id && c.type === d.type && c.name === d.name)
    && !loaded.has(d.id) && !usedElsewhere.has(d.id)).map((d) => d.id);
  return { cases: caseIds, combinations: [...comboIds] };
}
