import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ridgeRoofs } from './snow-surface-round3-fixture';
import { mesh } from './snow-surface-round2-fixture';
import { snow, pressure } from './snow-roof-plane-fixture';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { parseSnapshot } from '../../../../../scripts/results-snapshot/compare.mjs';

const oracleRegression = process.env.RUN_KNOWN_WRONG === '2172' ? it : it.skip;

type Load = { elementId: number; q: number; qJ?: number; a?: number; b?: number };
function stored(name: string, caseIndex: number): Load[] {
  const snapshot = parseSnapshot(readFileSync(`results-snapshots/${name}.json`, 'utf8'));
  const entries = new Map<number, Record<string, number>>();
  for (const [key, value] of Object.entries(snapshot.values)) {
    const m = new RegExp(`^generatedLoads.item${caseIndex}.distributed.item([0-9]+)\\.(\\w+)$`).exec(key);
    if (!m || typeof value !== 'number') continue;
    const row = entries.get(+m[1]!) ?? {};
    row[m[2]!] = value;
    entries.set(+m[1]!, row);
  }
  return [...entries.values()] as Load[];
}

function hipPressure(x: number, y: number, direction?: number[]) {
  const distances = [x, 8 - x, y, 12 - y], low = Math.min(...distances);
  const gradients = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const factors = distances.flatMap((d, k) => {
    if (Math.abs(d - low) > 1e-10) return [];
    if (!direction) return [1];
    const side = gradients[k]![0]! * direction[0]! + gradients[k]![1]! * direction[1]!;
    return [side === 0 ? 1 : side < 0 ? 1.5 : 0];
  });
  return factors.reduce((a, b) => a + b, 0) / factors.length;
}

oracleRegression('known wrong result: #2172 hip snapshot balanced and directional intensities approach independent physical facet integrals', () => {
  const model = ridgeRoofs('hip'), layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, layout, snow: { ...snow, partial: true }, tributaryWidth: 1 })!;
  const ps = 0.7 * (70 - Math.atan(0.5) * 180 / Math.PI) / 65;
  let maxOld = 0, maxNew = 0, worsened = 0;
  for (const [caseIndex, c] of out.cases.entries()) {
    if (c.pattern) continue;
    const dir = c.nameParams.dir;
    const direction = dir === '−X' ? [-1, 0] : dir === '+X' ? [1, 0] : dir === '−Y' ? [0, -1] : dir === '+Y' ? [0, 1] : undefined;
    const old = stored('snow-hip-facets', caseIndex);
    for (const e of model.elements.values()) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
      const horizontal = Math.hypot(b.x - a.x, b.y - a.y);
      const pieces = layout.pieces.filter(p => p.elementId === e.id);
      const candidates = [0, length, ...[...old, ...c.distributed].filter(d => d.elementId === e.id).flatMap(d => [d.a ?? 0, d.b ?? length]), ...pieces.flatMap(p => [p.a ?? 0, p.b ?? length])].sort((a, b) => a - b);
      const cuts = candidates.filter((x, k) => k === 0 || x - candidates[k - 1]! > 1e-8);
      for (let j = 1; j < cuts.length; j++) for (const t of [0.001, 0.25, 0.5, 0.75, 0.999]) {
        const station = cuts[j - 1]! + t * (cuts[j]! - cuts[j - 1]!);
        const x = a.x + (b.x - a.x) * station / length, y = a.y + (b.y - a.y) * station / length;
        let expected = layout.widthMembers.some(w => w.elementId === e.id) ? ps * hipPressure(x, y, direction) : 0;
        for (const p of pieces) {
          const lo = p.a ?? 0, hi = p.b ?? length;
          if (station <= lo || station >= hi) continue;
          const depth = p.wI + (p.wJ - p.wI) * (station - lo) / (hi - lo);
          let nx = -(b.y - a.y) / horizontal, ny = (b.x - a.x) / horizontal;
          if (nx * (4 - x) + ny * (6 - y) < 0) { nx = -nx; ny = -ny; }
          const constants = [x, 8 - x, y, 12 - y], rates = [nx, -nx, ny, -ny];
          const ds = [0, depth];
          for (let m = 0; m < 4; m++) for (let n = m + 1; n < 4; n++) {
            if (rates[m] === rates[n]) continue;
            const d = (constants[n]! - constants[m]!) / (rates[m]! - rates[n]!);
            if (d > 0 && d < depth) ds.push(d);
          }
          ds.sort((a, b) => a - b);
          for (let m = 1; m < ds.length; m++) {
            const mid = (ds[m - 1]! + ds[m]!) / 2;
            expected += ps * (ds[m]! - ds[m - 1]!) * hipPressure(x + nx * mid, y + ny * mid, direction);
          }
        }
        const current = pressure(c.distributed.map(d => ({ ...d, b: d.b ?? length })), e.id, station);
        const previous = pressure(old.map(d => ({ ...d, b: d.b ?? length })), e.id, station);
        const newError = Math.abs(current - expected), oldError = Math.abs(previous - expected);
        maxNew = Math.max(maxNew, newError); maxOld = Math.max(maxOld, oldError);
        if (newError > oldError + 1e-8) worsened++;
      }
    }
  }
  console.log('hip physical oracle', { maxOld, maxNew, worsened });
  expect(worsened).toBe(0);
  expect(maxNew).toBeLessThan(1e-8);
});

it('subdivided override snapshot retains the physical ridge discontinuity with triangular tributaries', () => {
  const model = mesh([[[0, -2, 3], ...Array.from({ length: 8 }, (_, k) => [2 * (k + 1), -2, 3]), [16, 2, 3], [0, 2, 3]]]);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, layout, snow: { ...snow, roofSlopeDeg: 20 }, tributaryWidth: 1 })!;
  const p = 1.5 * 0.7 * (70 - 20) / 65;
  let maxOld = 0, maxNew = 0;
  for (const caseIndex of [1, 2]) for (const id of [9, 11]) for (let k = 1; k < 80; k++) {
    if (k === 40) continue;
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const x = k / 20, y = a.y + (b.y - a.y) * x / 4;
    const expected = (caseIndex === 1 ? y > 0 : y < 0) ? p * (2 - Math.abs(y)) : 0;
    const actual = pressure(out.cases[caseIndex]!.distributed, id, x);
    const previous = pressure(stored('snow-subdivided-override', caseIndex), id, x);
    maxNew = Math.max(maxNew, Math.abs(actual - expected)); maxOld = Math.max(maxOld, Math.abs(previous - expected));
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(previous - expected) + 1e-8);
  }
  console.log('subdivided physical oracle', { maxOld, maxNew });
  expect(maxNew).toBeLessThan(1e-12);
});
