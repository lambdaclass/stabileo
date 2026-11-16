export interface DemandCoverage {
  readonly combinations?: readonly { comboId: number; comboName: string }[];
  readonly combinationIds: readonly number[];
  readonly stationTs: readonly number[];
  readonly combinationStations?: readonly { readonly comboId: number; readonly stationTs: readonly number[] }[];
}

export interface DemandScope {
  readonly combinations: readonly {
    readonly comboId: number;
    readonly comboName?: string;
    readonly members: readonly { readonly elementId: number; readonly stationTs: readonly number[] }[];
  }[];
  readonly missingMembers?: readonly number[];
}

export function memberDemandScope(members: readonly ({ readonly elementId: number } & DemandCoverage)[]): DemandScope {
  const combinations = new Map<number, { comboId: number; comboName?: string; members: { elementId: number; stationTs: readonly number[] }[] }>();
  const missingMembers: number[] = [];
  for (const member of members) {
    if (!member.combinationIds.length) missingMembers.push(member.elementId);
    const names = new Map(member.combinations?.map(c => [c.comboId, c.comboName]));
    const requested = new Map<number, Set<number>>();
    for (const c of member.combinationStations ?? []) {
      const ts = requested.get(c.comboId) ?? new Set<number>();
      for (const t of c.stationTs) ts.add(t);
      requested.set(c.comboId, ts);
    }
    for (const comboId of member.combinationIds) {
      let combo = combinations.get(comboId);
      if (!combo) { combo = { comboId, comboName: names.get(comboId), members: [] }; combinations.set(comboId, combo); }
      combo.members.push({ elementId: member.elementId, stationTs: [...new Set([...member.stationTs,
        ...(requested.get(comboId) ?? [])])] });
    }
  }
  return { combinations: [...combinations.values()], missingMembers };
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

  map<U extends object>(project: (row: T) => U): CompleteDemandSet<U & ScopedDemand> {
    return new CompleteDemandSet(Object.freeze(this.rows.map(row => Object.freeze({ ...project(row),
      elementId: row.elementId, comboId: row.comboId, stationT: row.stationT }))));
  }

  prepend(rows: readonly T[]): CompleteDemandSet<T> {
    return new CompleteDemandSet(Object.freeze([...rows.map(row => Object.freeze({ ...row })), ...this.rows]));
  }

  partition<K>(key: (row: T) => K): ReadonlyMap<K, CompleteDemandSet<T>> {
    const groups = new Map<K, T[]>();
    for (const row of this.rows) {
      const k = key(row), list = groups.get(k) ?? [];
      list.push(row); groups.set(k, list);
    }
    return new Map([...groups].map(([k, rows]) => [k, new CompleteDemandSet(Object.freeze(rows))]));
  }

  static require<T extends ScopedDemand>(scope: DemandScope, rows: readonly T[], availableCombinationIds?: readonly number[]): CompleteDemandSet<T> {
    const diagnostics: IncompleteDemandDiagnostic[] = [];
    const snapshot = Object.freeze(rows.map(row => Object.freeze({ ...row })));
    const byCombo = new Map<number, Map<number, Set<number>>>();
    for (const row of snapshot) {
      let members = byCombo.get(row.comboId);
      if (!members) { members = new Map(); byCombo.set(row.comboId, members); }
      let stations = members.get(row.elementId);
      if (!stations) { stations = new Set(); members.set(row.elementId, stations); }
      stations.add(row.stationT);
    }
    for (const elementId of scope.missingMembers ?? []) diagnostics.push({ code: 'missing-scope', elementId });
    const available = new Set(availableCombinationIds ?? byCombo.keys());
    for (const combo of scope.combinations) {
      const members = byCombo.get(combo.comboId);
      const identity = { comboId: combo.comboId, comboName: combo.comboName };
      if (!Number.isFinite(combo.comboId) || !available.has(combo.comboId)) { diagnostics.push({ code: 'missing-combination', ...identity }); continue; }
      for (const member of combo.members) {
        const stations = members?.get(member.elementId);
        if (!member.stationTs.length || member.stationTs.some(t => !Number.isFinite(t))) diagnostics.push({ code: 'missing-scope', elementId: member.elementId });
        if (!stations?.size) { diagnostics.push({ code: 'missing-member', ...identity, elementId: member.elementId }); continue; }
        for (const stationT of member.stationTs) {
          if (!stations.has(stationT)) diagnostics.push({ code: 'missing-station', ...identity, elementId: member.elementId, stationT });
        }
      }
    }
    if (diagnostics.length) throw new IncompleteConcurrentDemandError(diagnostics);
    return new CompleteDemandSet(snapshot);
  }
}

export function demandCoverage(
  declared: Partial<DemandCoverage>,
  tuples: readonly { comboId: number; coverage?: DemandCoverage; forces?: { readonly t: number } }[] | undefined,
): DemandCoverage {
  const ids = new Set(declared.combinationIds), stations = new Set(declared.stationTs);
  const byCombo = new Map<number, Set<number>>();
  const include = (comboId: number, ts: readonly number[]) => {
    ids.add(comboId);
    let requested = byCombo.get(comboId);
    if (!requested) { requested = new Set(); byCombo.set(comboId, requested); }
    for (const t of ts) requested.add(t);
  };
  for (const c of declared.combinationStations ?? []) include(c.comboId, c.stationTs);
  const seen = new Set<DemandCoverage>();
  const names = new Map(declared.combinations?.map(c => [c.comboId, c.comboName]));
  for (const tuple of tuples ?? []) {
    const comboId = tuple.comboId;
    ids.add(comboId);
    const coverage = tuple.coverage;
    if (coverage && !seen.has(coverage)) {
      seen.add(coverage);
      for (const c of coverage.combinations ?? []) names.set(c.comboId, c.comboName);
      for (const id of coverage.combinationIds) ids.add(id);
      for (const id of coverage.combinationIds) include(id, coverage.stationTs);
      for (const c of coverage.combinationStations ?? []) include(c.comboId, c.stationTs);
    }
    if (tuple.forces) include(comboId, [tuple.forces.t]);
  }
  return Object.freeze({ combinationIds: Object.freeze([...ids]), stationTs: Object.freeze([...stations]),
    combinationStations: Object.freeze([...byCombo].map(([comboId, ts]) => Object.freeze({ comboId, stationTs: Object.freeze([...ts]) }))),
    combinations: Object.freeze([...names].map(([comboId, comboName]) => Object.freeze({ comboId, comboName }))) });
}
