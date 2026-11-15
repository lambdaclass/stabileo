import { CompleteDemandSet, demandCoverage, memberDemandScope, type DemandCoverage, type ScopedDemand } from './complete-demand-set';
import type { ElementStationResult } from './station-design-forces';
import type { StationForces } from './station-forces';
import type { AnalysisResults3D } from './types-3d';

interface ConcurrentTuple {
  readonly comboId: number;
  readonly comboName: string;
  readonly forces: Readonly<StationForces>;
  readonly coverage?: DemandCoverage;
  readonly transverseLoading?: Readonly<{ My?: boolean; Mz?: boolean }>;
}

export class ConcurrentDemand {
  readonly #concurrent = true;
  readonly #complete: CompleteDemandSet<ScopedDemand>;
  readonly #coverage: DemandCoverage;
  private constructor(
    complete: CompleteDemandSet<ScopedDemand>,
    readonly comboId: number,
    coverage: DemandCoverage,
    readonly comboName: string,
    readonly forces: Readonly<StationForces>,
    readonly transverseLoading: Readonly<{ My?: boolean; Mz?: boolean }>,
    readonly ends: Readonly<{ my: readonly [number, number]; mz: readonly [number, number] }>,
  ) {
    if (!complete.values.length) throw new TypeError('Complete concurrent demand required');
    this.#complete = complete;
    this.#coverage = coverage;
    Object.freeze(this);
  }

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
    const tuples = result.comboResults.flatMap(c => c.stations.map(forces => ({
      comboId: c.comboId, comboName: c.comboName, forces, transverseLoading: c.transverseLoading,
    })));
    const coverage = demandCoverage({ combinationIds: [...(result.expectedCombinationIds ?? []), ...result.comboResults.map(c => c.comboId)],
      combinations: result.comboResults.map(c => ({ comboId: c.comboId, comboName: c.comboName })), stationTs: result.stationTs }, tuples);
    return ConcurrentDemand.completeCoveredTuples(tuples, coverage, result.elementId);
  }

  static fromTuples(tuples: readonly ConcurrentTuple[], declared?: DemandCoverage): ConcurrentDemand[] {
    if (!tuples.length && !declared) return [];
    const coverage = demandCoverage(declared ?? {}, tuples);
    const independent = declared === undefined && tuples.every(t => t.coverage === undefined);
    return ConcurrentDemand.completeCoveredTuples(tuples, coverage, 0, independent).values.map(row => row.demand);
  }

  private static completeCoveredTuples(tuples: readonly ConcurrentTuple[], coverage: DemandCoverage, elementId: number, independent = false) {
    const complete = CompleteDemandSet.require(memberDemandScope([{ elementId, ...coverage }]),
      tuples.map(tuple => ({ elementId, comboId: tuple.comboId, stationT: tuple.forces.t, tuple, coverage })));
    return ConcurrentDemand.convertCompleteTuples(complete, independent);
  }

  static fromCompleteTuples<T extends ScopedDemand & { readonly tuple: ConcurrentTuple; readonly coverage: DemandCoverage }>(complete: CompleteDemandSet<T>) {
    return ConcurrentDemand.convertCompleteTuples(complete);
  }

  private static convertCompleteTuples<T extends ScopedDemand & { readonly tuple: ConcurrentTuple; readonly coverage: DemandCoverage }>(complete: CompleteDemandSet<T>, independent = false) {
    const ends = new Map<string, ConcurrentDemand['ends']>();
    const coverages = new Map<string, DemandCoverage>();
    const key = (row: ScopedDemand) => `${row.elementId}|${row.comboId}`;
    for (const [k, group] of complete.partition(key)) {
      const ordered = [...group.values].sort((a, b) => a.stationT - b.stationT);
      const first = ordered[0]!.tuple.forces, last = ordered[ordered.length - 1]!.tuple.forces;
      ends.set(k, Object.freeze({ my: Object.freeze([first.my, last.my] as [number, number]), mz: Object.freeze([first.mz, last.mz] as [number, number]) }));
      coverages.set(k, independent ? demandCoverage({ combinationIds: [ordered[0]!.comboId] }, ordered.map(r => r.tuple)) : ordered[0]!.coverage);
    }
    return complete.map(row => ({ ...row, demand: new ConcurrentDemand(complete, row.comboId, coverages.get(key(row))!, row.tuple.comboName,
      Object.freeze({ ...row.tuple.forces }), Object.freeze({ ...row.tuple.transverseLoading }), ends.get(key(row))!) }));
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
    return new ConcurrentDemand(this.#complete, this.comboId, this.coverage, this.comboName, Object.freeze({ t, x: lerp('x'), n: lerp('n'),
      my: lerp('my'), mz: lerp('mz'), vy: lerp('vy'), vz: lerp('vz'), torsion: lerp('torsion') }), this.transverseLoading, this.ends);
  }

  withAxial(n: number): ConcurrentDemand {
    if (!this.#concurrent) throw new Error('Concurrent demand required');
    return new ConcurrentDemand(this.#complete, this.comboId, this.coverage, this.comboName, Object.freeze({ ...this.forces, n }), this.transverseLoading, this.ends);
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
