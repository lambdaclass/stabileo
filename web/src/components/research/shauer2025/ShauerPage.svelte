<script lang="ts">
  /**
   * /research/fracture/shauer-2025: the AT2 phase-field notched plate. On load it replays a run of
   * our solver precomputed at build time; Recompute live runs the same Rust solver in the
   * browser (WASM, in a worker). The reference code's own outputs are shown alongside.
   */
  import { onDestroy, onMount } from 'svelte';
  import refCsv from '../../../../../research/fracture/shauer-2025/reference-results/ex2_steps.csv?raw';
  import validation from '../../../../../research/fracture/shauer-2025/VALIDATION.json';
  import LineChart from './LineChart.svelte';
  import IterationsChart from './IterationsChart.svelte';
  import NumberField from './NumberField.svelte';
  import { SimulationController, type Frame } from './simulation.svelte';
  import type { PlateConfig, Series, Step } from './protocol';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import { Playback, SOURCE_LABEL, type Source } from '../shell/playback.svelte';
  import { fetchReplay } from '../shell/replay';

  const STABILEO = '#3987e5';
  const REFERENCE = '#d95926';
  const BASE = `${import.meta.env.BASE_URL}research-wasm/shauer-2025/`;
  /** This experiment shows its mesh by default: the refined band is part of the method. */
  const MESH_BY_DEFAULT = true;

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
    coarse: { label: 'Coarse: h = 0.0025 mm in the refined box', mesh: { nx: 40, ny: 40, nx_fine: 16, ny_fine: 8, h_fine: 0.0025 } },
    medium: { label: 'Medium: h = 0.00167 mm', mesh: { nx: 50, ny: 60, nx_fine: 24, ny_fine: 12, h_fine: 1 / 600 } },
    reference: { label: 'Reference: 5 600 elements, h = 0.00125 mm', mesh: { nx: 70, ny: 80, nx_fine: 32, ny_fine: 16, h_fine: 0.00125 } },
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

  function configOf(): PlateConfig {
    return {
      material: { e, nu, gc, l0, plane: 'strain' },
      mesh: { ...MESHES[meshKey].mesh },
      top_displacement: u,
      controls: { dt, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: history ? 'history' : 'none' },
    };
  }
  const REFERENCE_KEY = JSON.stringify({
    material: { e: 210, nu: 0.3, gc: 0.0027, l0: 0.0075, plane: 'strain' },
    mesh: { ...MESHES.reference.mesh },
    top_displacement: 0.01,
    controls: { dt: 0.01, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: 'none' },
  });
  const isReference = $derived(JSON.stringify(configOf()) === REFERENCE_KEY);
  const hOverL = $derived(MESHES[meshKey].mesh.h_fine / l0);
  const sigmaC = $derived(Math.sqrt((27 * e * gc) / (256 * l0)));

  const sim = new SimulationController();
  const playback = new Playback();
  onDestroy(() => {
    sim.dispose();
    playback.dispose();
  });

  let replay = $state.raw<{ nodes: Float64Array; elements: Uint32Array; frames: Frame[] } | null>(null);
  let replayError = $state<string | null>(null);
  let pane: HTMLElement | undefined = $state();

  onMount(() => {
    fetchReplay<Step>(`${BASE}replay.srpl`)
      .then((d) => {
        replay = { nodes: d.nodes, elements: d.elements, frames: d.frames };
        playback.setCount(d.frames.length);
        // A link can open the page at a step, with or without the mesh (?step=57&mesh=0).
        const q = new URLSearchParams(location.search);
        if (q.get('mesh') === '0') showMesh = false;
        if (q.get('mesh') === '1') showMesh = true;
        const v = q.get('view');
        if (v === 'plate' || v === 'band' || v === 'tip') view = v;
        if (q.get('deformed') === '0') deformed = false;
        if (q.has('step')) {
          playback.seek(Number(q.get('step')));
          return;
        }
        playback.startAutoplay({
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          narrow: window.innerWidth < 640,
        });
      })
      .catch((err) => {
        console.warn('research: the precomputed replay could not be loaded', err);
        replayError = 'unavailable';
      });
    const io = new IntersectionObserver(([en]) => playback.setVisible(en.isIntersecting), { threshold: 0.15 });
    if (pane) io.observe(pane);
    return () => io.disconnect();
  });

  const run = $derived(sim.current);
  const source = $derived<Source>(run ? (run.origin === 'cached' ? 'cached' : 'live') : 'replay');
  const frames = $derived<Frame[]>(run ? run.frames : (replay?.frames ?? []));
  const nodes = $derived(run ? run.nodes : (replay?.nodes ?? null));
  const elements = $derived(run ? run.elements : (replay?.elements ?? null));
  const shownConfigKey = $derived(run ? JSON.stringify(run.config) : REFERENCE_KEY);
  const showsReference = $derived(shownConfigKey === REFERENCE_KEY);

  $effect(() => {
    playback.setCount(frames.length);
  });
  const frame = $derived(frames[Math.min(playback.shown, frames.length - 1)] ?? null);

  let field = $state<'damage' | 'disp' | 'syy'>('damage');
  let view = $state<'plate' | 'band' | 'tip'>('plate');
  let deformed = $state(true);
  let deform = $state(10);
  let showMesh = $state(MESH_BY_DEFAULT && (typeof window === 'undefined' || window.innerWidth >= 640));
  let hideBroken = $state(true);

  const VIEWS: Record<'plate' | 'band' | 'tip', [number, number, number, number]> = {
    plate: [-0.55, -0.6, 0.55, 0.6],
    band: [-0.5, -0.12, 0.5, 0.12],
    tip: [-0.03, -0.0225, 0.03, 0.0225],
  };
  const viewer = import('../../viewport/ScalarFieldViewer.svelte');

  const dispMag = $derived.by(() => {
    if (!frame) return null;
    const m = new Float32Array(frame.displacement.length / 2);
    for (let i = 0; i < m.length; i++) m[i] = Math.hypot(frame.displacement[2 * i], frame.displacement[2 * i + 1]);
    return m;
  });
  const fieldValues = $derived(!frame ? null : field === 'damage' ? frame.damage : field === 'disp' ? dispMag : (frame.syy ?? null));
  const fieldRange = $derived.by(() => {
    if (!frame || field === 'damage') return { min: 0, max: 1 };
    const v = field === 'disp' ? dispMag! : frame.syy;
    if (!v) return { min: 0, max: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of v) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    if (field === 'disp') lo = 0;
    return { min: lo, max: hi > lo ? hi : lo + 1e-12 };
  });
  const hideCell = $derived.by(() => {
    if (!hideBroken || !deformed || !frame || !elements) return null;
    const d = frame.damage;
    const el = elements;
    // Two broken corners already put the element across the open crack; drawn, it becomes a
    // stretched sliver from one face of the crack to the other.
    return (c: number) => (d[el[4 * c]] > 0.95 ? 1 : 0) + (d[el[4 * c + 1]] > 0.95 ? 1 : 0) + (d[el[4 * c + 2]] > 0.95 ? 1 : 0) + (d[el[4 * c + 3]] > 0.95 ? 1 : 0) >= 2;
  });

  function start(force: boolean) {
    if (!valid) return;
    playback.interact();
    playback.follow = true;
    playback.playing = false;
    sim.run($state.snapshot(configOf()) as PlateConfig, force);
  }
  function restart() {
    sim.stop();
    start(true);
  }
  function backToReplay() {
    playback.interact();
    sim.clear();
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

  const actions = {
    goToStep: (s: number) => playback.seek(s),
    setParams: (p: Record<string, number | string | boolean>) => {
      playback.interact();
      if (typeof p.l0 === 'number') l0 = p.l0;
      if (typeof p.e === 'number') e = p.e;
      if (typeof p.gc === 'number') gc = p.gc;
      if (typeof p.mesh === 'string' && p.mesh in MESHES) meshKey = p.mesh as MeshKey;
      if (typeof p.history === 'boolean') history = p.history;
      if (p.reset) reset();
      if (p.run) start(false);
    },
  };

  const expectedSteps = $derived(run ? Math.floor(run.config.controls.total_time / run.config.controls.dt + 1e-9) : frames.length);

  const forceSeries = $derived.by<Series[]>(() => {
    const out: Series[] = [];
    if (frames.length) out.push({ name: source === 'replay' ? 'Stabileo (Rust, precomputed replay)' : 'Stabileo (Rust, in this browser)', color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.reaction]), markers: true });
    if (showsReference) out.push({ name: 'Reference code (Python, committed outputs)', color: REFERENCE, dashed: true, points: reference.map((r) => [r.pseudotime * REF_TOP_DISPLACEMENT, r.reaction]) });
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
    if (!showsReference || frames.length !== reference.length) return null;
    if (run && run.status !== 'done') return null;
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
  const statusItems = $derived(
    frame
      ? [
          { label: 'step', value: `${frame.step.step} / ${Math.max(expectedSteps, frames.length) - 1}` },
          { label: 'u', value: `${fmt(frame.step.displacement, 5)} mm` },
          { label: 'F', value: `${fmt(frame.step.reaction)} kN` },
          { label: 'max d', value: frame.step.damage_max.toFixed(4) },
        ]
      : [],
  );
  const checks = { passed: validation.checks.filter((c) => c.passed).length, total: validation.checks.length };
</script>

<ExperimentShell
  paperId="shauer-2025"
  name="Phase-field fracture of a notched plate"
  lead="A square plate with a notch from its left edge to the centre is pulled apart at the top. The AT2 phase-field model represents the crack as a damage field d between 0 (intact) and 1 (broken), smeared over a length ℓ. The experiment on the right is the Stabileo Rust implementation, shown in Stabileo’s viewer; the dashed curve is what the author’s Python code computed."
  {checks}
  {actions}
  sourcePath="research/fracture/shauer-2025"
>
  {#snippet article()}
    <h2>What the paper shows</h2>
    <p>
      The article presents a self-contained Python finite element code, under 500 lines, for brittle fracture with the phase-field method,
      and uses it on three examples: a bar in tension compared with the one-dimensional AT2 solution, a single-edge notched plate in
      tension (this page), and a three-point bending test. We read the code in full (the article’s text was not accessible to us) and
      everything below about the method comes from it.
    </p>
    <p>
      In the replay on the right the damage grows smoothly ahead of the notch while the force rises linearly to
      <ExperimentLink step={56}>the peak load (step 56)</ExperimentLink>; at the next increment
      <ExperimentLink step={57}>the crack runs through the plate in a single step (step 57)</ExperimentLink>, after 308 alternating
      iterations, and the force drops to almost zero. <ExperimentLink step={78}>The final state</ExperimentLink> shows the open crack on
      the deformed plate.
    </p>

    <h2>The model</h2>
    <p>Displacement <b>u</b> and damage d are both bilinear on quadrilaterals, integrated with 2×2 Gauss points; plane strain, small strain, quasi-static loading.</p>
    <ul>
      <li><b>Elasticity</b> at fixed d: div(g(d) <b>C</b> : <b>ε</b>(<b>u</b>)) = 0 with g(d) = (1 − d)², applied to the whole stress.</li>
      <li><b>Damage (AT2)</b> at fixed <b>u</b>: (G<sub>c</sub>/ℓ + 2H) d − G<sub>c</sub> ℓ Δd = 2H.</li>
      <li><b>Driving energy</b>: H = ψ⁺ = ½ Σ σ<sub>i</sub> ε<sub>i</sub> over the positive principal strains, with σ<sub>i</sub> the undamaged principal stresses: elasticity is degraded fully while damage is driven by tension only, a “hybrid” formulation.</li>
      <li><b>Alternating solution</b> per load step: solve <b>u</b> with the current d, then d with the new <b>u</b>, until the elasticity residual ‖K(d)u − f‖ falls below 10⁻⁵.</li>
      <li><b>Irreversibility</b>: none in the reference code; damage is recomputed from the current energy and is not bounded by 1. <ExperimentLink params={{ history: true, run: true }}>Turn on the history field</ExperimentLink> to keep it on unloading (not in the reference).</li>
    </ul>
    <p>
      Units are kN and mm. The homogeneous AT2 peak stress σ<sub>c</sub> = √(27 E G<sub>c</sub> / 256 ℓ) ≈ 2.82 kN/mm² here, so ℓ behaves as a
      strength as much as a regularisation length: <ExperimentLink params={{ l0: 0.015, run: true }}>try ℓ = 0.015 mm</ExperimentLink> and the
      peak load falls. The mesh matters too: the crack band needs elements a few times smaller than ℓ;
      <ExperimentLink params={{ mesh: 'coarse', run: true }}>try the coarse mesh</ExperimentLink>.
    </p>

    <h2>How we reproduced it</h2>
    <ol>
      <li>The author’s code (commit 61037c6, MIT licence) was run unmodified for its three examples in Python 3.12.15 with numpy 2.1.3 and scipy 1.14.1; every step’s force, iteration count, residual and damage range, and nodal fields at chosen steps, were saved with a manifest of versions and checksums.</li>
      <li>The Rust implementation regenerates the same meshes (bit-identical), applies the same boundary conditions, loop and stopping rule, and solves with the Stabileo engine’s sparse Cholesky factorisation.</li>
      <li>{validation.checks.length} named checks compare the two, each with a stated tolerance, in continuous integration. The browser bundle and the replay on this page are checked separately against the native build.</li>
    </ol>

    <h2>Comparison with the reference</h2>
    <table class="rs-checks">
      <thead><tr><th>Check</th><th>Observed</th><th>Tolerance</th><th></th></tr></thead>
      <tbody>
        {#each validation.checks as c (c.name)}
          <tr><td>{c.name}</td><td>{c.metric === 'exact' ? (c.passed ? 'equal' : 'differs') : c.observed.toExponential(1)}</td><td>{c.metric === 'exact' ? '—' : c.tolerance.toExponential(0)}</td><td>{c.passed ? 'pass' : 'FAIL'}</td></tr>
        {/each}
      </tbody>
    </table>
    <p>
      One finding: the plate is symmetric about the notch plane, and the crack runs along the row of elements just above it in one code and
      just below it in the other. Which row is chosen is decided by floating-point round-off; against the mirror image the final damage
      fields agree to 3·10⁻¹⁰.
    </p>

    <h2>Comparison with the paper</h2>
    <p>Not done: the article’s full text was not accessible to us, so no number printed in it has been compared. Figures here come from our own runs.</p>

    <h2>Limitations</h2>
    <ul>
      <li>Agreement with a reference code is not validation against experiments, and none of this is an engineering certification.</li>
      <li>The reference mesh refines only a 0.04 × 0.04 mm box around the notch tip; beyond it the crack crosses elements wider than 3ℓ.</li>
      <li>No bound constraints: damage can exceed 1 slightly (the reference reaches 1.0096 here) and undershoot 0 on coarse meshes. Values are shown as computed; only the colour scale is clamped.</li>
      <li>The alternating scheme is not accelerated; at unstable crack growth it can take hundreds of iterations in one step.</li>
      <li>Browser runs are limited in mesh size and parameter range.</li>
    </ul>

    <h2>Code and references</h2>
    <ul>
      <li>Implementation, tests and reference outputs: <a href="https://github.com/lambdaclass/stabileo/tree/main/research/fracture/shauer-2025" rel="noreferrer" target="_blank">research/fracture/shauer-2025</a> (mesh generators and loop adapted from the MIT reference, credited in the source).</li>
      <li>Reference code: <a href="https://github.com/nathanshauer/phasefield-jr-py" rel="noreferrer" target="_blank">github.com/nathanshauer/phasefield-jr-py</a>, MIT, © 2025 Nathan Shauer.</li>
    </ul>
  {/snippet}

  {#snippet app()}
    <div class="rs-app" bind:this={pane} data-steps={frames.length} data-source={source}>
      <p class="rs-mode" data-testid="rs-mode"><span class="dot dot-{source}"></span>{SOURCE_LABEL[source]}</p>

      {#if nodes && elements}
        {#await viewer then m}
          <m.default
            xy={nodes}
            cells={elements}
            values={fieldValues}
            perCell={field === 'syy'}
            range={fieldRange}
            title={field === 'damage' ? 'Damage d' : field === 'disp' ? '|u|' : 'σyy (degraded)'}
            unit={field === 'damage' ? '' : field === 'disp' ? 'mm' : 'kN/mm²'}
            legendFooter={field === 'damage' ? 'colours clamped to [0, 1]' : field === 'disp' ? 'mm' : 'kN/mm², element centres'}
            displacement={deformed ? (frame?.displacement ?? null) : null}
            deformScale={deform}
            {showMesh}
            {hideCell}
            view={VIEWS[view]}
            height="min(26rem, 62vw)"
            status={statusItems}
            ariaLabel="Stabileo viewer: {field} on the {deformed ? 'deformed' : 'undeformed'} mesh"
          >
            {#snippet toolbar()}
              <div class="rs-ribbon" role="group" aria-label="Result shown" onclickcapture={() => playback.interact()}>
                <button class="diagram-btn" class:active={field === 'damage'} onclick={() => (field = 'damage')}>Damage d</button>
                <button class="diagram-btn" class:active={field === 'disp'} onclick={() => (field = 'disp')}>Displacement</button>
                <button class="diagram-btn" class:active={field === 'syy'} disabled={!frame?.syy} title={frame?.syy ? '' : 'Stress is available after a live run'} onclick={() => (field = 'syy')}>σyy</button>
                <span class="rs-sep"></span>
                <button class="diagram-btn" class:active={deformed} onclick={() => (deformed = !deformed)}>Deformed ×{deform}</button>
                <button class="diagram-btn" class:active={showMesh} onclick={() => (showMesh = !showMesh)}>Mesh</button>
                <button class="diagram-btn" class:active={hideBroken} onclick={() => (hideBroken = !hideBroken)} title="Hide elements with two or more corners at d > 0.95 (the open crack)">Hide broken</button>
                <span class="rs-sep"></span>
                <button class="diagram-btn" class:active={view === 'plate'} onclick={() => (view = 'plate')}>Plate</button>
                <button class="diagram-btn" class:active={view === 'band'} onclick={() => (view = 'band')}>Crack band</button>
                <button class="diagram-btn" class:active={view === 'tip'} onclick={() => (view = 'tip')}>Notch tip</button>
              </div>
            {/snippet}
          </m.default>
        {/await}
      {:else}
        <div class="rs-placeholder">{replayError ? 'The precomputed replay couldn’t be loaded. Press Recompute live to compute it in your browser.' : 'Loading the replay…'}</div>
      {/if}

      {#if frames.length}
        <div class="rs-scrub">
          <button class="btn btn-sm" type="button" onclick={() => (playback.playing ? playback.pause() : playback.play())}>{playback.playing ? 'Pause' : 'Play'}</button>
          <input type="range" min="0" max={frames.length - 1} value={playback.shown} oninput={(ev) => playback.seek(Number((ev.currentTarget as HTMLInputElement).value))} aria-label="Load step shown" />
        </div>
        <p class="rs-note">Unconstrained AT2, as in the reference code, can give d slightly above 1; values are shown as computed, only the colours are clamped to [0, 1].</p>
      {/if}

      <details class="rs-params" open oninputcapture={() => playback.interact()}>
        <summary>Parameters</summary>
        <div class="rs-grid2">
          <label><span class="lbl"><i>E</i></span><NumberField label="E, Young’s modulus, kN/mm²" min={LIMITS.e[0]} max={LIMITS.e[1]} bind:value={e} /><span class="u">kN/mm²</span></label>
          <label><span class="lbl"><i>ν</i></span><NumberField label="ν, Poisson’s ratio" min={LIMITS.nu[0]} max={LIMITS.nu[1]} bind:value={nu} /><span class="u"></span></label>
          <label><span class="lbl"><i>G</i><sub>c</sub></span><NumberField label="Gc, fracture toughness, kN/mm" min={LIMITS.gc[0]} max={LIMITS.gc[1]} bind:value={gc} /><span class="u">kN/mm</span></label>
          <label><span class="lbl"><i>ℓ</i></span><NumberField label="ℓ, length scale, mm" min={LIMITS.l0[0]} max={LIMITS.l0[1]} bind:value={l0} /><span class="u">mm</span></label>
          <label><span class="lbl">top <i>u</i> at <i>t</i> = 1</span><NumberField label="Top displacement at t = 1, mm" min={LIMITS.u[0]} max={LIMITS.u[1]} bind:value={u} /><span class="u">mm</span></label>
          <label><span class="lbl">Δ<i>t</i></span>
            <select bind:value={dt} aria-label="Load step">
              {#each [0.005, 0.01, 0.02, 0.03, 0.06] as v (v)}<option value={v}>{v} ({Math.floor(0.8 / v + 1e-9)} steps)</option>{/each}
            </select><span class="u"></span>
          </label>
          <label class="wide"><span class="lbl">Mesh</span>
            <select bind:value={meshKey} aria-label="Mesh">
              {#each Object.entries(MESHES) as [k, m] (k)}<option value={k}>{m.label}</option>{/each}
            </select>
          </label>
          <label class="wide rs-check"><input type="checkbox" bind:checked={history} /> History field (irreversibility; not in the reference)</label>
        </div>
        <p class="rs-derived">
          Plane strain, loaded to t = 0.8 ({fmt(0.8 * u)} mm). σ<sub>c</sub> = {fmt(sigmaC, 3)} kN/mm². h/ℓ in the refined box = {hOverL.toFixed(2)}{#if hOverL > 0.5}<strong class="warnt"> — under-resolved (h &gt; ℓ/2)</strong>{/if}.
        </p>
        {#if !valid}
          <p class="warnt">Outside the browser limits: E {LIMITS.e.join('–')}, ν {LIMITS.nu.join('–')}, Gc {LIMITS.gc.join('–')}, ℓ {LIMITS.l0.join('–')}, u {LIMITS.u.join('–')}.</p>
        {/if}
        <div class="rs-buttons">
          {#if run?.status === 'running'}
            <button class="btn" type="button" onclick={() => sim.stop()}>Stop</button>
            <button class="btn" type="button" onclick={restart}>Restart</button>
          {:else}
            <button class="btn btn-primary" type="button" disabled={!valid} onclick={() => start(false)}>Run</button>
            <button class="btn" type="button" disabled={!valid} onclick={() => start(true)}>Recompute live</button>
          {/if}
          {#if !isReference}<button class="btn" type="button" onclick={reset}>Reference parameters</button>{/if}
          {#if run}<button class="btn" type="button" onclick={backToReplay}>Back to the replay</button>{/if}
        </div>
        <p class="rs-status" aria-live="polite">
          {#if sim.available === false}
            <span class="warnt">The in-browser solver couldn’t be loaded in this build; the replay above is still our solver’s run.</span>
          {:else if run?.status === 'running'}
            Solving step {frames.length + 1} of {expectedSteps}…
          {:else if run?.status === 'done'}
            Done: {frames.length} steps{run.seconds ? ` in ${run.seconds.toFixed(1)} s` : ''}. Completed runs are kept, so earlier parameters replay instantly.
          {:else if run?.status === 'stopped'}
            Stopped after {frames.length} steps.
          {:else if run?.status === 'error'}
            <span class="warnt">The solver refused the input: {run.error}</span>
          {:else if isReference}
            Run shows this replay’s parameters from memory or computes them; Recompute live always solves again (about 15–30 s).
          {:else}
            Run computes these parameters in your browser.
          {/if}
        </p>
      </details>

      <figure>
        <figcaption>Reaction force against imposed top displacement</figcaption>
        <LineChart series={forceSeries} xLabel="top displacement u, mm" yLabel="force F, kN" fx={(v) => v.toFixed(4)} fy={(v) => v.toFixed(2)} marker={frame ? frame.step.displacement : null} height={220} />
        {#if !showsReference}<p class="rs-note">The reference curve is shown only for the reference parameters.</p>{/if}
      </figure>

      {#if comparison}
        <div class="rs-compare" role="status">
          <h3>{source === 'replay' ? 'This replay' : 'This run'} against the reference code</h3>
          <ul>
            <li>Peak force {comparison.peak.step.reaction.toFixed(6)} kN at step {comparison.peak.step.step}; reference {refPeak.reaction.toFixed(6)} kN at step {refPeak.step}.</li>
            <li>Largest relative force difference up to the peak: {comparison.worstPre.toExponential(1)} (test tolerance 1e-9).</li>
            <li>Largest absolute force difference, fracture included: {comparison.worstAll.toExponential(1)} kN (bounded by the staggered tolerance 1e-5).</li>
            <li>Identical number of staggered iterations at {comparison.sameIterations} of {reference.length} steps.</li>
          </ul>
        </div>
      {/if}

      {#if frames.length}
        <details class="rs-more">
          <summary>Convergence and energies</summary>
          <figure>
            <figcaption>Staggered iterations per load step{showsReference ? ' (dots where the reference differs; none expected)' : ''}</figcaption>
            <IterationsChart steps={frames.map((f) => f.step)} reference={showsReference ? reference.map((r) => r.iterations) : null} />
          </figure>
          <figure>
            <figcaption>Energies</figcaption>
            <LineChart series={energySeries} xLabel="top displacement u, mm" yLabel="energy, kN·mm" fx={(v) => v.toFixed(4)} fy={(v) => v.toExponential(1)} marker={frame ? frame.step.displacement : null} height={200} />
          </figure>
          <details class="rs-table">
            <summary>Step table ({frames.length} steps)</summary>
            <table>
              <thead><tr><th>step</th><th>u, mm</th><th>F, kN</th><th>iterations</th><th>residual</th><th>max d</th>{#if showsReference}<th>reference F, kN</th>{/if}</tr></thead>
              <tbody>
                {#each frames as f, i (i)}
                  <tr><td>{f.step.step}</td><td>{f.step.displacement.toFixed(5)}</td><td>{f.step.reaction.toExponential(6)}</td><td>{f.step.iterations}</td><td>{f.step.residual.toExponential(2)}</td><td>{f.step.damage_max.toFixed(4)}</td>{#if showsReference}<td>{reference[i]?.reaction.toExponential(6)}</td>{/if}</tr>
                {/each}
              </tbody>
            </table>
          </details>
        </details>
      {/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .rs-app {
    display: grid;
    gap: 0.9rem;
    color: var(--fg);
  }
  .rs-mode {
    margin: 0;
    font: 12px var(--lp-mono);
    color: var(--fg-2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .dot-replay {
    background: #8fa3b3;
  }
  .dot-live {
    background: #2aa869;
  }
  .dot-cached {
    background: #4a8fd4;
  }
  .rs-ribbon {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
  }
  .rs-ribbon :global(.diagram-btn) {
    padding: 0.25rem 0.5rem;
  }
  .rs-ribbon :global(.diagram-btn:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .rs-sep {
    width: 1px;
    align-self: stretch;
    background: var(--hair);
    margin: 0 0.2rem;
  }
  .rs-scrub {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .rs-scrub input[type='range'] {
    flex: 1 1 auto;
  }
  .rs-placeholder {
    border: 1px dashed var(--hair);
    border-radius: 3px;
    min-height: 16rem;
    display: grid;
    place-items: center;
    color: var(--fg-2);
    padding: 1rem;
    text-align: center;
  }
  .rs-params,
  .rs-more {
    border: 1px solid var(--hair);
    border-radius: 4px;
    padding: 0.5rem 0.9rem;
  }
  summary {
    cursor: pointer;
    color: var(--fg);
    font-size: 0.95rem;
  }
  .rs-grid2 {
    display: grid;
    gap: 0.35rem 1.25rem;
    margin-top: 0.6rem;
  }
  @media (min-width: 34rem) {
    .rs-grid2 {
      grid-template-columns: 1fr 1fr;
    }
    .rs-grid2 .wide {
      grid-column: 1 / -1;
    }
  }
  .rs-grid2 label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  .lbl {
    flex: 0 0 5.5rem;
    white-space: nowrap;
  }
  .lbl sub {
    font-size: 0.75em;
  }
  .u {
    color: var(--fg-2);
    font-size: 0.78rem;
    flex: 0 0 3.5rem;
  }
  .rs-grid2 select {
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.3rem 0.4rem;
    font: 13px var(--lp-mono);
    min-width: 0;
    flex: 1 1 auto;
  }
  .rs-check {
    justify-content: flex-start;
  }
  .rs-derived,
  .rs-note,
  .rs-status {
    font-size: 0.82rem;
    color: var(--fg-2);
    margin: 0.4rem 0;
  }
  .warnt {
    color: #d9a441;
  }
  .rs-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  figure {
    margin: 0;
  }
  figcaption {
    color: var(--fg);
    font-size: 0.92rem;
    margin-bottom: 0.4rem;
  }
  .rs-compare {
    border: 1px solid var(--ok);
    border-radius: 3px;
    padding: 0.6rem 0.9rem;
    font-size: 0.88rem;
  }
  .rs-compare h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }
  .rs-compare ul {
    margin: 0;
    padding-left: 1.1rem;
  }
  .rs-table {
    overflow-x: auto;
  }
  .rs-table table,
  :global(.rs-checks) {
    border-collapse: collapse;
    font: 12px var(--lp-mono);
    width: 100%;
  }
  .rs-table th,
  .rs-table td,
  :global(.rs-checks th),
  :global(.rs-checks td) {
    border-bottom: 1px solid var(--hair);
    padding: 0.25rem 0.5rem;
    text-align: left;
  }
  :global(.rs-checks) {
    display: block;
    overflow-x: auto;
  }
</style>
