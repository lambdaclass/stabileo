export async function compareSolvers(wasm, large = false) {
  const { ExperimentalGpuContext, ExperimentalPcgSolver, ExperimentalCholesky, comparison_cases } = wasm;
  const tolerance = 1e-6, maxIterations = 2000;
  const startup = performance.now();
  const context = await ExperimentalGpuContext.create();
  const adapter = context.adapter_info;
  const gpuStartupMs = performance.now() - startup;
  const median = samples => {
    const x = [...samples].sort((a, b) => a - b);
    return (x[Math.floor((x.length - 1) / 2)] + x[Math.floor(x.length / 2)]) / 2;
  };
  const error = (x, y) => Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / y.reduce((s, v) => s + v * v, 0));
  const orders = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0], [1, 0, 2], [0, 2, 1]];
  const rows = [];
  try {
    const cases = large ? wasm.large_comparison_names() : comparison_cases();
    for (const entry of cases) {
      const c = large ? wasm.large_comparison_case(entry) : entry;
      const args = () => [c.n, new Uint32Array(c.offsets), new Uint32Array(c.rows), new Float64Array(c.values)];
      let cpu, gpu, resident, direct;
      try {
        let t = performance.now();
        cpu = await ExperimentalPcgSolver.cpu(...args());
        const cpuPrepareMs = performance.now() - t;
        t = performance.now(); gpu = await context.prepare_pcg(...args());
        const gpuPrepareMs = performance.now() - t;
        t = performance.now(); resident = await context.prepare_resident_pcg(...args());
        const residentPrepareMs = performance.now() - t;
        t = performance.now();
        if (c.n <= 4096) direct = ExperimentalCholesky.create(...args());
        const directPrepareMs = direct ? performance.now() - t : null;
        const rhs = new Float64Array(c.rhs);
        const run = async solver => {
          try { return await solver.solve(rhs, tolerance, maxIterations); }
          catch (e) { return { converged: false, error: String(e) }; }
        };
        const reference = direct?.solve(rhs, tolerance);
        const cpuReference = await run(cpu);
        await run(gpu); await run(resident);
        const summarize = r => {
          if (r.error) return r;
          const { x, ...metrics } = r;
          return { ...metrics, relative_error_vs_direct: reference ? error(x, reference.x) : null,
            relative_error_vs_known: error(x, c.expected), relative_error_vs_cpu: cpuReference.x ? error(x, cpuReference.x) : null };
        };
        const samples = [[], [], []], runs = [[], [], []], directMs = [];
        const solvers = [cpu, gpu, resident];
        for (let round = 0; round < orders.length; round++) {
          for (const variant of orders[round]) {
            t = performance.now(); const result = await run(solvers[variant]);
            samples[variant].push(performance.now() - t);
            runs[variant].push(summarize(result));
          }
          if (direct) { t = performance.now(); direct.solve(rhs, tolerance); directMs.push(performance.now() - t); }
          console.log(`${c.name}: balanced round ${round + 1}/6`);
        }
        rows.push({ case: c.name, dofs: c.n, stored_nnz: c.values.length,
          cpu_prepare_ms: cpuPrepareMs, gpu_prepare_ms: gpuPrepareMs, resident_prepare_ms: residentPrepareMs, cholesky_prepare_ms: directPrepareMs,
          cpu_solve_ms: median(samples[0]), gpu_solve_ms: median(samples[1]), resident_solve_ms: median(samples[2]), cholesky_solve_ms: directMs.length ? median(directMs) : null,
          cpu_samples_ms: samples[0], gpu_samples_ms: samples[1], resident_samples_ms: samples[2], cholesky_samples_ms: directMs,
          cpu_runs: runs[0], gpu_runs: runs[1], resident_runs: runs[2],
          cpu: runs[0].at(-1), gpu: runs[1].at(-1), resident: runs[2].at(-1),
          cholesky_true_relative_residual: reference?.true_relative_residual ?? null });
      } finally { cpu?.free(); gpu?.free(); resident?.free(); direct?.free(); }
    }
    for (const prepare of [context.prepare_pcg.bind(context), context.prepare_resident_pcg.bind(context)]) {
      const rounded = await prepare(2, new Uint32Array([0, 2, 3]), new Uint32Array([0, 1, 1]), new Float64Array([1 + 1e-8, -1, 1 + 1e-8]));
      try {
        const result = await rounded.solve(new Float64Array([1, 1]), tolerance, 100);
        if (result.converged) throw new Error('accepted a matrix that loses definiteness in f32');
        const zero = await rounded.solve(new Float64Array(2), tolerance, 100);
        if (!zero.converged || zero.x.some(x => x !== 0)) throw new Error('stale solver state');
      } finally { rounded.free(); }
    }
  } finally { context.free(); }
  return { experimental: true, profile: large ? 'large' : 'small', adapter, gpu_startup_ms: gpuStartupMs, tolerance, max_iterations: maxIterations,
    cpu_baseline: 'production pcg_solve + original f64 residual validation',
    timing: 'median of six balanced CPU/hybrid/resident rounds after warmup; solve includes transfers, f64 residual validation and WASM bindings', rows };
}
