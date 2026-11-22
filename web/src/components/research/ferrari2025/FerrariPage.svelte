<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import replay from '../../../../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json';
  import paper from '../../../../../research/stability/ferrari-sigmund-2025/reference-results/paper_values.json';
  import comparison from '../../../../../research/stability/ferrari-sigmund-2025/reference-results/published_comparison.json';
  import validation from '../../../../../research/stability/ferrari-sigmund-2025/VALIDATION.json';
  import { researchLocale } from '../i18n';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { sci } from '../shell/format';
  import type { PublishedRow } from '../shell/context';
  import PlotXY from '../grossman2026/PlotXY.svelte';
  import type { Frame } from './protocol';
  import { ferrariLocale, ferrariStrings, fill } from './strings';
  const s = $derived(ferrariStrings());
  const playback = new Playback(160, 1600);
  let frames = $state<Frame[]>(replay.frames);
  let lambda = $state(replay.lambda);
  const MOMENTS = [replay.model.loads[0].data.my, -replay.model.loads[0].data.my, -10 * replay.model.loads[0].data.my];
  let moment = $state(MOMENTS[0]);
  let source = $state<'replay' | 'live' | 'cached'>('replay');
  let running = $state(false);
  let failed = $state(false);
  let worker: Worker | null = null;
  let host: HTMLDivElement;
  const shown = $derived(frames[Math.min(playback.shown, frames.length - 1)]);
  const format = (value: number) => new Intl.NumberFormat(researchLocale(), { maximumFractionDigits: 6 }).format(value);
  const signed = (value: number) => new Intl.NumberFormat(researchLocale(), { maximumFractionDigits: 6, signDisplay: 'always' }).format(value);
  const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '−': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const scientific = (value: number) => {
    const e = sci(value, 4, researchLocale());
    return e.exp ? `${e.mantissa} × 10${[...e.exp].map(c => SUPERSCRIPT[c] ?? c).join('')}` : e.mantissa;
  };
  const short = (value: number) => new Intl.NumberFormat(researchLocale(), { maximumSignificantDigits: 4 }).format(value);
  const percent = (value: number) => new Intl.NumberFormat(researchLocale(), { style: 'percent', maximumSignificantDigits: 2 }).format(value);
  const rows = comparison.checks as PublishedRow[];
  const check = (prefix: string) => validation.checks.find(c => c.name.startsWith(prefix))!;
  const study = validation.study;
  const fine = study.corotational[study.corotational.length - 1];
  const beta = rows.find(r => r.id === 'beta-closed')!;
  const sourceLabel = $derived(source === 'replay' ? s.replay : source === 'live' ? s.live : s.cached);
  const values = $derived({
    length: format(replay.model.nodes['21'].x), young: format(replay.model.materials['1'].e), area: format(replay.model.sections['1'].a),
    inertia: scientific(replay.model.sections['1'].iz), force: format(-replay.model.loads[0].data.fz), moment: signed(MOMENTS[0]),
    elements: format(Object.keys(replay.model.elements).length / 2),
  });
  function stop() {
    playback.interact();
    worker?.terminate();
    worker = null;
    running = false;
    if (source === 'live') source = 'cached';
  }
  function restart() {
    stop(); failed = false; moment = MOMENTS[0];
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
    const model = structuredClone(replay.model);
    model.loads[0].data.my = moment;
    active.postMessage(model);
  }
  function setMoment(value: number) {
    if (!MOMENTS.includes(value)) return;
    moment = value;
    run();
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
<ExperimentShell introInArticle paperId="ferrari-2025" name={s.title} lead={s.lead} locale={ferrariLocale()}
  sourcePath="research/stability/ferrari-sigmund-2025"
  checks={{ passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length }}
  referenceLabel={s.checksLabel} comparison={rows} comparisonNames={s.rows}
  actions={{ goToStep: i => playback.seek(i), setParams: p => setMoment(Number(p.moment)), showTab: () => host.scrollIntoView({ block: 'nearest' }) }}>
  {#snippet article()}
    <h2>{s.scope}</h2><p>{s.scopeText}</p><p data-testid="ferrari-model">{fill(s.model, values)}</p>
    <h2>{s.methodHeading}</h2>
    <p>{fill(s.method, { factor: format(study.inextensional_area_m2 / paper.parameters.area_m2), elements: format(fine.elements_per_member) })}</p>
    <p data-testid="ferrari-extensible">{fill(s.extensible, { first: short(study.paper_area_not_a_bifurcation[0].alpha), second: short(study.paper_area_not_a_bifurcation[1].alpha) })}</p>
    <p data-testid="ferrari-beta">{fill(s.beta, { beta: short(beta.computed!), modal: short(fine.beta_modal), paper: format(beta.reference!) })}</p>
    <p>{s.tolerances}</p>
    <h2 id="checks">{s.evidence}</h2>
    <p data-testid="ferrari-checks">{fill(s.evidenceText, { mesh: percent(check('alpha: mesh').observed), step: percent(check('alpha: independent').observed), stiff: percent(check('alpha: inextensional').observed),
      derivative: scientific(Math.max(...validation.checks.slice(0, 4).map(c => c.observed))), derivativeTolerance: scientific(validation.checks[0].tolerance) })}</p>
    <p>{s.missing}</p>
    <p>{fill(s.signs, { opposite: signed(MOMENTS[1]), larger: signed(MOMENTS[2]) })} <ExperimentLink params={{ moment: MOMENTS[1] }}>{s.tryNegative}</ExperimentLink> · <ExperimentLink params={{ moment: MOMENTS[2] }}>{s.tryLarger}</ExperimentLink></p>
  {/snippet}
  {#snippet app()}
    <div bind:this={host} class="experiment" data-testid="ferrari-experiment">
      <p class="notice">{s.disclaimer}</p>
      <div class="run">
        <p data-testid="ferrari-source" aria-live="polite">{sourceLabel}</p>
        <div class="controls">
          <label>{s.imperfection}
            <select data-testid="ferrari-sign" value={moment} onchange={e => setMoment(Number(e.currentTarget.value))}>
              {#each MOMENTS as value}<option value={value}>{signed(value)} kN·m</option>{/each}
            </select>
          </label>
          <button onclick={run} disabled={running}>{s.run}</button>
          <button onclick={stop}>{s.stop}</button>
          <button onclick={restart}>{s.restart}</button>
        </div>
        {#if failed}<p role="alert">{s.failed}</p>{/if}
        <p data-testid="ferrari-buckling">λ₁ = {format(lambda)}</p>
      </div>
      <StabileoViewer plane="elevation" xy={replay.nodes} cells={replay.cells} cellSize={2} values={null} displayMode="geometry" renderDiagnostics range={{ min: 0, max: 1 }}
        displacement={shown.displacement} deformScale={1} showMesh={false} title={s.viewer}
        height="min(52vh, 24rem)" view={[-0.1, -0.1, 1.1, 1.1]} editorButton={false} oninteract={() => { playback.interact(); playback.follow = false; }} />
      <label>{s.step} {format(playback.shown + 1)} / {format(frames.length)}
        <input type="range" min="0" max={frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      <p>{s.lambda}: {format(shown.lambda)} · {s.theta}: {format(shown.theta)}</p>
      <PlotXY series={[{ name: s.path, color: '#3987e5', kind: 'line', points: frames.map(f => ({ x: f.theta, y: f.lambda })) }]}
        xLabel={s.theta} yLabel={s.lambda} ariaLabel={s.path}
        current={{ x: shown.theta, y: shown.lambda, label: s.step }} />
      <p class="notice">{s.pathNote}</p>
    </div>
  {/snippet}
</ExperimentShell>
</div>

<style>
  .experiment { min-width: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
  .controls { display: flex; flex-wrap: wrap; align-items: end; gap: 0.5rem; }
  select { min-height: 44px; padding: 0.4rem 0.6rem; font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--hair); border-radius: 4px; }
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
    .experiment > .notice:first-child { padding-left: 0.5rem; font-size: 12px; line-height: 1.25; }
  }
  @media (max-height: 500px) and (min-width: 600px) and (max-width: 900px) {
    .experiment { display: grid; grid-template-columns: minmax(0, 1fr) 13rem; grid-template-rows: auto 1fr; column-gap: 0.75rem; }
    .experiment > :global(*) { grid-column: 1 / -1; }
    .experiment > :global(.rs-viewer-host) { grid-column: 1; grid-row: 1 / span 2; }
    .experiment > .notice:first-child { grid-column: 2; grid-row: 1; }
    .experiment > .run { grid-column: 2; grid-row: 2; align-self: start; }
  }
</style>
