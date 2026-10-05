// Manual production-browser A/B benchmark. Includes packing, allocation and result decoding.
import { CollisionGeometry } from '../src/lib/wasm/dedaliano_engine.js';
import { registerCollisionKernel } from '../src/lib/engine/detailing/collision-kernel';
import { getRcSectionKernel, registerRcSectionKernel } from '../src/lib/engine/codes/argentina/rc-section-kernel';
import { initSolver } from '../src/lib/engine/wasm-solver';
import { interactionCurve, type Bar, type Outline } from '../src/lib/engine/codes/argentina/cirsoc201-section';
import { surfaceCut } from '../src/lib/engine/codes/argentina/cirsoc-flex-surface';
import { modelStore, resultsStore, uiStore } from '../src/lib/store';
import { designRunStore } from '../src/lib/store/design-run.svelte';
import { verificationStore } from '../src/lib/store/verification.svelte';
import '../src/lib/engine/design/adapters/cirsoc201-adapter';
import '../src/lib/engine/design/adapters/unsupported-adapter';
import { runCollisionBatch, type CollisionJob } from './collision-worker/protocol';

function equivalent(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= 1e-10 * Math.max(1, Math.abs(b));
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => Object.hasOwn(y, k) && equivalent(x[k], y[k]));
}
export async function benchmark() {
  await initSolver();
  const rc = getRcSectionKernel();
  if (!rc) throw new Error('Rebuild WASM with the RC kernel');
  uiStore.analysisMode = 'pro';
  await modelStore.loadExample('pro-edificio-7p');
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setCombinationResults3D(solved.perCase, solved.perCombo, solved.envelope);
  if (!designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']).ok) throw new Error('Design failed');
  const memberKinds = [...verificationStore.contexts].map(([id, ctx]) => [id, ctx.elementType]);
  const jobs: CollisionJob[] = JSON.parse(JSON.stringify(
    (modelStore.model.detailing?.assemblies ?? []).filter(a => a.bars.length).map(a => ({
      bars: a.bars, classification: { edition: '2025', maxAggregateSizeMm: 19, memberKinds },
    })),
  ));
  const bars: Bar[] = Array.from({ length: 16 }, (_, i) => ({
    x: 0.16 * Math.cos(i * Math.PI / 8), y: 0.16 * Math.sin(i * Math.PI / 8), area: 0.000314,
  }));
  const mat = { fc: 30, fy: 420 };
  const hollow: Outline = { kind: 'circle', D: 0.5, Dint: 0.2 };
  const cases = [
    { name: 'collision-seven-storey', run: () => runCollisionBatch(jobs), exact: true },
    { name: 'rc-hollow-circle-diagram', run: () => [interactionCurve(hollow, bars, mat, Math.PI/2, 160), interactionCurve(hollow, bars, mat, -Math.PI/2, 160)] },
    { name: 'rc-hollow-circle-contour', run: () => surfaceCut(hollow, bars, mat, 300, { steps: 36 }) },
    { name: 'rc-nine-rectangular-contours', run: () => Array.from({ length: 9 }, (_, i) => surfaceCut(
      { kind: 'rect', b: 0.4, h: 0.5 }, bars.map(b => ({ ...b, area: b.area * (i + 1) })), mat, 300, { steps: 24 })) },
  ];
  const rows = [];
  try {
    for (const task of cases) {
      const times = { ts: [] as number[], rust: [] as number[] };
      let reference: unknown;
      for (let round = 0; round < 6; round++) {
        const order = round % 2 ? ['rust', 'ts'] as const : ['ts', 'rust'] as const;
        for (const mode of order) {
          registerCollisionKernel(mode === 'rust' ? CollisionGeometry : null);
          registerRcSectionKernel(mode === 'rust' ? rc : null);
          const start = performance.now(), result = task.run(), elapsed = performance.now() - start;
          if (round === 0 && mode === 'ts') reference = result;
          if (!(task.exact ? JSON.stringify(result) === JSON.stringify(reference) : equivalent(result, reference))) {
            throw new Error(`${task.name}: ${mode} differs from TS`);
          }
          if (round) times[mode].push(elapsed);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      const median = (x: number[]) => [...x].sort((a, b) => a-b)[2];
      rows.push({ name: task.name, tsMs: median(times.ts), rustMs: median(times.rust), speedup: median(times.ts)/median(times.rust), times });
    }
    return rows;
  } finally { registerCollisionKernel(CollisionGeometry); registerRcSectionKernel(rc); }
}
