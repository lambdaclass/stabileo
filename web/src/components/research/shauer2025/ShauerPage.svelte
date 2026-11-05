<script lang="ts">
  import { replayMatchesBuild } from '../shell/assets';
  /**
   * /research/fracture/shauer-2025: the AT2 phase-field notched plate. On load it replays a run of
   * our solver precomputed at build time; Recompute live runs the same Rust solver in the
   * browser (WASM, in a worker). The reference code's own outputs are shown alongside.
   */
  import { onDestroy, onMount } from 'svelte';
  import { snapshots } from './reference-fields';
  import validation from '../../../../../research/fracture/shauer-2025/VALIDATION.json';
  import { rs } from '../i18n';
  import { paperTextLocale } from '../text-locale';
  import { solverStepCount } from './steps';
  import { compareReference, deepLinkStep } from './comparison';
  import { comparisonFailureLabel } from './failure-labels';
  import LineChart from './LineChart.svelte';
  import IterationsChart from './IterationsChart.svelte';
  import { SimulationController, pendingMeshMessage, type Frame } from './simulation.svelte';
  import type { PlateConfig, Series, Step } from './protocol';
  import ShauerArticle from './ShauerArticle.svelte';
  import ShauerParameters from './ShauerParameters.svelte';
  import { DEFAULT_PARAMS, LIMITS, MESHES, REFERENCE_KEY, REF_TOP_DISPLACEMENT, VIEWS, configOf, inRange, reference, refPeak, type Params } from './model';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import { SHAUER_REPLAY_URL, loadedShauerReplay } from './replay-data';
  import { fetchReplay } from '../shell/replay';
  import { num, qty } from '../shell/format';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import Segmented from '../shell/Segmented.svelte';
  import Toggles from '../shell/Toggles.svelte';

  const strings = $derived(rs());
  const STABILEO = 'var(--rs-plot-ours)';
  const REFERENCE = 'var(--rs-plot-ref)';
  /** This experiment shows its mesh by default: the refined band is part of the method. */
  const MESH_BY_DEFAULT = true;

  let params = $state<Params>({ ...DEFAULT_PARAMS });
  let invalid = $state({ e: false, nu: false, gc: false, l0: false, u: false });
  const valid = $derived(!Object.values(invalid).some(Boolean) && inRange(params.e, LIMITS.e) && inRange(params.nu, LIMITS.nu) && inRange(params.gc, LIMITS.gc) && inRange(params.l0, LIMITS.l0) && inRange(params.u, LIMITS.u));
  const isReference = $derived(JSON.stringify(configOf(params)) === REFERENCE_KEY);

  const sim = new SimulationController();
  const playback = new Playback();
  onDestroy(() => {
    sim.dispose();
    playback.dispose();
    clearTimeout(flashTimer);
  });

  const arrived = loadedShauerReplay();
  let replay = $state.raw<{ nodes: Float64Array; elements: Uint32Array; frames: Frame[] } | null>(arrived && { nodes: arrived.nodes, elements: arrived.elements, frames: arrived.frames });
  let replayVerified = $state(!!arrived && replayMatchesBuild(arrived.header, JSON.parse(REFERENCE_KEY)));
  let replayConfig = $state<unknown>(arrived?.header.config ?? null);
  if (arrived) playback.setCount(arrived.frames.length);
  let replayError = $state<string | null>(null);
  let pane: HTMLElement | undefined = $state();

  onMount(() => {
    const abort = new AbortController();
    (arrived ? Promise.resolve(arrived) : fetchReplay<Step>(SHAUER_REPLAY_URL, abort.signal))
      .then((d) => {
        if (abort.signal.aborted) return;
        if (d !== arrived) {
          replayConfig = d.header.config;
          replayVerified = replayMatchesBuild(d.header, JSON.parse(REFERENCE_KEY));
          replay = { nodes: d.nodes, elements: d.elements, frames: d.frames };
          playback.setCount(d.frames.length);
        }
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
    sim.run(configOf($state.snapshot(params)) as PlateConfig, force);
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
    params = { ...DEFAULT_PARAMS };
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
      if (typeof p.l0 === 'number') { params.l0 = p.l0; invalid.l0 = !inRange(p.l0, LIMITS.l0); }
      if (typeof p.e === 'number') { params.e = p.e; invalid.e = !inRange(p.e, LIMITS.e); }
      if (typeof p.gc === 'number') { params.gc = p.gc; invalid.gc = !inRange(p.gc, LIMITS.gc); }
      if (typeof p.mesh === 'string' && p.mesh in MESHES) params.meshKey = p.mesh as Params['meshKey'];
      if (typeof p.history === 'boolean') params.history = p.history;
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
      ? [{ x: peakFrame.step.displacement, y: peakFrame.step.reaction, anchor: 'end' as const, text: showsReference ? `${strings.peakReferenceLabel} ${num(peakFrame.step.reaction, { dp: 4 })} kN` : `${strings.peakLabel} ${num(peakFrame.step.reaction, { dp: 4 })} kN` }]
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
          { name: strings.elasticEnergy, color: '#259b86', points: frames.map((f) => [f.step.displacement, f.step.elastic_energy]) },
          { name: strings.fractureEnergy, color: '#b77bce', points: frames.map((f) => [f.step.displacement, f.step.fracture_energy]) },
        ]
      : [],
  );

  const comparison = $derived(showsReference && frames.length && (!run || run.status !== 'running')
    && nodes && elements ? compareReference(frames, reference, { nodes, elements, snapshots, material: JSON.parse(REFERENCE_KEY).material, replay: !run }) : null);

  const statusItems = $derived(
    frame
      ? [
          { label: strings.step, value: `${frame.step.step} ${strings.of} ${Math.max(expectedSteps, frames.length) - 1}` },
          { label: 'u', value: qty(frame.step.displacement, 'mm', { dp: 5 }) },
          { label: 'F', value: qty(frame.step.reaction, 'kN', { sig: 4 }) },
          { label: strings.maxDamage, value: num(frame.step.damage_max, { dp: 4 }) },
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
  introInArticle
  compactHeader
  verification={{ reference: { kind: 'checks', ...checks, href: '#checks' }, published: { kind: 'none', why: strings.paperNotCompared } }}
  {actions}
  sourcePath="research/fracture/shauer-2025"
>
  {#snippet article()}
    <ShauerArticle {frames} {showsReference} />
  {/snippet}

  {#snippet app()}
    <div class="rs-app" lang={paperTextLocale('shauer-2025')} bind:this={pane} data-steps={frames.length} data-source={source}>
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
        <p class="rs-compare-line" role="status">{run?.status === 'unconverged' ? strings.nonConverged : strings.referenceMismatch}: {comparison?.failures.map(comparisonFailureLabel).join('; ') || strings.comparisonFailure}</p>
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
              editorButton={false}
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
          <LineChart scrubber series={forceSeries} xLabel={strings.topDisplacementAxis} yLabel="F (kN)" marker={frame ? frame.step.displacement : null} markerLabel={frame ? `${strings.step} ${frame.step.step}` : ''} labels={forceLabels} height={Math.max(170, forceH - 190)} />
          {#if residualSeries.length}
            <LineChart scrubber series={residualSeries} xLabel={strings.topDisplacementAxis} yLabel="|F − F_ref| (kN)" log rules={[{ y: 1e-5, text: strings.forceComparisonTolerance }]} marker={frame ? frame.step.displacement : null} height={110} />
          {/if}
          {#if !showsReference}<p class="rs-note">{strings.referenceCurveNote}</p>{/if}
        </figure>
      </div>

      <div class="rs-panel" id="rs-panel-convergence" role="tabpanel" aria-labelledby="rs-tab-convergence" hidden={tab !== 'convergence'} bind:clientHeight={convH}>
        {#if comparison}
          <div class="rs-compare" id="rs-compare-detail">
            <h3>{source === 'replay' ? strings.thisReplay : strings.thisRun} {strings.againstReferenceCode}</h3>
            <ul>
              <li>{strings.peakForce} {num(comparison.peak.step.reaction, { dp: 6 })} {strings.knAtStep} {comparison.peak.step.step}{strings.referenceSemicolon} {num(refPeak.reaction, { dp: 6 })} {strings.knAtStep} {refPeak.step}.</li>
              <li>{strings.relativeForceDifference} {num(comparison.worstPre, { sig: 2 })} {strings.relativeTestTolerance}</li>
              <li>{strings.absoluteForceDifference} {num(comparison.worstAll, { sig: 2 })} {strings.absoluteTestTolerance}</li>
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
            <LineChart scrubber series={energySeries} xLabel={strings.topDisplacementAxis} yLabel={strings.energyAxis} marker={frame ? frame.step.displacement : null} labels={energyLabels} height={Math.max(150, convH - (comparison ? 420 : 260))} />
          </figure>
        {/if}
      </div>

      <div class="rs-panel rs-params" id="rs-panel-parameters" role="tabpanel" aria-labelledby="rs-tab-parameters" hidden={tab !== 'parameters'} oninputcapture={() => playback.interact()}>
        <ShauerParameters bind:params bind:invalid {sim} frameCount={frames.length} {expectedSteps} {valid} {isReference} onstart={start} onrestart={restart} onreset={reset} onback={backToReplay} />
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
  .rs-app :global(button), .rs-app :global(select), .rs-app :global(input) { min-height: 44px; }
  .rs-app :global(button) { min-width: 44px; }
  .rs-app :global(.rs-scrub) { flex-wrap: wrap; }
  @media (max-width: 69.999rem) {
    .rs-mode, .rs-compare-line { order: 1; }
    .rs-viewer-slot { order: -1; }
  }
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
    min-width: 0;
    height: 2.75rem;
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
  .rs-note {
    font-size: 0.82rem;
    color: var(--fg-2);
    margin: 0.4rem 0;
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
