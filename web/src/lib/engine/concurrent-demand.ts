import { CompleteDemandSet, demandCoverage, memberDemandScope, IncompleteConcurrentDemandError, DemandInventory, type DemandCoverage, type ScopedDemand } from './complete-demand-set';
import type { ElementStationResult } from './station-design-forces';
import type { StationForces } from './station-forces';
import type { AnalysisResults3D } from './types-3d';

type ScalarFields<T> = { [K in keyof T]-?: T[K] extends number | string | boolean | undefined | DemandInventory ? true : never };
function scalarKeys<T extends object>(fields: ScalarFields<T>): readonly (keyof T)[] { return Object.freeze(Object.keys(fields) as (keyof T)[]); }
function readScalars<T extends object, K extends keyof T>(source: T, keys: readonly K[], state?: unknown[]): Pick<T, K> {
  const copied = {} as { -readonly [P in K]: T[P] };
  for (const key of keys) { const value = source[key]; copied[key] = value; state?.push(value); }
  return copied;
}
const forceFields = scalarKeys<StationForces>({ t: true, x: true, n: true, my: true, mz: true, vy: true, vz: true, torsion: true });
const resultFields = scalarKeys<Omit<ElementStationResult, 'stationTs' | 'expectedCombinationIds' | 'comboResults'>>({ inventory: true, elementId: true, length: true });
type ComboStations = ElementStationResult['comboResults'][number];
const comboFields = scalarKeys<Omit<ComboStations, 'stations' | 'transverseLoading'>>({ comboId: true, comboName: true });
const loadingFields = scalarKeys<NonNullable<ComboStations['transverseLoading']>>({ My: true, Mz: true });

interface ConcurrentTuple {
  readonly elementId?: number;
  readonly inventory?: DemandInventory;
  readonly comboId: number;
  readonly comboName: string;
  readonly forces: Readonly<StationForces>;
  readonly coverage?: DemandCoverage;
  readonly transverseLoading?: Readonly<{ My?: boolean; Mz?: boolean }>;
}

function captureTuple(tuple: ConcurrentTuple): ConcurrentTuple {
  const loading = tuple.transverseLoading;
  return Object.freeze({ elementId: tuple.elementId, comboId: tuple.comboId, comboName: tuple.comboName,
    inventory: tuple.inventory, coverage: tuple.coverage,
    forces: Object.freeze(readScalars(tuple.forces, forceFields)),
    transverseLoading: loading === undefined ? undefined : Object.freeze(readScalars(loading, loadingFields)),
  });
}

export class ConcurrentDemand {
  static readonly #stationCache = new WeakMap<ElementStationResult, { state: readonly unknown[]; complete: ReturnType<typeof ConcurrentDemand.completeCoveredTuples> }>();
  readonly #concurrent = true;
  readonly #complete: CompleteDemandSet<ScopedDemand>;
  readonly #coverage: DemandCoverage;
  readonly #elementId: number;
  private constructor(
    complete: CompleteDemandSet<ScopedDemand>,
    readonly comboId: number,
    elementId: number,
    coverage: DemandCoverage,
    readonly comboName: string,
    readonly forces: Readonly<StationForces>,
    readonly transverseLoading: Readonly<{ My?: boolean; Mz?: boolean }>,
    readonly ends: Readonly<{ my: readonly [number, number]; mz: readonly [number, number] }>,
  ) {
    if (!complete.values.length) throw new TypeError('Complete concurrent demand required');
    this.#complete = complete;
    this.#elementId = elementId;
    this.#coverage = coverage;
    Object.freeze(this);
  }

  get elementId(): number { return this.#elementId; }

  get inventory(): DemandInventory { return this.#complete.inventory; }

  get coverage(): DemandCoverage { return this.#coverage; }

  get n(): number { return this.forces.n; }
  get my(): number { return this.forces.my; }
  get mz(): number { return this.forces.mz; }
  get vy(): number { return this.forces.vy; }
  get vz(): number { return this.forces.vz; }
  get tq(): number { return this.forces.torsion; }
  get stationT(): number { return this.forces.t; }
  get stationX(): number { return this.forces.x; }

  static fromStations(result: ElementStationResult): ConcurrentDemand[] {
    return ConcurrentDemand.completeStations(result).values.map(row => row.demand);
  }

  static completeStations(result: ElementStationResult) {
    const state: unknown[] = [];
    const metadata = readScalars(result, resultFields, state);
    const expected = result.expectedCombinationIds;
    const expectedCombinationIds = expected === undefined ? undefined : [...expected];
    const stationTs = [...(result.stationTs ?? [])];
    const groups = [...result.comboResults];
    state.push(expectedCombinationIds?.length, ...(expectedCombinationIds ?? []), stationTs.length, ...stationTs, groups.length);
    const comboResults = groups.map(combo => {
      const comboMetadata = readScalars(combo, comboFields, state);
      const loading = combo.transverseLoading;
      state.push(loading !== undefined);
      const transverseLoading = loading === undefined ? undefined : readScalars(loading, loadingFields, state);
      const stations = [...combo.stations];
      state.push(stations.length);
      return { ...comboMetadata, transverseLoading, stations: stations.map(forces => readScalars(forces, forceFields, state)) };
    });
    const snapshot: ElementStationResult = { ...metadata, expectedCombinationIds, stationTs, comboResults };
    const previous = ConcurrentDemand.#stationCache.get(result);
    if (previous?.state.length === state.length && state.every((value, index) => Object.is(value, previous.state[index]))) return previous.complete;
    const tuples = snapshot.comboResults.flatMap(c => c.stations.map(forces => ({
      comboId: c.comboId, comboName: c.comboName, forces, transverseLoading: c.transverseLoading,
    })));
    const complete = ConcurrentDemand.completeCoveredTuples(tuples, ConcurrentDemand.stationCoverage(snapshot), snapshot.elementId, snapshot.inventory);
    ConcurrentDemand.#stationCache.set(result, { state: Object.freeze(state), complete });
    return complete;
  }

  static inventoryForStations(results: readonly ElementStationResult[]): DemandInventory {
    return DemandInventory.declare(memberDemandScope(results.map(result => ({ elementId: result.elementId, ...ConcurrentDemand.stationCoverage(result) }))));
  }

  private static stationCoverage(result: ElementStationResult): DemandCoverage {
    return demandCoverage({ combinationIds: [...(result.expectedCombinationIds ?? []), ...result.comboResults.map(c => c.comboId)],
      combinations: result.comboResults.map(c => ({ comboId: c.comboId, comboName: c.comboName })), stationTs: result.stationTs },
    result.comboResults.flatMap(c => c.stations.map(forces => ({ comboId: c.comboId, forces }))));
  }

  static fromTuples(source: readonly ConcurrentTuple[], declared?: DemandCoverage): ConcurrentDemand[] {
    const tuples = source.map(captureTuple);
    ConcurrentDemand.requireInventory(tuples, declared);
    const elementIds = [...new Set(tuples.map(t => t.elementId ?? 0))];
    const inherited = tuples.length > 0 && tuples.every(t => t.inventory ?? t.coverage?.inventory);
    if (!inherited && !declared?.inventory && elementIds.length > 1) throw new IncompleteConcurrentDemandError([{ code: 'missing-scope' }], 'A declared member inventory is required for multi-member tuples');
    const coverages = new Map((elementIds.length ? elementIds : [0]).map(elementId => [elementId,
      demandCoverage(declared ?? {}, tuples.filter(t => (t.elementId ?? 0) === elementId))]));
    const scope = memberDemandScope([...coverages].map(([elementId, coverage]) => ({ elementId, ...coverage })));
    const complete = CompleteDemandSet.require(scope,
      tuples.map(tuple => ({ elementId: tuple.elementId ?? 0, comboId: tuple.comboId, stationT: tuple.forces.t, tuple,
        coverage: coverages.get(tuple.elementId ?? 0)!, inventory: tuple.inventory ?? tuple.coverage?.inventory ?? declared?.inventory })));
    return ConcurrentDemand.convertCompleteTuples(complete).values.map(row => row.demand);
  }

  private static requireInventory(tuples: readonly ConcurrentTuple[], declared?: DemandCoverage): void {
    if (!declared && (!tuples.length || tuples.some(t => !t.inventory && !t.coverage))) {
      throw new IncompleteConcurrentDemandError([{ code: 'missing-scope' }], 'A declared coverage inventory is required for raw tuples');
    }
  }

  static fromMemberTuples(source: readonly ConcurrentTuple[], elementId: number, declared?: DemandCoverage): ConcurrentDemand[] {
    const tuples = source.map(captureTuple);
    ConcurrentDemand.requireInventory(tuples, declared);
    return ConcurrentDemand.completeCoveredTuples(tuples, demandCoverage(declared ?? {}, tuples), elementId, declared?.inventory).values.map(r => r.demand);
  }

  private static completeCoveredTuples(source: readonly ConcurrentTuple[], coverage: DemandCoverage, elementId: number, inventory?: DemandInventory) {
    const tuples = source.map(captureTuple);
    const complete = CompleteDemandSet.require(memberDemandScope([{ elementId, ...coverage }]),
      tuples.map(tuple => ({ elementId, comboId: tuple.comboId, stationT: tuple.forces.t, tuple, coverage, inventory: inventory ?? tuple.inventory ?? tuple.coverage?.inventory })), undefined, [elementId]);
    return ConcurrentDemand.convertCompleteTuples(complete);
  }

  static fromCompleteTuples<T extends ScopedDemand & { readonly tuple: ConcurrentTuple; readonly coverage: DemandCoverage }>(complete: CompleteDemandSet<T>) {
    return ConcurrentDemand.convertCompleteTuples(complete);
  }

  private static convertCompleteTuples<T extends ScopedDemand & { readonly tuple: ConcurrentTuple; readonly coverage: DemandCoverage }>(complete: CompleteDemandSet<T>) {
    complete.assertComplete();
    const captured = new Map<T, ConcurrentTuple>();
    for (const row of complete.values) {
      const tuple = captureTuple(row.tuple);
      if (tuple.comboId !== row.comboId) throw new IncompleteConcurrentDemandError([{ code: 'missing-combination', comboId: row.comboId }]);
      if (tuple.forces.t !== row.stationT) throw new IncompleteConcurrentDemandError([{ code: 'missing-station', elementId: row.elementId, comboId: row.comboId, stationT: row.stationT }]);
      captured.set(row, tuple);
    }
    const ends = new Map<string, ConcurrentDemand['ends']>();
    const key = (row: ScopedDemand) => `${row.elementId}|${row.comboId}`;
    for (const [k, group] of complete.partition(key)) {
      const ordered = [...group.values].sort((a, b) => a.stationT - b.stationT);
      const first = captured.get(ordered[0]!)!.forces, last = captured.get(ordered[ordered.length - 1]!)!.forces;
      ends.set(k, Object.freeze({ my: Object.freeze([first.my, last.my] as [number, number]), mz: Object.freeze([first.mz, last.mz] as [number, number]) }));
    }
    return complete.map(row => {
      const tuple = captured.get(row)!;
      const coverage = complete.inventory.coverageForMember(row.elementId);
      return { ...row, demand: new ConcurrentDemand(complete, row.comboId, row.elementId, coverage, tuple.comboName,
        Object.freeze({ ...tuple.forces }), Object.freeze({ ...tuple.transverseLoading }), ends.get(key(row))!) };
    });
  }

  static loadingOf(ef: AnalysisResults3D['elementForces'][number] | undefined): Readonly<{ My?: boolean; Mz?: boolean }> {
    const axis = (direction: 'Y' | 'Z'): boolean | undefined => {
      if (!ef) return undefined;
      const qi = direction === 'Y' ? ef.qYI : ef.qZI, qj = direction === 'Y' ? ef.qYJ : ef.qZJ;
      const distributed = direction === 'Y' ? ef.distributedLoadsY : ef.distributedLoadsZ;
      const points = direction === 'Y' ? ef.pointLoadsY : ef.pointLoadsZ;
      if (qi !== undefined && qi !== 0 || qj !== undefined && qj !== 0
        || distributed?.some(q => q.qI !== 0 || q.qJ !== 0) || points?.some(p => p.a > 0 && p.a < ef.length && p.p !== 0)) return true;
      return qi === 0 && qj === 0 && distributed && points ? false : undefined;
    };
    return Object.freeze({ My: axis('Z'), Mz: axis('Y') });
  }

  static endpoints(ef: AnalysisResults3D['elementForces'][number]): ConcurrentDemand[] {
    return ConcurrentDemand.fromStations({ elementId: ef.elementId, length: ef.length, stationTs: [0, 1], comboResults: [{
      comboId: 0, comboName: '', transverseLoading: ConcurrentDemand.loadingOf(ef), stations: ([0, 1] as const).map(t => ({
        t, x: t * ef.length, n: t ? ef.nEnd : ef.nStart,
        my: t ? ef.myEnd : ef.myStart, mz: t ? ef.mzEnd : ef.mzStart,
        vy: t ? ef.vyEnd : ef.vyStart, vz: t ? ef.vzEnd : ef.vzStart,
        torsion: t ? ef.mxEnd : ef.mxStart,
      })),
    }] });
  }

  interpolate(other: ConcurrentDemand, t: number): ConcurrentDemand {
    if (this.comboId !== other.comboId) throw new Error('Concurrent interpolation requires one combination');
    const span = other.stationT - this.stationT;
    const w = span > 1e-9 ? (t - this.stationT) / span : 0;
    const lerp = (key: 'n' | 'my' | 'mz' | 'vy' | 'vz' | 'torsion' | 'x') => this.forces[key] + (other.forces[key] - this.forces[key]) * w;
    return new ConcurrentDemand(this.#complete, this.comboId, this.elementId, this.coverage, this.comboName, Object.freeze({ t, x: lerp('x'), n: lerp('n'),
      my: lerp('my'), mz: lerp('mz'), vy: lerp('vy'), vz: lerp('vz'), torsion: lerp('torsion') }), this.transverseLoading, this.ends);
  }

  withAxial(n: number): ConcurrentDemand {
    if (!this.#concurrent) throw new Error('Concurrent demand required');
    return new ConcurrentDemand(this.#complete, this.comboId, this.elementId, this.coverage, this.comboName, Object.freeze({ ...this.forces, n }), this.transverseLoading, this.ends);
  }

  section(axis: 'My' | 'Mz'): ConcurrentSectionDemand {
    if (!this.#concurrent) throw new Error('Concurrent demand required');
    return ConcurrentSectionDemand.at(this, axis);
  }
}

export class ConcurrentSectionDemand {
  readonly #concurrent = true;
  private constructor(readonly source: ConcurrentDemand, readonly axis: 'My' | 'Mz', readonly Mu: number, readonly Muy: number) { Object.freeze(this); }
  static at(source: ConcurrentDemand, axis: 'My' | 'Mz'): ConcurrentSectionDemand {
    return new ConcurrentSectionDemand(source, axis, Math.abs(axis === 'My' ? source.forces.my : source.forces.mz), Math.abs(axis === 'My' ? source.forces.mz : source.forces.my));
  }
  get signedMu(): number { return this.axis === 'My' ? this.source.forces.my : this.source.forces.mz; }
  get Nu(): number { return 0 - this.source.forces.n; }
  get Vu(): number { return Math.abs(this.axis === 'My' ? this.source.forces.vz : this.source.forces.vy); }
  get VuSecondary(): number { return Math.abs(this.axis === 'My' ? this.source.forces.vy : this.source.forces.vz); }
  get Tu(): number { return Math.abs(this.source.forces.torsion); }
  amplified(Mu: number, Muy: number): ConcurrentSectionDemand {
    if (!this.#concurrent) throw new Error('Concurrent demand required');
    return new ConcurrentSectionDemand(this.source, this.axis, Mu, Muy);
  }
}
