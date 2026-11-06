<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
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
  let tab = $state<'riser' | 'forces' | 'cantilever'>('riser');
  let pull = $state(1000);
  let lift = $state(186);
  let friction = $state(0.2);
  let source = $state<'replay' | 'live'>('replay');
  let busy = $state(false);
  let failed = $state(false);
  let host: HTMLDivElement;
  let worker: Worker | null = null;

  const frames = $derived(tab === 'cantilever' ? cantilever.frames.length : run.frames.length);
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

  function value(v: number | number[] | null) {
    if (v === null) return s.wholeLine;
    return Array.isArray(v) ? v.map(x => num(x, { dp: 4 })).join(', ') : num(v, { dp: 4 });
  }
  function stop() { playback.interact(); worker?.terminate(); worker = null; busy = false; }
  function compute() {
    stop(); busy = true; failed = false; if (tab === 'cantilever') setTab('riser');
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
  function setTab(next: string) {
    if (next !== 'riser' && next !== 'forces' && next !== 'cantilever') return;
    const swapped = (next === 'cantilever') !== (tab === 'cantilever');
    tab = next;
    if (swapped) { playback.setCount(frames); playback.seek(0); playback.play(); }
  }
  function goToStep(step: number) {
    if (tab === 'cantilever') setTab('riser');
    playback.interact();
    playback.seek(run.frames.findLastIndex(f => f.step === step + 1));
  }

  onMount(() => {
    playback.setCount(run.frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: innerWidth < 640 });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => observer.disconnect();
  });
  onDestroy(() => { stop(); playback.dispose(); });
</script>

<ExperimentShell paperId="gay-neto-2014" name={s.title} lead={s.lead} introInArticle compactHeader locale={publicI18n.locale}
  sourcePath="research/mechanics/gay-neto-2014"
  verification={{ reference: { kind: 'checks', passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length, href: '#checks' } }}
  actions={{ goToStep, setParams: () => {}, showTab: setTab }}>
  {#snippet article()}
    <h2>{s.model}</h2>
    <p>{s.theory}</p>
    <p>{s.method}</p>
    <p>{#each s.steps as label, i}{#if i > 0}{' · '}{/if}<ExperimentLink step={i}>{i + 1}. {label}</ExperimentLink>{/each}</p>
    <p>{s.comparison}</p>
    <p><ExperimentLink tab="forces">{s.forces}</ExperimentLink> · <ExperimentLink tab="cantilever">{s.cantilever}</ExperimentLink></p>
    <h2 id="checks">{s.checks}</h2>
    <p>{s.tableIntro}</p>
    <div class="table-scroll">
      <table class="checks">
        <thead><tr><th scope="col">{s.table.quantity}</th><th scope="col">{s.table.reference}</th><th scope="col">{s.table.ours}</th><th scope="col">{s.table.difference}</th><th scope="col">{s.table.tolerance}</th></tr></thead>
        <tbody>
          {#each validation.checks as check}
            <tr>
              <th scope="row">{s.checkLabels[check.metric] ?? check.metric}<span>{s.sources[check.source]}</span></th>
              <td>{value(check.reference)}</td>
              <td>{value(check.ours)}</td>
              <td>{check.passed ? '✓ ' : ''}{num(check.observed, { sig: 3 })}</td>
              <td>{num(check.tolerance, { sig: 3 })}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p>{s.limits}</p>
    <p><a href="https://github.com/alfredogneto/GIRAFFE/tree/1b8241ed337e79d29e0b65262a4ec340e2f1f443">{s.code}</a> · <a href="https://github.com/lambdaclass/stabileo/tree/main/research/mechanics/gay-neto-2014/inputs">{s.inputs}</a></p>
  {/snippet}
  {#snippet app()}
    <div lang={publicI18n.locale} class="riser-pane" bind:this={host} data-source={source} data-step={shown} data-tab={tab}
      data-touchdown={run.summary.touchdown} data-moment-min={run.summary.moment_min}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <PaneTabs label={s.caseLabel} tabs={[{ id: 'riser', label: s.riser }, { id: 'forces', label: s.forces }, { id: 'cantilever', label: s.cantilever }]}
        bind:active={() => tab, setTab} oninteract={() => playback.interact()} />
      <p class="source">{source === 'replay' || tab === 'cantilever' ? shared.replaySource : shared.liveSource}</p>
      <div id="rs-panel-riser" role="tabpanel" aria-labelledby="rs-tab-riser" hidden={tab !== 'riser'}>
        <StabileoViewer editorButton={false} xy={riserXY} cells={riserCells} cellSize={2} values={riserValues} displacement={riserDisplacement} deformScale={1}
          range={{ min: -300, max: 300 }} colourMap="diverging" title={s.moment} unit="N·m" height="max(240px, min(20rem, 38svh))" view={[-30, -330, 1300, 220]} lineWidth={4} showAxes={false} lengthUnit="m" />
        <p class="caption">{s.coordinates}</p>
      </div>
      <div id="rs-panel-forces" role="tabpanel" aria-labelledby="rs-tab-forces" hidden={tab !== 'forces'}>
        {#if tab === 'forces'}
          <LineChart dataTable series={momentSeries} xLabel={s.length} yLabel={`${s.moment} (N·m)`} height={210} />
          <LineChart series={shearSeries} xLabel={s.length} yLabel={`${s.shear} (N)`} height={210} />
          {#if atDefaults && lastFrame}<p class="caption">{s.defaults}</p>{/if}
        {/if}
      </div>
      <div id="rs-panel-cantilever" role="tabpanel" aria-labelledby="rs-tab-cantilever" hidden={tab !== 'cantilever'}>
        {#if tab === 'cantilever'}
          <StabileoViewer editorButton={false} xy={beamXY} cells={beamCells} cellSize={2} values={nodal(beam.m)} displacement={beamDisplacement} deformScale={1}
            range={{ min: -900, max: 900 }} colourMap="diverging" title={s.moment} unit="N·m" height="max(220px, min(17rem, 32svh))" view={[-0.2, -0.1, 1.1, 1.1]} lineWidth={8} showAxes={false} lengthUnit="m" />
          <p class="caption">{s.cantileverNote}</p>
          <LineChart dataTable series={tipSeries} xLabel={s.time} yLabel={`${s.tipX} · ${s.tipZ}`} height={200} marker={beam.t} />
        {/if}
      </div>
      <label class="step">
        <span>{#if tab !== 'cantilever'}<strong>{s.steps[frame.step - 1]}</strong>{' · '}{/if}{shared.step} {shown + 1}/{frames}</span>
        <input type="range" min="0" max={frames - 1} value={shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      {#if tab !== 'cantilever'}
        <div class="params">
          <label>{s.pull} <strong>{num(pull, { dp: 0 })} kN</strong><input type="range" min="300" max="2000" step="50" bind:value={pull} /></label>
          <label>{s.lift} <strong>{num(lift, { dp: 0 })} m</strong><input type="range" min="50" max="190" step="2" bind:value={lift} /></label>
          <label>{s.friction} <strong>{num(friction, { dp: 2 })}</strong><input type="range" min="0" max="0.6" step="0.05" bind:value={friction} /></label>
        </div>
      {/if}
      <div class="buttons">
        {#if tab !== 'cantilever'}<button onclick={compute} disabled={busy}>{s.run}</button>{/if}
        <button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button>
      </div>
      {#if busy}<p aria-live="polite">{s.computing}</p>{/if}
      {#if failed}<p role="alert">{s.error}</p>{/if}
      {#if tab !== 'cantilever'}
        <dl class="summary">
          <dt>{s.fairlead}</dt><dd>x {num(run.summary.fairlead[0], { dp: 2 })} m · z {num(run.summary.fairlead[1], { dp: 2 })} m</dd>
          <dt>{s.touchdown}</dt><dd>{num(run.summary.touchdown, { dp: 1 })} m</dd>
          <dt>{s.anchor}</dt><dd>{num(run.summary.anchor_tension / 1000, { dp: 1 })} kN</dd>
        </dl>
      {/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .riser-pane { min-width: 0; height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  [role='tabpanel'] { display: flex; flex-direction: column; gap: 0.5rem; }
  [role='tabpanel'][hidden] { display: none; }
  p { font-size: 0.85rem; margin: 0; }
  .source, .caption { color: var(--fg-2); font-size: 0.8rem; }
  label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
  input[type='range'] { width: 100%; min-height: 44px; margin: 0; }
  .params { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0 1rem; }
  .buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { min-height: 44px; min-width: 44px; font: inherit; font-size: max(12px, 0.85rem); padding: 0.4rem 0.7rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--lp-ink); cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  .summary { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.8rem; font-size: 0.85rem; margin: 0; }
  .summary dt { color: var(--fg-2); }
  .summary dd { margin: 0; }
  .table-scroll { overflow-x: auto; }
  .checks { width: 100%; border-collapse: collapse; font-size: 0.85rem; line-height: 1.35; }
  .checks th, .checks td { text-align: left; vertical-align: top; padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--hair); }
  .checks thead th { color: var(--fg-2); font-weight: 500; }
  .checks thead th + th { text-align: right; white-space: nowrap; }
  .checks td { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .checks tbody th { font-weight: 500; min-width: 11rem; }
  .checks tbody th span { display: block; color: var(--fg-2); font-weight: 400; font-size: 0.8rem; }
</style>
