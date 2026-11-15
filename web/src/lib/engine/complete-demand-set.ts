export interface DemandCoverage {
  readonly combinations?: readonly { comboId: number; comboName: string }[];
  readonly combinationIds: readonly number[];
  readonly stationTs: readonly number[];
}

export interface DemandScope {
  readonly combinations: readonly { comboId: number; comboName?: string }[];
  readonly members: readonly { elementId: number; stationTs: readonly number[] }[];
}

export interface ScopedDemand {
  readonly elementId: number;
  readonly comboId: number;
  readonly stationT: number;
}

export type IncompleteDemandDiagnostic =
  | { readonly code: 'missing-scope'; readonly elementId?: number }
  | { readonly code: 'missing-combination'; readonly comboId: number; readonly comboName?: string }
  | { readonly code: 'missing-member'; readonly elementId: number; readonly comboId: number; readonly comboName?: string }
  | { readonly code: 'missing-station'; readonly elementId: number; readonly comboId: number; readonly comboName?: string; readonly stationT: number };

export class IncompleteConcurrentDemandError extends Error {
  readonly code = 'incomplete-concurrent-demand';
  constructor(readonly diagnostics: readonly IncompleteDemandDiagnostic[]) {
    super(`Incomplete concurrent demand: ${diagnostics.map(d => [d.code,
      ...('comboId' in d ? [`combination ${d.comboId}${d.comboName ? ` (${d.comboName})` : ''}`] : []),
      ...('elementId' in d ? [`member ${d.elementId}`] : []),
      ...('stationT' in d ? [`station ${d.stationT}`] : [])].join(', ')).join('; ')}`);
    this.name = 'IncompleteConcurrentDemandError';
    Object.freeze(diagnostics);
  }
}

export class CompleteDemandSet<T extends ScopedDemand> {
  readonly #complete = true;
  private constructor(private readonly rows: readonly T[]) { Object.freeze(this); }

  get values(): readonly T[] {
    if (!this.#complete) throw new TypeError('Complete concurrent demand required');
    return this.rows;
  }

  static require<T extends ScopedDemand>(scope: DemandScope, rows: readonly T[], availableCombinationIds?: readonly number[]): CompleteDemandSet<T> {
    const diagnostics: IncompleteDemandDiagnostic[] = [];
    const byCombo = new Map<number, Map<number, Set<number>>>();
    for (const row of rows) {
      let members = byCombo.get(row.comboId);
      if (!members) { members = new Map(); byCombo.set(row.comboId, members); }
      let stations = members.get(row.elementId);
      if (!stations) { stations = new Set(); members.set(row.elementId, stations); }
      stations.add(row.stationT);
    }
    if (scope.members.length && !scope.combinations.length) diagnostics.push({ code: 'missing-scope' });
    for (const member of scope.members) {
      if (!member.stationTs.length || member.stationTs.some(t => !Number.isFinite(t))) diagnostics.push({ code: 'missing-scope', elementId: member.elementId });
    }
    const available = new Set(availableCombinationIds ?? byCombo.keys());
    for (const combo of scope.combinations) {
      const members = byCombo.get(combo.comboId);
      if (!Number.isFinite(combo.comboId) || !available.has(combo.comboId)) { diagnostics.push({ code: 'missing-combination', ...combo }); continue; }
      for (const member of scope.members) {
        const stations = members?.get(member.elementId);
        if (!stations?.size) { diagnostics.push({ code: 'missing-member', ...combo, elementId: member.elementId }); continue; }
        for (const stationT of member.stationTs) {
          if (!stations.has(stationT)) diagnostics.push({ code: 'missing-station', ...combo, elementId: member.elementId, stationT });
        }
      }
    }
    if (diagnostics.length) throw new IncompleteConcurrentDemandError(diagnostics);
    return new CompleteDemandSet(Object.freeze([...rows]));
  }
}

export function demandCoverage(
  declared: Partial<DemandCoverage>,
  tuples: readonly { comboId: number; coverage?: DemandCoverage }[] | undefined,
): DemandCoverage {
  const ids = new Set(declared.combinationIds), stations = new Set(declared.stationTs);
  const seen = new Set<DemandCoverage>();
  const names = new Map(declared.combinations?.map(c => [c.comboId, c.comboName]));
  for (const tuple of tuples ?? []) {
    ids.add(tuple.comboId);
    const coverage = tuple.coverage;
    if (coverage && !seen.has(coverage)) {
      seen.add(coverage);
      for (const c of coverage.combinations ?? []) names.set(c.comboId, c.comboName);
      for (const id of coverage.combinationIds) ids.add(id);
      for (const t of coverage.stationTs) stations.add(t);
    }
  }
  return { combinationIds: [...ids], stationTs: [...stations], combinations: [...names].map(([comboId, comboName]) => ({ comboId, comboName })) };
}
