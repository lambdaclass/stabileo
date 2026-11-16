import { modelStore, resultsStore, uiStore } from '../src/lib/store';
import { initSolver, combineResults3D, combineResultsBatch3D } from '../src/lib/engine/wasm-solver';
import { destroyPool } from '../src/lib/engine/solver-pool';
import { computeGoverning3D } from '../src/lib/engine/governing-case';
import { compareSolveResults } from './solve-benchmark-comparison';
import { createDiagramGroup3D } from '../src/lib/three/diagram-render-3d';
import { disposeObject } from '../src/lib/three/selection-helpers';
import { hasNonlinearBehaviour } from '../src/lib/engine/member-behaviour';

type Strategy = 'parallel' | 'multiCase';
type Bundle = Exclude<ReturnType<typeof modelStore.solveCombinations3D>, string | null>;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};

export async function benchmark(exampleIds: string[]) {
  await initSolver();
  const output = [];
  try {
    for (const example of exampleIds) {
      destroyPool();
      modelStore.clear();
      resultsStore.clear();
      uiStore.analysisMode = 'pro';
      const [fixture, count] = example.split('@');
      await modelStore.loadExample(fixture);
      if (!modelStore.elements.size && !modelStore.model.quads.size && !modelStore.model.plates.size) throw new Error(`Empty or unknown example: ${fixture}`);
      if (count !== undefined) {
        const target = Number(count), originals = [...modelStore.model.combinations];
        if (!Number.isSafeInteger(target) || target < originals.length || !originals.length) throw new Error(`Invalid combination count: ${example}`);
        modelStore.bulkMutate(() => {
          for (let i = originals.length; i < target; i++) {
            const source = originals[i % originals.length];
            modelStore.addCombination(`benchmark-${i}`, source.factors.map(f => ({ caseId: f.caseId, factor: f.factor * (1 + i / target) })));
          }
        });
      }
      const names = new Map(modelStore.model.combinations.map(c => [c.id, c.name]));
      const rows: Array<{ round: number; strategy: Strategy; solveMs: number; governingMs: number; phases: string[] }> = [];
      const postprocess: Array<{ round: number; individualMs: number; batchMs: number; diagramBuildMs: number }> = [];
      for (let round = 0; round < 7; round++) {
        const bundles = {} as Record<Strategy, Bundle>;
        const order: Strategy[] = round % 2 ? ['multiCase', 'parallel'] : ['parallel', 'multiCase'];
        for (const strategy of order) {
          const warnings: unknown[][] = [];
          const phases: string[] = [];
          const log = console.log;
          console.log = (...args) => {
            if (String(args[0]).startsWith('[solveCombinations3D')) phases.push(args.join(' '));
            log(...args);
          };
          const warn = console.warn;
          console.warn = (...args) => { warnings.push(args); warn(...args); };
          let result: Bundle | string | null;
          const start = performance.now();
          try {
            result = strategy === 'parallel'
              ? await modelStore.solveCombinations3DParallel(true, false, true)
              : modelStore.solveCombinations3D(true, false, true);
          } finally { console.warn = warn; console.log = log; }
          const solveMs = performance.now() - start;
          if (!result || typeof result === 'string') throw new Error(`${example}/${strategy}: ${result}`);
          if (warnings.length) throw new Error(`${example}/${strategy}: solve emitted warnings; timings may include fallback: ${warnings.flat().join(' ')}`);
          bundles[strategy] = result;
          const governingStart = performance.now();
          computeGoverning3D(result.perCombo, names);
          rows.push({ round, strategy, solveMs, governingMs: performance.now() - governingStart, phases });
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        compareSolveResults(bundles.parallel, bundles.multiCase, example);
        const factors = modelStore.model.combinations.map(c => c.factors.map(f => ({ caseId: f.caseId, factor: f.factor })));
        const combine = (batch: boolean) => batch
          ? combineResultsBatch3D(factors, bundles.parallel.perCase, modelStore.plates)
          : factors.map(f => combineResults3D(f, bundles.parallel.perCase, modelStore.plates));
        const times: number[] = [], combined: unknown[] = [];
        for (const batch of round % 2 ? [true, false] : [false, true]) {
          const start = performance.now();
          combined[Number(batch)] = combine(batch);
          times[Number(batch)] = performance.now() - start;
        }
        compareSolveResults(combined[0], combined[1], `${example}.combinations`);
        const forces = bundles.parallel.perCombo.values().next().value?.elementForces ?? [];
        const start = performance.now();
        const diagram = createDiagramGroup3D(modelStore.elements, modelStore.nodes, forces, 'momentY', 1, false, false, modelStore.sections);
        const diagramBuildMs = performance.now() - start;
        disposeObject(diagram);
        postprocess.push({ round, individualMs: times[0], batchMs: times[1], diagramBuildMs });
      }
      const timings = (strategy: Strategy) => {
        const runs = rows.filter(row => row.strategy === strategy);
        return {
          firstSolveMs: runs[0].solveMs,
          medianWarmSolveMs: median(runs.slice(1).map(row => row.solveMs)),
          medianGoverningMs: median(runs.slice(1).map(row => row.governingMs)),
        };
      };
      output.push({ example, nodes: modelStore.nodes.size, members: modelStore.elements.size,
        cases: modelStore.model.loadCases.length, combinations: names.size,
        shells: modelStore.model.plates.size + modelStore.model.quads.size,
        declaredConstraints: modelStore.model.constraints?.length ?? 0,
        nonlinear: hasNonlinearBehaviour(modelStore.model),
        perCombination: modelStore.model.analysis?.perCombination ?? 'linear',
        parallel: timings('parallel'), multiCase: timings('multiCase'), numericalParity: true, rows,
        postprocess, medianIndividualCombineMs: median(postprocess.slice(1).map(r => r.individualMs)),
        medianBatchCombineMs: median(postprocess.slice(1).map(r => r.batchMs)),
        medianDiagramBuildMs: median(postprocess.slice(1).map(r => r.diagramBuildMs)),
      });
    }
    return output;
  } finally { destroyPool(); }
}
