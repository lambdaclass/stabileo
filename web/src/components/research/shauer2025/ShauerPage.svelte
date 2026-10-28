<script lang="ts">
  /**
   * /research/fracture/shauer-2025: the AT2 phase-field notched plate, run in the reader's browser
   * by the Rust implementation in research/fracture/shauer-2025 (WASM, in a worker), with the
   * reference code's own outputs alongside.
   */
  import { onDestroy } from 'svelte';
  import refCsv from '../../../../../research/fracture/shauer-2025/reference-results/ex2_steps.csv?raw';
  import validation from '../../../../../research/fracture/shauer-2025/VALIDATION.json';
  import LineChart from './LineChart.svelte';
  import IterationsChart from './IterationsChart.svelte';
  import { SimulationController } from './simulation.svelte';
  import type { PlateConfig, Series } from './protocol';
  import { REPO_URL } from '../../landing/landing-utils';
  import PublicLink from '../../landing/PublicLink.svelte';
  import NumberField from './NumberField.svelte';

  const SOURCE = `${REPO_URL}/tree/main/research/fracture/shauer-2025`;
  const STABILEO = '#3987e5';
  const REFERENCE = '#d95926';

  type Ref = { step: number; pseudotime: number; reaction: number; iterations: number; damageMax: number };
  const reference: Ref[] = refCsv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const c = line.split(',');
      return { step: Number(c[0]), pseudotime: Number(c[1]), iterations: Number(c[2]), damageMax: Number(c[4]), reaction: Number(c[6]) };
    });
  const REF_TOP_DISPLACEMENT = 0.01;
  const refPeak = reference.reduce((a, r) => (r.reaction > a.reaction ? r : a), reference[0]);

  const MESHES = {
    coarse: { label: 'Coarse: 1 600 elements in the band, h = 0.0025 mm', mesh: { nx: 40, ny: 40, nx_fine: 16, ny_fine: 8, h_fine: 0.0025 } },
    medium: { label: 'Medium: h = 0.00167 mm', mesh: { nx: 50, ny: 60, nx_fine: 24, ny_fine: 12, h_fine: 1 / 600 } },
    reference: { label: 'Reference: 5 600 elements, h = 0.00125 mm (as the reference script)', mesh: { nx: 70, ny: 80, nx_fine: 32, ny_fine: 16, h_fine: 0.00125 } },
  } as const;
  type MeshKey = keyof typeof MESHES;

  const DEFAULTS = { e: 210, nu: 0.3, gc: 0.0027, l0: 0.0075, u: 0.01, dt: 0.01, mesh: 'reference' as MeshKey, history: false };
  let e = $state(DEFAULTS.e);
  let nu = $state(DEFAULTS.nu);
  let gc = $state(DEFAULTS.gc);
  let l0 = $state(DEFAULTS.l0);
  let u = $state(DEFAULTS.u);
  let dt = $state(DEFAULTS.dt);
  let meshKey = $state<MeshKey>(DEFAULTS.mesh);
  let history = $state(DEFAULTS.history);

  const LIMITS = { e: [10, 400], nu: [0, 0.45], gc: [1e-4, 1e-2], l0: [0.003, 0.03], u: [0.004, 0.02] } as const;
  const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;
  const valid = $derived(inRange(e, LIMITS.e) && inRange(nu, LIMITS.nu) && inRange(gc, LIMITS.gc) && inRange(l0, LIMITS.l0) && inRange(u, LIMITS.u));

  const config = $derived<PlateConfig>({
    material: { e, nu, gc, l0, plane: 'strain' },
    mesh: { ...MESHES[meshKey].mesh },
    top_displacement: u,
    controls: { dt, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: history ? 'history' : 'none' },
  });
  const isReference = $derived(
    e === DEFAULTS.e && nu === DEFAULTS.nu && gc === DEFAULTS.gc && l0 === DEFAULTS.l0 && u === DEFAULTS.u && dt === DEFAULTS.dt && meshKey === 'reference' && !history,
  );
  const hOverL = $derived(MESHES[meshKey].mesh.h_fine / l0);
  const sigmaC = $derived(Math.sqrt((27 * e * gc) / (256 * l0)));

  const sim = new SimulationController();
  onDestroy(() => sim.dispose());
  const run = $derived(sim.current);
  const frames = $derived(run?.frames ?? []);
  const runIsReference = $derived(run ? JSON.stringify(run.config) === JSON.stringify(referenceConfig()) : false);

  function referenceConfig(): PlateConfig {
    return {
      material: { e: DEFAULTS.e, nu: DEFAULTS.nu, gc: DEFAULTS.gc, l0: DEFAULTS.l0, plane: 'strain' },
      mesh: { ...MESHES.reference.mesh },
      top_displacement: DEFAULTS.u,
      controls: { dt: DEFAULTS.dt, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: 'none' },
    };
  }

  let shown = $state(0);
  let follow = $state(true);
  let playing = $state(false);
  $effect(() => {
    if (follow && frames.length) shown = frames.length - 1;
  });
  $effect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (shown >= frames.length - 1) playing = false;
      else shown += 1;
    }, 120);
    return () => clearInterval(id);
  });
  const frame = $derived(frames[Math.min(shown, frames.length - 1)] ?? null);

  const VIEWS: Record<'plate' | 'band' | 'tip', [number, number, number, number]> = {
    plate: [-0.5, -0.5, 0.5, 0.5],
    band: [-0.5, -0.12, 0.5, 0.12],
    tip: [-0.03, -0.0225, 0.03, 0.0225],
  };
  const viewer = import('../../viewport/ScalarFieldViewer.svelte');
  const fieldValues = $derived(frame ? (field === 'damage' ? frame.damage : frame.syy) : null);
  const fieldRange = $derived.by(() => {
    if (!frame || field === 'damage') return { min: 0, max: 1 };
    let lo = 0;
    let hi = 0;
    for (const v of frame.syy) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return { min: lo, max: hi > lo ? hi : lo + 1 };
  });
  const hideCell = $derived.by(() => {
    if (!hideBroken || !frame || !run?.elements) return null;
    const d = frame.damage;
    const el = run.elements;
    return (c: number) => d[el[4 * c]] > 0.95 && d[el[4 * c + 1]] > 0.95 && d[el[4 * c + 2]] > 0.95 && d[el[4 * c + 3]] > 0.95;
  });

  let field = $state<'damage' | 'syy'>('damage');
  let view = $state<'plate' | 'band' | 'tip'>('plate');
  let deform = $state(20);
  let showMesh = $state(typeof window === 'undefined' || window.innerWidth >= 640);
  let hideBroken = $state(true);

  function start() {
    if (!valid) return;
    follow = true;
    playing = false;
    sim.run($state.snapshot(config) as PlateConfig);
  }
  function reset() {
    e = DEFAULTS.e;
    nu = DEFAULTS.nu;
    gc = DEFAULTS.gc;
    l0 = DEFAULTS.l0;
    u = DEFAULTS.u;
    dt = DEFAULTS.dt;
    meshKey = DEFAULTS.mesh;
    history = DEFAULTS.history;
  }

  const expectedSteps = $derived(run ? Math.floor(run.config.controls.total_time / run.config.controls.dt + 1e-9) : 0);

  const forceSeries = $derived.by<Series[]>(() => {
    const out: Series[] = [];
    if (frames.length) out.push({ name: 'Stabileo (Rust, in this browser)', color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.reaction]), markers: true });
    if (runIsReference || !run) out.push({ name: 'Reference code (Python, committed outputs)', color: REFERENCE, dashed: true, points: reference.map((r) => [r.pseudotime * REF_TOP_DISPLACEMENT, r.reaction]) });
    return out;
  });
  const energySeries = $derived.by<Series[]>(() =>
    frames.length
      ? [
          { name: 'Elastic energy', color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.elastic_energy]) },
          { name: 'Fracture energy Gc·Γ', color: REFERENCE, points: frames.map((f) => [f.step.displacement, f.step.fracture_energy]) },
        ]
      : [],
  );

  const comparison = $derived.by(() => {
    if (!runIsReference || !run || run.status !== 'done' || frames.length !== reference.length) return null;
    const peak = frames.reduce((a, f) => (f.step.reaction > a.step.reaction ? f : a), frames[0]);
    let worstPre = 0;
    let worstAll = 0;
    let sameIterations = 0;
    frames.forEach((f, i) => {
      const r = reference[i].reaction;
      if (i <= refPeak.step) worstPre = Math.max(worstPre, Math.abs(f.step.reaction - r) / Math.abs(r));
      worstAll = Math.max(worstAll, Math.abs(f.step.reaction - r));
      if (f.step.iterations === reference[i].iterations) sameIterations += 1;
    });
    return { peak, worstPre, worstAll, sameIterations };
  });

  const fmt = (v: number, d = 4) => (Math.abs(v) >= 1e-3 || v === 0 ? v.toFixed(d) : v.toExponential(2));
</script>

<section class="sec sec--ink rs-head">
  <div class="wrap rs-col">
    <p class="rs-crumb"><PublicLink to="/research">Research</PublicLink> / Fracture</p>
    <h1>Phase-field fracture of a notched plate</h1>
    <p class="rs-cite">
      After N. Shauer, “Less than 500 lines self-contained Python finite element implementation of the phase-field method for fracture mechanics”,
      <em>Advances in Engineering Software</em> 210 (2025) 104013,
      <a href="https://doi.org/10.1016/j.advengsoft.2025.104013" rel="noreferrer" target="_blank">doi:10.1016/j.advengsoft.2025.104013</a>.
      Reference code <a href="https://github.com/nathanshauer/phasefield-jr-py" rel="noreferrer" target="_blank">phasefield-jr-py</a> (MIT).
    </p>
    <ul class="rs-badges">
      <li class="ok">Numerically validated against the reference code: {validation.checks.filter((c) => c.passed).length}/{validation.checks.length} checks pass</li>
      <li>Published figures not compared (paper text not accessed)</li>
      <li class="warn">Research, not a design tool</li>
    </ul>
    <p class="rs-lead">
      A square plate with a horizontal notch from the left edge to its centre is pulled apart at the top edge. The AT2 phase-field model
      represents the crack as a damage field d between 0 (intact) and 1 (broken), smeared over a length ℓ. The simulation below is the
      Stabileo Rust implementation, compiled to WebAssembly and running in your browser; the dashed curve is what the author’s Python code
      computed for the same input.
    </p>
  </div>
</section>

<section class="sec sec--ink rs-sim" aria-labelledby="rs-sim-title">
  <div class="wrap rs-wide">
    <h2 id="rs-sim-title">Run the experiment</h2>
    <div class="rs-grid">
      <form class="rs-controls" onsubmit={(ev) => { ev.preventDefault(); start(); }}>
        <fieldset>
          <legend>Material (plane strain)</legend>
          <label><span class="lbl"><i>E</i>, Young’s modulus</span><span class="u">kN/mm²</span><NumberField label="E, Young’s modulus, kN/mm²" min={LIMITS.e[0]} max={LIMITS.e[1]} bind:value={e} /></label>
          <label><span class="lbl"><i>ν</i>, Poisson’s ratio</span><span class="u"></span><NumberField label="ν, Poisson’s ratio" min={LIMITS.nu[0]} max={LIMITS.nu[1]} bind:value={nu} /></label>
          <label><span class="lbl"><i>G</i><sub>c</sub>, fracture toughness</span><span class="u">kN/mm</span><NumberField label="Gc, fracture toughness, kN/mm" min={LIMITS.gc[0]} max={LIMITS.gc[1]} bind:value={gc} /></label>
          <label><span class="lbl"><i>ℓ</i>, length scale</span><span class="u">mm</span><NumberField label="ℓ, length scale, mm" min={LIMITS.l0[0]} max={LIMITS.l0[1]} bind:value={l0} /></label>
        </fieldset>
        <fieldset>
          <legend>Loading and discretisation</legend>
          <label><span class="lbl">Top displacement at <i>t</i> = 1</span><span class="u">mm</span><NumberField label="Top displacement at t = 1, mm" min={LIMITS.u[0]} max={LIMITS.u[1]} bind:value={u} /></label>
          <label><span class="lbl">Load step Δ<i>t</i></span>
            <select bind:value={dt} aria-label="Load step">
              {#each [0.005, 0.01, 0.02, 0.03, 0.06] as v (v)}<option value={v}>{v} ({Math.floor(0.8 / v + 1e-9)} steps)</option>{/each}
            </select>
          </label>
          <label><span class="lbl">Mesh</span>
            <select bind:value={meshKey} aria-label="Mesh">
              {#each Object.entries(MESHES) as [k, m] (k)}<option value={k}>{m.label}</option>{/each}
            </select>
          </label>
          <label class="rs-check"><input type="checkbox" bind:checked={history} /> History field (irreversibility; not in the reference)</label>
        </fieldset>
        <p class="rs-derived">
          Loaded to t = 0.8 (final displacement {fmt(0.8 * u)} mm). σ<sub>c</sub> = √(27EG<sub>c</sub>/256ℓ) = {fmt(sigmaC, 3)} kN/mm².
          h/ℓ in the refined box = {hOverL.toFixed(2)}{#if hOverL > 0.5}<strong class="warnt"> — the crack band is under-resolved (h &gt; ℓ/2)</strong>{/if}.
          Staggered tolerance 1e-5, at most 1000 iterations per step.
        </p>
        {#if !valid}
          <p class="warnt">Outside the browser limits: E {LIMITS.e.join('–')}, ν {LIMITS.nu.join('–')}, Gc {LIMITS.gc.join('–')}, ℓ {LIMITS.l0.join('–')}, u {LIMITS.u.join('–')}.</p>
        {/if}
        <div class="rs-buttons">
          <button class="btn btn-primary" type="submit" disabled={!valid || run?.status === 'running'}>Run</button>
          {#if run?.status === 'running'}<button class="btn" type="button" onclick={() => sim.stop()}>Stop</button>{/if}
          {#if !isReference}<button class="btn" type="button" onclick={reset}>Reference parameters</button>{/if}
        </div>
        {#if isReference}<p class="rs-note">Using the reference script’s parameters: the run is compared step by step with its outputs.</p>{/if}
        <p class="rs-status" aria-live="polite">
          {#if sim.available === false}
            <span class="warnt">The simulation bundle is not part of this build ({sim.unavailableReason}). Build it with research/fracture/shauer-2025/wasm/build.sh.</span>
          {:else if run?.status === 'running'}
            Solving step {frames.length + 1} of {expectedSteps}…
          {:else if run?.status === 'done'}
            Done: {frames.length} steps in {run.seconds?.toFixed(1)} s. Completed runs are kept, so earlier parameters replay instantly.
          {:else if run?.status === 'stopped'}
            Stopped after {frames.length} steps.
          {:else if run?.status === 'error'}
            <span class="warnt">The solver refused the input: {run.error}</span>
          {:else}
            Press Run. The reference mesh takes about 15–30 s in a browser; the coarse mesh a few seconds.
          {/if}
        </p>
      </form>

      <div class="rs-out" data-steps={frames.length}>
        {#if run?.nodes && run?.elements}
          <div class="rs-viewbar">
            <label>Field <select bind:value={field}><option value="damage">Damage d</option><option value="syy">Opening stress σyy (degraded)</option></select></label>
            <label>View <select bind:value={view}><option value="plate">Whole plate</option><option value="band">Crack band</option><option value="tip">Notch tip</option></select></label>
            <label>Deformation ×<input type="number" min="0" max="200" step="5" bind:value={deform} /></label>
            <label class="rs-check"><input type="checkbox" bind:checked={showMesh} /> Mesh</label>
            <label class="rs-check"><input type="checkbox" bind:checked={hideBroken} /> Hide broken elements (d &gt; 0.95)</label>
          </div>
          {#await viewer then m}
            <m.default
              xy={run.nodes}
              cells={run.elements}
              values={fieldValues}
              perCell={field === 'syy'}
              range={fieldRange}
              title={field === 'damage' ? 'Damage d' : 'σyy (degraded)'}
              unit={field === 'damage' ? '' : 'kN/mm²'}
              legendFooter={field === 'damage' ? 'colours clamped to [0, 1]' : 'kN/mm², element centres'}
              displacement={frame?.displacement ?? null}
              deformScale={deform}
              {showMesh}
              {hideCell}
              view={VIEWS[view]}
              height="min(34rem, 70vw)"
              ariaLabel="Stabileo viewer: {field === 'damage' ? 'damage' : 'opening stress'} on the deformed mesh"
            />
          {/await}
          {#if frames.length}
            <div class="rs-scrub">
              <button class="btn btn-sm" type="button" onclick={() => { follow = false; if (shown >= frames.length - 1) shown = 0; playing = !playing; }}>{playing ? 'Pause' : 'Play'}</button>
              <input type="range" min="0" max={frames.length - 1} bind:value={shown} oninput={() => { follow = false; playing = false; }} aria-label="Load step shown" />
              <span class="mono">step {frame?.step.step} · u = {fmt(frame?.step.displacement ?? 0, 5)} mm · F = {fmt(frame?.step.reaction ?? 0)} kN · max d = {fmt(frame?.step.damage_max ?? 0, 3)}</span>
            </div>
            <p class="rs-note">Unconstrained AT2, as in the reference code, can give d slightly above 1 (the reference reaches 1.0096 here); values are shown as computed and only the colour scale is clamped to [0, 1].</p>
          {/if}
        {:else}
          <div class="rs-placeholder">
            <p>The mesh, the damage field and the deformed shape appear here, step by step, as the solver advances.</p>
          </div>
        {/if}
      </div>
    </div>

    <div class="rs-charts">
      <figure>
        <figcaption>Reaction force on the bottom edge against imposed top displacement</figcaption>
        <LineChart series={forceSeries} xLabel="top displacement u, mm" yLabel="force F, kN" fx={(v) => v.toFixed(4)} fy={(v) => v.toFixed(2)} marker={frame ? frame.step.displacement : null} />
        {#if run && !runIsReference}<p class="rs-note">The reference curve is shown only for the reference parameters.</p>{/if}
      </figure>
      {#if frames.length}
        <figure>
          <figcaption>Convergence: staggered iterations per load step{runIsReference ? ' (dots: where the reference differs; none expected)' : ''}</figcaption>
          <IterationsChart steps={frames.map((f) => f.step)} reference={runIsReference ? reference.map((r) => r.iterations) : null} />
        </figure>
        <figure>
          <figcaption>Energies</figcaption>
          <LineChart series={energySeries} xLabel="top displacement u, mm" yLabel="energy, kN·mm" fx={(v) => v.toFixed(4)} fy={(v) => v.toExponential(1)} marker={frame ? frame.step.displacement : null} />
        </figure>
      {/if}
    </div>

    {#if comparison}
      <div class="rs-compare" role="status">
        <h3>This run against the reference code</h3>
        <ul>
          <li>Peak force: {comparison.peak.step.reaction.toFixed(6)} kN at step {comparison.peak.step.step}; reference {refPeak.reaction.toFixed(6)} kN at step {refPeak.step}.</li>
          <li>Largest relative force difference up to the peak: {comparison.worstPre.toExponential(1)} (tolerance in the tests: 1e-9).</li>
          <li>Largest absolute force difference over all steps, fracture included: {comparison.worstAll.toExponential(1)} kN (bounded by the staggered tolerance 1e-5).</li>
          <li>Identical number of staggered iterations at {comparison.sameIterations} of {reference.length} steps.</li>
        </ul>
      </div>
    {/if}

    {#if frames.length}
      <details class="rs-table">
        <summary>Step table ({frames.length} steps)</summary>
        <table>
          <thead><tr><th>step</th><th>u, mm</th><th>F, kN</th><th>iterations</th><th>residual</th><th>max d</th><th>elastic, kN·mm</th><th>fracture, kN·mm</th>{#if runIsReference}<th>reference F, kN</th>{/if}</tr></thead>
          <tbody>
            {#each frames as f, i (i)}
              <tr><td>{f.step.step}</td><td>{f.step.displacement.toFixed(5)}</td><td>{f.step.reaction.toExponential(6)}</td><td>{f.step.iterations}</td><td>{f.step.residual.toExponential(2)}</td><td>{f.step.damage_max.toFixed(4)}</td><td>{f.step.elastic_energy.toExponential(3)}</td><td>{f.step.fracture_energy.toExponential(3)}</td>{#if runIsReference}<td>{reference[i]?.reaction.toExponential(6)}</td>{/if}</tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}
  </div>
</section>

<section class="sec sec--ink rs-text">
  <div class="wrap rs-col">
    <h2>The model</h2>
    <p>Displacement <b>u</b> and damage d are both interpolated with bilinear quadrilaterals and integrated with 2×2 Gauss points; the plate is in plane strain and small strain, loaded quasi-statically.</p>
    <ul>
      <li><b>Elasticity</b> at fixed d: div(g(d) <b>C</b> : <b>ε</b>(<b>u</b>)) = 0 with g(d) = (1 − d)², applied to the whole stress.</li>
      <li><b>Damage (AT2)</b> at fixed <b>u</b>: (G<sub>c</sub>/ℓ + 2H) d − G<sub>c</sub> ℓ Δd = 2H.</li>
      <li><b>Driving energy</b>: H = ψ⁺ = ½ Σ σ<sub>i</sub> ε<sub>i</sub> over the positive principal strains ε<sub>i</sub>, with σ<sub>i</sub> the principal undamaged stresses. Elasticity is degraded fully while damage is driven only by tension: a “hybrid” formulation.</li>
      <li><b>Alternating solution</b> per load step: solve <b>u</b> with the current d, then d with the new <b>u</b>, until the elasticity residual ‖K(d)u − f‖ falls below 10⁻⁵.</li>
      <li><b>Irreversibility</b>: none in the reference code (damage is recomputed from the current energy and can heal on unloading, and it is not bounded by 1). The optional history field H = max over steps of ψ⁺ keeps it on unloading.</li>
    </ul>
    <p>Units: kN and mm. With these values σ<sub>c</sub> ≈ {Math.sqrt((27 * 210 * 0.0027) / (256 * 0.0075)).toFixed(2)} kN/mm² is the homogeneous AT2 peak stress, so ℓ behaves as a strength parameter as much as a regularisation length.</p>

    <h2>How it was reproduced</h2>
    <ol>
      <li>The author’s code (commit 61037c6, MIT) was read in full, then run unmodified for its three examples in Python 3.12.15 with numpy 2.1.3 and scipy 1.14.1. Every step’s force, iteration count, residual and damage range, and nodal fields at chosen steps, were saved with a manifest of versions and checksums.</li>
      <li>The Rust implementation regenerates the same meshes (bit-identical), applies the same boundary conditions, loop and stopping rule, and solves with the Stabileo engine’s sparse Cholesky factorisation.</li>
      <li>{validation.checks.length} named checks compare the two, each with a stated tolerance, in continuous integration. The browser bundle was checked separately to give the same numbers as the native build.</li>
    </ol>

    <h2>Comparison with the reference</h2>
    <table class="rs-checks">
      <thead><tr><th>Check</th><th>Metric</th><th>Observed</th><th>Tolerance</th><th></th></tr></thead>
      <tbody>
        {#each validation.checks as c (c.name)}
          <tr><td>{c.name}</td><td>{c.metric}</td><td>{c.metric === 'exact' ? (c.passed ? 'equal' : 'differs') : c.observed.toExponential(1)}</td><td>{c.metric === 'exact' ? '—' : c.tolerance.toExponential(0)}</td><td>{c.passed ? 'pass' : 'FAIL'}</td></tr>
        {/each}
      </tbody>
    </table>
    <p>
      One finding: the notched plate is symmetric about the notch plane, and the crack runs along the row of elements just above it in one
      code and just below it in the other. Which row is chosen is decided by floating-point round-off. Compared with the mirror image, the
      final damage fields agree to 3·10⁻¹⁰.
    </p>

    <h2>Comparison with the paper</h2>
    <p>
      Not done. The article’s full text was not accessible to us, so no figure or number printed in it has been compared. Everything on this
      page is compared with the author’s published code instead. Figures here are generated from our own runs.
    </p>

    <h2>Limitations</h2>
    <ul>
      <li>Agreement with a reference code is not validation against experiments, and none of this is an engineering certification.</li>
      <li>The reference mesh refines only a 0.04 × 0.04 mm box around the notch tip; beyond it the crack crosses elements wider than 3ℓ.</li>
      <li>No bound constraints: damage can slightly exceed 1, and with coarse meshes undershoot 0.</li>
      <li>The alternating scheme is not accelerated; at unstable crack growth it can take hundreds of iterations in one step.</li>
      <li>Browser runs are limited in mesh size and parameter range; larger studies belong in the native build.</li>
    </ul>

    <h2>Code and references</h2>
    <ul>
      <li>Implementation, tests, reference outputs: <a href={SOURCE} rel="noreferrer" target="_blank">research/fracture/shauer-2025</a> (AGPL-3.0, like Stabileo; mesh generators and loop adapted from the MIT reference, credited in the source).</li>
      <li>Reference code: <a href="https://github.com/nathanshauer/phasefield-jr-py" rel="noreferrer" target="_blank">github.com/nathanshauer/phasefield-jr-py</a>, MIT License, © 2025 Nathan Shauer.</li>
      <li>Article: <a href="https://doi.org/10.1016/j.advengsoft.2025.104013" rel="noreferrer" target="_blank">doi:10.1016/j.advengsoft.2025.104013</a>.</li>
    </ul>
  </div>
</section>

<style>
  .rs-col {
    max-width: 52rem;
  }
  .rs-wide {
    max-width: 80rem;
  }
  .sec.rs-head {
    padding-top: clamp(5rem, 9vw, 6.5rem);
    padding-bottom: 1.5rem;
  }
  .rs-head h1 {
    font-family: var(--lp-display);
    font-size: clamp(2rem, 4.5vw, 3rem);
    line-height: 1.1;
    margin: 0.25rem 0 0.75rem;
    color: var(--fg);
  }
  .rs-crumb,
  .rs-cite {
    color: var(--fg-2);
    font-size: 0.95rem;
  }
  .rs-crumb :global(a),
  .rs-cite a,
  .rs-text a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-badges {
    list-style: none;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  .rs-badges li {
    font: 12px var(--lp-mono);
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.25rem 0.5rem;
    color: var(--fg-2);
  }
  .rs-badges li.ok {
    color: var(--ok);
    border-color: var(--ok);
  }
  .rs-badges li.warn {
    color: #d9a441;
    border-color: #d9a441;
  }
  .rs-lead {
    color: var(--fg);
    font-size: 1.05rem;
  }
  .sec.rs-sim {
    padding-top: 1rem;
    padding-bottom: 3rem;
  }
  .rs-sim h2,
  .rs-text h2 {
    font-family: var(--lp-display);
    color: var(--fg);
    font-size: 1.5rem;
    margin: 2rem 0 0.75rem;
  }
  .rs-grid {
    display: grid;
    gap: 1.5rem;
  }
  @media (min-width: 60rem) {
    .rs-grid {
      grid-template-columns: 22rem 1fr;
      align-items: start;
    }
  }
  .rs-controls fieldset {
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.75rem 1rem;
    margin: 0 0 1rem;
  }
  .rs-controls legend {
    color: var(--fg-2);
    font-size: 0.85rem;
    padding: 0 0.35rem;
  }
  .rs-controls label,
  .rs-viewbar label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: var(--fg);
    margin: 0.35rem 0;
  }
  .rs-controls input[type='number'],
  .rs-controls select,
  .rs-viewbar select,
  .rs-viewbar input[type='number'] {
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.3rem 0.4rem;
    font: 13px var(--lp-mono);
    width: 8rem;
    min-width: 0;
  }
  .rs-controls select {
    width: 12rem;
  }
  label.rs-check {
    justify-content: flex-start;
  }
  .u {
    color: var(--fg-2);
    font-size: 0.8rem;
    flex: 0 0 3.5rem;
    text-align: right;
  }
  .rs-derived,
  .rs-note,
  .rs-status {
    font-size: 0.85rem;
    color: var(--fg-2);
  }
  .warnt {
    color: #d9a441;
  }
  .rs-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .rs-viewbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    margin-bottom: 0.5rem;
  }
  .rs-viewbar input[type='number'] {
    width: 4.5rem;
  }
  .rs-scrub {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
  }
  .rs-scrub input[type='range'] {
    flex: 1 1 12rem;
  }
  .mono {
    font: 12px var(--lp-mono);
    color: var(--fg-2);
  }
  .rs-placeholder {
    border: 1px dashed var(--hair);
    border-radius: 3px;
    min-height: 18rem;
    display: grid;
    place-items: center;
    color: var(--fg-2);
    padding: 1rem;
    text-align: center;
  }
  .rs-charts {
    display: grid;
    gap: 1.5rem;
    margin-top: 2rem;
  }
  @media (min-width: 60rem) {
    .rs-charts {
      grid-template-columns: 1fr 1fr;
    }
    .rs-charts figure:first-child {
      grid-column: 1 / -1;
    }
  }
  figure {
    margin: 0;
  }
  figcaption {
    color: var(--fg);
    font-size: 0.95rem;
    margin-bottom: 0.5rem;
  }
  .rs-compare {
    border: 1px solid var(--ok);
    border-radius: 3px;
    padding: 0.75rem 1rem;
    margin-top: 1.5rem;
    color: var(--fg);
  }
  .rs-compare h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .rs-table {
    margin-top: 1.5rem;
    color: var(--fg);
  }
  .rs-table table,
  .rs-checks {
    border-collapse: collapse;
    font: 12px var(--lp-mono);
    width: 100%;
  }
  .rs-table {
    overflow-x: auto;
  }
  .rs-table th,
  .rs-table td,
  .rs-checks th,
  .rs-checks td {
    border-bottom: 1px solid var(--hair);
    padding: 0.25rem 0.5rem;
    text-align: left;
  }
  .sec.rs-text {
    padding-top: 0;
    padding-bottom: 4rem;
    color: var(--fg);
  }
  .rs-text h2:first-child {
    margin-top: 0;
  }
  .rs-head :global(h1),
  .rs-sim h2,
  .rs-text h2,
  .rs-sim :global([id]) {
    scroll-margin-top: calc(var(--lp-nav-h, 3.6rem) + 1rem);
  }
  .lbl {
    flex: 1 1 auto;
    min-width: 0;
  }
  .lbl sub {
    font-size: 0.75em;
  }
  .rs-text p,
  .rs-text li {
    line-height: 1.65;
  }
  .rs-checks {
    display: block;
    overflow-x: auto;
  }
</style>
