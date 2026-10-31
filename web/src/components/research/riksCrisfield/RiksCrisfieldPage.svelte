<script lang="ts">
  import { articleStrings } from './article';
  const copy = $derived(articleStrings(publicI18n.locale));
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { onDestroy, onMount } from 'svelte';
  import caseJson from '../../../../../research/numerical-methods/riks-crisfield/reference-results/arc_length_snap_through.json';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import ParamRow from '../shell/ParamRow.svelte';
  import NumberField from '../shauer2025/NumberField.svelte';
  import Sci from '../shell/Sci.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import { num, qty } from '../shell/format';
  import { rs } from '../i18n';
  import PathChart, { type LimitMarker, type PathSeries } from './PathChart.svelte';
  import { compareFrameRun, frameReferenceLoadAt, compareRun, interpolatedLimit, DEFAULT_PARAMETERS, inputFor, limitPoint, referencePath, type BenchmarkRun, type CaseFile, type RunParameters } from './benchmark';
  import { nativeReplay } from './replay';
  import { ArcRunner } from './runner.svelte';
  import { editorSnapshot } from './editor';

  const data = caseJson as CaseFile;
  const strings = $derived(rs());
  const runner = new ArcRunner();
  const playback = new Playback(130, 1600);
  const STABILEO = 'var(--rs-plot-ours)';
  const REFERENCE = 'var(--rs-plot-ref)';

  const defaultCase = data.cases.find((c) => c.id === 'von-mises-truss') ?? data.cases[0];
  let caseId = $state(defaultCase.id);
  const currentCase = $derived(data.cases.find((c) => c.id === caseId) ?? defaultCase);
  let parameters = $state<RunParameters>(DEFAULT_PARAMETERS(defaultCase));
  let invalid = $state({ riseSpan: false, initialDs: false });
  const valid = $derived(!invalid.riseSpan && !invalid.initialDs && parameters.riseSpan >= 0.005 && parameters.riseSpan <= 0.8 && parameters.initialDs >= 1e-8 && parameters.initialDs <= currentCase.input.maxDs);
  let tab = $state('viewer');
  let pane: HTMLElement | undefined = $state();
  let runTimer: ReturnType<typeof setTimeout> | undefined;

  const replay = $derived(nativeReplay(currentCase));
  const live = $derived(runner.current);
  const shown = $derived<BenchmarkRun>(live ?? replay);
  const source = $derived<Source>(live ? runner.origin : 'replay');
  const frames = $derived(shown.frames);
  const frame = $derived(frames[Math.min(playback.shown, frames.length - 1)] ?? null);
  const isFrame = $derived(currentCase.id === 'shallow-toggle');
  const checks = $derived(isFrame ? compareFrameRun(currentCase, shown) : compareRun(currentCase, shown));
  const checkCount = $derived({ passed: checks.filter((check) => check.passed).length, total: checks.length });
  const headline = $derived(`${isFrame ? copy.frameHeadline : checks[0].reached ? copy.limitHeadline : copy.checkHeadline}: ${checkCount.passed}/${checkCount.total} ${copy.passed}`);
  const referenceLimit = $derived(limitPoint(currentCase.geometry.halfSpan, 2 * currentCase.geometry.halfSpan * shown.parameters.riseSpan, Object.values(currentCase.input.solver.materials)[0].e * 1000 * Object.values(currentCase.input.solver.sections)[0].a, currentCase.apex.referenceLoad));

  $effect(() => {
    playback.setCount(frames.length);
  });

  onMount(() => {
    const query = new URLSearchParams(location.search);
    const requestedCase = query.get('case');
    if (requestedCase && data.cases.some((c) => c.id === requestedCase)) caseId = requestedCase;
    const requestedTab = query.get('tab');
    if (requestedTab && ['viewer', 'path', 'parameters'].includes(requestedTab)) tab = requestedTab;
    parameters = DEFAULT_PARAMETERS(currentCase);
    playback.setCount(frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: innerWidth < 640 });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting), { threshold: 0.15 });
    if (pane) observer.observe(pane);
    return () => observer.disconnect();
  });

  onDestroy(() => {
    runner.dispose();
    playback.dispose();
    clearTimeout(runTimer);
  });

  const model = $derived.by(() => {
    const input = inputFor(currentCase, shown.parameters).solver;
    const nodes = Object.values(input.nodes).sort((a, b) => a.id - b.id);
    const index = new Map(nodes.map((node, i) => [node.id, i]));
    return {
      xy: nodes.flatMap((node) => [node.x, node.z]),
      cells: Object.values(input.elements).sort((a, b) => a.id - b.id).flatMap((element) => [index.get(element.nodeI)!, index.get(element.nodeJ)!]),
    };
  });
  const displacementRange = $derived.by(() => {
    let max = 1e-12;
    for (const item of frames) for (let i = 0; i < item.displacements.length; i += 2) max = Math.max(max, Math.hypot(item.displacements[i], item.displacements[i + 1]));
    return { min: 0, max };
  });
  const displacementValues = $derived(frame ? Array.from({ length: frame.displacements.length / 2 }, (_, i) => Math.hypot(frame.displacements[2 * i], frame.displacements[2 * i + 1])) : []);
  const view = $derived.by<[number, number, number, number]>(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < model.xy.length; i += 2) {
      for (const item of frames.length ? frames : [{ displacements: [] }]) {
        xs.push(model.xy[i] + (item.displacements[i] ?? 0));
        ys.push(model.xy[i + 1] + (item.displacements[i + 1] ?? 0));
      }
    }
    const loX = Math.min(...xs), hiX = Math.max(...xs), loY = Math.min(...ys), hiY = Math.max(...ys);
    const pad = Math.max(hiX - loX, hiY - loY, 1) * 0.08;
    return [loX - pad, loY - pad, hiX + pad, hiY + pad];
  });
  const pathSeries = $derived<PathSeries[]>([
    { name: copy.reference, color: REFERENCE, reference: true, points: referencePath(currentCase, shown.parameters).map(([v, p]) => [v, isFrame ? frameReferenceLoadAt(currentCase, v, 2 * currentCase.geometry.halfSpan * shown.parameters.riseSpan) : p]) },
    { name: source === 'replay' ? copy.replay : copy.live, color: STABILEO, points: frames.map((item) => [item.displacement, item.load]) },
  ]);
  const pathMarkers = $derived.by<LimitMarker[]>(() => {
    if (isFrame) return [];
    const markers = [{ x: referenceLimit.displacement, y: referenceLimit.load, label: copy.referenceLimit }];
    if (checks[0].reached && frames.length) {
      const peak = interpolatedLimit(frames)!;
      markers.push({ x: peak.displacement, y: peak.load, label: copy.measuredLimit });
    }
    return markers;
  });

  function checkLabel(id: string) {
    return id === 'limit-load' ? copy.limitLoad : id === 'limit-displacement' ? copy.limitDisplacement : copy.pathError;
  }
    function parameterEdited(event: Event) {
    if ((event.target as HTMLElement).id !== 'p-case') scheduleLive();
  }
  function scheduleLive() {
    playback.interact();
    clearTimeout(runTimer);
    runTimer = setTimeout(() => start(false), 300);
  }
  function start(force: boolean) {
    if (!valid) return;
    clearTimeout(runTimer);
    playback.interact();
    playback.follow = true;
    runner.run(currentCase, $state.snapshot(parameters), force);
  }
  function stop() {
    clearTimeout(runTimer);
    runner.stop();
  }
  function backToReplay() {
    clearTimeout(runTimer);
    runner.clear();
    parameters = DEFAULT_PARAMETERS(currentCase);
    playback.interact();
  }
  function reset() {
    parameters = DEFAULT_PARAMETERS(currentCase);
    invalid = { riseSpan: false, initialDs: false };
    start(true);
  }
  function selectCase(id: string) {
    caseId = id;
    runner.clear();
    parameters = DEFAULT_PARAMETERS(currentCase);
    playback.interact();
  }
  function showTab(id: string) {
    playback.interact();
    tab = id;
  }
  async function openEditor() {
    const { codeShareUrl } = await import('../../../lib/model/code/share');
    const base = `${location.origin}${import.meta.env.BASE_URL}app/basic`;
    location.href = codeShareUrl(editorSnapshot(currentCase, shown.parameters), base).url;
  }

  const actions = {
    goToStep: (step: number) => { backToReplay(); playback.seek(step); },
    showTab,
    setParams: (next: Record<string, number | string | boolean>) => {
      if (typeof next.riseSpan === 'number') parameters.riseSpan = next.riseSpan;
      if (typeof next.initialDs === 'number') parameters.initialDs = next.initialDs;
      if (next.direction === 'downward' || next.direction === 'upward') parameters.direction = next.direction;
      showTab('parameters');
      scheduleLive();
    },
  };
</script>

<ExperimentShell
  paperId="riks-1979"
  introInArticle
  citationRelation={copy.citationRelation}
  contentLocale={publicI18n.locale}
  verification={{ reference: { kind: 'checks', ...checkCount, href: '#checks' }, published: { kind: 'none', why: copy.scopeText } }}
  name={copy.arcLengthSnapThroughRiksAndCrisfield}
  lead={copy.lead}
  checks={checkCount}
  referenceLabel={strings.againstBenchmark}
  {actions}
  sourcePath="research/numerical-methods/riks-crisfield"
>
  {#snippet article()}
    <h2>{copy.method}</h2><p>{copy.methodText}</p>
    <p>{copy.papersBefore}<a href="https://doi.org/10.1016/0020-7683(79)90081-7" rel="noreferrer" target="_blank">{copy.riksTitle}</a>{copy.papersBetween}<a href="https://doi.org/10.1016/0045-7949(81)90108-5" rel="noreferrer" target="_blank">{copy.crisfieldTitle}</a>{copy.papersAfter}</p>
    <h2>{copy.models}</h2><p>{copy.modelsText}</p>
    <p>{copy.formula}</p>
    <h2 id="checks">{copy.comparison}</h2><p>{headline}</p>
    <div class="rs-table-scroll" role="region" aria-label={copy.benchmarkChecks}>
      <table class="rs-checks">
        <thead><tr><th>{copy.check}</th><th class="num">{strings.benchmark.error}</th><th class="num">{copy.tolerance}</th><th>{strings.benchmark.result}</th></tr></thead>
        <tbody>{#each checks as check (check.id)}<tr><td>{checkLabel(check.id)}</td><td class="num">{#if Number.isFinite(check.error)}<Sci value={check.error} />{:else}{copy.notEvaluated}{/if}</td><td class="num"><Sci value={check.tolerance} sig={1} /></td><td class={check.passed ? 'pass' : 'fail'}>{check.passed ? copy.pass : check.reached ? copy.fail : copy.notEvaluated}</td></tr>{/each}</tbody>
      </table>
    </div>
    <p>{copy.accuracy}</p>
    <h2>{copy.scope}</h2><p>{copy.scopeText}</p>
    <p>{copy.isolation}</p>
  {/snippet}

  {#snippet app()}
    <div class="rs-app" lang={publicI18n.locale} bind:this={pane} data-source={source} data-steps={frames.length} data-case={currentCase.id} data-status={runner.status} data-playing={playback.playing}>
      <p class="rs-mode" data-testid="rs-mode"><span class="dot dot-{source}"></span>{copy[source]}</p>
      <p class="rs-headline" data-testid="benchmark-headline">{headline}</p>
      <PaneTabs oninteract={() => playback.interact()} tabs={[{ id: 'viewer', label: strings.benchmark.viewer }, { id: 'path', label: strings.benchmark.path }, { id: 'parameters', label: strings.benchmark.parameters }]} bind:active={tab} />

      <div class="rs-panel rs-viewer-panel" id="rs-panel-viewer" role="tabpanel" aria-labelledby="rs-tab-viewer" hidden={tab !== 'viewer'}>
        <div class="rs-viewer-slot" onpointerdowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} onkeydowncapture={() => playback.interact()}>
          <StabileoViewer
            locale={publicI18n.locale}
            xy={model.xy}
            cells={model.cells}
            cellSize={2}
            lineWidth={5}
            values={displacementValues}
            range={displacementRange}
            title={copy.displacementMagnitude}
            unit="m"
            colourMap="sequential"
            displacement={frame?.displacements ?? null}
            deformScale={1}
            showMesh={true}
            {view}
            height="100%"
            status={frame ? [{ label: strings.benchmark.step, value: `${frame.step}/${frames.length}` }, { label: 'λ', value: num(frame.loadFactor, { sig: 5 }) }, { label: 'v', value: qty(frame.displacement, 'm', { sig: 4 }) }, { label: 'P', value: qty(frame.load, 'kN', { sig: 5 }) }] : []}
            ariaLabel={copy.viewerDescription}
            onOpenEditor={() => void openEditor()}
            openEditorNote={copy.openThisGeometryAndReferenceLoadThrough}
          />
        </div>
      </div>

      <div class="rs-panel" id="rs-panel-path" role="tabpanel" aria-labelledby="rs-tab-path" hidden={tab !== 'path'}>
        <figure>
          <figcaption>{copy.downwardLoadAgainstDownwardApexDisplacementOrange}</figcaption>
          <PathChart series={pathSeries} limits={pathMarkers} current={frame ? { x: frame.displacement, y: frame.load } : null} xLabel={copy.xLabel} yLabel={copy.yLabel} height={300} />
        </figure>
        <div class="rs-table-scroll" role="region" aria-label={copy.referenceAndStabileoComparisonValues}>
          <table>
            <thead><tr><th>{copy.check}</th><th class="num">{strings.benchmark.reference}</th><th class="num">{strings.benchmark.stabileo}</th><th class="num">{strings.benchmark.error}</th><th>{strings.benchmark.result}</th></tr></thead>
            <tbody>{#each checks as check (check.id)}<tr><td>{checkLabel(check.id)}</td><td class="num">{check.id === 'equilibrium-path' ? '0' : num(check.reference, { sig: 6 })}</td><td class="num">{Number.isNaN(check.observed) ? '—' : num(check.observed, { sig: 6 })}</td><td class="num">{Number.isFinite(check.error) ? `${num(check.error * 100, { sig: 3 })}%` : copy.notEvaluated}</td><td class={check.passed ? 'pass' : 'fail'}>{check.passed ? copy.pass : check.reached ? copy.fail : copy.notEvaluated}</td></tr>{/each}</tbody>
          </table>
        </div>
        <p class="rs-note">{live && runner.status !== 'done' ? copy.partial : ''} {shown.totalIterations}{copy.totalNewtonIterations}{frames.length}{copy.convergedPathPointsFinalLoadFactor}{num(shown.finalLoadFactor, { sig: 7 })}{copy.solverConvergedFlag}{shown.converged ? copy.yes : copy.no}.</p>
      </div>

      <div class="rs-panel rs-params" id="rs-panel-parameters" role="tabpanel" aria-labelledby="rs-tab-parameters" hidden={tab !== 'parameters'} oninputcapture={parameterEdited} onchangecapture={parameterEdited}>
        <ParamRow id="p-case" name={strings.benchmark.case}>
          <select id="p-case" value={caseId} onchange={(event) => selectCase((event.currentTarget as HTMLSelectElement).value)}>
            {#each data.cases as c (c.id)}<option value={c.id}>{c.id === 'shallow-toggle' ? copy.shallowCase : copy.vonMisesCase}</option>{/each}
          </select>
        </ParamRow>
        <ParamRow id="p-rise" name={strings.benchmark.riseSpan} hint="0.005–0.8" invalid={invalid.riseSpan}>
          <NumberField id="p-rise" label={strings.benchmark.riseSpan} min={0.005} max={0.8} bind:value={parameters.riseSpan} bind:invalid={invalid.riseSpan} />
        </ParamRow>
        <ParamRow id="p-direction" name={strings.benchmark.loadDirection}>
          <select id="p-direction" bind:value={parameters.direction}><option value="downward">{strings.benchmark.downward}</option><option value="upward">{strings.benchmark.upward}</option></select>
        </ParamRow>
        <ParamRow id="p-ds" name={strings.benchmark.arcLengthStep} hint={`1e−8–${currentCase.input.maxDs}`} invalid={invalid.initialDs}>
          <NumberField id="p-ds" label={strings.benchmark.arcLengthStep} min={1e-8} max={currentCase.input.maxDs} bind:value={parameters.initialDs} bind:invalid={invalid.initialDs} />
        </ParamRow>
        <div class="rs-buttons">
          {#if runner.status === 'running'}
            <button class="btn btn-ghost btn-sm" type="button" onclick={stop}>{strings.benchmark.stop}</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick={() => start(true)}>{strings.benchmark.restart}</button>
          {:else}
            <button class="btn btn-primary btn-sm" type="button" disabled={!valid} onclick={() => start(false)}>{strings.benchmark.recompute}</button>
            <button class="btn btn-ghost btn-sm" type="button" disabled={!valid} onclick={() => start(true)}>{strings.benchmark.restart}</button>
          {/if}
          {#if live}<button class="btn btn-ghost btn-sm" type="button" onclick={backToReplay}>{strings.benchmark.backToReplay}</button>{/if}
          <button class="btn btn-ghost btn-sm" type="button" onclick={reset}>{strings.benchmark.reset}</button>
        </div>
        <p class="rs-status" aria-live="polite">{copy[runner.status]}{#if runner.status === 'error' && runner.error} <span class="fail">{runner.error}</span>{/if}</p>
      </div>

      {#if frames.length}
        <div class="rs-scrub">
          <button class="btn btn-ghost btn-sm" type="button" onclick={() => playback.playing ? playback.pause() : playback.play()}>{playback.playing ? strings.benchmark.pause : strings.benchmark.play}</button>
          <input type="range" min="0" max={frames.length - 1} value={playback.shown} oninput={(event) => playback.seek(Number((event.currentTarget as HTMLInputElement).value))} aria-label={strings.benchmark.step} />
          <span class="rs-stepread">{frame?.step ?? 0} / {frames.length}</span>
        </div>
      {/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .rs-app { --rs-control-h: 44px; display: flex; flex-direction: column; gap: .6rem; color: var(--fg); min-width: 0; }
  .rs-panel { min-width: 0; }
  .rs-panel[hidden] { display: none; }
  .rs-mode, .rs-headline, .rs-note, .rs-status { margin: 0; font: var(--rs-ui) var(--st-sans); color: var(--fg-2); }
  .rs-mode { display: flex; align-items: center; gap: .45rem; }
  .rs-headline { color: var(--fg); font-weight: 600; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .dot-replay { background: #8fa3b3; } .dot-live { background: #2aa869; } .dot-cached { background: #4a8fd4; }
  .rs-viewer-panel { display: flex; flex-direction: column; min-height: 0; }
  .rs-viewer-slot { height: clamp(25rem, 80vw, 30rem); min-height: 0; }
  .rs-viewer-slot :global(.rs-viewer-host), .rs-viewer-slot :global(.sfv-wrap) { height: 100%; display: flex; flex-direction: column; }
  .rs-viewer-slot :global(.sfv) { flex: 1; min-height: 0; }
  .rs-scrub { display: flex; align-items: center; gap: .65rem; }
  .rs-scrub input { width: 0; flex: 1; accent-color: var(--st-accent); }
  .rs-stepread { color: var(--fg-2); font: var(--rs-ui) var(--st-sans); white-space: nowrap; }
  .rs-params { display: grid; gap: .45rem; }
  .rs-params :global(select) { width: 100%; min-height: var(--rs-control-h); background: var(--st-surface-3); color: var(--fg); border: 1px solid var(--rs-control-border); border-radius: 3px; }
  .rs-buttons { display: flex; flex-wrap: wrap; gap: .45rem; }
  .rs-table-scroll { overflow-x: auto; margin-top: .6rem; }
  table { border-collapse: collapse; width: 100%; font: var(--rs-small) var(--st-sans); font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: .3rem .45rem; border-bottom: 1px solid var(--hair); }
  .num { text-align: right; white-space: nowrap; }
  .pass { color: var(--st-ok); } .fail { color: var(--st-danger); }
  figure { margin: 0; } figcaption { color: var(--fg-2); font: var(--rs-small) var(--st-sans); margin-bottom: .35rem; }
  @media (min-width: 70rem) {
    .rs-app { --rs-control-h: 44px; height: 100%; }
    .rs-panel { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; }
    .rs-viewer-slot { flex: 1; height: auto; min-height: 13rem; }
  }
  .rs-app :global(button), .rs-app :global(select), .rs-app :global(input) { min-height: 44px; min-width: 44px; font-size: max(12px, var(--rs-ui)); }
  .rs-app :global(select) { max-width: 100%; width: 100%; }
  .rs-app :global(.rs-tabs button) { min-height: 44px; flex: 1; min-width: 0; padding-inline: .35rem; }
  .rs-app :global(.rs-param) { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .rs-app :global(.rs-param-unit) { display: none; }
  .rs-app :global(td.num), .rs-app :global(th.num) { white-space: nowrap; }
  .rs-app :global(.status-value), .rs-app :global(.status-label) { font-size: 12px; }
</style>
