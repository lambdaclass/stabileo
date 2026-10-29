<script lang="ts">
  import { researchAssetBase, replayMatchesBuild } from '../shell/assets';
  /**
   * /research/fracture/shauer-2025: the AT2 phase-field notched plate. On load it replays a run of
   * our solver precomputed at build time; Recompute live runs the same Rust solver in the
   * browser (WASM, in a worker). The reference code's own outputs are shown alongside.
   */
  import { onDestroy, onMount } from 'svelte';
  import { snapshots } from './reference-fields';
  import refCsv from '../../../../../research/fracture/shauer-2025/reference-results/ex2_steps.csv?raw';
  import validation from '../../../../../research/fracture/shauer-2025/VALIDATION.json';
  import { rs } from '../i18n';
  import { solverStepCount } from './steps';
  import { compareReference, deepLinkStep } from './comparison';
  import LineChart from './LineChart.svelte';
  import IterationsChart from './IterationsChart.svelte';
  import NumberField from './NumberField.svelte';
  import { SimulationController, pendingMeshMessage, type Frame } from './simulation.svelte';
  import type { PlateConfig, Series, Step } from './protocol';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import { Playback, SOURCE_LABEL, type Source } from '../shell/playback.svelte';
  import { fetchReplay } from '../shell/replay';
  import { num, qty } from '../shell/format';
  import Sci from '../shell/Sci.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import Segmented from '../shell/Segmented.svelte';
  import Toggles from '../shell/Toggles.svelte';
  import ParamRow from '../shell/ParamRow.svelte';

  const strings = $derived(rs());
  const STABILEO = 'var(--rs-plot-ours)';
  const REFERENCE = 'var(--rs-plot-ref)';
  const BASE = `${researchAssetBase}shauer-2025/`;
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
    coarse: { label: 'Coarse: h = 0.0025 mm', mesh: { nx: 40, ny: 40, nx_fine: 16, ny_fine: 8, h_fine: 0.0025 } },
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
  let invalid = $state({ e: false, nu: false, gc: false, l0: false, u: false });
  const valid = $derived(!Object.values(invalid).some(Boolean) && inRange(e, LIMITS.e) && inRange(nu, LIMITS.nu) && inRange(gc, LIMITS.gc) && inRange(l0, LIMITS.l0) && inRange(u, LIMITS.u));

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
    clearTimeout(flashTimer);
  });

  let replay = $state.raw<{ nodes: Float64Array; elements: Uint32Array; frames: Frame[] } | null>(null);
  let replayVerified = $state(false);
  let replayConfig = $state<unknown>(null);
  let replayError = $state<string | null>(null);
  let pane: HTMLElement | undefined = $state();

  onMount(() => {
    const abort = new AbortController();
    fetchReplay<Step>(`${BASE}replay.srpl`, abort.signal)
      .then((d) => {
        if (abort.signal.aborted) return;
        replayConfig = d.header.config;
        replayVerified = replayMatchesBuild(d.header, JSON.parse(REFERENCE_KEY));
        replay = { nodes: d.nodes, elements: d.elements, frames: d.frames };
        playback.setCount(d.frames.length);
        // A link can open the page at a step, with or without the mesh (?step=57&mesh=0).
        const q = new URLSearchParams(location.search);
        if (q.get('mesh') === '0') showMesh = false;
        if (q.get('mesh') === '1') showMesh = true;
        const v = q.get('view');
        if (v === 'plate' || v === 'band' || v === 'tip') view = v;
        if (q.get('deformed') === '0') deformed = false;
        const k = Number(q.get('deform'));
        if (Number.isFinite(k) && k >= 0 && k <= 200 && q.has('deform')) deform = k;
        if (q.get('broken') === 'show') hideBroken = false;
        const linkedStep = deepLinkStep(q.get('step'), d.frames.length);
        if (linkedStep !== null) {
          playback.seek(linkedStep);
          return;
        }
        playback.startAutoplay({
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          narrow: window.innerWidth < 640,
        });
      })
      .catch((err) => {
        if (abort.signal.aborted) return;
        console.warn('research: the precomputed replay could not be loaded', err);
        replayError = 'unavailable';
      });
    const io = new IntersectionObserver(([en]) => playback.setVisible(en.isIntersecting), { threshold: 0.15 });
    if (pane) io.observe(pane);
    return () => {
      abort.abort();
      io.disconnect();
    };
  });

  const run = $derived(sim.current);
  const source = $derived<Source>(run ? (run.origin === 'cached' ? 'cached' : 'live') : 'replay');
  const frames = $derived<Frame[]>(run ? run.frames : (replay?.frames ?? []));
  const nodes = $derived(run ? run.nodes : (replay?.nodes ?? null));
  const elements = $derived(run ? run.elements : (replay?.elements ?? null));
  const shownConfigKey = $derived(run ? JSON.stringify(run.config) : (replayVerified ? REFERENCE_KEY : JSON.stringify(replayConfig)));
  const showsReference = $derived(shownConfigKey === REFERENCE_KEY && (!!run || replayVerified));

  $effect(() => {
    playback.setCount(frames.length);
  });
  const frame = $derived(frames[Math.min(playback.shown, frames.length - 1)] ?? null);

  let field = $state<'damage' | 'disp' | 'syy'>('damage');
  $effect(() => {
    if (field === 'syy' && !frame?.syy) field = 'damage';
  });
  let view = $state<'plate' | 'band' | 'tip'>('plate');
  let deformed = $state(true);
  let deform = $state(10);
  let showMesh = $state(MESH_BY_DEFAULT && (typeof window === 'undefined' || window.innerWidth >= 640));
  let hideBroken = $state(true);
  const TABS = [
    { id: 'viewer', label: 'Viewer' },
    { id: 'force', label: 'Force' },
    { id: 'convergence', label: 'Convergence' },
    { id: 'parameters', label: 'Parameters' },
  ];
  let tab = $state('viewer');
  let flashTab = $state<string | null>(null);
  let forceH = $state(400);
  let convH = $state(600);
  let flashTimer: ReturnType<typeof setTimeout>;
  function showTab(t: string) {
    playback.interact();
    tab = t;
    flashTab = t;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashTab = null), 1300);
  }

  const VIEWS: Record<'plate' | 'band' | 'tip', [number, number, number, number]> = {
    plate: [-0.55, -0.6, 0.55, 0.6],
    band: [-0.5, -0.12, 0.5, 0.12],
    tip: [-0.03, -0.0225, 0.03, 0.0225],
  };

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
    invalid = { e: false, nu: false, gc: false, l0: false, u: false };
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
    goToStep: (s: number) => {
      backToReplay();
      playback.setCount(replay?.frames.length ?? 0);
      playback.seek(s);
    },
    showTab,
    setParams: (p: Record<string, number | string | boolean>) => {
      playback.interact();
      showTab('parameters');
      if (typeof p.l0 === 'number') { l0 = p.l0; invalid.l0 = !inRange(l0, LIMITS.l0); }
      if (typeof p.e === 'number') { e = p.e; invalid.e = !inRange(e, LIMITS.e); }
      if (typeof p.gc === 'number') { gc = p.gc; invalid.gc = !inRange(gc, LIMITS.gc); }
      if (typeof p.mesh === 'string' && p.mesh in MESHES) meshKey = p.mesh as MeshKey;
      if (typeof p.history === 'boolean') history = p.history;
      if (p.reset) reset();
      if (p.run) start(false);
    },
  };

  const expectedSteps = $derived(run && run.status === 'running' ? solverStepCount(run.config.controls.dt, run.config.controls.total_time) : frames.length);

  const forceSeries = $derived.by<Series[]>(() => {
    const out: Series[] = [];
    if (frames.length) out.push({ name: source === 'replay' ? 'Stabileo (Rust, precomputed replay)' : 'Stabileo (Rust, in this browser)', color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.reaction]) });
    if (showsReference) out.push({ name: 'Reference code (Python, committed outputs)', color: REFERENCE, dashed: true, points: reference.map((r) => [r.pseudotime * REF_TOP_DISPLACEMENT, r.reaction]) });
    return out;
  });
  const peakFrame = $derived(frames.length ? frames.reduce((a, f) => (f.step.reaction > a.step.reaction ? f : a), frames[0]) : null);
  const forceLabels = $derived(
    peakFrame
      ? [{ x: peakFrame.step.displacement, y: peakFrame.step.reaction, anchor: 'end' as const, text: showsReference ? `Stabileo (blue), reference (orange halo): peak ${peakFrame.step.reaction.toFixed(4)} kN` : `Stabileo: peak ${peakFrame.step.reaction.toFixed(4)} kN` }]
      : [],
  );
  const residualSeries = $derived.by<Series[]>(() => {
    if (!showsReference || !frames.length) return [];
    return [{ name: 'difference from the reference', color: STABILEO, points: frames.map((f, i) => [f.step.displacement, Math.max(1e-16, Math.abs(f.step.reaction - (reference[i]?.reaction ?? f.step.reaction)))]) }];
  });
  const energyLabels = $derived.by(() => {
    if (!frames.length) return [];
    const last = frames[frames.length - 1].step;
    const peak = frames.reduce((a, f) => (f.step.elastic_energy > a.step.elastic_energy ? f : a), frames[0]).step;
    return [
      { x: peak.displacement, y: peak.elastic_energy, anchor: 'end' as const, text: 'elastic' },
      { x: last.displacement, y: last.fracture_energy, anchor: 'end' as const, text: 'fracture Gc·Γ' },
    ];
  });
  const energySeries = $derived.by<Series[]>(() =>
    frames.length
      ? [
          { name: 'Elastic energy', color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.elastic_energy]) },
          { name: 'Fracture energy Gc·Γ', color: REFERENCE, points: frames.map((f) => [f.step.displacement, f.step.fracture_energy]) },
        ]
      : [],
  );

  const comparison = $derived(showsReference && frames.length && (!run || run.status !== 'running')
    && nodes && elements ? compareReference(frames, reference, { nodes, elements, snapshots, material: JSON.parse(REFERENCE_KEY).material, replay: !run }) : null);

  const fmt = (v: number, d = 4) => (Math.abs(v) >= 1e-3 || v === 0 ? num(v, { dp: d }) : num(v, { sig: 3 }));
  const statusItems = $derived(
    frame
      ? [
          { label: 'step', value: `${frame.step.step} of ${Math.max(expectedSteps, frames.length) - 1}` },
          { label: 'u', value: qty(frame.step.displacement, 'mm', { dp: 5 }) },
          { label: 'F', value: qty(frame.step.reaction, 'kN', { sig: 4 }) },
          { label: 'max d', value: num(frame.step.damage_max, { dp: 4 }) },
        ]
      : [],
  );
  const checks = { passed: validation.checks.filter((c) => c.passed).length, total: validation.checks.length };
</script>

<ExperimentShell
  paperId="shauer-2025"
  name="Phase-field fracture of a notched plate"
  lead="A square plate with a notch from its left edge to the centre is pulled apart at the top. The AT2 phase-field model represents the crack as a damage field d between 0 (intact) and 1 (broken), smeared over a length ℓ. The experiment pane runs the Stabileo Rust implementation in Stabileo’s viewer; the orange curve is what the author’s Python code computed."
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
      In the replay the damage grows smoothly ahead of the notch while <ExperimentLink tab="force">the force</ExperimentLink> rises linearly to
      <ExperimentLink step={56}>the peak load (step 56)</ExperimentLink>; at the next increment
      <ExperimentLink step={57}>the crack runs through the plate in a single step (step 57)</ExperimentLink>, after <ExperimentLink tab="convergence">308 alternating
      iterations</ExperimentLink>, and the force drops to almost zero. <ExperimentLink step={78}>The final state</ExperimentLink> shows the open crack on
      the deformed plate.
    </p>

    <h2>The model</h2>
    <p>Displacement <b>u</b> and damage d are both bilinear on quadrilaterals, integrated with 2×2 Gauss points; plane strain, small strain, quasi-static loading.</p>
    <ul>
      <li><b>Elasticity</b> at fixed d: div(g(d) <b>C</b> : <b>ε</b>(<b>u</b>)) = 0 with g(d) = (1 − d)², applied to the whole stress.</li>
      <li><b>Damage (AT2)</b> at fixed <b>u</b>: (G<sub>c</sub>/ℓ + 2H) d − G<sub>c</sub> ℓ Δd = 2H.</li>
      <li><b>Driving energy</b>: H = ψ<sup>+</sup> = ½ Σ σ<sub>i</sub> ε<sub>i</sub> over the positive principal strains, with σ<sub>i</sub> the undamaged principal stresses: elasticity is degraded fully while damage is driven by tension only, a “hybrid” formulation.</li>
      <li><b>Alternating solution</b> per load step: solve <b>u</b> with the current d, then d with the new <b>u</b>, until the elasticity residual ‖K(d)u − f‖ falls below 10<sup>−5</sup>.</li>
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

    <h2 id="checks">Comparison with the reference</h2>
    <div class="rs-table-scroll" role="region" aria-label="Validation checks" tabindex="0">
    <table class="rs-checks">
      <caption>{validation.checks.length} validation checks run in CI, each with its tolerance</caption>
      <thead><tr><th scope="col">Check</th><th scope="col" class="num">Observed</th><th scope="col" class="num">Tolerance</th><th scope="col">Result</th></tr></thead>
      <tbody>
        {#each validation.checks as c (c.name)}
          <tr><td>{c.name}</td><td class="num">{#if c.metric === 'exact'}{c.passed ? 'equal' : 'differs'}{:else}<Sci value={c.observed} />{/if}</td><td class="num">{#if c.metric === 'exact'}—{:else}<Sci value={c.tolerance} sig={1} />{/if}</td><td class={c.passed ? 'pass' : 'fail'}>{c.passed ? '✓ pass' : '✗ fail'}</td></tr>
        {/each}
      </tbody>
    </table>
    </div>
    <p>
      One finding: the plate is symmetric about the notch plane, and the crack runs along the row of elements just above it in one code and
      just below it in the other. Which row is chosen is decided by floating-point round-off; against the mirror image the final damage
      fields differ by 3.085970368132962 × 10<sup>−10</sup>.
      The thresholds in the table are comparison tolerances, not mathematical error bounds.
      Displacement fields are compared at example 1 step 50, example 2 step 56, and example 3 step 56.
    </p>

    {#if frames.length}
      <details class="rs-table">
        <summary>Step table ({frames.length} steps)</summary>
        <table>
          <thead><tr><th>step</th><th>u, mm</th><th>F, kN</th><th>iterations</th><th>residual</th><th>max d</th>{#if showsReference}<th>reference F, kN</th>{/if}</tr></thead>
          <tbody>
            {#each frames as f, i (i)}
              <tr><td class="num">{f.step.step}</td><td class="num">{num(f.step.displacement, { dp: 5 })}</td><td class="num">{num(f.step.reaction, { sig: 7 })}</td><td class="num">{f.step.iterations}</td><td class="num"><Sci value={f.step.residual} /></td><td class="num">{num(f.step.damage_max, { dp: 4 })}</td>{#if showsReference}<td class="num">{num(reference[i]?.reaction ?? NaN, { sig: 7 })}</td>{/if}</tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}

    <h2>Comparison with the paper</h2>
    <p>Not done: the article’s full text was not accessible to us, so no number printed in it has been compared. Figures here come from our own runs.</p>

    <h2>Limitations</h2>
    <ul>
      <li>Agreement with a reference code is not validation against experiments, and none of this is an engineering certification.</li>
      <li>The reference mesh refines only a 0.04 × 0.04 mm box around the notch tip; beyond it the crack crosses elements wider than 3ℓ.</li>
      <li>No bound constraints: damage can exceed 1 slightly (the reference reaches 1.0096 here and 1.0021897551918642 in example 1) and undershoot 0. The recorded Python reference outputs have minimum nodal damage 3.076336950017797e-08 (example 1), -0.0031224948220514573 (example 2), and -0.06024191772700118 (example 3). This also occurs in the reference code’s unconstrained AT2 discretization. Negative damage is unphysical: (1-d)² at the example 3 minimum is about 1.124, above intact stiffness. Assembly uses interpolated damage at quadrature points, so this is not a 12.4% assembled-stiffness error. The solver does not clamp damage; the replay’s quantized nodal field and colour scale clamp it for display.</li>
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
    <div class="rs-app" lang="en" bind:this={pane} data-steps={frames.length} data-source={source}>
      <p class="rs-mode" data-testid="rs-mode"><span class="dot dot-{source}"></span>{SOURCE_LABEL[source]}</p>
      {#if comparison?.matches && (!run || run.status === 'done')}
        <p class="rs-compare-line" role="status">
          <span class="ok" aria-hidden="true">✓</span>
          {source === 'replay' ? 'This replay' : 'This run'} agrees with reference forces, iterations, pre-peak maximum damage, damage at steps 56/57/78 and displacement at step 56 (replay fields quantized; stress has no reference snapshot): peak {qty(comparison.peak.step.reaction, 'kN', { dp: 6 })} at step {comparison.peak.step.step}, identical iterations at {comparison.sameIterations} of {reference.length} steps.
          <button type="button" class="rs-textbtn" onclick={() => { playback.interact(); tab = 'convergence'; }}>Details</button>
        </p>
      {:else if !run && replay && !replayVerified}
        <p class="rs-compare-line" role="status">Replay build or configuration mismatch: reference comparison disabled.</p>
      {:else if comparison || run?.status === 'unconverged'}
        <p class="rs-compare-line" role="status">{run?.status === 'unconverged' ? 'Non-converged run' : 'Reference mismatch'}: {comparison?.failures.join('; ') || run?.error}</p>
      {/if}
      <PaneTabs oninteract={() => playback.interact()} tabs={TABS} bind:active={tab} flash={flashTab} />

      <div class="rs-panel rs-panel-viewer" id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        {#if nodes && elements}
          <div class="rs-ribbon" onclickcapture={() => playback.interact()}>
            <Segmented
              label="Show"
              bind:value={field}
              options={[
                { id: 'damage', label: 'Damage d' },
                { id: 'disp', label: 'Displacement' },
                { id: 'syy', label: 'σyy', disabled: !frame?.syy, title: frame?.syy ? '' : 'Stress is available after a run in this browser' },
              ]}
            />
            <Toggles
              label="Display"
              items={[
                { label: `Deformed ×${deform}`, on: deformed, toggle: () => (deformed = !deformed) },
                { label: 'Mesh', on: showMesh, toggle: () => (showMesh = !showMesh) },
                { label: 'Hide broken', on: hideBroken, toggle: () => (hideBroken = !hideBroken), title: 'Hide elements with two or more corners at d > 0.95 (the open crack)' },
              ]}
            />
            <Segmented label="View" bind:value={view} options={[{ id: 'plate', label: 'Plate' }, { id: 'band', label: 'Crack band' }, { id: 'tip', label: 'Notch tip' }]} />
          </div>
          <div class="rs-viewer-slot" onpointerdowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onclickcapture={() => playback.interact()}>
            <StabileoViewer
              xy={nodes}
              cells={elements}
              values={fieldValues}
              perCell={field === 'syy'}
            colourMap={field === 'syy' ? 'diverging' : 'sequential'}
              range={fieldRange}
              title={field === 'damage' ? 'Damage d' : field === 'disp' ? '|u|' : 'σyy (degraded)'}
              unit={field === 'damage' ? '' : field === 'disp' ? 'mm' : 'kN/mm²'}
              legendFooter={field === 'damage' ? 'colours clamped to [0, 1]' : field === 'disp' ? 'mm' : 'kN/mm², element centres'}
              displacement={deformed ? (frame?.displacement ?? null) : null}
              deformScale={deform}
              {showMesh}
              {hideCell}
              view={VIEWS[view]}
              height="100%"
              status={statusItems}
              ariaLabel="Stabileo viewer: {field} on the {deformed ? 'deformed' : 'undeformed'} mesh"
            />
          </div>
        {:else}
          <div class="rs-placeholder">{pendingMeshMessage(run, replayError)}</div>
        {/if}
      </div>

      <div class="rs-panel" id="rs-panel-force" role="tabpanel" aria-labelledby="rs-tab-force" hidden={tab !== 'force'} bind:clientHeight={forceH}>
        <figure>
          <figcaption>Reaction force against imposed top displacement</figcaption>
          <LineChart series={forceSeries} xLabel="top displacement u (mm)" yLabel="F (kN)" marker={frame ? frame.step.displacement : null} markerLabel={frame ? `step ${frame.step.step}` : ''} labels={forceLabels} height={Math.max(170, forceH - 190)} />
          {#if residualSeries.length}
            <LineChart series={residualSeries} xLabel="top displacement u (mm)" yLabel="|F − F_ref| (kN)" log rules={[{ y: 1e-5, text: 'force comparison tolerance' }]} marker={frame ? frame.step.displacement : null} height={110} />
          {/if}
          {#if !showsReference}<p class="rs-note">The reference curve is shown only for the reference parameters.</p>{/if}
        </figure>
      </div>

      <div class="rs-panel" id="rs-panel-convergence" role="tabpanel" aria-labelledby="rs-tab-convergence" hidden={tab !== 'convergence'} bind:clientHeight={convH}>
        {#if comparison}
          <div class="rs-compare" id="rs-compare-detail">
            <h3>{source === 'replay' ? 'This replay' : 'This run'} against the reference code</h3>
            <ul>
              <li>Peak force {comparison.peak.step.reaction.toFixed(6)} kN at step {comparison.peak.step.step}; reference {refPeak.reaction.toFixed(6)} kN at step {refPeak.step}.</li>
              <li>Largest relative force difference up to the peak: {comparison.worstPre.toExponential(1)} (test tolerance 1e-9).</li>
              <li>Largest absolute force difference, fracture included: {comparison.worstAll.toExponential(1)} kN (test tolerance 1e-5).</li>
              <li>Identical number of staggered iterations at {comparison.sameIterations} of {reference.length} steps.</li>
            </ul>
          </div>
        {/if}
        {#if frames.length}
          <figure>
            <figcaption>Staggered iterations per load step{showsReference ? ' (dots where the reference differs; none expected)' : ''}</figcaption>
            <IterationsChart steps={frames.map((f) => f.step)} reference={showsReference ? reference.map((r) => r.iterations) : null} height={130} />
          </figure>
          <figure>
            <figcaption>Energies</figcaption>
            <LineChart series={energySeries} xLabel="top displacement u (mm)" yLabel="energy (kN·mm)" marker={frame ? frame.step.displacement : null} labels={energyLabels} height={Math.max(150, convH - (comparison ? 420 : 260))} />
          </figure>
        {/if}
      </div>

      <div class="rs-panel rs-params" id="rs-panel-parameters" role="tabpanel" aria-labelledby="rs-tab-parameters" hidden={tab !== 'parameters'} oninputcapture={() => playback.interact()}>
        <div class="rs-params-list">
          <ParamRow id="p-e" name="Young’s modulus" unit="kN/mm²" hint="10–400" invalid={invalid.e || !inRange(e, LIMITS.e)}>{#snippet symbol()}<var>E</var>{/snippet}<NumberField id="p-e" label="Young’s modulus E, kN/mm²" min={LIMITS.e[0]} max={LIMITS.e[1]} bind:value={e} bind:invalid={invalid.e} /></ParamRow>
          <ParamRow id="p-nu" name="Poisson’s ratio" hint="0–0.45" invalid={invalid.nu || !inRange(nu, LIMITS.nu)}>{#snippet symbol()}<var>ν</var>{/snippet}<NumberField id="p-nu" label="Poisson’s ratio ν" min={LIMITS.nu[0]} max={LIMITS.nu[1]} bind:value={nu} bind:invalid={invalid.nu} /></ParamRow>
          <ParamRow id="p-gc" name="Fracture toughness" unit="kN/mm" hint="0.0001–0.01" invalid={invalid.gc || !inRange(gc, LIMITS.gc)}>{#snippet symbol()}<var>G</var><sub>c</sub>{/snippet}<NumberField id="p-gc" label="Fracture toughness Gc, kN/mm" min={LIMITS.gc[0]} max={LIMITS.gc[1]} bind:value={gc} bind:invalid={invalid.gc} /></ParamRow>
          <ParamRow id="p-l0" name="Length scale" unit="mm" hint="0.003–0.03" invalid={invalid.l0 || !inRange(l0, LIMITS.l0)}>{#snippet symbol()}<var>ℓ</var>{/snippet}<NumberField id="p-l0" label="Length scale ℓ, mm" min={LIMITS.l0[0]} max={LIMITS.l0[1]} bind:value={l0} bind:invalid={invalid.l0} /></ParamRow>
          <ParamRow id="p-u" name="Top displacement at t = 1" unit="mm" hint="0.004–0.02" invalid={invalid.u || !inRange(u, LIMITS.u)}>{#snippet symbol()}<var>u</var>{/snippet}<NumberField id="p-u" label="Top displacement u at t = 1, mm" min={LIMITS.u[0]} max={LIMITS.u[1]} bind:value={u} bind:invalid={invalid.u} /></ParamRow>
          <ParamRow id="p-dt" name="Load step">{#snippet symbol()}Δ<var>t</var>{/snippet}
            <select id="p-dt" bind:value={dt}>
              {#each [0.005, 0.01, 0.02, 0.03, 0.06] as v (v)}<option value={v}>{v} ({solverStepCount(v, 0.8)} steps)</option>{/each}
            </select>
          </ParamRow>
          <ParamRow id="p-mesh" name="Mesh">
            <select id="p-mesh" bind:value={meshKey}>
              {#each Object.entries(MESHES) as [k, m] (k)}<option value={k}>{m.label}</option>{/each}
            </select>
          </ParamRow>
          <label class="rs-check"><input type="checkbox" bind:checked={history} /> History field (irreversibility; not in the reference)</label>
        </div>
        <p class="rs-derived">
          Plane strain, loaded to t = 0.8 ({fmt(0.8 * u)} mm). σ<sub>c</sub> = {fmt(sigmaC, 3)} kN/mm². h/ℓ in the refined box = {hOverL.toFixed(2)}{#if hOverL > 0.5}<strong class="warnt"> — under-resolved (h &gt; ℓ/2)</strong>{/if}.
        </p>
        <div class="rs-buttons">
          {#if run?.status === 'running'}
            <button class="btn btn-ghost btn-sm" type="button" onclick={() => sim.stop()}>Stop</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick={restart}>Restart</button>
          {:else}
            <button class="btn btn-primary btn-sm" type="button" disabled={!valid} onclick={() => start(false)}>Run</button>
            <button class="btn btn-ghost btn-sm" type="button" disabled={!valid} onclick={() => start(true)}>Solve again in this browser</button>
          {/if}
          {#if !isReference}<button class="btn btn-ghost btn-sm" type="button" onclick={reset}>{strings.resetParameters}</button>{/if}
          {#if run}<button class="btn btn-ghost btn-sm" type="button" onclick={backToReplay}>Back to the replay</button>{/if}
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
            Run reuses a result already computed for these parameters, if there is one; Solve again recomputes it here (about 15–30 s).
          {:else}
            Run computes these parameters in your browser.
          {/if}
        </p>
      </div>

      {#if frames.length}
        <div class="rs-scrub">
          <button class="btn btn-ghost btn-sm" type="button" onclick={() => (playback.playing ? playback.pause() : playback.play())}>{playback.playing ? 'Pause' : 'Play'}</button>
          <input type="range" min="0" max={frames.length - 1} value={playback.shown} oninput={(ev) => playback.seek(Number((ev.currentTarget as HTMLInputElement).value))} aria-label="Load step shown" />
          <span class="rs-stepread">step {frame?.step.step ?? 0} of {Math.max(expectedSteps, frames.length) - 1}</span>
        </div>
      {/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .rs-app {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    color: var(--fg);
    min-width: 0;
  }
  .rs-panel {
    min-width: 0;
  }
  .rs-panel[hidden] {
    display: none;
  }
  .rs-panel-viewer {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .rs-viewer-slot {
    height: clamp(18rem, 70vw, 26rem);
    min-height: 0;
  }
  .rs-viewer-slot :global(.rs-viewer-host),
  .rs-viewer-slot :global(.sfv-wrap) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .rs-viewer-slot :global(.sfv) {
    flex: 1 1 auto;
    min-height: 0;
  }
  /* In the sticky pane (wide screens) the app is exactly the pane's height and its panels share
     what is left after the tabs and the step player. Only overflowing panels scroll as a
     fallback on short windows; the article keeps the normal page scroll. */
  @media (min-width: 70rem) {
    .rs-app {
      height: 100%;
    }
    .rs-panel {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: auto;
      scrollbar-gutter: stable;
      scrollbar-color: var(--fg-2) var(--hair);
    }
    .rs-panel::-webkit-scrollbar { width: 10px; }
    .rs-panel::-webkit-scrollbar-track { background: var(--hair); }
    .rs-panel::-webkit-scrollbar-thumb { background: var(--fg-2); border-radius: 5px; }
    .rs-viewer-slot {
      flex: 1 1 auto;
      height: auto;
      min-height: 12rem;
    }
  }
  .rs-stepread {
    font-size: var(--rs-ui);
    color: var(--fg-2);
    white-space: nowrap;
  }
  .rs-mode {
    margin: 0;
    font: var(--rs-ui) var(--st-sans);
    color: var(--fg-2);
    display: flex;
    flex-wrap: wrap;
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
  .rs-scrub {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .rs-scrub input[type='range'] {
    flex: 1 1 auto;
    height: 1.5rem;
    accent-color: var(--st-accent);
  }
  .rs-ribbon {
    display: grid;
    gap: 0.35rem;
  }
  .rs-params-list {
    display: grid;
    gap: 0.15rem;
  }
  .rs-params-list :global(select) {
    height: var(--rs-control-h);
    background: var(--st-surface-3);
    color: var(--fg);
    border: 1px solid var(--rs-control-border);
    border-radius: var(--st-radius, 3px);
    font: 0.9375rem var(--st-sans);
  }
  .rs-check input {
    accent-color: var(--st-accent);
    width: 1.125rem;
    height: 1.125rem;
  }
  .rs-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    font-size: var(--rs-ui);
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

  summary {
    cursor: pointer;
    color: var(--fg);
    font-size: 0.95rem;
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
  .rs-compare-line {
    margin: 0;
    font-size: 0.9rem;
  }
  .rs-compare-line .ok {
    color: var(--ok);
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
    font: var(--rs-small) var(--st-sans);
    font-variant-numeric: tabular-nums;
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
  :global(.rs-checks caption) {
    text-align: left;
    color: var(--fg-2);
    font-size: var(--rs-small);
    padding-bottom: 0.4rem;
  }
  :global(.rs-checks td.num),
  :global(.rs-checks th.num),
  .rs-table :global(td.num) {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  :global(.rs-checks td.pass) {
    color: var(--st-ok);
    white-space: nowrap;
  }
  :global(.rs-checks td.fail) {
    color: var(--st-danger);
  }
  :global(.rs-table-scroll) {
    overflow-x: auto;
  }
  .rs-textbtn {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: var(--lp-accent);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
