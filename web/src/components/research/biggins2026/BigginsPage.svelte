<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { rs } from '../i18n';
  import { archStrings } from './strings';
  import { decodeRun, type ArchRun } from './protocol';
  import replay from '../../../../../research/mechanics/biggins-2026/reference-results/replay.json';
  import reference from '../../../../../research/mechanics/biggins-2026/reference-results/thresholds.json';
  import validation from '../../../../../research/mechanics/biggins-2026/VALIDATION.json';

  const s = $derived(archStrings());
  const shared = $derived(rs());
  const playback = new Playback(110);
  let run = $state.raw<ArchRun>(decodeRun(replay));
  let width = $state(0.7);
  let compression = $state(0.012);
  let showMode = $state(false);
  let source = $state<'replay' | 'live'>('replay');
  let busy = $state(false);
  let failed = $state(false);
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  const frame = $derived(run.frames[playback.shown]);
  const xy = $derived(run.frames[0].y.flatMap((_, i) => [i / 64, 0]));
  const cells = Array.from({ length: 64 }, (_, i) => [i, i + 1]).flat();
  const heights = $derived(showMode ? run.modes[1].y.map(v => v * Math.sqrt(run.compression)) : frame.y);
  const displacement = $derived(heights.flatMap(y => [0, y]));
  const series = $derived([
    { name: s.reference, color: 'var(--rs-plot-ref)', dashed: true, points: reference as [number, number][] },
    { name: s.ours, color: 'var(--rs-plot-ours)', points: run.curve },
  ]);
  function stop() { playback.interact(); worker?.terminate(); worker = null; busy = false; }
  function compute() {
    stop(); busy = true; failed = false;
    const active = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = event => {
      if (worker !== active) return;
      try {
        if (event.data.error) throw new Error();
        run = decodeRun(event.data.result); source = 'live'; playback.setCount(run.frames.length); playback.seek(0);
      } catch { failed = true; }
      active.terminate(); worker = null; busy = false;
    };
    active.onerror = () => { if (worker === active) { failed = true; stop(); } };
    active.postMessage({ width, compression });
  }
  function restart() { stop(); playback.seek(0); playback.play(); }
  onMount(() => {
    playback.setCount(run.frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: innerWidth < 640 });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => observer.disconnect();
  });
  onDestroy(() => { stop(); playback.dispose(); });
</script>

<ExperimentShell paperId="zmyslony-2026" name={s.title} lead={s.lead}
  sourcePath="research/mechanics/biggins-2026"
  verification={{ reference: { kind: 'checks', passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length, href: '#checks' }, published: { kind: 'checks', passed: validation.published_checks.filter(c => c.passed).length, total: validation.published_checks.length, href: '#checks' } }}
  actions={{ goToStep: i => playback.seek(i), setParams: params => { if (typeof params.width === 'number' && params.width >= 0.3 && params.width <= 0.9) { width = params.width; compute(); } }, showTab: tab => { showMode = tab === 'mode'; playback.interact(); } }}>
  {#snippet article()}
    <h2>{s.model}</h2><p>{s.theory}</p><p>{s.method}</p>
    <p><ExperimentLink step={48}>{s.jump}</ExperimentLink> · <ExperimentLink tab="mode">{s.mode}</ExperimentLink></p>
    <h2 id="checks">{s.checks}</h2><p>{s.evidence.replace('{threshold}', num(21.52, { dp: 2 }))}</p>
    <dl>
      <dt>{s.publishedValue}</dt><dd>{num(21.52, { dp: 2 })}</dd>
      <dt>{s.ours}</dt><dd>{num(replay.threshold / Math.sqrt(replay.compression), { dp: 5 })}</dd>
      {#each validation.checks as check, i}
        <dt>{s.checkLabels[i]}</dt>
        <dd>{num(100 * check.observed, { sig: 4 })}% · {shared.tolerance} {num(100 * check.tolerance, { sig: 3 })}%</dd>
      {/each}
    </dl>
    <p><a href="https://arxiv.org/html/2601.06598v2">{s.paper}</a> · <a href="https://zenodo.org/records/18256271">{s.data}</a></p>
    <p>{s.limits}</p>
  {/snippet}
  {#snippet app()}
    <div class="arches-app" bind:this={host} data-source={source} data-step={playback.shown} data-threshold={run.threshold} data-width={run.width}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} onclickcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <p>{source === 'replay' ? shared.replaySource : shared.liveSource}</p>
      <StabileoViewer {xy} {cells} cellSize={2} values={heights} {displacement} deformScale={1}
        range={{ min: -0.12, max: 0.12 }} title={showMode ? s.mode : s.arch} height="17rem" view={[-0.05, -0.13, 1.05, 0.13]} lineWidth={5} />
      <label><input type="checkbox" bind:checked={showMode} />{s.mode}</label>
      <label for="arch-width">{s.width} {num(width, { dp: 2 })}</label>
      <input id="arch-width" type="range" min="0.3" max="0.9" step="0.02" bind:value={width} onchange={compute} />
      <label for="arch-compression">{s.compression} {num(compression, { dp: 3 })}</label>
      <input id="arch-compression" type="range" min="0.002" max="0.02" step="0.001" bind:value={compression} onchange={compute} />
      <div class="buttons"><button onclick={compute}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button></div>
      <p aria-live="polite">{busy ? s.pending : s.threshold} {busy ? '' : num(run.threshold, { dp: 4 })}</p>
      {#if failed}<p role="alert">{s.error}</p>{/if}
      <label for="arch-step">{shared.step} {playback.shown}</label>
      <input id="arch-step" type="range" min="0" max={run.frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      <p>{s.jump}</p><p>{s.parameterNotice}</p>
      <LineChart {series} xLabel={s.width} yLabel={s.normalized} height={180} marker={run.width} />
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .arches-app { max-height: 100%; overflow: auto; padding: 0.6rem; border: 1px solid var(--hair); border-radius: 6px; }
  label { display: block; font-size: 0.85rem; }
  input[type='range'] { width: 100%; }
  p { font-size: 0.8rem; margin: 0.4rem 0; }
  .buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { padding: 0.4rem 0.7rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--lp-ink); cursor: pointer; }
</style>
