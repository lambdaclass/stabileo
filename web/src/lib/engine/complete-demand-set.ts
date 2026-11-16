export interface DemandCoverage {
  readonly inventory?: DemandInventory;
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
  readonly inventory?: DemandInventory;
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
  constructor(readonly diagnostics: readonly IncompleteDemandDiagnostic[], context?: string) {
    super(`${context ? context + ': ' : ''}Incomplete concurrent demand: ${diagnostics.map(d => [d.code,
      ...('comboId' in d ? [`combination ${d.comboId}${d.comboName ? ` (${d.comboName})` : ''}`] : []),
      ...('elementId' in d ? [`member ${d.elementId}`] : []),
      ...('stationT' in d ? [`station ${d.stationT}`] : [])].join(', ')).join('; ')}`);
    this.name = 'IncompleteConcurrentDemandError';
    Object.freeze(diagnostics);
  }
}

export class DemandInventory {
  readonly scope: DemandScope;
  readonly #cells: ReadonlyMap<number, ReadonlyMap<number, ReadonlySet<number>>>;
  readonly #members: ReadonlyMap<number, DemandScope>;
  readonly #coverages: ReadonlyMap<number, DemandCoverage>;
  private constructor(scope: DemandScope) {
    this.scope = Object.freeze({ combinations: Object.freeze(scope.combinations.map(c => Object.freeze({ ...c,
      members: Object.freeze(c.members.map(m => Object.freeze({ ...m, stationTs: Object.freeze([...m.stationTs]) }))) }))),
      missingMembers: Object.freeze([...(scope.missingMembers ?? [])]) });
    this.#cells = new Map(this.scope.combinations.map(c => [c.comboId, new Map(c.members.map(m => [m.elementId, new Set(m.stationTs)]))]));
    const members = new Map<number, DemandScope['combinations'][number][]>();
    for (const c of this.scope.combinations) for (const m of c.members) {
      const list = members.get(m.elementId) ?? [];
      list.push(Object.freeze({ comboId: c.comboId, comboName: c.comboName, members: Object.freeze([m]) }));
      members.set(m.elementId, list);
    }
    this.#members = new Map([...members].map(([id, combinations]) => [id, Object.freeze({ combinations: Object.freeze(combinations) })]));
    this.#coverages = new Map([...this.#members].map(([elementId, scope]) => [elementId, Object.freeze({ inventory: this,
      combinationIds: Object.freeze(scope.combinations.map(c => c.comboId)), stationTs: Object.freeze([]),
      combinations: Object.freeze(scope.combinations.map(c => Object.freeze({ comboId: c.comboId, comboName: c.comboName ?? '' }))),
      combinationStations: Object.freeze(scope.combinations.map(c => Object.freeze({ comboId: c.comboId, stationTs: c.members[0]!.stationTs }))),
    })]));
    Object.freeze(this);
  }

  coverageForMember(elementId: number): DemandCoverage {
    const coverage = this.#coverages.get(elementId);
    if (!coverage) throw new IncompleteConcurrentDemandError([{ code: 'missing-scope', elementId }]);
    return coverage;
  }

  scopeForMembers(ids: readonly number[]): DemandScope {
    return { combinations: ids.flatMap(id => this.#members.get(id)?.combinations ?? []),
      missingMembers: ids.filter(id => !this.#members.has(id) || this.scope.missingMembers?.includes(id)) };
  }

  static declare(scope: DemandScope): DemandInventory { return new DemandInventory(scope); }

  static include(scope: DemandScope, inventories: readonly DemandInventory[]): DemandInventory {
    const unique = [...new Set(inventories)];
    if (unique.some(i => !(i instanceof DemandInventory))) throw new IncompleteConcurrentDemandError([{ code: 'missing-scope' }], 'A producer or declared coverage inventory is required');
    if (unique.length === 1 && unique[0]!.contains(scope)) return unique[0]!;
    const combinations = new Map<number, { comboId: number; comboName?: string; members: Map<number, Set<number>> }>();
    const missing = new Set<number>();
    for (const source of [...unique.map(i => i.scope), scope]) {
      for (const id of source.missingMembers ?? []) missing.add(id);
      for (const c of source.combinations) {
        let combo = combinations.get(c.comboId);
        if (!combo) { combo = { comboId: c.comboId, comboName: c.comboName, members: new Map() }; combinations.set(c.comboId, combo); }
        for (const m of c.members) {
          const ts = combo.members.get(m.elementId) ?? new Set<number>();
          for (const t of m.stationTs) ts.add(t);
          combo.members.set(m.elementId, ts);
        }
      }
    }
    return DemandInventory.declare({ combinations: [...combinations.values()].map(c => ({ comboId: c.comboId, comboName: c.comboName,
      members: [...c.members].map(([elementId, ts]) => ({ elementId, stationTs: [...ts] })) })), missingMembers: [...missing] });
  }

  private contains(b: DemandScope): boolean {
    return (b.missingMembers ?? []).every(id => this.scope.missingMembers?.includes(id)) && b.combinations.every(c => {
      const members = this.#cells.get(c.comboId);
      return members !== undefined && c.members.every(m => { const ts = members.get(m.elementId); return ts !== undefined && m.stationTs.every(t => ts.has(t)); });
    });
  }
}

export function requireDemandInventories(demands: readonly { readonly inventory?: DemandInventory }[], elementId?: number): void {
  if (demands.some(d => !(d.inventory instanceof DemandInventory))) throw new IncompleteConcurrentDemandError([
    elementId === undefined ? { code: 'missing-scope' } : { code: 'missing-scope', elementId },
  ], 'A producer or declared coverage inventory is required');
}

export class CompleteDemandSet<T extends ScopedDemand> {
  readonly #complete = true;
  #validated: boolean;
  private constructor(private readonly rows: readonly T[], readonly inventory: DemandInventory, private readonly memberIds: readonly number[] | undefined, validated: boolean) {
    this.#validated = validated;
    Object.freeze(this);
  }

  assertComplete(): void {
    if (this.#validated) return;
    CompleteDemandSet.require(this.inventory, this.rows, undefined, this.memberIds);
    this.#validated = true;
  }

  forMembers(ids: readonly number[]): CompleteDemandSet<T> {
    const selected = new Set(ids);
    return CompleteDemandSet.require(this.inventory, this.rows.filter(row => selected.has(row.elementId)), undefined, ids);
  }

  get values(): readonly T[] {
    if (!this.#complete) throw new TypeError('Complete concurrent demand required');
    return this.rows;
  }

  map<U extends object>(project: (row: T) => U): CompleteDemandSet<U & ScopedDemand> {
    return new CompleteDemandSet(Object.freeze(this.rows.map(row => Object.freeze({ ...project(row),
      elementId: row.elementId, comboId: row.comboId, stationT: row.stationT, inventory: this.inventory }))), this.inventory, this.memberIds, this.#validated);
  }

  prepend(rows: readonly T[]): CompleteDemandSet<T> {
    return new CompleteDemandSet(Object.freeze([...rows.map(row => Object.freeze({ ...row, inventory: this.inventory })), ...this.rows]), this.inventory, this.memberIds, this.#validated);
  }

  partition<K>(key: (row: T) => K): ReadonlyMap<K, CompleteDemandSet<T>> {
    const groups = new Map<K, T[]>();
    for (const row of this.rows) {
      const k = key(row), list = groups.get(k) ?? [];
      list.push(row); groups.set(k, list);
    }
    return new Map([...groups].map(([k, rows]) => [k, new CompleteDemandSet(Object.freeze(rows), this.inventory, this.memberIds, this.#validated && rows.length === this.rows.length)]));
  }

  static require<T extends ScopedDemand>(scope: DemandScope | DemandInventory, rows: readonly T[], availableCombinationIds?: readonly number[], memberIds?: readonly number[]): CompleteDemandSet<T> {
    const inventory = DemandInventory.include(scope instanceof DemandInventory ? scope.scope : scope,
      [...(scope instanceof DemandInventory ? [scope] : []), ...rows.flatMap(row => row.inventory ? [row.inventory] : [])]);
    const required = memberIds === undefined ? inventory.scope : inventory.scopeForMembers(memberIds);
    const diagnostics: IncompleteDemandDiagnostic[] = [];
    const snapshot = Object.freeze(rows.map(row => Object.freeze({ ...row, inventory })));
    const byCombo = new Map<number, Map<number, Set<number>>>();
    for (const row of snapshot) {
      let members = byCombo.get(row.comboId);
      if (!members) { members = new Map(); byCombo.set(row.comboId, members); }
      let stations = members.get(row.elementId);
      if (!stations) { stations = new Set(); members.set(row.elementId, stations); }
      stations.add(row.stationT);
    }
    for (const elementId of required.missingMembers ?? []) diagnostics.push({ code: 'missing-scope', elementId });
    const available = new Set(availableCombinationIds ?? byCombo.keys());
    for (const combo of required.combinations) {
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
    return new CompleteDemandSet(snapshot, inventory, memberIds === undefined ? undefined : Object.freeze([...memberIds]), true);
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
