<script lang="ts">
  import { onMount } from 'svelte';
  import replay from '../../../../../research/benchmarks/newmark-1959/results/stabileo_results.json';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback, type Source } from '../shell/playback.svelte';
  import { rs, researchLocale } from '../i18n';
  import { num, sci } from '../shell/format';
  import { fill, strings } from './i18n';
  import { benchmark, model, mass, stiffness, omega, period, exact, compute, summarize, evaluate, discretePeriod, phaseLagBound, playbackMs, PLAYBACK_SLOWDOWN, type Run } from './benchmark';

  const s = $derived(strings());
  const common = $derived(rs());
  const initialRatio = 0.05;
  const playback = new Playback(playbackMs(initialRatio));
  let runs = $state<Run[]>(replay.runs.map(r => summarize(r.ratio, r.time, r.u)));
  let selected = $state(initialRatio);
  let source = $state<Source>('replay');
  let busy = $state(false);
  let failed = $state(false);
  let chartWidth = $state(500);
  let generation = 0;
  let host: HTMLDivElement;
  const run = $derived(runs.find(r => r.ratio === selected)!);
  const index = $derived(Math.min(playback.shown, run.u.length - 1));
  const checks = $derived(evaluate(runs));
  const nf = (v: number, dp = 4) => num(v, { dp, locale: researchLocale() });
  const values = $derived({
    L: nf(model.length, 0), E: nf(model.e, 0), A: nf(model.area, 2), rho: nf(model.density, 0), m: nf(mass, 0), k: nf(stiffness, 0),
    F: nf(model.force, 0), omega: nf(omega, 0), T: nf(period, 6),
  });
  const font = $derived(Math.max(16, 13 * 500 / Math.max(chartWidth, 1)));
  const top = $derived(font + 8);
  const axis = 140;
  const chartHeight = $derived(axis + 2 * font + 10);
  const x = (t: number) => 45 + 430 * t / (4 * period);
  const y = (u: number) => axis - (axis - top) * u / 0.02;
  const curve = (us: number[]) => us.map((u, i) => `${i ? 'L' : 'M'}${x(run.time[i])},${y(u)}`).join(' ');
  const exactCurve = () => Array.from({ length: 401 }, (_, i) => {
    const t = i * 4 * period / 400;
    return `${i ? 'L' : 'M'}${x(t)},${y(exact(t))}`;
  }).join(' ');

  function stop() { generation++; busy = false; playback.interact(); }
  function select(value: number) {
    stop(); selected = value; source = liveRatios.has(value) ? 'cached' : 'replay';
    playback.stepMs = playbackMs(value);
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

<ExperimentShell paperId="newmark-1959" name={s.title} lead={s.lead} compactHeader citeAs="benchmark"
  referenceLabel={common.againstBenchmark}
  verification={{ reference: { kind: 'checks', passed: checks.filter(c => c.passed).length, total: checks.length, href: '#checks' }, published: { kind: 'none', why: s.published } }}
  sourcePath="research/benchmarks/newmark-1959"
  actions={{ goToStep: i => playback.seek(i), setParams: p => select(Number(p.ratio)), showTab: () => {} }}>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p>
    <p><strong>{common.notDesign}.</strong></p>
    <p>{s.paper}</p>
    <h2>{s.model}</h2><p data-testid="description">{fill(s.description, values)}</p><p>{s.method}</p>
    <ExperimentLink params={{ ratio: 0.2 }}>{s.tryCoarse}</ExperimentLink>
    <h2>{s.reference}</h2><p data-testid="formula">{fill(s.formula, values)}</p><p>{s.tolerance}</p>
    <h2 id="checks">{s.comparison}</h2>
    <div class="table-wrap"><table data-testid="periods">
      <thead><tr><th>Δt/T</th><th>{s.predicted}</th><th>{s.measured}</th><th>{s.elongation}</th></tr></thead>
      <tbody>{#each runs as r (r.ratio)}<tr><td>{nf(r.ratio, 3)}</td><td>{nf(discretePeriod(r.ratio), 6)}</td><td>{nf(r.measuredPeriod, 6)}</td><td>{nf((r.measuredPeriod / period - 1) * 100, 3)}</td></tr>{/each}</tbody>
    </table></div>
    <h2>{s.errors}</h2>
    <div class="table-wrap"><table data-testid="errors">
      <thead><tr><th>Δt/T</th><th>{s.discreteError}</th><th>{s.continuousError}</th><th>{s.bound}</th></tr></thead>
      <tbody>{#each runs as r (r.ratio)}<tr><td>{nf(r.ratio, 3)}</td><td>{#if r.discreteError === 0}0{:else}{@const e = sci(r.discreteError, 2, researchLocale())}{e.mantissa} × 10<sup>{e.exp}</sup>{/if}</td><td>{nf(r.maxError * 1000, 3)}</td><td>{nf(phaseLagBound(r.ratio) * 1000, 3)}</td></tr>{/each}</tbody>
    </table></div>
    <h2>{s.notYet}</h2><ul>{#each s.limitations as limitation}<li>{limitation}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="experiment" bind:this={host}>
      <StabileoViewer xy={[0, 0, 1, 0]} cells={[0, 1]} cellSize={2} lineWidth={6}
        values={[0, run.u[index] * 1000]} range={{ min: 0, max: 20 }} title={s.displacement} unit="mm"
        displacement={[0, 0, run.u[index], 0]} deformScale={10} view={[-0.15, -0.9, 1.3, 0.1]}
        height="15rem" editorButton={false} oninteract={stop} />
      <small>{s.scaled} {fill(s.speed, { x: nf(PLAYBACK_SLOWDOWN, 1) })}</small>
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
      <label class="slider">{s.sample} · t = {nf(run.time[index])} s
        <input type="range" aria-label={s.sample} aria-valuetext={fill(s.sampleValue, { i: String(index), n: String(run.u.length - 1), t: nf(run.time[index]) })}
          min="0" max={run.u.length - 1} value={index} oninput={e => { stop(); playback.seek(Number(e.currentTarget.value)); }} />
      </label>
      <div class="values" data-testid="comparison" data-error={run.maxError}>
        <span>{s.reference}: {nf(exact(run.time[index]) * 1000)} mm</span>
        <span>Stabileo: {nf(run.u[index] * 1000)} mm</span>
        <span>{s.difference}: {nf((run.u[index] - exact(run.time[index])) * 1000)} mm</span>
      </div>
      <div class="chart" bind:clientWidth={chartWidth}>
        <svg viewBox="0 0 500 {chartHeight}" role="img" aria-label={s.alt} style:font-size="{font}px">
          <path d="M45,{top} V{axis} H480" fill="none" stroke="currentColor" />
          <path d={exactCurve()} fill="none" stroke="#e59b44" stroke-width="2" />
          <path d={curve(run.u)} fill="none" stroke="#60a5fa" stroke-width="2" stroke-dasharray="5 3" />
          {#each [0, 10, 20] as value}<text x="39" y={y(value / 1000) + font / 3} text-anchor="end">{nf(value, 0)}</text>{/each}
          {#each [0, 2, 4] as cycle}<text x={x(cycle * period)} y={axis + font + 2} text-anchor="middle">{nf(cycle * period, 2)}</text>{/each}
          <text x="5" y={font}>mm</text><text x="480" y={axis + 2 * font + 6} text-anchor="end">{s.time}</text>
        </svg>
      </div>
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
  input { width: 100%; min-height: 44px; }
  .values, small, .legend { font-size: 0.8rem; }
  .chart { max-width: 36rem; }
  svg { display: block; width: 100%; }
  svg text { fill: currentColor; }
  .legend { margin: 0; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; font-size: 0.8rem; border-collapse: collapse; }
  th, td { padding: 0.4rem 0.2rem; text-align: right; border-bottom: 1px solid var(--hair); }
  .table-wrap td sup { font-size: 12px; }
</style>
