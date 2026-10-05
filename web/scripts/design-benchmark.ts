import { setCompactStationTransfer } from '../src/lib/engine/verification-service';
import { setColumnCapacityReuse } from '../src/lib/engine/station-design-forces';
import { CollisionGeometry } from '../src/lib/wasm/dedaliano_engine.js';
import { registerCollisionKernel } from '../src/lib/engine/detailing/collision-kernel';
// Manual browser benchmark, outside the application import graph. Run via bench:design.
import { modelStore, resultsStore, uiStore } from '../src/lib/store';
import { designRunStore } from '../src/lib/store/design-run.svelte';
import { verificationStore } from '../src/lib/store/verification.svelte';
import { initSolver } from '../src/lib/engine/wasm-solver';
import '../src/lib/engine/design/adapters/cirsoc201-adapter';
import '../src/lib/engine/design/adapters/unsupported-adapter';
import { detailingStore } from '../src/lib/store/detailing.svelte';

export async function benchmark(exampleIds: string[], captureOutputs: boolean, collisionKernel = true, incrementalRepair = true, columnCapacity = true, compactStations = true) {
  const results = [];
  await initSolver();
  registerCollisionKernel(collisionKernel ? CollisionGeometry : null, incrementalRepair);
  setColumnCapacityReuse(columnCapacity);
  setCompactStationTransfer(compactStations);
  for (const example of exampleIds) {
    const rows = [];
    // Run 0 warms the solver/design code; report the median of the next three runs.
    for (let run = 0; run < 4; run++) {
      modelStore.clear(); resultsStore.clear(); detailingStore.clear();
      designRunStore.resetMarks(); verificationStore.clear();
      uiStore.analysisMode = 'pro';
      await modelStore.loadExample(example);
      let start = performance.now();
      const solved = await modelStore.solveCombinations3DParallel(true, false, true);
      const solveMs = performance.now() - start;
      if (!solved || typeof solved === 'string') throw new Error(String(solved));
      resultsStore.setCombinationResults3D(solved.perCase, solved.perCombo, solved.envelope);
      const generate = detailingStore.generate, floors = detailingStore.generateFloors;
      let membersMs = 0, floorsMs = 0;
      detailingStore.generate = (...args) => {
        const t = performance.now();
        try { return generate(...args); } finally { membersMs += performance.now() - t; }
      };
      detailingStore.generateFloors = (...args) => {
        const t = performance.now();
        try { return floors(...args); } finally { floorsMs += performance.now() - t; }
      };
      start = performance.now();
      try {
        const report = designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);
        if (!report.ok) throw new Error('Design failed');
        const designMs = performance.now() - start;
        rows.push({ run, solveMs, designMs, membersMs, floorsMs, otherMs: designMs - membersMs - floorsMs });
      } finally { detailingStore.generate = generate; detailingStore.generateFloors = floors; }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const outputs = captureOutputs ? JSON.stringify({
      assemblies: modelStore.model.detailing?.assemblies,
      reinforcement: [...modelStore.elements].map(([id, e]) => [id, e.reinforcement]),
      outcomes: [...verificationStore.contexts.keys()].map(id => [id, verificationStore.outcomeFor(id), verificationStore.providedFor(id)])
    }, (key, value) => key === 'searchStats' ? { ...value, ms: 0 } : value) : undefined;
    const warmTimes = rows.slice(1).map(row => row.designMs).sort((a, b) => a - b);
    const bars = (modelStore.model.detailing?.assemblies ?? []).reduce((n, a) => n + a.bars.length, 0);
    results.push({ example, bars, medianDesignMs: warmTimes[1], rows, outputs });
  }
  return results;
}
