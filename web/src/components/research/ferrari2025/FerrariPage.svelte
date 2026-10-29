<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import replay from '../../../../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json';
  import validation from '../../../../../research/stability/ferrari-sigmund-2025/VALIDATION.json';
  import { rs, researchLocale } from '../i18n';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback } from '../shell/playback.svelte';
  import PlotXY from '../grossman2026/PlotXY.svelte';
  import type { Frame } from './protocol';
  const s = $derived(rs());
  const playback = new Playback(160, 1600);
  let frames = $state<Frame[]>(replay.frames);
  let lambda = $state(replay.lambda);
  let source = $state<'replay' | 'live' | 'cached'>('replay');
  let running = $state(false);
  let failed = $state(false);
  let worker: Worker | null = null;
  let host: HTMLDivElement;
  const shown = $derived(frames[Math.min(playback.shown, frames.length - 1)]);
  const format = (value: number) => new Intl.NumberFormat(researchLocale(), { maximumFractionDigits: 6 }).format(value);
  const scientific = (value: number) => new Intl.NumberFormat(researchLocale(), { notation: 'scientific', maximumSignificantDigits: 4 }).format(value);
  const sourceLabel = $derived(source === 'replay' ? s.ferrariReplay : source === 'live' ? s.ferrariLive : s.ferrariCached);
  function stop() {
    playback.interact();
    worker?.terminate();
    worker = null;
    running = false;
    if (source === 'live') source = 'cached';
  }
  function restart() {
    stop(); failed = false;
    frames = replay.frames; lambda = replay.lambda; source = 'replay';
    playback.setCount(frames.length); playback.seek(0); playback.play();
  }
  function run() {
    stop(); failed = false; running = true;
    const active = new Worker(new URL('./run.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = ({ data }: MessageEvent<{ kind: string; lambda?: number; frame?: Frame }>) => {
      if (worker !== active) return;
      if (data.kind === 'buckling' && data.lambda !== undefined) {
        lambda = data.lambda; frames = [replay.frames[0]]; source = 'live';
        playback.setCount(1); playback.seek(0);
      } else if (data.kind === 'frame' && data.frame) {
        frames = [...frames, data.frame]; playback.setCount(frames.length); playback.seek(frames.length - 1);
      } else if (data.kind === 'done') stop();
      else if (data.kind === 'error') { failed = true; stop(); }
    };
    active.onerror = () => { if (worker === active) { failed = true; stop(); } };
    active.postMessage(replay.model);
  }
  onMount(() => {
    playback.setCount(frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 810px)').matches });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => observer.disconnect();
  });
  onDestroy(() => { worker?.terminate(); playback.dispose(); });
</script>

<div class="ferrari-page">
<ExperimentShell paperId="ferrari-2025" name={s.ferrariTitle} lead={s.ferrariLead}
  sourcePath="research/stability/ferrari-sigmund-2025"
  verification={{ reference: { kind: 'none', why: s.ferrariPending }, published: { kind: 'none', why: s.ferrariPending } }}
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: () => host.scrollIntoView({ block: 'nearest' }) }}>
  {#snippet article()}
    <h2>{s.ferrariScope}</h2><p>{s.ferrariScopeText}</p><p>{s.ferrariModel.replace('{area}', format(0.01)).replace('{moment}', format(0.001))}</p>
    <h2>{s.ferrariReference}</h2><p>{s.ferrariReferenceText.replace('{closed}', [2.430, 0.3805, 0.1421].map(format).join('; ')).replace('{numerical}', [2.4313, 0.3820, 0.1436].map(format).join('; '))}</p>
    <h2 id="checks">{s.ferrariEvidence}</h2><p>{s.ferrariEvidenceText}</p>
    <p>{s.ferrariNumbers.replace('{reference}', format(2.4313)).replace('{error}', scientific(validation.checks[4].observed)).replace('{tolerance}', scientific(validation.checks[4].tolerance)).replace('{derivative}', scientific(Math.max(...validation.checks.slice(0, 4).map(c => c.observed)))).replace('{derivativeTolerance}', scientific(validation.checks[0].tolerance))}</p><p>{s.ferrariBlocker}</p><p>{s.ferrariMissing}</p>
    <h2>{s.ferrariAuthors}</h2><p>{s.ferrariQuestions}</p>
  {/snippet}
  {#snippet app()}
    <div bind:this={host} class="experiment" data-testid="ferrari-experiment">
      <p class="notice">{s.ferrariDisclaimer}</p>
      <p data-testid="ferrari-source" aria-live="polite">{sourceLabel}</p>
      <div class="controls">
        <button onclick={run} disabled={running}>{s.ferrariRun}</button>
        <button onclick={stop}>{s.ferrariStop}</button>
        <button onclick={restart}>{s.ferrariRestart}</button>
      </div>
      {#if failed}<p role="alert">{s.ferrariFailed}</p>{/if}
      <p data-testid="ferrari-buckling">λ₁ = {format(lambda)}</p>
      <StabileoViewer xy={replay.nodes} cells={replay.cells} cellSize={2} values={null} range={{ min: 0, max: 1 }}
        displacement={shown.displacement} deformScale={1} showMesh={false} title={s.ferrariViewer}
        height="min(52vh, 24rem)" view={[-0.1, -0.1, 1.1, 1.1]} editorButton={false} oninteract={() => playback.interact()} />
      <label>{s.ferrariStep} {format(playback.shown + 1)} / {format(frames.length)}
        <input type="range" min="0" max={frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      <p>{s.ferrariLambda}: {format(shown.lambda)} · {s.ferrariTheta}: {format(shown.theta)}</p>
      <PlotXY series={[{ name: s.ferrariPath, color: '#3987e5', kind: 'line', points: frames.map(f => ({ x: f.theta, y: f.lambda })) }]}
        xLabel={s.ferrariTheta} yLabel={s.ferrariLambda} ariaLabel={s.ferrariPath}
        current={{ x: shown.theta, y: shown.lambda, label: s.ferrariStep }} />
      <p class="notice">{s.ferrariPending}</p>
    </div>
  {/snippet}
</ExperimentShell>
</div>

<style>
  .experiment { min-width: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { min-height: 44px; padding: 0.5rem 0.75rem; font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--hair); border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .experiment :global(.sfv *) { font-size: 12px !important; }
  .experiment :global(button) { min-height: 44px; min-width: 44px; font-size: 12px; }
  label { display: block; }
  input { display: block; width: 100%; min-height: 44px; margin: 0; }
  .notice { border-left: 3px solid var(--rs-plot-ref); padding-left: 0.75rem; }
  @media (max-width: 900px) { .ferrari-page :global(.rs-shell-app) { order: -1; } }
  @media (min-width: 70rem) { .ferrari-page :global(.rs-shell-app) { overflow: auto; } }
  .ferrari-page :global(svg text) { font-size: 12px; }
</style>
