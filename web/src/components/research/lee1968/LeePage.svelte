<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import { viewerInteraction } from '../shell/viewer-interaction';
  import replay from '../../../../../research/benchmarks/lee-frame-1968/results/stabileo_results.json';
  import { benchmark, firstLimit, point, viewer, type Frame } from './case';
  import { strings } from './i18n';
  let frames = $state<Frame[]>(replay.frames);
  let source = $state<Source>('replay');
  let busy = $state(false);
  let narrow = $state(false);
  let failure = $state('');
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  const playback = new Playback(90);
  const s = $derived(strings[publicI18n.locale as keyof typeof strings] ?? strings.en);
  const current = $derived(frames[playback.shown]);
  const view = $derived(viewer(current));
  const limit = $derived(firstLimit(frames));
  const fmt = (n: number) => new Intl.NumberFormat(publicI18n.locale, { maximumFractionDigits: 4 }).format(n);
  const series = $derived([{ name: 'Stabileo', color: '#60a5fa', points: frames.map(point) }]);
  function stop() {
    playback.interact(); worker?.terminate(); worker = null; busy = false;
    if (source === 'live') source = 'cached';
  }
  function restart() {
    stop(); failure = ''; source = 'replay'; frames = replay.frames;
    playback.setCount(frames.length); playback.seek(0); playback.play();
  }
  function run() {
    stop(); frames = []; failure = ''; source = 'live'; busy = true;
    playback.follow = true; playback.setCount(0);
    worker = new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ frame?: Frame; done?: boolean; error?: string }>) => {
      if (data.frame) { frames = [...frames, data.frame]; playback.setCount(frames.length); }
      if (data.error) failure = data.error;
      if (data.done || data.error) stop();
    };
    worker.onerror = e => { failure = e.message; stop(); };
    worker.postMessage({});
  }
  onMount(() => {
    narrow = innerWidth < 700;
    playback.setCount(frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow });
    const observer = new IntersectionObserver(entries => playback.setVisible(entries[0].isIntersecting));
    observer.observe(host);
    return () => { observer.disconnect(); worker?.terminate(); playback.dispose(); };
  });
</script>
<ExperimentShell paperId="lee-frame-1968" name={s.title} lead={s.lead}
  sourcePath="research/benchmarks/lee-frame-1968"
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: () => {} }}
  verification={{ reference: { kind: 'none', why: s.reference }, published: { kind: 'none', why: s.provenance } }}>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p><p>{s.disclaimer}</p>
    <h2>{s.model}</h2><p>{s.description}</p><p>{s.method}</p>
    <h2>{s.reference}</h2><p>{s.provenance}</p>
    <p><a href="https://doi.org/10.1155/2020/3613892">{s.sourceLabel}</a></p>
    <h2>{s.notYet}</h2><ul>{#each s.limits as item}<li>{item}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="lee-pane" bind:this={host}>
      <p role="status" data-testid="lee-source">{source === 'replay' ? s.replay : source === 'live' ? s.live : s.cached} · {frames.length}/{benchmark.input.maxSteps}</p>
      <div class="controls"><button onclick={run} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button></div>
      {#if failure}<p role="alert">{failure}</p>{/if}
      <label>{s.step} {current?.step ?? 0}<input aria-label={s.step} type="range" min="0" max={Math.max(0,frames.length-1)} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} /></label>
      <div use:viewerInteraction={() => playback.interact()}><StabileoViewer {...view} cellSize={2} deformScale={1} showMesh={!narrow} title={s.alt} unit="m" height="21rem" editorButton={false} /></div>
      <h2>{s.results}</h2>
      <LineChart {series} xLabel={s.displacement} yLabel={s.load} height={230} rules={[{ y: benchmark.reference.load, text: s.reference }]} />
      <div class="table-scroll"><table><thead><tr><th>{s.peak}</th><th>{s.reference}</th><th>Stabileo</th><th>{s.difference}</th></tr></thead><tbody><tr><th>P</th><td>{fmt(benchmark.reference.load)}</td><td data-testid="lee-limit">{limit ? fmt(limit.load) : s.pending}</td><td>{limit ? `${fmt(limit.load-benchmark.reference.load)} (${fmt(100*(limit.load/benchmark.reference.load-1))}%)` : '—'}</td></tr></tbody></table></div>
    </div>
  {/snippet}
</ExperimentShell>
<style>
  .lee-pane { min-width: 0; height: 100%; overflow: auto; }
  .controls { display: flex; flex-wrap: wrap; gap: .4rem; }
  button { font: inherit; padding: .6rem; }
  label { display: block; margin: .7rem 0; }
  input { width: 100%; }
  h2 { font-size: 1rem; }
  p, table { font-size: .85rem; }
  .table-scroll { overflow: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .4rem; border-bottom: 1px solid var(--hair); }
</style>
