import { setColumnCapacityKernelEnabled } from '../src/lib/engine/column-capacity-kernel';
// Isolated production-browser comparison; section preparation is inside the measurement.
import { initSolver } from '../src/lib/engine/wasm-solver';
import { prepareColumnCapacity, setColumnCapacityReuse, type ColumnCapacitySection, type BarInstance } from '../src/lib/engine/station-design-forces';

const sections: ColumnCapacitySection[] = Array.from({ length: 24 }, (_, i) => {
  const b = 0.3 + (i % 4) * 0.1, h = 0.4 + (i % 3) * 0.1;
  const count = 4 + 2 * (i % 5);
  const bars: BarInstance[] = Array.from({ length: count }, (_, j) => ({
    face: j < count / 2 ? 'bottom' : 'top', row: 0, index: j, diameter: 20,
    x: 0.045 + (j % (count / 2)) * (b - 0.09) / (count / 2 - 1), y: j < count / 2 ? 0.045 : h - 0.045,
  }));
  return { b, h, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, AsProv_cm2: count * 3.14, bars };
});
export async function benchmark() {
  await initSolver();
  const modes = ['reference', 'cached-ts', 'batched-rust'] as const;
  const rows = [];
  try {
    for (const distinct of [false, true]) {
      const times = Object.fromEntries(modes.map(mode => [mode, [] as number[]])) as Record<typeof modes[number], number[]>;
      let reference = '';
      for (let round = 0; round < 12; round++) {
        const order = [...modes.slice(round % modes.length), ...modes.slice(0, round % modes.length)];
        for (const mode of order) {
          setColumnCapacityReuse(mode !== 'reference');
          setColumnCapacityKernelEnabled(mode === 'batched-rust');
          const start = performance.now(), outputs = [];
          for (const section of sections) {
            const axialLoads = Array.from({ length: 7 * 21 }, (_, i) => -300 + Math.floor(i / 21) * 200 + (distinct ? (i % 21) * 2.73 : 0));
            const capacity = prepareColumnCapacity(section, { axialLoads: { z: axialLoads, y: axialLoads } });
            for (let combo = 0; combo < 7; combo++) for (let station = 0; station < 21; station++) {
              const Nu = -300 + combo * 200 + (distinct ? station * 2.73 : 0);
              outputs.push(capacity.biaxial(Nu, station * 2, station * 3));
            }
          }
          const elapsed = performance.now() - start;
          const serialized = JSON.stringify(outputs);
          if (round === 0 && mode === 'reference') reference = serialized;
          if (serialized !== reference) throw new Error(`Column capacity mismatch: ${mode}`);
          if (round >= 4) times[mode].push(elapsed);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      const medians = Object.fromEntries(modes.map(mode => [mode, [...times[mode]].sort((a, b) => a - b)[Math.floor(times[mode].length / 2)]]));
      rows.push({ name: distinct ? 'distinct-axial-loads' : 'repeated-axial-loads', sections: sections.length,
        biaxialChecks: sections.length * 7 * 21, medians, times, equivalent: true });
    }
    return rows;
  } finally { setColumnCapacityReuse(true); setColumnCapacityKernelEnabled(true); }
}
