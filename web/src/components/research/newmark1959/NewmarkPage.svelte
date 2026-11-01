<script lang="ts">
  import { onMount } from 'svelte';
  import evidence from '../../../../../research/benchmarks/newmark-1959/VALIDATION.json';
  import replay from '../../../../../research/benchmarks/newmark-1959/results/stabileo_results.json';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import { rs, researchLocale } from '../i18n';
  import { num } from '../shell/format';
  import { strings } from './i18n';
  import { benchmark, period, exact, compute, type Run } from './benchmark';

  const s = $derived(strings());
  const common = $derived(rs());
  const playback = new Playback(45);
  let runs = $state<Run[]>(replay.runs);
  let selected = $state(0.05);
  let source = $state<Source>('replay');
  let busy = $state(false);
  let failed = $state(false);
  let generation = 0;
  let host: HTMLDivElement;
  const run = $derived(runs.find(r => r.ratio === selected)!);
  const index = $derived(Math.min(playback.shown, run.u.length - 1));
  const nf = (v: number, dp = 4) => num(v, { dp, locale: researchLocale() });
  const x = (t: number) => 45 + 430 * t / (4 * period);
  const y = (u: number) => 140 - 120 * u / 0.02;
  const curve = (values: number[]) => values.map((u, i) => `${i ? 'L' : 'M'}${x(run.time[i])},${y(u)}`).join(' ');
  const exactCurve = () => Array.from({ length: 401 }, (_, i) => {
    const t = i * 4 * period / 400;
    return `${i ? 'L' : 'M'}${x(t)},${y(exact(t))}`;
  }).join(' ');

  function stop() { generation++; busy = false; playback.interact(); }
  function select(value: number) {
    stop(); selected = value; source = liveRatios.has(value) ? 'cached' : 'replay';
    playback.setCount(run.u.length); playback.seek(0);
  }
  const liveRatios = new Set<number>();
  async function recompute() {
    stop();
    const token = generation;
    const ratio = selected;
    busy = true; failed = false;
    try {
      const result = await compute(ratio);
      if (token !== generation) return;
      runs = runs.map(r => r.ratio === ratio ? result : r);
      liveRatios.add(ratio); source = 'live'; playback.setCount(result.u.length); playback.seek(result.u.length - 1);
    } catch { if (token === generation) failed = true; }
    finally { if (token === generation) busy = false; }
  }
  onMount(() => {
    playback.setCount(run.u.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 600px)').matches });
    const observer = new IntersectionObserver(entries => playback.setVisible(entries[0].isIntersecting));
    observer.observe(host);
    return () => { generation++; observer.disconnect(); playback.dispose(); };
  });
</script>

<ExperimentShell paperId="newmark-1959" name={s.title} lead={s.lead} checks={{ passed: evidence.checks.filter(c => c.passed).length, total: evidence.checks.length }}
  sourcePath="research/benchmarks/newmark-1959"
  actions={{ goToStep: i => playback.seek(i), setParams: p => select(Number(p.ratio)), showTab: () => {} }}>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p>
    <p><strong>{common.notDesign}.</strong></p>
    <p>{s.paper}</p>
    <h2>{s.model}</h2><p>{s.description}</p><p>{s.method}</p>
    <ExperimentLink params={{ ratio: 0.2 }}>{s.tryCoarse}</ExperimentLink>
    <h2>{s.reference}</h2><p>{s.formula}</p><p>{s.tolerance}</p>
    <h2 id="checks">{s.comparison}</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Δt/T</th><th>{s.reference}<br />T (s)</th><th>{s.measured}<br />T (s)</th><th>{s.difference}<br />%</th></tr></thead>
      <tbody>{#each runs as r}<tr><td>{nf(r.ratio, 3)}</td><td>{nf(period, 6)}</td><td>{nf(r.measuredPeriod, 6)}</td><td>{nf((r.measuredPeriod / period - 1) * 100, 3)}</td></tr>{/each}</tbody>
    </table></div>
    <h2>{s.notYet}</h2><ul>{#each s.limitations as limitation}<li>{limitation}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="experiment" bind:this={host}>
      <p data-testid="source" aria-live="polite">{s[source]}{busy ? ` · ${s.busy}` : ''}</p>
      <div class="controls">
        <label>{s.step} Δt/T <select aria-label={s.step} value={selected} onchange={e => select(Number(e.currentTarget.value))}>
          {#each benchmark.ratios as ratio}<option value={ratio}>{nf(ratio, 3)}</option>{/each}
        </select></label>
        <button onclick={recompute} disabled={busy}>{s.run}</button>
        <button onclick={stop}>{s.stop}</button>
        <button onclick={() => { stop(); playback.seek(0); playback.play(); }}>{s.restart}</button>
      </div>
      {#if failed}<p role="alert">{s.failure}</p>{/if}
      <StabileoViewer xy={[0, 0, 1, 0]} cells={[0, 1]} cellSize={2} lineWidth={6}
        values={[0, run.u[index] * 1000]} range={{ min: 0, max: 20 }} title={s.displacement} unit="mm"
        displacement={[0, 0, run.u[index], 0]} deformScale={10} view={[-0.15, -0.25, 1.3, 0.25]}
        height="15rem" editorButton={false} oninteract={stop} />
      <small>{s.scaled}</small>
      <label class="slider">{s.sample} · t = {nf(run.time[index])} s
        <input type="range" aria-label={s.sample} min="0" max={run.u.length - 1} value={index} oninput={e => { stop(); playback.seek(Number(e.currentTarget.value)); }} />
      </label>
      <div class="values" data-testid="comparison" data-error={run.maxError}>
        <span>{s.reference}: {nf(exact(run.time[index]) * 1000)} mm</span>
        <span>Stabileo: {nf(run.u[index] * 1000)} mm</span>
        <span>{s.difference}: {nf((run.u[index] - exact(run.time[index])) * 1000)} mm</span>
      </div>
      <svg viewBox="0 0 500 175" role="img" aria-label={s.displacement}>
        <path d="M45,15 V140 H480" fill="none" stroke="currentColor" />
        <path d={exactCurve()} fill="none" stroke="#e59b44" stroke-width="2" />
        <path d={curve(run.u)} fill="none" stroke="#60a5fa" stroke-width="2" stroke-dasharray="5 3" />
        {#each [0, 10, 20] as value}<text x="39" y={y(value / 1000) + 4} text-anchor="end">{nf(value, 0)}</text>{/each}
        {#each [0, 2, 4] as cycle}<text x={x(cycle * period)} y="158" text-anchor="middle">{nf(cycle * period, 2)}</text>{/each}
        <text x="5" y="12">mm</text><text x="475" y="173" text-anchor="end">{s.time}</text>
      </svg>
      <p class="legend"><span style="color:#e59b44">━ {s.reference}</span> <span style="color:#60a5fa">┄ Stabileo</span></p>
      <p>{s.error}: <strong>{nf(run.maxError * 1000)}</strong></p>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .experiment { height: 100%; overflow: auto; padding: 0.5rem; }
  .controls, .values { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
  button, select { min-height: 44px; padding: 0.4rem 0.6rem; background: var(--lp-ink); color: var(--fg); border: 1px solid var(--hair); border-radius: 4px; }
  .slider { display: grid; margin-top: 0.75rem; }
  input { width: 100%; min-height: 32px; }
  .values, small, .legend { font-size: 0.8rem; }
  svg { display: block; width: 100%; max-height: 190px; }
  svg text { fill: currentColor; font-size: 16px; }
  .legend { margin: 0; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; font-size: 0.8rem; border-collapse: collapse; }
  th, td { padding: 0.4rem 0.2rem; text-align: right; border-bottom: 1px solid var(--hair); }
</style>
