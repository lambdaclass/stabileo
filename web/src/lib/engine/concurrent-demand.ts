import { CompleteDemandSet, demandCoverage, type DemandCoverage, type ScopedDemand } from './complete-demand-set';
import type { ElementStationResult } from './station-design-forces';
import type { StationForces } from './station-forces';
import type { AnalysisResults3D } from './types-3d';

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
    const combinations = new Map(result.comboResults.map(c => [c.comboId, { comboId: c.comboId, comboName: c.comboName }]));
    for (const comboId of result.expectedCombinationIds ?? []) if (!combinations.has(comboId)) combinations.set(comboId, { comboId, comboName: '' });
    const coverage = Object.freeze({ combinations: Object.freeze([...combinations.values()].map(c => Object.freeze(c))),
      combinationIds: Object.freeze([...combinations.keys()]), stationTs: Object.freeze([...result.stationTs]) });
    const complete = CompleteDemandSet.require({ combinations: coverage.combinations, members: [{ elementId: result.elementId, stationTs: result.stationTs }] },
      result.comboResults.flatMap(c => c.stations.map(s => ({ elementId: result.elementId, comboId: c.comboId, stationT: s.t }))));
    return result.comboResults.flatMap(c => {
      const ordered = [...c.stations].sort((a, b) => a.t - b.t);
      const first = ordered[0]!, last = ordered[ordered.length - 1]!;
      const ends = Object.freeze({ my: Object.freeze([first.my, last.my] as [number, number]), mz: Object.freeze([first.mz, last.mz] as [number, number]) });
      return c.stations.map(s => new ConcurrentDemand(complete, c.comboId, coverage, c.comboName, Object.freeze({ ...s }), Object.freeze({ ...c.transverseLoading }), ends));
    });
  }

  static fromTuples(tuples: readonly { comboId: number; comboName: string; forces: Readonly<StationForces>; coverage?: DemandCoverage }[]): ConcurrentDemand[] {
    if (tuples.length === 0) return [];
    const combos = new Map<number, { comboId: number; comboName: string; stations: StationForces[] }>();
    for (const t of tuples) {
      let c = combos.get(t.comboId);
      if (!c) { c = { comboId: t.comboId, comboName: t.comboName, stations: [] }; combos.set(t.comboId, c); }
      c.stations.push({ ...t.forces });
    }
    const declared = demandCoverage({}, tuples);
    const stationTs = declared.stationTs.length ? [...declared.stationTs] : [...new Set(tuples.map(t => t.forces.t))];
    const sources = ConcurrentDemand.fromStations({ elementId: 0, length: 0, expectedCombinationIds: declared.combinationIds, stationTs, comboResults: [...combos.values()] });
    const ends = new Map(sources.map(d => [d.comboId, d.ends]));
    const coverage = sources[0]!.coverage;
    return tuples.map(t => new ConcurrentDemand(sources[0]!.#complete, t.comboId, coverage, t.comboName, Object.freeze({ ...t.forces }), Object.freeze({}), ends.get(t.comboId)!));
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
