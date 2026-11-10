<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { rs } from '../i18n';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { shapeStrings } from './strings';
  import { decodeRun, endAngles, type ShapeRun } from './protocol';
  import replay from '../../../../../research/stability/feher-sipos-varkonyi-2026/reference-results/replay.json';
  import validation from '../../../../../research/stability/feher-sipos-varkonyi-2026/VALIDATION.json';

  const s = $derived(shapeStrings());
  const shared = $derived(rs());
  const playback = new Playback(90);
  let run = $state.raw<ShapeRun>(decodeRun(replay));
  let cornerTheta = $state(1.3);
  let cornerDelta = $state(1.3);
  let source = $state<'replay' | 'live'>('replay');
  let busy = $state(false);
  let failed = $state(false);
  let narrow = $state(false);
  let host: HTMLDivElement;
  let worker: Worker | null = null;

  const matches = validation.figure_9c_matches as Record<string, { step: number; theta: number; delta: number; median_distance: number }>;
  const published = validation.published_checks as { metric: string; computed: number | null; passed: boolean }[];
  const computed = (prefix: string) => published.find(c => c.metric.startsWith(prefix))?.computed ?? NaN;
  const distances = Object.values(matches).map(m => m.median_distance);
  const radial = validation.checks[0].observed;

  const frame = $derived(run.frames[Math.min(playback.shown, run.frames.length - 1)]);
  const nodes = $derived(run.elements + 1);
  const xy = $derived(Array.from({ length: nodes }, (_, i) => [i / run.elements, 0]).flat());
  const cells = $derived(Array.from({ length: run.elements }, (_, i) => [i, i + 1]).flat());
  const displacement = $derived(frame.ux.flatMap((u, i) => [u, frame.uz[i]]));
  const angles = $derived(endAngles(frame));
  const series = $derived([{ name: s.ours, color: 'var(--rs-plot-ours)', points: run.frames.map((f, i) => [i, f.y_mid] as [number, number]) }]);
  const ending = $derived(run.lost ? s.lost.replace('{t}', num(run.lost.theta, { dp: 2 })).replace('{d}', num(run.lost.delta, { dp: 2 })) : run.frames[run.frames.length - 1].y_mid < 0 ? s.inverted : s.back);
  const plane = $derived(run.frames.map(f => `${40 + (f.theta - 0.9) * 200},${130 - f.delta * 70}`).join(' '));
  const paperSteps = $derived(source === 'replay' ? Object.entries(matches) : []);

  function stop() { playback.interact(); worker?.terminate(); worker = null; busy = false; }
  function compute() {
    stop(); busy = true; failed = false;
    const active = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = event => {
      if (worker !== active) return;
      try {
        if (event.data.error) throw new Error();
        run = decodeRun(event.data.result); source = 'live'; playback.setCount(run.frames.length); playback.seek(0); playback.play();
      } catch { failed = true; }
      active.terminate(); worker = null; busy = false;
    };
    active.onerror = () => { if (worker === active) { failed = true; stop(); } };
    active.postMessage({ theta: cornerTheta, delta: cornerDelta });
  }
  function restart() { stop(); playback.seek(0); playback.play(); }
  onMount(() => {
    playback.setCount(run.frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: innerWidth < 640 });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    const phone = matchMedia('(max-width: 639px)');
    const syncNarrow = () => { narrow = phone.matches; };
    syncNarrow();
    phone.addEventListener('change', syncNarrow);
    return () => { observer.disconnect(); phone.removeEventListener('change', syncNarrow); };
  });
  onDestroy(() => { stop(); playback.dispose(); });
</script>

<ExperimentShell paperId="feher-sipos-varkonyi-2026" name={s.title} lead={s.lead} introInArticle compactHeader wide locale={publicI18n.locale}
  sourcePath="research/stability/feher-sipos-varkonyi-2026" referenceLabel={s.referenceLabel}
  verification={{ reference: { kind: 'checks', passed: validation.checks.filter(c => c.passed).length, total: validation.checks.length, href: '#checks' }, published: { kind: 'checks', passed: published.filter(c => c.passed).length, total: published.length, href: '#checks' } }}
  actions={{ goToStep: i => playback.seek(i), setParams: params => { if (typeof params.theta === 'number' && typeof params.delta === 'number') { cornerTheta = params.theta; cornerDelta = params.delta; compute(); } }, showTab: () => playback.interact() }}>
  {#snippet article()}
    <h2>{s.model}</h2><p>{s.theory}</p><p>{s.targets}</p><p>{s.method}</p>
    <p>{s.shapes} {#each Object.entries(matches) as [label, m]}<ExperimentLink step={m.step}>{s.shape} {label}</ExperimentLink>{' '}{/each}</p>
    <h2 id="checks">{s.checks}</h2>
    <p>{s.fig9.replace('{min}', num(Math.min(...distances), { dp: 4 })).replace('{max}', num(Math.max(...distances), { dp: 4 })).replace('{t3}', num(matches['3'].theta, { dp: 2 })).replace('{d3}', num(matches['3'].delta, { dp: 2 })).replace('{t4}', num(matches['4'].theta, { dp: 2 })).replace('{d4}', num(matches['4'].delta, { dp: 2 }))}</p>
    <p>{s.circle.replace('{radial}', num(radial, { sig: 2 }))}</p>
    <p>{s.section32.replace('{q1}', num(computed('Section 3.2.1: limit load, uniform load, Θ = 0.9, Δ = 0 '), { dp: 2 })).replace('{q2}', num(computed('Section 3.2.1: limit load, uniform load, Θ = 0.9, Δ = 0.04'), { dp: 2 })).replace('{k1}', num(computed('Table 1: largest curvature at q = 2.5, uniform load, Θ = 0.96'), { dp: 2 }))}</p>
    <p>{s.open.replace('{q3}', num(computed('Section 3.2.1: limit load, half-span load, Θ = 0.9'), { dp: 2 }))}</p>
    <p>{s.convention}</p>
    <dl>
      {#each [...validation.checks, ...published] as check}
        <dt lang="en">{check.metric}</dt>
        <dd>{check.passed ? '✓' : '✗'} {check.observed === null ? '—' : num(check.observed as number, { sig: 3 })} · {shared.tolerance} {num(check.tolerance, { sig: 3 })}</dd>
      {/each}
    </dl>
    <p>{s.limits}</p>
    <p><a href="https://arxiv.org/abs/2509.12916v1">{s.paper}</a> · <a href="https://doi.org/10.1016/j.euromechsol.2025.106000">{s.journal}</a></p>
  {/snippet}
  {#snippet app()}
    <div lang={publicI18n.locale} class="shape-app" bind:this={host} data-source={source} data-step={playback.shown} data-theta={frame.theta} data-delta={frame.delta} data-ymid={frame.y_mid} data-stable={frame.stable}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} onclickcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <p>{source === 'replay' ? shared.replaySource : shared.liveSource}</p>
      <StabileoViewer editorButton={false} {xy} {cells} cellSize={2} values={frame.curvature} {displacement} deformScale={1}
        range={{ min: -12, max: 12 }} title={s.strip} height="17rem" view={[-0.15, narrow ? -0.5 : -0.3, 1.3, 0.32]} lineWidth={5} />
      <p>{s.coordinates}</p>
      <p class="readout">Θ {num(frame.theta, { dp: 2 })} · Δ {num(frame.delta, { dp: 2 })} · θ(A) {num(angles[0], { dp: 2 })} · θ(B) {num(angles[1], { dp: 2 })} · y(1/2) {num(frame.y_mid, { dp: 3 })} · κ<sub>max</sub> {num(frame.max_curvature, { dp: 2 })} · {frame.stable ? s.stable : s.unstable}</p>
      <label for="shape-step">{shared.step} {playback.shown}</label>
      <input id="shape-step" type="range" min="0" max={run.frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      {#if paperSteps.length}
        <div class="buttons">{#each paperSteps as [label, m]}<button onclick={() => playback.seek(m.step)}>{s.shape} {label}</button>{/each}</div>
      {/if}
      <svg class="plane" viewBox="0 0 200 150" role="img" aria-label={s.plane}>
        <line x1="20" y1="130" x2="195" y2="130" stroke="var(--hair)" /><line x1="20" y1="5" x2="20" y2="130" stroke="var(--hair)" />
        <text x="190" y="145" font-size="10" fill="var(--fg-2)">Θ</text><text x="6" y="12" font-size="10" fill="var(--fg-2)">Δ</text>
        <text x="36" y="145" font-size="8" fill="var(--fg-2)">1</text><text x="96" y="145" font-size="8" fill="var(--fg-2)">{num(1.3, { dp: 1 })}</text>
        <polyline points={plane} fill="none" stroke="var(--rs-plot-ours)" stroke-width="2" />
        <circle cx={40 + (frame.theta - 0.9) * 200} cy={130 - frame.delta * 70} r="4" fill={frame.stable ? 'var(--rs-plot-ours)' : 'crimson'} />
        <title>{s.plane}</title>
      </svg>
      <p aria-live="polite">{busy ? s.computing : ending}</p>
      {#if failed}<p role="alert">{s.error}</p>{/if}
      <label for="shape-theta">{s.cornerTheta} {num(cornerTheta, { dp: 2 })}</label>
      <input id="shape-theta" type="range" min="1.05" max="1.6" step="0.05" bind:value={cornerTheta} onchange={compute} />
      <label for="shape-delta">{s.cornerDelta} {num(cornerDelta, { dp: 2 })}</label>
      <input id="shape-delta" type="range" min="0.2" max="1.8" step="0.1" bind:value={cornerDelta} onchange={compute} />
      <div class="buttons"><button onclick={compute}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button></div>
      <p>{s.parameterNotice} Θ {num(run.corner[0], { dp: 2 })} · Δ {num(run.corner[1], { dp: 2 })}</p>
      <LineChart dataTable {series} xLabel={s.stepAxis} yLabel={s.pathPlot} height={170} marker={playback.shown} />
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .shape-app { min-width: 0; padding: 0.6rem; border: 1px solid var(--hair); border-radius: 6px; }
  label { display: block; font-size: 0.85rem; }
  input[type='range'] { width: 100%; min-height: 44px; }
  p { font-size: 0.8rem; margin: 0.4rem 0; }
  .readout { font-variant-numeric: tabular-nums; }
  .plane { width: 100%; max-width: 260px; display: block; margin: 0.4rem 0; }
  .buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.3rem 0; }
  button { min-height: 44px; min-width: 44px; font-size: max(12px, 0.85rem); padding: 0.4rem 0.7rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--lp-ink); cursor: pointer; }
</style>
