<script lang="ts">
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import replay from '../../../../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json';
  import { benchmark, checks, compare, published, quantities, study, tolerance, viewerData, type Frame, type LimitPoint, type Quantity, type Step } from './case';
  import { archStrings } from './i18n';
  import type { WorkerError } from './solver.worker';

  const playback = new Playback(140, 1500);
  let frames = $state<Frame[]>(replay.frames);
  let steps = $state<Step[]>(replay.steps);
  let limit = $state<LimitPoint | null>(replay.limitPoint);
  let source = $state<Source>('replay');
  let busy = $state(false);
  let liveSteps = $state(400);
  let error = $state<WorkerError | null>(null);
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  const s = $derived(archStrings(publicI18n.locale));
  const current = $derived(frames[playback.shown]);
  const view = $derived(viewerData(current));
  const comparison = $derived(steps.length ? compare(steps) : null);
  const rows = $derived(limit ? checks(limit) : null);
  const replayChecks = checks(replay.limitPoint);
  const studyRows = study();
  const complete = $derived(steps.length === benchmark.input.maxSteps);
  const label = $derived<Record<Quantity, string>>({ loadFactor: s.qLoad, uOverR: s.qU, vOverR: s.qV, rotation: s.qRot });
  const fmt = (n: number | undefined) => n === undefined ? '—' : new Intl.NumberFormat(publicI18n.locale, { maximumFractionDigits: 5 }).format(n);
  const pct = (n: number, digits = 3, signDisplay: 'exceptZero' | 'auto' = 'exceptZero') => new Intl.NumberFormat(publicI18n.locale, { style: 'percent', maximumFractionDigits: digits, signDisplay }).format(n);
  const verdict = $derived(
    !complete ? (busy ? s.running : s.incomplete.replace('{n}', String(steps.length)).replace('{total}', String(benchmark.input.maxSteps)))
      : !rows ? s.running
      : comparison?.pass && rows.every(r => r.pass) ? s.verdictPass : s.verdictFail,
  );
  function stop() {
    playback.interact();
    worker?.terminate(); worker = null; busy = false;
    if (source === 'live') source = 'cached';
  }
  function run() {
    stop(); frames = []; steps = []; limit = null; error = null; source = 'live'; busy = true;
    playback.follow = true;
    worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.error) { error = data.error; stop(); return; }
      if (data.frame) {
        frames = [...frames, data.frame]; steps = data.steps;
        playback.setCount(frames.length);
      }
      if (data.limit) limit = data.limit;
      if (data.done) stop();
    };
    worker.onerror = () => { error = 'solve'; stop(); };
    worker.postMessage({ maxSteps: liveSteps });
  }
  function restart() {
    stop(); frames = replay.frames; steps = replay.steps; limit = replay.limitPoint; error = null; source = 'replay';
    playback.setCount(frames.length); playback.play();
  }
  onMount(() => {
    const narrow = matchMedia('(max-width: 600px)').matches;
    playback.setCount(frames.length);
    playback.startAutoplay({ narrow, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
    const observer = new IntersectionObserver(entries => playback.setVisible(entries[0].isIntersecting));
    observer.observe(host);
    return () => { observer.disconnect(); worker?.terminate(); playback.dispose(); };
  });
</script>

<ExperimentShell compactHeader introInArticle paperId="dadeppo-arch-1975" name={s.title} lead={s.hook}
  sourcePath="research/benchmarks/dadeppo-arch-1975"
  actions={{ goToStep: i => playback.seek(i), setParams: () => {}, showTab: () => {} }}
  verification={{ reference: { kind: 'none', why: s.noAuthorCode }, published: { kind: 'checks', passed: replayChecks.filter(r => r.pass).length, total: replayChecks.length, href: '#checks' } }}>
  {#snippet article()}
    <div class="arch-article">
      <h2>{s.model}</h2><p>{s.description}</p><p>{s.units}</p>
      <h2>{s.comparison}</h2><p>{s.referenceText}</p><p>{s.signs}</p>
      <p><a href="https://userweb.eng.gla.ac.uk/sondipon.adhikari/fulltext/journal/ft7a.pdf" target="_blank" rel="noreferrer">{s.sourceLink}</a></p>
      <p>{s.method}</p>
      <h2>{s.studyHeading}</h2><p>{s.studyText}</p>
      <div class="table-scroll">
        <table data-testid="arch-study">
          <caption>{s.studyCaption}</caption>
          <thead><tr><th>{s.quantity}</th><th>20</th><th>40</th><th>80</th><th>{s.extrapolated}</th><th>{s.reference}</th><th>{s.tolerance}</th></tr></thead>
          <tbody>
            {#each studyRows as r (r.quantity)}
              <tr data-testid="study-{r.quantity}"><th>{label[r.quantity]}</th>{#each r.values as v, i (i)}<td>{fmt(v)}</td>{/each}<td>{fmt(r.extrapolated)} ({pct(r.relative)})</td><td>{fmt(r.published)}</td><td>{pct(r.tolerance, 2, 'auto')}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p><ExperimentLink step={12}>{s.inspect}</ExperimentLink></p><p>{s.replayNote}</p>
      <h2>{s.notYet}</h2><ul>{#each s.limitations as item (item)}<li>{item}</li>{/each}</ul>
    </div>
  {/snippet}
  {#snippet app()}
    <div class="arch-app" bind:this={host} data-source={source} data-busy={busy}>
      <StabileoViewer oninteract={() => playback.interact()} {...view} cellSize={2} deformScale={1} editorButton={false} title={s.displacement} unit="m" height="min(20rem, 42svh)" />
      <label class="slider">{s.step} {current?.step ?? 0} / {benchmark.input.maxSteps}
        <input aria-label={s.step} aria-valuetext={current ? s.slider.replace('{step}', String(current.step)).replace('{load}', fmt(current.loadFactor)) : undefined} type="range" min="0" max={Math.max(0, frames.length - 1)} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      <p role="status">{s[source]}{busy ? ` · ${s.running}` : ''}</p>
      <div class="controls">
        <label class="path">{s.livePath}
          <select aria-label={s.livePath} bind:value={liveSteps} disabled={busy}>
            <option value={20}>{s.shortPath}</option>
            <option value={400}>{s.fullPath}</option>
          </select>
        </label>
        <button onclick={run} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button>
      </div>
      {#if error}<p role="alert">{error === 'invalid' ? s.errorInvalid : s.errorSolve}</p>{/if}
      <div class="comparison" id="checks" data-testid="arch-comparison">
        <p class="limit-title"><strong>{s.limit}</strong></p>
        <div class="table-scroll">
          <table>
            <thead><tr><th>{s.quantity}</th><th>{s.reference}</th><th>{s.stabileo}</th><th>{s.difference}</th><th>{s.tolerance}</th><th></th></tr></thead>
            <tbody>
              {#each quantities as q (q)}
                {@const r = rows?.find(r => r.quantity === q)}
                <tr data-testid="check-{q}"><th>{label[q]}</th><td>{fmt(published[q])}</td><td>{r ? fmt(r.value) : '—'}</td><td>{r ? pct(r.relative) : '—'}</td><td>{pct(tolerance[q], 2, 'auto')}</td><td>{r ? (r.pass ? s.pass : s.fail) : '—'}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p>{s.largest}: <span data-testid="arch-peak">{fmt(comparison?.peak)}</span></p>
        <p data-testid="arch-verdict">{verdict}</p>
      </div>
      <LineChart ariaLabel={s.chartLabel} series={[{ name: 'Stabileo', color: '#61b6ff', points: steps.map(p => [p.step, p.loadFactor]) }]} xLabel={s.step} yLabel="PR²/EI" height={180} rules={[{ y: benchmark.reference, text: `${s.reference}: ${fmt(benchmark.reference)}` }]} marker={current?.step ?? null} />
      <details>
        <summary>{s.chartData}</summary>
        <div class="table-scroll">
          <table data-testid="arch-curve-data">
            <thead><tr><th>{s.step}</th><th>PR²/EI</th></tr></thead>
            <tbody>{#each steps.filter(p => p.step % 20 === 0) as p (p.step)}<tr><td>{p.step}</td><td>{fmt(p.loadFactor)}</td></tr>{/each}</tbody>
          </table>
        </div>
      </details>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .arch-app { max-height: 100%; overflow-y: auto; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; align-items: end; margin-bottom: .75rem; }
  .path { flex: 1 1 100%; margin: 0; }
  select { display: block; min-height: 44px; font: inherit; max-width: 100%; }
  button { font: inherit; padding: .55rem .7rem; min-height: 44px; min-width: 44px; }
  label { display: block; margin: .5rem 0; }
  input[type=range] { display: block; width: 100%; min-height: 44px; margin: 0; }
  p { font-size: .875rem; overflow-wrap: anywhere; }
  .comparison { border-block: 1px solid var(--hair); padding: .6rem 0; }
  .limit-title { margin: 0 0 .4rem; }
  .table-scroll { overflow-x: auto; max-width: 100%; }
  table { border-collapse: collapse; width: 100%; font-size: .8125rem; font-variant-numeric: tabular-nums; }
  caption { text-align: left; font-size: .8125rem; padding-bottom: .3rem; }
  th, td { text-align: left; padding: .35rem .5rem .35rem 0; border-bottom: 1px solid var(--hair); white-space: nowrap; }
  tbody th { white-space: normal; min-width: 7rem; }
  summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; font-size: .875rem; }
  .arch-article :global(.rs-xlink) { min-height: 44px; text-align: left; }
  a { color: inherit; }
  @media (max-height: 500px) and (orientation: landscape) {
    :global(.rs-shell:has(.arch-app) .rs-shell-head h1) { font-size: 1.5rem; margin-bottom: .25rem; }
    :global(.rs-shell:has(.arch-app) .rs-shell-head) { margin-bottom: .5rem; }
    :global(.landing .rs-shell.sec:has(.arch-app)) { padding-top: 1rem; }
  }
</style>
