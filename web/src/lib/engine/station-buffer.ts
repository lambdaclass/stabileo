import type { ElementStationResult } from './station-design-forces';

/** Decode the versioned numeric station buffer into the existing verification shape. */
export function decodeStationBuffer(buffer: Float64Array, comboNames: ReadonlyMap<number, string>): ElementStationResult[] {
  let cursor = 0;
  const read = () => {
    if (cursor >= buffer.length) throw new Error('Truncated station force buffer');
    return buffer[cursor++];
  };
  const count = () => {
    const value = read();
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid station buffer count');
    return value;
  };
  if (read() !== 1) throw new Error('Unsupported station force buffer version');
  const members = count(), stations = count();
  if (stations < 2) throw new Error('Invalid station count');
  const results: ElementStationResult[] = [];
  for (let member = 0; member < members; member++) {
    const elementId = read(), length = read(), combos = count();
    const stationTs = Array.from({ length: stations }, (_, i) => i / (stations - 1));
    const comboResults: ElementStationResult['comboResults'] = [];
    for (let combo = 0; combo < combos; combo++) {
      const comboId = read();
      const forces = stationTs.map(t => ({ x: t * length, t,
        n: read(), vy: read(), vz: read(), my: read(), mz: read(), torsion: read() }));
      comboResults.push({ comboId, comboName: comboNames.get(comboId) ?? `Combo ${comboId}`, stations: forces });
    }
    results.push({ elementId, length, stationTs, comboResults });
  }
  if (cursor !== buffer.length) throw new Error('Trailing station force buffer data');
  return results;
}
