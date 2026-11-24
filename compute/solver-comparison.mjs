export async function compareSolvers(wasm, large = false) {
  const { ExperimentalGpuContext, ExperimentalPcgSolver, ExperimentalCholesky, comparison_cases } = wasm;
  const tolerance = 1e-6, maxIterations = 2000;
  const startup = performance.now();
  const context = await ExperimentalGpuContext.create();
  const adapter = context.adapter_info;
  const gpuStartupMs = performance.now() - startup;
  const median = x => [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)];
  const error = (x, y) => Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / y.reduce((s, v) => s + v * v, 0));
  const rows = [];
  try {
    const cases = large ? wasm.large_comparison_names() : comparison_cases();
    for (const entry of cases) {
      const c = large ? wasm.large_comparison_case(entry) : entry;
      const args = () => [c.n, new Uint32Array(c.offsets), new Uint32Array(c.rows), new Float64Array(c.values)];
      let cpu, gpu, direct;
      try {
        let t = performance.now();
        cpu = await ExperimentalPcgSolver.cpu(...args());
        const cpuPrepareMs = performance.now() - t;
        t = performance.now(); gpu = await context.prepare_pcg(...args());
        const gpuPrepareMs = performance.now() - t;
        t = performance.now();
        if (c.n <= 4096) direct = ExperimentalCholesky.create(...args());
        const directPrepareMs = direct ? performance.now() - t : null;
        const rhs = new Float64Array(c.rhs);
        const run = async solver => {
          try { return await solver.solve(rhs, tolerance, maxIterations); }
          catch (e) { return { converged: false, error: String(e) }; }
        };
        const reference = direct?.solve(rhs, tolerance);
        await run(cpu); await run(gpu);
        const cpuMs = [], gpuMs = [], directMs = [];
        const cpuRuns = [], gpuRuns = [];
        let cpuResult, gpuResult;
        for (let round = 0; round < 5; round++) {
          for (const gpuFirst of [round % 2 === 0, round % 2 !== 0]) {
            t = performance.now();
            if (gpuFirst) { gpuResult = await run(gpu); gpuMs.push(performance.now() - t); gpuRuns.push(gpuResult); }
            else { cpuResult = await run(cpu); cpuMs.push(performance.now() - t); cpuRuns.push(cpuResult); }
          }
          if (direct) { t = performance.now(); direct.solve(rhs, tolerance); directMs.push(performance.now() - t); }
          console.log(`${c.name}: paired round ${round + 1}/5`);
        }
        const summarize = r => {
          if (r.error) return r;
          const { x, ...metrics } = r;
          return { ...metrics, relative_error_vs_direct: reference ? error(x, reference.x) : null, relative_error_vs_known: error(x, c.expected) };
        };
        rows.push({ case: c.name, dofs: c.n, stored_nnz: c.values.length,
          cpu_prepare_ms: cpuPrepareMs, gpu_prepare_ms: gpuPrepareMs, cholesky_prepare_ms: directPrepareMs,
          cpu_solve_ms: median(cpuMs), gpu_solve_ms: median(gpuMs), cholesky_solve_ms: directMs.length ? median(directMs) : null,
          cpu_samples_ms: cpuMs, gpu_samples_ms: gpuMs, cholesky_samples_ms: directMs,
          cpu_runs: cpuRuns.map(summarize), gpu_runs: gpuRuns.map(summarize),
          cpu: summarize(cpuResult), gpu: summarize(gpuResult),
          relative_gpu_error_vs_cpu: gpuResult.x && cpuResult.x ? error(gpuResult.x, cpuResult.x) : null,
          cholesky_true_relative_residual: reference?.true_relative_residual ?? null });
      } finally { cpu?.free(); gpu?.free(); direct?.free(); }
    }
    const rounded = await context.prepare_pcg(2, new Uint32Array([0, 2, 3]), new Uint32Array([0, 1, 1]), new Float64Array([1 + 1e-8, -1, 1 + 1e-8]));
    try {
      const result = await rounded.solve(new Float64Array([1, 1]), tolerance, 100);
      if (result.converged) throw new Error('accepted a matrix that loses definiteness in f32');
    } finally { rounded.free(); }
  } finally { context.free(); }
  return { experimental: true, profile: large ? 'large' : 'small', adapter, gpu_startup_ms: gpuStartupMs, tolerance, max_iterations: maxIterations,
    cpu_baseline: 'production pcg_solve + original f64 residual validation',
    timing: 'median of five paired rounds after warmup; solve includes transfers, CPU vector work, f64 residual validation and WASM bindings', rows };
}
