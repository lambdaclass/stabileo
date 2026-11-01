<script lang="ts">
  import { onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import NumberField from '../shauer2025/NumberField.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import Sci from '../shell/Sci.svelte';
  import { rs } from '../i18n';
  import { projection, editorUrl, type Form } from './form';
  import frames from '../../../../../research/form-finding/pastrana-2026/results/stabileo_results.json';
  import validation from '../../../../../research/form-finding/pastrana-2026/VALIDATION.json';
  const s = $derived(rs());
  const playback = new Playback(120);
  let q = $state(1);
  let load = $state(4);
  let invalidQ = $state(false);
  let invalidLoad = $state(false);
  let elevation = $state(false);
  let source = $state<Source>('replay');
  let live = $state<Form | null>(null);
  let busy = $state(false);
  let failed = $state(false);
  let worker: Worker | null = null;
  let host: HTMLDivElement;
  const shown = $derived(live ?? frames[playback.shown]);
  const xy = $derived(projection(shown, elevation));
  const checks = { passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length };
  function stop() {
    playback.interact();
    worker?.terminate(); worker = null; busy = false;
  }
  function restart() {
    stop(); q = 1; load = 4; invalidQ = false; invalidLoad = false; live = null; source = 'replay'; failed = false;
    playback.setCount(frames.length); playback.play();
  }
  function run() {
    stop(); failed = false;
    if (invalidQ || invalidLoad) return;
    busy = true;
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.error) failed = true;
      else { live = data.form; source = 'live'; }
      worker?.terminate(); worker = null; busy = false;
    };
    worker.onerror = () => { failed = true; stop(); };
    worker.postMessage({ base: new URL(`${import.meta.env.BASE_URL}research-wasm/pastrana-2026/`, location.origin).href, q, load });
  }
  async function openEditor() {
    stop();
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const url = await editorUrl(shown, s.formEditorLabel, new URLSearchParams(location.search).has('e2e'));
      if (popup) popup.location.href = url; else location.href = url;
    } catch { popup?.close(); failed = true; }
  }
  onMount(() => {
    playback.setCount(frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 700px)').matches });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => { observer.disconnect(); playback.dispose(); worker?.terminate(); };
  });
</script>

<div class="pastrana-page">
<ExperimentShell compactHeader={true} paperId="pastrana-2026" name={s.formTitle} lead={s.formLead} {checks}
  actions={{ goToStep: (i) => { stop(); live = null; source = 'replay'; playback.seek(i); }, setParams: () => restart(), showTab: () => {} }}
  sourcePath="research/form-finding/pastrana-2026"
>
  {#snippet article()}
    <h2>{s.formScopeTitle}</h2><p>{s.formScope}</p>
    <h2>{s.formMethodTitle}</h2><p>{s.formMethod}</p>
    <p class="equation">x* = (Σ qⱼ sⱼ + p) / Σ qⱼ</p>
    <p>{s.formInputs}</p>
    <h2 id="checks">{s.formEvidenceTitle}</h2><p>{s.formEvidence}</p>
    <p>{s.formPositionError}: <Sci value={Math.max(...validation.checks.filter(c => c.metric.startsWith('jax_fdm positions')).map(c => c.observed))} /> m;
      {s.formForceError}: <Sci value={Math.max(...validation.checks.filter(c => c.metric.startsWith('jax_fdm tension')).map(c => c.observed))} /> kN.</p>
    <p>{s.formReference}</p>
    <h2>{s.formEngineTitle}</h2><p>{s.formEngine}</p>
    <h2>{s.formLimitsTitle}</h2><p>{s.formLimits}</p>
    <p><strong>{s.notDesign}.</strong> {s.formDisclaimer}</p>
    <h2>{s.formQuestionsTitle}</h2><p>{s.formQuestions}</p>
  {/snippet}
  {#snippet app()}
    <div class="form-app" bind:this={host}>
      <p class="source" data-testid="form-source">{source === 'replay' ? s.formReplay : s.formLive}</p>
      <StabileoViewer {xy} cells={shown.edges.flat()} cellSize={2} values={shown.forces} perCell={true}
        range={{ min: 0, max: Math.max(...shown.forces) }} title={s.formForce} unit="kN"
        height="clamp(15rem, 36vh, 25rem)" showMesh={false} editorButton={false} oninteract={() => playback.interact()} />
      <p class="projection">{s.formProjectionNote}</p>
      <div class="result" data-testid="form-result">
        <span>{s.formHeight}: {num(shown.nodes[0][2], { dp: 3 })} m</span>
        <span>{s.formForce}: {num(shown.forces[0], { dp: 3 })} kN</span>
        <span>{s.formDensity}: {num(shown.q)} kN/m · {s.formLoad}: {num(shown.load)} kN</span>
      </div>
      <div class="controls" onfocusin={() => playback.interact()} role="group" aria-label={s.formControls}>
        <label>{s.formDensity} (kN/m)<NumberField bind:value={q} bind:invalid={invalidQ} min={0.5} max={2} label={s.formDensity} /></label>
        <label>{s.formLoad} (kN)<NumberField bind:value={load} bind:invalid={invalidLoad} min={1} max={8} label={s.formLoad} /></label>
        <button onclick={run} disabled={busy || invalidQ || invalidLoad}>{busy ? s.formComputing : s.formRun}</button>
        <button onclick={stop}>{s.formStop}</button>
        <button onclick={restart}>{s.formRestart}</button>
        <button onclick={() => { playback.interact(); elevation = !elevation; }}>{elevation ? s.formOblique : s.formElevation}</button>
      </div>
      {#if failed}<p role="alert">{s.formFailed}</p>{/if}
      <label class="slider">{s.formReplayStep} {num(playback.shown + 1)} / {num(frames.length)}
        <input type="range" min="0" max={frames.length - 1} value={playback.shown} aria-label={s.formReplayStep}
          oninput={(e) => { stop(); live = null; source = 'replay'; playback.seek(Number(e.currentTarget.value)); }} />
      </label>
      <button id="edit" class="editor" onclick={openEditor}>{s.editInStabileo}</button>
      <p class="note">{s.formExportNote}</p>
    </div>
  {/snippet}
</ExperimentShell>
</div>

<style>
  .pastrana-page :global(.rs-prose) { overflow-wrap: anywhere; }
  .form-app { --rs-control-h: 44px; border: 1px solid var(--hair); border-radius: 8px; padding: .75rem; background: var(--card); font-size: .875rem; max-height: 100%; overflow: auto; }
  p { margin: .35rem 0 .7rem; }
  .source { font-weight: 600; }
  .projection, .note { font-size: .8125rem; color: var(--fg-2); }
  .result { display: flex; flex-wrap: wrap; gap: .4rem 1rem; padding: .5rem 0; }
  .controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
  label { display: grid; gap: .3rem; min-width: 0; }
  button { min-height: 44px; padding: .4rem .5rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--card); font: inherit; cursor: pointer; }
  .form-app :global(button) { min-height: 44px; min-width: 44px; font-size: max(12px, .8125rem); }
  .form-app :global(.shell-legend), .form-app :global(.legend-unit-inline), .form-app :global(.status-bar),
  .form-app :global(.sfv-mark), .form-app :global(.status-label), .form-app :global(.cam-group-title), .form-app :global(.cam-two small) { font-size: 12px; }
  button:disabled { opacity: .5; cursor: default; }
  .slider { margin: .6rem 0; }
  input[type=range] { width: 100%; min-height: 44px; margin: 0; }
  .editor { width: 100%; }
  .equation { overflow-wrap: anywhere; }
</style>
