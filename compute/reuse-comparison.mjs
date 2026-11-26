export async function compareReuse(wasm, large = false) {
  const median = values => {
    const s = [...values].sort((a, b) => a - b);
    return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
  };
  const same = (a, b) => {
    if (a.x.length !== b.x.length || a.x.some((v, i) => !Object.is(v, b.x[i]))) throw new Error('updated solution differs from fresh preparation');
    for (const k of ['converged', 'iterations', 'recursive_relative_residual', 'true_relative_residual']) {
      if (!Object.is(a[k], b[k])) throw new Error(`updated ${k} differs from fresh preparation`);
    }
  };
  const start = performance.now();
  const context = await wasm.ExperimentalGpuContext.create();
  const startupMs = performance.now() - start, rows = [];
  try {
    const cases = large ? wasm.large_comparison_names() : wasm.comparison_cases();
    for (const entry of cases) {
      const c = large ? wasm.large_comparison_case(entry) : entry;
      const prepare = values => context.prepare_resident_pcg(c.n, new Uint32Array(c.offsets), new Uint32Array(c.rows), values);
      const t = performance.now();
      const reused = await prepare(new Float64Array(c.values));
      const initialPrepareMs = performance.now() - t;
      try {
        await reused.solve(new Float64Array(c.rhs), 1e-6, 2000);
        const warm = await prepare(new Float64Array(c.values));
        try { await warm.solve(new Float64Array(c.rhs), 1e-6, 2000); } finally { warm.free(); }
        const runs = [], freshPrepare = [], update = [], freshTotal = [], updateTotal = [];
        for (let round = 0; round < 6; round++) {
          // Uniform positive scaling preserves SPD, changes values/Jacobi/range
          // bounds, and exercises the same sparsity pattern in every round.
          const factor = 1 + ((round % 3) + 1) / 8;
          const values = Float64Array.from(c.values, v => v * factor);
          const rhs = Float64Array.from(c.rhs, v => v * factor);
          const result = [], timings = [], uploads = [];
          for (const variant of round % 2 ? [1, 0] : [0, 1]) {
            let fresh;
            const before = performance.now();
            try {
              if (variant === 0) fresh = await prepare(values);
              else uploads[1] = await reused.update_values(values);
              const prepared = performance.now();
              result[variant] = await (fresh ?? reused).solve(rhs, 1e-6, 2000);
              timings[variant] = { prepare_ms: prepared - before, solve_ms: performance.now() - prepared };
            } finally { fresh?.free(); }
            timings[variant].total_ms = performance.now() - before;
          }
          same(...result);
          if (result[0].converged && !(result[0].true_relative_residual <= 1e-6)) throw new Error(`${c.name}: invalid convergence acceptance`);
          freshPrepare.push(timings[0].prepare_ms); update.push(timings[1].prepare_ms);
          freshTotal.push(timings[0].total_ms); updateTotal.push(timings[1].total_ms);
          const { x, ...metrics } = result[1];
          runs.push({ factor, timings, update_transfers: uploads[1], ...metrics, exact_match: true });
          console.log(`${c.name}: update/fresh round ${round + 1}/6, exact match`);
        }
        // Failed numeric updates must leave both CPU validation and GPU data intact.
        const rhs = Float64Array.from(c.rhs, v => v * 1.375);
        const reference = await reused.solve(rhs, 1e-6, 2000);
        for (const bad of [NaN, Infinity, Number.MAX_VALUE, 1e-300]) {
          const invalid = Float64Array.from(c.values, v => v * 1.375);
          invalid[0] = bad;
          let refused = false;
          try { await reused.update_values(invalid); } catch { refused = true; }
          if (!refused) throw new Error('unsafe update accepted');
          same(reference, await reused.solve(rhs, 1e-6, 2000));
        }
        rows.push({ case: c.name, dofs: c.n, initial_prepare_ms: initialPrepareMs,
          fresh_prepare_ms: median(freshPrepare), update_ms: median(update),
          fresh_total_ms: median(freshTotal), update_total_ms: median(updateTotal), runs });
      } finally { reused.free(); }
    }
    return { experimental: true, adapter: context.adapter_info, gpu_startup_ms: startupMs,
      tolerance: 1e-6, max_iterations: 2000, profile: large ? 'large' : 'small',
      timing: 'Six alternating fresh-prepare+solve versus update+solve rounds after warmup; total includes disposal and f64 residual validation. One-time reusable preparation is reported separately. Matrix assembly excluded.', rows };
  } finally { context.free(); }
}
