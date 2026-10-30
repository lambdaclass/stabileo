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
  import { SimulationController, pendingMeshMessage, type Frame } from './simulation.svelte';
  import type { PlateConfig, Step } from './protocol';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import { fetchReplay } from '../shell/replay';
  import { num, qty } from '../shell/format';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import Segmented from '../shell/Segmented.svelte';
  import Toggles from '../shell/Toggles.svelte';

  import ShauerArticle from './ShauerArticle.svelte';
  import ShauerResultsPanels from './ShauerResultsPanels.svelte';
  import ShauerParamsPanel from './ShauerParamsPanel.svelte';

  const strings = $derived(rs());
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

  const comparison = $derived(
    showsReference && frames.length && (!run || run.status !== 'running') && nodes && elements
      ? compareReference(frames, reference, { nodes, elements, snapshots, material: JSON.parse(REFERENCE_KEY).material, replay: !run })
      : null,
  );

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
    <ShauerArticle {frames} {showsReference} {reference} />
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

      <ShauerResultsPanels
        {tab}
        bind:forceH
        bind:convH
        {frame}
        {frames}
        {source}
        {showsReference}
        {reference}
        {refPeak}
        {nodes}
        {elements}
        {run}
        referenceKey={REFERENCE_KEY}
      />

      <ShauerParamsPanel
        {tab}
        bind:e
        bind:nu
        bind:gc
        bind:l0
        bind:u
        bind:dt
        bind:meshKey
        bind:history
        bind:invalid
        {valid}
        {isReference}
        {sigmaC}
        {hOverL}
        {run}
        {sim}
        {playback}
        {frames}
        {expectedSteps}
        {start}
        {restart}
        {backToReplay}
        {reset}
      />

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
  @media (min-width: 70rem) {
    .rs-app {
      height: 100%;
    }
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
  .rs-compare-line {
    margin: 0;
    font-size: 0.9rem;
  }
  .rs-compare-line .ok {
    color: var(--ok);
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
