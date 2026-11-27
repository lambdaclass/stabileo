<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { comparisonStrings } from '../shell/comparison-strings';
  import { BUILD_COMMIT } from '../../../lib/build-info';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { viewerInteraction } from '../shell/viewer-interaction';
  import replay from '../../../../../research/benchmarks/lee-frame-1968/results/stabileo_results.json';
  import validation from '../../../../../research/benchmarks/lee-frame-1968/VALIDATION.json';
  import publishedRows from '../../../../../research/benchmarks/lee-frame-1968/reference-results/published_comparison.json';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import { benchmark, convergence, fill, firstPeak, loadNodeOf, refinedInput, splits, studyCase, viewer, point, type Failure, type Frame, type Split } from './case';
  import { strings } from './i18n';
  let frames = $state<Frame[]>(replay.frames);
  let source = $state<'replay' | 'live' | 'cached' | 'stopped'>('replay');
  let busy = $state(false);
  let narrow = $state(false);
  let reduced = $state(false);
  let failure = $state<Failure | null>(null);
  let split = $state<Split>(1);
  let shownSplit = $state<Split>(1);
  let livePeak = $state<number | null>(null);
  const input = $derived(refinedInput(shownSplit));
  const at = (f: Frame) => point(f, loadNodeOf(shownSplit));
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  const playback = new Playback();
  const s = $derived(strings[publicI18n.locale as keyof typeof strings] ?? strings.en);
  const current = $derived(frames[playback.shown] as Frame | undefined);
  const view = $derived(viewer(current, input));
  const peak = $derived(shownSplit === 1 ? firstPeak(frames)?.load ?? null : livePeak);
  const native = $derived(studyCase(shownSplit).firstPeak);
  const fmt = (n: number, digits = 4) => new Intl.NumberFormat(publicI18n.locale, { maximumFractionDigits: digits }).format(n);
  const series = $derived([{ name: 'Stabileo', color: '#60a5fa', points: frames.map(at) }]);
  const readout = $derived(current ? fill(s.readout, { step: String(current.step), load: fmt(current.load), u: fmt(at(current)[0], 3) }) : '');
  const total = $derived(Math.floor(input.maxSteps / shownSplit) + frames.filter(f => f.step % shownSplit !== 0).length);
  const rowNames = $derived(Object.fromEntries(publishedRows.checks.map(r => [r.id, s[`row_${r.id.replaceAll('-', '_')}` as keyof typeof s] as string])));
  const status = $derived(source === 'stopped' ? `${s.stopped} ${frames.length}/${total}` : `${source === 'replay' ? s.replay : source === 'live' ? s.live : s.cached} · ${frames.length}/${total}`);
  function stop() {
    playback.interact(); worker?.terminate(); worker = null; busy = false;
    if (source === 'live') source = frames.at(-1)?.step === input.maxSteps ? 'cached' : 'stopped';
  }
  function restart() {
    stop(); failure = null; source = 'replay'; frames = replay.frames; split = 1; shownSplit = 1; livePeak = null;
    playback.setCount(frames.length); playback.seek(0); playback.play();
  }
  function run() {
    stop(); frames = []; failure = null; source = 'live'; busy = true; shownSplit = split; livePeak = null;
    playback.follow = !reduced; playback.setCount(0);
    worker = new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ frame?: Frame; done?: boolean; error?: Failure; peak?: number | null }>) => {
      if (data.frame) { frames = [...frames, data.frame]; playback.setCount(frames.length); }
      if (data.peak != null) livePeak = data.peak;
      if (data.error) failure = data.error;
      if (data.done || data.error) { stop(); if (reduced) playback.seek(frames.length - 1); }
    };
    worker.onerror = () => { failure = 'solveError'; stop(); };
    worker.postMessage({ split: shownSplit });
  }
  onMount(() => {
    narrow = innerWidth < 700;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = motion.matches;
    const onMotion = (e: MediaQueryListEvent) => {
      reduced = e.matches;
      if (reduced && (playback.playing || playback.follow)) { playback.follow = false; playback.seek(busy ? 0 : frames.length - 1); }
    };
    motion.addEventListener('change', onMotion);
    playback.setCount(frames.length);
    playback.startAutoplay({ reducedMotion: reduced, narrow });
    const observer = new IntersectionObserver(entries => playback.setVisible(entries[0].isIntersecting));
    observer.observe(host);
    return () => { motion.removeEventListener('change', onMotion); observer.disconnect(); worker?.terminate(); playback.dispose(); };
  });
</script>
<ExperimentShell compactHeader paperId="lee-frame-1968" name={s.title} lead={s.lead}
  sourcePath="research/benchmarks/lee-frame-1968"
  actions={{ goToStep: i => playback.seek(i), setParams: p => { if (splits.includes(p.split as Split)) { split = p.split as Split; run(); } }, showTab: () => {} }}
  verification={{ reference: { kind: 'checks', passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length, href: `https://github.com/lambdaclass/stabileo/blob/${BUILD_COMMIT}/research/benchmarks/lee-frame-1968/VALIDATION.json` } }} referenceLabel={s.validationLabel}
  comparison={publishedRows.checks} comparisonNames={rowNames}>
  {#snippet article()}
    <h2>{s.model}</h2><p>{s.description}</p><p>{s.method}</p>
    <h2>{s.referenceHeading}</h2><p>{s.provenance}</p>
    <p><a href="https://doi.org/10.1155/2020/3613892">{s.sourceLabel}</a></p>
    <h2>{s.convergenceHeading}</h2>
    <p data-testid="lee-convergence">{fill(s.convergence, { peak: fmt(benchmark.regression.firstLimitLoad), step: String(benchmark.regression.firstPeakStep), p40: fmt(convergence.elements40.firstPeak), p80: fmt(convergence.elements80.firstPeak), bound: fmt(convergence.stepEffectBound) })}</p>
    <p>{s.meshLive} {#each splits.slice(1) as n, i (n)}{#if i} · {/if}<ExperimentLink params={{ split: n }}>{fill(s.elementsOption, { n: String(20 * n) })}</ExperimentLink>{/each}</p>
    <h2>{s.scopeHeading}</h2><ul>{#each s.limits as item}<li>{item}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="lee-pane" bind:this={host}>
      <div use:viewerInteraction={() => playback.interact()}><StabileoViewer plane="elevation" {...view} cellSize={2} deformScale={1} showMesh={!narrow} title={s.magnitude} ariaLabel={s.alt} unit="m" height="min(21rem, 48svh)" editorButton={false} /></div>
      <label>{s.step} {current?.step ?? 0}<input aria-label={s.step} aria-valuetext={readout} type="range" min="1" max={Math.max(1, frames.length)} value={playback.shown + 1} disabled={frames.length === 0} oninput={e => playback.seek(Number(e.currentTarget.value) - 1)} /></label>
      <p data-testid="lee-readout">{readout}</p>
      <div class="controls"><label class="mesh">{s.elements}<select aria-label={s.elements} bind:value={split} disabled={busy}>{#each splits as n (n)}<option value={n}>{fill(s.elementsOption, { n: String(20 * n) })}</option>{/each}</select></label><button onclick={run} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button></div>
      <p role="status" data-testid="lee-source">{status}</p>
      {#if failure}<p role="alert">{s[failure]}</p>{/if}
      <h2>{s.results}</h2>
      <LineChart {series} xLabel={s.displacement} yLabel={s.load} height={230} ariaLabel={s.chartLabel} nearest="xy" point={current ? at(current) : null} rules={[{ y: publishedRows.checks[0].reference, text: s.reference }]} />
      <div class="table-scroll" id="checks"><table><thead><tr><th></th><th>{s.peak}</th></tr></thead><tbody>
        <tr><th>{fill(s.rowShown, { n: String(20 * shownSplit) })}</th><td data-testid="lee-limit">{peak !== null ? fmt(peak) : busy ? '…' : failure ? comparisonStrings().unavailable : s.notReached}</td></tr>
        <tr><th>{fill(s.rowNative, { n: String(20 * shownSplit) })}</th><td data-testid="lee-native">{fmt(native)}</td></tr>
      </tbody></table></div>
    </div>
  {/snippet}
</ExperimentShell>
<style>
  .lee-pane { min-width: 0; height: 100%; overflow: auto; }
  .controls { display: flex; flex-wrap: wrap; gap: .4rem; align-items: end; }
  .mesh { margin: 0; flex: 1 1 100%; }
  select { display: block; font: inherit; min-height: 44px; max-width: 100%; }
  button { font: inherit; padding: .6rem; min-height: 44px; min-width: 44px; }
  label { display: block; margin: .7rem 0; }
  input[type="range"] { width: 100%; min-height: 44px; margin: 0; }
  h2 { font-size: 1rem; }
  p, table { font-size: .85rem; }
  .table-scroll { overflow: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .4rem; border-bottom: 1px solid var(--hair); }
</style>
