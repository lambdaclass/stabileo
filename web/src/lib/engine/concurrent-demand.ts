import type { ElementStationResult } from './station-design-forces';
import type { StationForces } from './station-forces';
import type { AnalysisResults3D } from './types-3d';

export class ConcurrentDemand {
  readonly #concurrent = true;
  private constructor(
    readonly comboId: number,
    readonly comboName: string,
    readonly forces: Readonly<StationForces>,
    readonly ends: Readonly<{ my: readonly [number, number]; mz: readonly [number, number] }>,
  ) { Object.freeze(this); }

  get n(): number { return this.forces.n; }
  get my(): number { return this.forces.my; }
  get mz(): number { return this.forces.mz; }
  get vy(): number { return this.forces.vy; }
  get vz(): number { return this.forces.vz; }
  get tq(): number { return this.forces.torsion; }
  get stationT(): number { return this.forces.t; }
  get stationX(): number { return this.forces.x; }

  static fromStations(result: ElementStationResult): ConcurrentDemand[] {
    return result.comboResults.flatMap(c => {
      if (!c.stations.length) return [];
      const ordered = [...c.stations].sort((a, b) => a.t - b.t);
      const first = ordered[0]!, last = ordered[ordered.length - 1]!;
      const ends = Object.freeze({ my: Object.freeze([first.my, last.my] as [number, number]), mz: Object.freeze([first.mz, last.mz] as [number, number]) });
      return c.stations.map(s => new ConcurrentDemand(c.comboId, c.comboName, Object.freeze({ ...s }), ends));
    });
  }

  static fromTuples(tuples: readonly { comboId: number; comboName: string; forces: Readonly<StationForces> }[]): ConcurrentDemand[] {
    const combos = new Map<number, { comboId: number; comboName: string; stations: StationForces[] }>();
    for (const t of tuples) {
      let c = combos.get(t.comboId);
      if (!c) { c = { comboId: t.comboId, comboName: t.comboName, stations: [] }; combos.set(t.comboId, c); }
      c.stations.push({ ...t.forces });
    }
    const ends = new Map(ConcurrentDemand.fromStations({ elementId: 0, length: 0, stationTs: [], comboResults: [...combos.values()] }).map(d => [d.comboId, d.ends]));
    return tuples.map(t => new ConcurrentDemand(t.comboId, t.comboName, Object.freeze({ ...t.forces }), ends.get(t.comboId)!));
  }

  static endpoints(ef: AnalysisResults3D['elementForces'][number]): ConcurrentDemand[] {
    return ConcurrentDemand.fromStations({ elementId: ef.elementId, length: ef.length, stationTs: [0, 1], comboResults: [{
      comboId: 0, comboName: '', stations: ([0, 1] as const).map(t => ({
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
    return new ConcurrentDemand(this.comboId, this.comboName, Object.freeze({ t, x: lerp('x'), n: lerp('n'),
      my: lerp('my'), mz: lerp('mz'), vy: lerp('vy'), vz: lerp('vz'), torsion: lerp('torsion') }), this.ends);
  }

  withAxial(n: number): ConcurrentDemand {
    if (!this.#concurrent) throw new Error('Concurrent demand required');
    return new ConcurrentDemand(this.comboId, this.comboName, Object.freeze({ ...this.forces, n }), this.ends);
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
