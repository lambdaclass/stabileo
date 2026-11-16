export function loadPrecedesStation(a: number, length: number, t: number): boolean {
  return a / length < t;
}

export function concentratedLoadStations(length: number, loads: Iterable<{ a: number }>): number[] {
  const positions = new Set(Array.from({ length: 21 }, (_, i) => i / 20));
  const bits = new DataView(new ArrayBuffer(8));
  const adjacent = (t: number, step: bigint) => {
    bits.setFloat64(0, t);
    bits.setBigUint64(0, bits.getBigUint64(0) + step);
    return bits.getFloat64(0);
  };
  for (const { a } of loads) {
    const t = a / length;
    if (t > 0) positions.add(adjacent(t, -1n));
    positions.add(t);
    if (t < 1) positions.add(adjacent(t, 1n));
  }
  return [...positions].sort((a, b) => a - b);
}
