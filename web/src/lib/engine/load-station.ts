import { cubicOnInterval, polynomialDerivative, polynomialRootCandidates } from './polynomial-stations';
export function adjacentStation(t: number, step: bigint): number {
  const bits = new DataView(new ArrayBuffer(8));
  bits.setFloat64(0, t);
  bits.setBigUint64(0, bits.getBigUint64(0) + step);
  return bits.getFloat64(0);
}

export function parentStations(length: number, x0: number, x1: number, stations: number[]): number[] {
  const width = Math.max(x1 - x0, 1e-12);
  const positions = new Set<number>();
  for (const u of stations) {
    const t = (x0 + u * (x1 - x0)) / length;
    positions.add(t);
    const local = (v: number) => (v * length - x0) / width;
    for (const step of [-1n, 1n]) {
      if (step < 0n ? t <= 0 : t >= 1) continue;
      let v = adjacentStation(t, step);
      while (v > 0 && v < 1 && (step < 0n ? local(v) >= u : local(v) <= u)) v = adjacentStation(v, step);
      if (step < 0n ? !(local(v) < u) : !(local(v) > u)) throw new Error('Cannot bracket member diagram station in parent coordinates');
      positions.add(v);
    }
  }
  return [...positions];
}

export function loadPrecedesStation(a: number, length: number, t: number): boolean {
  return a / length < t;
}

export function concentratedLoadStations(length: number, loads: Iterable<{ a: number }>): number[] {
  const positions = new Set(Array.from({ length: 21 }, (_, i) => i / 20));
  for (const { a } of loads) {
    const t = a / length;
    if (t > 0) positions.add(adjacentStation(t, -1n));
    positions.add(t);
    if (t < 1) positions.add(adjacentStation(t, 1n));
  }
  return [...positions].sort((a, b) => a - b);
}

export function diagramStations(length: number, loads: Iterable<{ a: number }>, boundaries: Iterable<number>, evaluate: (t: number) => number): number[] {
  const cuts = [...new Set([0, 1, ...Array.from(loads, p => p.a / length), ...Array.from(boundaries, x => x / length)])].filter(t => Number.isFinite(t) && t >= 0 && t <= 1).sort((a, b) => a - b);
  const positions = new Set(concentratedLoadStations(length, cuts.map(t => ({ a: t * length }))));
  for (const t of cuts) positions.add(t);
  for (let k = 0; k + 1 < cuts.length; k++) {
    const lo = cuts[k]!, hi = cuts[k + 1]!, width = hi - lo;
    if (!(width > 0)) continue;
    const roots = polynomialRootCandidates(polynomialDerivative(cubicOnInterval(evaluate, lo, hi)));
    for (const root of roots) if (root > 0 && root < 1) positions.add(lo + width * root);
  }
  return [...positions].sort((a, b) => a - b);
}
