<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import Segmented from '../shell/Segmented.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { rs } from '../i18n';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { riserStrings } from './strings';
  import { decodeRiser, nodal, parseReference, type CantileverRun, type RiserRun } from './protocol';
  import replay from '../../../../../research/mechanics/gay-neto-2014/reference-results/replay.json';
  import validation from '../../../../../research/mechanics/gay-neto-2014/VALIDATION.json';
  import referenceCsv from '../../../../../research/mechanics/gay-neto-2014/reference-results/tutorial16_step3_resultants.csv?raw';
  import tipCsv from '../../../../../research/mechanics/gay-neto-2014/reference-results/tutorial01_tip_history.csv?raw';

  const s = $derived(riserStrings());
  const shared = $derived(rs());
  const reference = parseReference(referenceCsv);
  const tipReference = tipCsv.trim().split('\n').slice(1).map(l => l.split(',').map(Number));
  const cantilever = replay.cantilever as CantileverRun;
  const playback = new Playback(140);
  let run = $state.raw<RiserRun>(decodeRiser(replay.riser));
  let tab = $state<'riser' | 'cantilever'>('riser');
  let pull = $state(1000);
  let lift = $state(186);
  let friction = $state(0.2);
  let source = $state<'replay' | 'live'>('replay');
  let busy = $state(false);
  let failed = $state(false);
  let host: HTMLDivElement;
  let worker: Worker | null = null;

  const frames = $derived(tab === 'riser' ? run.frames.length : cantilever.frames.length);
  const shown = $derived(Math.min(playback.shown, frames - 1));
  const frame = $derived(run.frames[Math.min(shown, run.frames.length - 1)]);
  const atDefaults = $derived(run.params.pull === 1e6 && run.params.lift === 186 && run.params.friction === 0.2);
  const lastFrame = $derived(shown === run.frames.length - 1);

  const SEABED = 0.01;
  const riserXY = $derived([...run.reference_x.flatMap(x => [x, 0]), -30, SEABED, 870, SEABED]);
  const riserCells = [...Array.from({ length: 268 }, (_, i) => [i, i + 1]).flat(), 269, 270];
  const riserValues = $derived([...nodal(frame.m), 0, 0]);
  const riserDisplacement = $derived([...frame.x.flatMap((x, i) => [x - run.reference_x[i], frame.z[i]]), 0, 0, 0, 0]);

  const beam = $derived(cantilever.frames[Math.min(shown, cantilever.frames.length - 1)]);
  const beamXY = cantilever.reference_z.flatMap(z => [0, z]);
  const beamCells = Array.from({ length: 10 }, (_, i) => [i, i + 1]).flat();
  const beamDisplacement = $derived(beam.x.flatMap((x, i) => [x, beam.z[i] - cantilever.reference_z[i]]));

  const momentSeries = $derived([
    ...(atDefaults ? [{ name: s.reference, color: 'var(--rs-plot-ref)', dashed: true, points: reference.map(r => [r.x, r.m] as [number, number]) }] : []),
    { name: s.ours, color: 'var(--rs-plot-ours)', points: run.element_x.map((x, i) => [x, frame.m[i]] as [number, number]) },
  ]);
  const shearSeries = $derived([
    ...(atDefaults ? [{ name: s.reference, color: 'var(--rs-plot-ref)', dashed: true, points: reference.map(r => [r.x, r.v] as [number, number]) }] : []),
    { name: s.ours, color: 'var(--rs-plot-ours)', points: run.element_x.map((x, i) => [x, frame.v[i]] as [number, number]) },
  ]);
  const tipSeries = $derived([
    { name: `${s.figure}: X`, color: 'var(--rs-plot-ref)', dashed: true, points: tipReference.map(r => [r[0], r[1]] as [number, number]) },
    { name: `${s.figure}: Z`, color: 'var(--rs-plot-ref)', dashed: true, points: tipReference.map(r => [r[0], r[2]] as [number, number]) },
    { name: `${s.ours}: X`, color: 'var(--rs-plot-ours)', points: cantilever.frames.map(f => [f.t, f.x[10]] as [number, number]) },
    { name: `${s.ours}: Z`, color: 'var(--rs-plot-ours)', points: cantilever.frames.map(f => [f.t, f.z[10]] as [number, number]) },
  ]);

  function stop() { playback.interact(); worker?.terminate(); worker = null; busy = false; }
  function compute() {
    stop(); busy = true; failed = false; tab = 'riser';
    const active = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = event => {
      if (worker !== active) return;
      try {
        if (event.data.error) throw new Error();
        run = decodeRiser(event.data.result); source = 'live'; playback.setCount(run.frames.length); playback.seek(run.frames.length - 1);
      } catch { failed = true; }
      active.terminate(); worker = null; busy = false;
    };
    active.onerror = () => { if (worker === active) { failed = true; stop(); } };
    active.postMessage({ pull: pull * 1000, lift, friction });
  }
  function restart() { stop(); playback.seek(0); playback.play(); }
  function switchTab() { playback.setCount(frames); playback.seek(0); playback.play(); }

  onMount(() => {
    playback.setCount(run.frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: innerWidth < 640 });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => observer.disconnect();
  });
  onDestroy(() => { stop(); playback.dispose(); });
</script>

<ExperimentShell paperId="gay-neto-2014" name={s.title} lead={s.lead} introInArticle compactHeader wide locale={publicI18n.locale}
  sourcePath="research/mechanics/gay-neto-2014"
  verification={{ reference: { kind: 'checks', passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length, href: '#checks' } }}
  actions={{ goToStep: i => { playback.seek(i); }, setParams: () => {}, showTab: t => { if (t === 'riser' || t === 'cantilever') { tab = t; switchTab(); } } }}>
  {#snippet article()}
    <h2>{s.model}</h2><p>{s.theory}</p><p>{s.method}</p><p>{s.comparison}</p>
    <p><ExperimentLink tab="riser">{s.riser}</ExperimentLink> · <ExperimentLink tab="cantilever">{s.cantilever}</ExperimentLink></p>
    <h2 id="checks">{s.checks}</h2>
    <dl>
      {#each validation.checks as check}
        <dt>{s.checkLabels[check.metric] ?? check.metric}</dt>
        <dd>{num(check.observed, { sig: 3 })} · {shared.tolerance} {num(check.tolerance, { sig: 3 })}</dd>
      {/each}
    </dl>
    <p>{s.limits}</p>
    <p><a href="https://github.com/alfredogneto/GIRAFFE/tree/1b8241ed337e79d29e0b65262a4ec340e2f1f443">{s.code}</a> · <a href="https://github.com/lambdaclass/stabileo/tree/main/research/mechanics/gay-neto-2014/inputs">{s.inputs}</a></p>
  {/snippet}
  {#snippet app()}
    <div lang={publicI18n.locale} class="riser-app" bind:this={host} data-source={source} data-step={shown} data-tab={tab}
      data-touchdown={run.summary.touchdown} data-moment-min={run.summary.moment_min}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <Segmented label={s.caseLabel} options={[{ id: 'riser', label: s.riser }, { id: 'cantilever', label: s.cantilever }]} bind:value={tab} onchange={switchTab} />
      <p>{source === 'replay' || tab === 'cantilever' ? shared.replaySource : shared.liveSource}</p>
      {#if tab === 'riser'}
        <StabileoViewer editorButton={false} xy={riserXY} cells={riserCells} cellSize={2} values={riserValues} displacement={riserDisplacement} deformScale={1}
          range={{ min: -300, max: 300 }} colourMap="diverging" title={s.moment} unit="N·m" height="17rem" view={[-30, -250, 1060, 230]} lineWidth={4} showAxes={false} lengthUnit="m" />
        <p>{s.coordinates}</p>
        <p><strong>{s.steps[frame.step - 1]}</strong> · {shared.step} {shown + 1}/{run.frames.length}</p>
      {:else}
        <StabileoViewer editorButton={false} xy={beamXY} cells={beamCells} cellSize={2} values={nodal(beam.m)} displacement={beamDisplacement} deformScale={1}
          range={{ min: -900, max: 900 }} colourMap="diverging" title={s.moment} unit="N·m" height="17rem" view={[-0.2, -0.1, 1.1, 1.1]} lineWidth={8} showAxes={false} lengthUnit="m" />
        <p>{s.cantileverNote}</p>
      {/if}
      <label for="riser-step">{shared.step} {shown + 1}</label>
      <input id="riser-step" type="range" min="0" max={frames - 1} value={shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      {#if tab === 'riser'}
        <label for="riser-pull">{s.pull} {num(pull, { dp: 0 })} kN</label>
        <input id="riser-pull" type="range" min="300" max="2000" step="50" bind:value={pull} />
        <label for="riser-lift">{s.lift} {num(lift, { dp: 0 })} m</label>
        <input id="riser-lift" type="range" min="50" max="190" step="2" bind:value={lift} />
        <label for="riser-friction">{s.friction} {num(friction, { dp: 2 })}</label>
        <input id="riser-friction" type="range" min="0" max="0.6" step="0.05" bind:value={friction} />
        <div class="buttons"><button onclick={compute} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button></div>
        {#if busy}<p aria-live="polite">{s.computing}</p>{/if}
        {#if failed}<p role="alert">{s.error}</p>{/if}
        <dl class="summary">
          <dt>{s.fairlead}</dt><dd>x {num(run.summary.fairlead[0], { dp: 2 })} m · z {num(run.summary.fairlead[1], { dp: 2 })} m</dd>
          <dt>{s.touchdown}</dt><dd>{num(run.summary.touchdown, { dp: 1 })} m</dd>
          <dt>{s.anchor}</dt><dd>{num(run.summary.anchor_tension / 1000, { dp: 1 })} kN</dd>
        </dl>
        {#if atDefaults && lastFrame}<p>{s.defaults}</p>{/if}
        <LineChart dataTable series={momentSeries} xLabel={s.length} yLabel={`${s.moment} (N·m)`} height={200} />
        <LineChart series={shearSeries} xLabel={s.length} yLabel={`${s.shear} (N)`} height={200} />
      {:else}
        <LineChart dataTable series={tipSeries} xLabel={s.time} yLabel={`${s.tipX} · ${s.tipZ}`} height={200} marker={beam.t} />
      {/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .riser-app { min-width: 0; padding: 0.6rem; border: 1px solid var(--hair); border-radius: 6px; }
  label { display: block; font-size: 0.85rem; }
  input[type='range'] { width: 100%; min-height: 44px; }
  p { font-size: 0.8rem; margin: 0.4rem 0; }
  .buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { min-height: 44px; min-width: 44px; font-size: max(12px, 0.85rem); padding: 0.4rem 0.7rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--lp-ink); cursor: pointer; }
  .summary { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.6rem; font-size: 0.8rem; }
  .summary dd { margin: 0; }
</style>
