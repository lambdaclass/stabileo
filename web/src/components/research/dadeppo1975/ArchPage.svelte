<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import replay from '../../../../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json';
  import { benchmark, compare, viewerData, type Frame, type Step } from './case';
  import { strings } from './i18n';

  const playback = new Playback(140, 1500);
  let frames = $state<Frame[]>(replay.frames);
  let steps = $state<Step[]>(replay.steps);
  let source = $state<Source>('replay');
  let busy = $state(false);
  let liveSteps = $state(400);
  let error = $state('');
  let mesh = $state(true);
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  const s = $derived(strings[publicI18n.locale as keyof typeof strings] ?? strings.en);
  const current = $derived(frames[playback.shown]);
  const view = $derived(viewerData(current));
  const comparison = $derived(steps.length ? compare(steps) : null);
  const fmt = (n: number | undefined) => n === undefined ? '—' : new Intl.NumberFormat(publicI18n.locale, { maximumFractionDigits: 5 }).format(n);
  function stop() {
    playback.interact();
    worker?.terminate(); worker = null; busy = false;
    if (source === 'live') source = 'cached';
  }
  function run() {
    stop(); frames = []; steps = []; error = ''; source = 'live'; busy = true;
    playback.follow = true;
    worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.error) { error = data.error; stop(); return; }
      if (data.frame) {
        frames = [...frames, data.frame]; steps = data.steps;
        playback.setCount(frames.length);
      }
      if (data.done) stop();
    };
    worker.onerror = event => { error = event.message; stop(); };
    worker.postMessage({ maxSteps: liveSteps });
  }
  function restart() {
    stop(); frames = replay.frames; steps = replay.steps; error = ''; source = 'replay';
    playback.setCount(frames.length); playback.play();
  }
  onMount(() => {
    const narrow = matchMedia('(max-width: 600px)').matches;
    mesh = !narrow;
    playback.setCount(frames.length);
    playback.startAutoplay({ narrow, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
    const observer = new IntersectionObserver(entries => playback.setVisible(entries[0].isIntersecting));
    observer.observe(host);
    return () => { observer.disconnect(); worker?.terminate(); playback.dispose(); };
  });
</script>

<ExperimentShell paperId="dadeppo-arch-1975" name={s.title} lead={s.hook}
  sourcePath="research/benchmarks/dadeppo-arch-1975"
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: () => {} }}
  verification={{ reference: { kind: 'none', why: s.stage }, published: { kind: 'none', why: s.referenceText } }}>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p>
    <p><strong>{s.disclaimer}</strong></p>
    <h2>{s.model}</h2><p>{s.description}</p><p>{s.units}</p>
    <h2>{s.comparison}</h2><p>{s.referenceText}</p>
    <p><a href="https://userweb.eng.gla.ac.uk/sondipon.adhikari/fulltext/journal/ft7a.pdf" target="_blank" rel="noreferrer">{s.sourceLink}</a></p>
    <p>{s.method}</p><p><ExperimentLink step={12}>{s.inspect}</ExperimentLink></p><p>{s.replayNote}</p>
    <h2>{s.notYet}</h2><ul>{#each s.limitations as item}<li>{item}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="arch-app" bind:this={host} data-source={source} data-busy={busy}>
      <p role="status">{s[source]}{busy ? ` · ${s.running}` : ''}</p>
      <label>{s.livePath}
        <select aria-label={s.livePath} bind:value={liveSteps} disabled={busy}>
          <option value={20}>{s.shortPath}</option>
          <option value={400}>{s.fullPath}</option>
        </select>
      </label>
      <div class="controls">
        <button onclick={run} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button>
      </div>
      {#if error}<p role="alert">{error}</p>{/if}
      <div>
        <StabileoViewer oninteract={() => playback.interact()} {...view} cellSize={2} showMesh={mesh} deformScale={1} editorButton={false} title={s.displacement} unit="m" height="20rem" />
      </div>
      <label>{s.step} {current?.step ?? 0} / {benchmark.input.maxSteps}
        <input aria-label={s.step} type="range" min="0" max={Math.max(0, frames.length - 1)} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      <label><input type="checkbox" bind:checked={mesh} onchange={() => playback.interact()} /> {s.mesh}</label>
      <div class="comparison" data-testid="arch-comparison">
        <strong>{s.peak}</strong>
        <dl><div><dt>{s.reference}</dt><dd>{fmt(benchmark.reference)}</dd></div><div><dt>Stabileo</dt><dd data-testid="arch-peak">{fmt(comparison?.peak)}</dd></div><div><dt>{s.difference}</dt><dd>{fmt(comparison?.difference)} ({fmt(comparison ? comparison.relative * 100 : undefined)}%)</dd></div></dl>
        <p data-testid="arch-verdict">{comparison?.pass ? s.pass : busy ? s.running : s.fail}</p>
      </div>
      <LineChart series={[{ name: 'Stabileo', color: '#61b6ff', points: steps.map(p => [p.step, p.loadFactor]) }]} xLabel={s.step} yLabel="PR²/EI" height={180} rules={[{ y: benchmark.reference, text: `${s.reference}: ${fmt(benchmark.reference)}` }]} marker={current?.step ?? null} />
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .arch-app { max-height: 100%; overflow-y: auto; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .75rem; }
  select { min-height: 44px; font: inherit; max-width: 100%; }
  button { font: inherit; padding: .55rem .7rem; min-height: 44px; }
  label { display: block; margin: .5rem 0; }
  input[type=range] { display: block; width: 100%; min-height: 30px; }
  p { font-size: .875rem; overflow-wrap: anywhere; }
  .comparison { border-block: 1px solid var(--hair); padding: .6rem 0; }
  dl { display: flex; flex-wrap: wrap; gap: .6rem 1.5rem; margin: .5rem 0; }
  dt { font-size: .8rem; } dd { margin: .2rem 0; font-variant-numeric: tabular-nums; }
  a { color: inherit; }
</style>
