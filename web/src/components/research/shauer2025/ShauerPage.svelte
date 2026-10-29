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
  import { rs, researchLocale } from '../i18n';
  import { solverStepCount } from './steps';
  import { compareReference, deepLinkStep } from './comparison';
  import LineChart from './LineChart.svelte';
  import IterationsChart from './IterationsChart.svelte';
  import NumberField from './NumberField.svelte';
  import { SimulationController, pendingMeshMessage, type Frame } from './simulation.svelte';
  import type { PlateConfig, Series, Step } from './protocol';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
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
    coarse: { label: 'coarseMesh', mesh: { nx: 40, ny: 40, nx_fine: 16, ny_fine: 8, h_fine: 0.0025 } },
    medium: { label: 'mediumMesh', mesh: { nx: 50, ny: 60, nx_fine: 24, ny_fine: 12, h_fine: 1 / 600 } },
    reference: { label: 'referenceMesh', mesh: { nx: 70, ny: 80, nx_fine: 32, ny_fine: 16, h_fine: 0.00125 } },
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
  const TABS = $derived([
    { id: 'viewer', label: strings.viewer },
    { id: 'force', label: strings.force },
    { id: 'convergence', label: strings.convergence },
    { id: 'parameters', label: strings.parameters },
  ]);
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
    if (frames.length) out.push({ name: source === 'replay' ? strings.precomputedSeries : strings.browserSeries, color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.reaction]) });
    if (showsReference) out.push({ name: strings.referenceSeries, color: REFERENCE, dashed: true, points: reference.map((r) => [r.pseudotime * REF_TOP_DISPLACEMENT, r.reaction]) });
    return out;
  });
  const peakFrame = $derived(frames.length ? frames.reduce((a, f) => (f.step.reaction > a.step.reaction ? f : a), frames[0]) : null);
  const forceLabels = $derived(
    peakFrame
      ? [{ x: peakFrame.step.displacement, y: peakFrame.step.reaction, anchor: 'end' as const, text: showsReference ? `${strings.peakReferenceLabel} ${peakFrame.step.reaction.toFixed(4)} kN` : `${strings.peakLabel} ${peakFrame.step.reaction.toFixed(4)} kN` }]
      : [],
  );
  const residualSeries = $derived.by<Series[]>(() => {
    if (!showsReference || !frames.length) return [];
    return [{ name: strings.referenceDifference, color: STABILEO, points: frames.map((f, i) => [f.step.displacement, Math.max(1e-16, Math.abs(f.step.reaction - (reference[i]?.reaction ?? f.step.reaction)))]) }];
  });
  const energyLabels = $derived.by(() => {
    if (!frames.length) return [];
    const last = frames[frames.length - 1].step;
    const peak = frames.reduce((a, f) => (f.step.elastic_energy > a.step.elastic_energy ? f : a), frames[0]).step;
    return [
      { x: peak.displacement, y: peak.elastic_energy, anchor: 'end' as const, text: strings.elasticLabel },
      { x: last.displacement, y: last.fracture_energy, anchor: 'end' as const, text: strings.fractureLabel },
    ];
  });
  const energySeries = $derived.by<Series[]>(() =>
    frames.length
      ? [
          { name: strings.elasticEnergy, color: STABILEO, points: frames.map((f) => [f.step.displacement, f.step.elastic_energy]) },
          { name: strings.fractureEnergy, color: REFERENCE, points: frames.map((f) => [f.step.displacement, f.step.fracture_energy]) },
        ]
      : [],
  );

  const comparison = $derived(showsReference && frames.length && (!run || run.status !== 'running')
    && nodes && elements ? compareReference(frames, reference, { nodes, elements, snapshots, material: JSON.parse(REFERENCE_KEY).material, replay: !run }) : null);

  const fmt = (v: number, d = 4) => (Math.abs(v) >= 1e-3 || v === 0 ? num(v, { dp: d }) : num(v, { sig: 3 }));
  const statusItems = $derived(
    frame
      ? [
          { label: strings.step, value: `${frame.step.step} ${strings.of} ${Math.max(expectedSteps, frames.length) - 1}` },
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
  name={strings.shauerTitle}
  lead={strings.shauerLead}
  {checks}
  {actions}
  sourcePath="research/fracture/shauer-2025"
>
  {#snippet article()}
    <h2>{strings.paperShows}</h2>
    <p>
      {strings.paperOverview}
    </p>
    <p>
      {strings.replayGrowth} <ExperimentLink tab="force">{strings.theForce}</ExperimentLink> {strings.risesTo}
      <ExperimentLink step={56}>{strings.peakStepLink}</ExperimentLink>{strings.nextIncrement}
      <ExperimentLink step={57}>{strings.crackStepLink}</ExperimentLink>{strings.afterComma} <ExperimentLink tab="convergence">{strings.alternating308}</ExperimentLink>{strings.forceDrops} <ExperimentLink step={78}>{strings.finalState}</ExperimentLink> {strings.openCrack}
    </p>

    <h2>{strings.modelHeading}</h2>
    <p>{strings.displacement} <b>u</b> {strings.bilinearModel}</p>
    <ul>
      <li><b>{strings.elasticity}</b> {strings.fixedDamage} <b>C</b> : <b>ε</b>(<b>u</b>{strings.wholeStress}</li>
      <li><b>{strings.damageAT2}</b> {strings.atFixed} <b>u</b>: (G<sub>c</sub>/ℓ + 2H) d − G<sub>c</sub> ℓ Δd = 2H.</li>
      <li><b>{strings.drivingEnergy}</b>: H = ψ<sup>+</sup> = ½ Σ σ<sub>i</sub> ε<sub>i</sub> {strings.positiveStrains}<sub>i</sub> {strings.hybridModel}</li>
      <li><b>{strings.alternatingSolution}</b> {strings.solvePerStep} <b>u</b> {strings.currentDamage} <b>u</b>{strings.residualThreshold}<sup>−5</sup>.</li>
      <li><b>{strings.irreversibility}</b>{strings.noIrreversibility} <ExperimentLink params={{ history: true, run: true }}>{strings.enableHistory}</ExperimentLink> {strings.keepOnUnloading}</li>
    </ul>
    <p>
      {strings.unitsAndPeak}<sub>c</sub> = √(27 E G<sub>c</sub> {strings.lengthStrength} <ExperimentLink params={{ l0: 0.015, run: true }}>{strings.tryLength}</ExperimentLink> {strings.meshMatters}
      <ExperimentLink params={{ mesh: 'coarse', run: true }}>{strings.tryCoarse}</ExperimentLink>.
    </p>

    <h2>{strings.reproductionHeading}</h2>
    <ol>
      <li>{strings.referenceProcedure}</li>
      <li>{strings.rustProcedure}</li>
      <li>{validation.checks.length} {strings.checksProcedure}</li>
    </ol>

    <h2 id="checks">{strings.referenceComparison}</h2>
    <div class="rs-table-scroll" role="region" aria-label={strings.validationChecks} tabindex="0">
    <table class="rs-checks">
      <caption>{validation.checks.length} {strings.checksCaption}</caption>
      <thead><tr><th scope="col">{strings.check}</th><th scope="col" class="num">{strings.observed}</th><th scope="col" class="num">{strings.tolerance}</th><th scope="col">{strings.result}</th></tr></thead>
      <tbody>
        {#each validation.checks as c (c.name)}
          <tr><td>{c.name}</td><td class="num">{#if c.metric === 'exact'}{c.passed ? strings.equal : strings.differs}{:else}<Sci value={c.observed} />{/if}</td><td class="num">{#if c.metric === 'exact'}—{:else}<Sci value={c.tolerance} sig={1} />{/if}</td><td class={c.passed ? 'pass' : 'fail'}>{c.passed ? strings.pass : strings.fail}</td></tr>
        {/each}
      </tbody>
    </table>
    </div>
    <p>
      {strings.symmetryFinding}<sup>−10</sup>{strings.toleranceMeaning}
    </p>

    {#if frames.length}
      <details class="rs-table">
        <summary>{strings.stepTable}{frames.length} {strings.stepsParen}</summary>
        <table>
          <thead><tr><th>{strings.step}</th><th>u, mm</th><th>F, kN</th><th>{strings.iterations}</th><th>{strings.residual}</th><th>max d</th>{#if showsReference}<th>{strings.referenceForce}</th>{/if}</tr></thead>
          <tbody>
            {#each frames as f, i (i)}
              <tr><td class="num">{f.step.step}</td><td class="num">{num(f.step.displacement, { dp: 5 })}</td><td class="num">{num(f.step.reaction, { sig: 7 })}</td><td class="num">{f.step.iterations}</td><td class="num"><Sci value={f.step.residual} /></td><td class="num">{num(f.step.damage_max, { dp: 4 })}</td>{#if showsReference}<td class="num">{num(reference[i]?.reaction ?? NaN, { sig: 7 })}</td>{/if}</tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}

    <h2>{strings.paperComparison}</h2>
    <p>{strings.paperNotCompared}</p>

    <h2>{strings.limitations}</h2>
    <ul>
      <li>{strings.noCertification}</li>
      <li>{strings.meshLimitation}</li>
      <li>{strings.damageLimitation}</li>
      <li>{strings.iterationLimitation}</li>
      <li>{strings.browserLimitation}</li>
    </ul>

    <h2>{strings.codeReferences}</h2>
    <ul>
      <li>{strings.implementationOutputs} <a href="https://github.com/lambdaclass/stabileo/tree/main/research/fracture/shauer-2025" rel="noreferrer" target="_blank">{"shauer-2025"}</a> {strings.adaptationCredit}</li>
      <li>{strings.referenceCode} <a href="https://github.com/nathanshauer/phasefield-jr-py" rel="noreferrer" target="_blank">{"github.com/nathanshauer/phasefield-jr-py"}</a>{", MIT, © 2025 Nathan Shauer."}</li>
    </ul>
  {/snippet}

  {#snippet app()}
    <div class="rs-app" lang={researchLocale()} bind:this={pane} data-steps={frames.length} data-source={source}>
      <p class="rs-mode" data-testid="rs-mode"><span class="dot dot-{source}"></span>{source === 'replay' ? strings.replaySource : source === 'live' ? strings.liveSource : strings.cachedSource}</p>
      {#if comparison?.matches && (!run || run.status === 'done')}
        <p class="rs-compare-line" role="status">
          <span class="ok" aria-hidden="true">✓</span>
          {source === 'replay' ? strings.thisReplay : strings.thisRun} {strings.comparisonMatches} {qty(comparison.peak.step.reaction, 'kN', { dp: 6 })} {strings.atStep} {comparison.peak.step.step}{strings.identicalIterationsAt} {comparison.sameIterations} {strings.of} {reference.length} {strings.stepsPeriod}
          <button type="button" class="rs-textbtn" onclick={() => { playback.interact(); tab = 'convergence'; }}>{strings.details}</button>
        </p>
      {:else if !run && replay && !replayVerified}
        <p class="rs-compare-line" role="status">{strings.replayMismatch}</p>
      {:else if comparison || run?.status === 'unconverged'}
        <p class="rs-compare-line" role="status">{run?.status === 'unconverged' ? strings.nonConverged : strings.referenceMismatch}: {comparison?.failures.join('; ') || run?.error}</p>
      {/if}
      <PaneTabs oninteract={() => playback.interact()} tabs={TABS} bind:active={tab} flash={flashTab} />

      <div class="rs-panel rs-panel-viewer" id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        {#if nodes && elements}
          <div class="rs-ribbon" onclickcapture={() => playback.interact()}>
            <Segmented
              label={strings.show}
              bind:value={field}
              options={[
                { id: 'damage', label: strings.damageField },
                { id: 'disp', label: strings.displacement },
                { id: 'syy', label: 'σyy', disabled: !frame?.syy, title: frame?.syy ? '' : strings.stressAvailable },
              ]}
            />
            <Toggles
              label={strings.display}
              items={[
                { label: `${strings.deformed} ×${deform}`, on: deformed, toggle: () => (deformed = !deformed) },
                { label: strings.mesh, on: showMesh, toggle: () => (showMesh = !showMesh) },
                { label: strings.hideBroken, on: hideBroken, toggle: () => (hideBroken = !hideBroken), title: strings.hideBrokenHint },
              ]}
            />
            <Segmented label={strings.view} bind:value={view} options={[{ id: 'plate', label: strings.plate }, { id: 'band', label: strings.crackBand }, { id: 'tip', label: strings.notchTip }]} />
          </div>
          <div class="rs-viewer-slot" onpointerdowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onclickcapture={() => playback.interact()}>
            <StabileoViewer
              xy={nodes}
              cells={elements}
              values={fieldValues}
              perCell={field === 'syy'}
            colourMap={field === 'syy' ? 'diverging' : 'sequential'}
              range={fieldRange}
              title={field === 'damage' ? strings.damageField : field === 'disp' ? '|u|' : strings.degradedStress}
              unit={field === 'damage' ? '' : field === 'disp' ? 'mm' : 'kN/mm²'}
              legendFooter={field === 'damage' ? strings.clampedColours : field === 'disp' ? 'mm' : strings.elementCentres}
              displacement={deformed ? (frame?.displacement ?? null) : null}
              deformScale={deform}
              {showMesh}
              {hideCell}
              view={VIEWS[view]}
              height="100%"
              status={statusItems}
              ariaLabel={strings.viewerMeshLabel.replace('{field}', field === 'damage' ? strings.damageField : field === 'disp' ? strings.displacement : 'σyy').replace('{shape}', deformed ? strings.deformed : strings.undeformed)}
            />
          </div>
        {:else}
          <div class="rs-placeholder">{pendingMeshMessage(run, replayError)}</div>
        {/if}
      </div>

      <div class="rs-panel" id="rs-panel-force" role="tabpanel" aria-labelledby="rs-tab-force" hidden={tab !== 'force'} bind:clientHeight={forceH}>
        <figure>
          <figcaption>{strings.reactionCaption}</figcaption>
          <LineChart series={forceSeries} xLabel={strings.topDisplacementAxis} yLabel="F (kN)" marker={frame ? frame.step.displacement : null} markerLabel={frame ? `${strings.step} ${frame.step.step}` : ''} labels={forceLabels} height={Math.max(170, forceH - 190)} />
          {#if residualSeries.length}
            <LineChart series={residualSeries} xLabel={strings.topDisplacementAxis} yLabel="|F − F_ref| (kN)" log rules={[{ y: 1e-5, text: strings.forceComparisonTolerance }]} marker={frame ? frame.step.displacement : null} height={110} />
          {/if}
          {#if !showsReference}<p class="rs-note">{strings.referenceCurveNote}</p>{/if}
        </figure>
      </div>

      <div class="rs-panel" id="rs-panel-convergence" role="tabpanel" aria-labelledby="rs-tab-convergence" hidden={tab !== 'convergence'} bind:clientHeight={convH}>
        {#if comparison}
          <div class="rs-compare" id="rs-compare-detail">
            <h3>{source === 'replay' ? strings.thisReplay : strings.thisRun} {strings.againstReferenceCode}</h3>
            <ul>
              <li>{strings.peakForce} {comparison.peak.step.reaction.toFixed(6)} {strings.knAtStep} {comparison.peak.step.step}{strings.referenceSemicolon} {refPeak.reaction.toFixed(6)} {strings.knAtStep} {refPeak.step}.</li>
              <li>{strings.relativeForceDifference} {comparison.worstPre.toExponential(1)} {strings.relativeTestTolerance}</li>
              <li>{strings.absoluteForceDifference} {comparison.worstAll.toExponential(1)} {strings.absoluteTestTolerance}</li>
              <li>{strings.identicalIterations} {comparison.sameIterations} {strings.of} {reference.length} {strings.stepsPeriod}</li>
            </ul>
          </div>
        {/if}
        {#if frames.length}
          <figure>
            <figcaption>{strings.iterationsCaption}{showsReference ? strings.referenceDots : ''}</figcaption>
            <IterationsChart steps={frames.map((f) => f.step)} reference={showsReference ? reference.map((r) => r.iterations) : null} height={130} />
          </figure>
          <figure>
            <figcaption>{strings.energies}</figcaption>
            <LineChart series={energySeries} xLabel={strings.topDisplacementAxis} yLabel={strings.energyAxis} marker={frame ? frame.step.displacement : null} labels={energyLabels} height={Math.max(150, convH - (comparison ? 420 : 260))} />
          </figure>
        {/if}
      </div>

      <div class="rs-panel rs-params" id="rs-panel-parameters" role="tabpanel" aria-labelledby="rs-tab-parameters" hidden={tab !== 'parameters'} oninputcapture={() => playback.interact()}>
        <div class="rs-params-list">
          <ParamRow id="p-e" name={strings.youngModulus} unit="kN/mm²" hint="10–400" invalid={invalid.e || !inRange(e, LIMITS.e)}>{#snippet symbol()}<var>E</var>{/snippet}<NumberField id="p-e" label={strings.youngModulusLabel} min={LIMITS.e[0]} max={LIMITS.e[1]} bind:value={e} bind:invalid={invalid.e} /></ParamRow>
          <ParamRow id="p-nu" name={strings.poissonRatio} hint="0–0.45" invalid={invalid.nu || !inRange(nu, LIMITS.nu)}>{#snippet symbol()}<var>ν</var>{/snippet}<NumberField id="p-nu" label={strings.poissonRatioLabel} min={LIMITS.nu[0]} max={LIMITS.nu[1]} bind:value={nu} bind:invalid={invalid.nu} /></ParamRow>
          <ParamRow id="p-gc" name={strings.fractureToughness} unit="kN/mm" hint="0.0001–0.01" invalid={invalid.gc || !inRange(gc, LIMITS.gc)}>{#snippet symbol()}<var>G</var><sub>c</sub>{/snippet}<NumberField id="p-gc" label={strings.fractureToughnessLabel} min={LIMITS.gc[0]} max={LIMITS.gc[1]} bind:value={gc} bind:invalid={invalid.gc} /></ParamRow>
          <ParamRow id="p-l0" name={strings.lengthScale} unit="mm" hint="0.003–0.03" invalid={invalid.l0 || !inRange(l0, LIMITS.l0)}>{#snippet symbol()}<var>ℓ</var>{/snippet}<NumberField id="p-l0" label={strings.lengthScaleLabel} min={LIMITS.l0[0]} max={LIMITS.l0[1]} bind:value={l0} bind:invalid={invalid.l0} /></ParamRow>
          <ParamRow id="p-u" name={strings.topDisplacement} unit="mm" hint="0.004–0.02" invalid={invalid.u || !inRange(u, LIMITS.u)}>{#snippet symbol()}<var>u</var>{/snippet}<NumberField id="p-u" label={strings.topDisplacementLabel} min={LIMITS.u[0]} max={LIMITS.u[1]} bind:value={u} bind:invalid={invalid.u} /></ParamRow>
          <ParamRow id="p-dt" name={strings.loadStep}>{#snippet symbol()}Δ<var>t</var>{/snippet}
            <select id="p-dt" bind:value={dt}>
              {#each [0.005, 0.01, 0.02, 0.03, 0.06] as v (v)}<option value={v}>{v} ({solverStepCount(v, 0.8)} {strings.stepsParen}</option>{/each}
            </select>
          </ParamRow>
          <ParamRow id="p-mesh" name={strings.mesh}>
            <select id="p-mesh" bind:value={meshKey}>
              {#each Object.entries(MESHES) as [k, m] (k)}<option value={k}>{strings[m.label]}</option>{/each}
            </select>
          </ParamRow>
          <label class="rs-check"><input type="checkbox" bind:checked={history} /> {strings.historyField}</label>
        </div>
        <p class="rs-derived">
          {strings.planeStrainLoaded}{fmt(0.8 * u)} mm). σ<sub>c</sub> = {fmt(sigmaC, 3)} {strings.refinedRatio} {hOverL.toFixed(2)}{#if hOverL > 0.5}<strong class="warnt"> {strings.underResolved}</strong>{/if}.
        </p>
        <div class="rs-buttons">
          {#if run?.status === 'running'}
            <button class="btn btn-ghost btn-sm" type="button" onclick={() => sim.stop()}>{strings.stop}</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick={restart}>{strings.restart}</button>
          {:else}
            <button class="btn btn-primary btn-sm" type="button" disabled={!valid} onclick={() => start(false)}>{strings.run}</button>
            <button class="btn btn-ghost btn-sm" type="button" disabled={!valid} onclick={() => start(true)}>{strings.solveAgain}</button>
          {/if}
          {#if !isReference}<button class="btn btn-ghost btn-sm" type="button" onclick={reset}>{strings.resetParameters}</button>{/if}
          {#if run}<button class="btn btn-ghost btn-sm" type="button" onclick={backToReplay}>{strings.backToReplay}</button>{/if}
        </div>
        <p class="rs-status" aria-live="polite">
          {#if sim.available === false}
            <span class="warnt">{strings.solverUnavailable}</span>
          {:else if run?.status === 'running'}
            {strings.solvingStep} {frames.length + 1} {strings.of} {expectedSteps}…
          {:else if run?.status === 'done'}
            {strings.done} {frames.length} {strings.steps}{run.seconds ? ` ${strings.inTime} ${run.seconds.toFixed(1)} s` : ''}{strings.completedRunsKept}
          {:else if run?.status === 'stopped'}
            {strings.stoppedAfter} {frames.length} {strings.stepsPeriod}
          {:else if run?.status === 'error'}
            <span class="warnt">{strings.solverRefused} {run.error}</span>
          {:else if isReference}
            {strings.runReuseNote}
          {:else}
            {strings.runBrowserNote}
          {/if}
        </p>
      </div>

      {#if frames.length}
        <div class="rs-scrub">
          <button class="btn btn-ghost btn-sm" type="button" onclick={() => (playback.playing ? playback.pause() : playback.play())}>{playback.playing ? strings.pause : strings.play}</button>
          <input type="range" min="0" max={frames.length - 1} value={playback.shown} oninput={(ev) => playback.seek(Number((ev.currentTarget as HTMLInputElement).value))} aria-label={strings.loadStepShown} />
          <span class="rs-stepread">{strings.step} {frame?.step.step ?? 0} {strings.of} {Math.max(expectedSteps, frames.length) - 1}</span>
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
