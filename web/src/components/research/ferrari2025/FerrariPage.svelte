<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import replay from '../../../../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json';
  import paper from '../../../../../research/stability/ferrari-sigmund-2025/reference-results/paper_values.json';
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
    stop(); failed = false; running = true; playback.follow = true;
    const active = new Worker(new URL('./run.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = ({ data }: MessageEvent<{ kind: string; lambda?: number; frame?: Frame }>) => {
      if (worker !== active) return;
      if (data.kind === 'buckling' && data.lambda !== undefined) {
        lambda = data.lambda; frames = [replay.frames[0]]; source = 'live';
        playback.setCount(1);
      } else if (data.kind === 'frame' && data.frame) {
        frames = [...frames, data.frame]; playback.setCount(frames.length);
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
<ExperimentShell introInArticle paperId="ferrari-2025" name={s.ferrariTitle} lead={s.ferrariLead}
  sourcePath="research/stability/ferrari-sigmund-2025"
  referenceLabel={s.ferrariReplay}
  verification={{ reference: { kind: 'none', why: s.ferrariComparison }, published: { kind: 'checks', passed: validation.checks.filter(c => c.category === 'paper' && c.passed).length, total: validation.checks.slice(4).length, href: '#checks' } }}
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: () => host.scrollIntoView({ block: 'nearest' }) }}>
  {#snippet article()}
    <h2>{s.ferrariScope}</h2><p>{s.ferrariScopeText}</p><p data-testid="ferrari-model">{s.ferrariModel.replace('{length}', format(replay.model.nodes['21'].x)).replace('{young}', format(replay.model.materials['1'].e)).replace('{area}', format(replay.model.sections['1'].a)).replace('{inertia}', scientific(replay.model.sections['1'].iz)).replace('{force}', format(-replay.model.loads[0].data.fz)).replace('{moment}', format(replay.model.loads[0].data.my)).replace('{elements}', format(Object.keys(replay.model.elements).length / 2))}</p>
    <h2>{s.ferrariReference}</h2><p data-testid="ferrari-reference">{s.ferrariReferenceText.replace('{closed}', [paper.closed_form.lambda_1, paper.closed_form.alpha, paper.closed_form.beta].map(format).join('; ')).replace('{numerical}', [paper.numerical.lambda_1, paper.numerical.alpha, paper.numerical.beta].map(format).join('; '))}</p>
    <h2 id="checks">{s.ferrariEvidence}</h2><p>{s.ferrariEvidenceText}</p>
    <p data-testid="ferrari-checks">{s.ferrariNumbers.replace('{elements}', format(Object.keys(replay.model.elements).length / 2)).replace('{reference}', format(paper.numerical.lambda_1)).replace('{error}', scientific(validation.checks[4].observed)).replace('{tolerance}', scientific(validation.checks[4].tolerance)).replace('{derivative}', scientific(Math.max(...validation.checks.slice(0, 4).map(c => c.observed)))).replace('{derivativeTolerance}', scientific(validation.checks[0].tolerance))}</p><p>{s.ferrariMissing}</p>
  {/snippet}
  {#snippet app()}
    <div bind:this={host} class="experiment" data-testid="ferrari-experiment">
      <p class="notice">{s.ferrariDisclaimer}</p>
      <div class="run">
        <p data-testid="ferrari-source" aria-live="polite">{sourceLabel}</p>
        <div class="controls">
          <button onclick={run} disabled={running}>{s.ferrariRun}</button>
          <button onclick={stop}>{s.ferrariStop}</button>
          <button onclick={restart}>{s.ferrariRestart}</button>
        </div>
        {#if failed}<p role="alert">{s.ferrariFailed}</p>{/if}
        <p data-testid="ferrari-buckling">λ₁ = {format(lambda)}</p>
      </div>
      <StabileoViewer xy={replay.nodes} cells={replay.cells} cellSize={2} values={null} displayMode="geometry" renderDiagnostics range={{ min: 0, max: 1 }}
        displacement={shown.displacement} deformScale={1} showMesh={false} title={s.ferrariViewer}
        height="min(52vh, 24rem)" view={[-0.1, -0.1, 1.1, 1.1]} editorButton={false} oninteract={() => { playback.interact(); playback.follow = false; }} />
      <label>{s.ferrariStep} {format(playback.shown + 1)} / {format(frames.length)}
        <input type="range" min="0" max={frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      <p>{s.ferrariLambda}: {format(shown.lambda)} · {s.ferrariTheta}: {format(shown.theta)}</p>
      <PlotXY series={[{ name: s.ferrariPath, color: '#3987e5', kind: 'line', points: frames.map(f => ({ x: f.theta, y: f.lambda })) }]}
        xLabel={s.ferrariTheta} yLabel={s.ferrariLambda} ariaLabel={s.ferrariPath}
        current={{ x: shown.theta, y: shown.lambda, label: s.ferrariStep }} />
      <p class="notice">{s.ferrariComparison}</p>
    </div>
  {/snippet}
</ExperimentShell>
</div>

<style>
  .experiment { min-width: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { min-height: 44px; padding: 0.5rem 0.75rem; font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--hair); border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .experiment :global(.sfv-wrap), .experiment :global(.sfv-wrap *) { font-size: 12px !important; }
  .experiment :global(button) { min-height: 44px; min-width: 44px; font-size: 12px; }
  label { display: block; }
  input { display: block; width: 100%; min-height: 44px; margin: 0; }
  .notice { border-left: 3px solid var(--rs-plot-ref); padding-left: 0.75rem; }
  @media (max-width: 900px) { .ferrari-page :global(.rs-shell-app) { order: -1; } }
  @media (min-width: 70rem) { .ferrari-page :global(.rs-shell-app) { overflow: auto; } }
  .ferrari-page :global(svg text) { font-size: 12px; }
  @media (max-height: 500px) and (min-width: 600px) {
    .ferrari-page :global(.rs-shell) { padding-top: calc(var(--lp-nav-h, 3.6rem) + 0.25rem); }
    .ferrari-page :global(.rs-shell-head) { margin-bottom: 0.25rem; }
    .ferrari-page :global(.rs-shell-head h1) { font-size: 1.25rem; margin: 0; max-width: none; }
    .ferrari-page :global(.rs-crumb) { margin: 0; font-size: 12px; }
    .experiment > p, .run p { margin: 0.25rem 0; }
    .experiment > .notice:first-child { display: none; }
  }
  @media (max-height: 500px) and (min-width: 600px) and (max-width: 900px) {
    .experiment { display: grid; grid-template-columns: minmax(0, 1fr) 13rem; column-gap: 0.75rem; }
    .experiment > :global(*) { grid-column: 1 / -1; }
    .experiment > :global(.rs-viewer-host) { grid-column: 1; grid-row: 1; }
    .run { grid-column: 2; grid-row: 1; align-self: start; }
  }
</style>
