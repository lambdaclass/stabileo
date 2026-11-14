<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { rs } from '../i18n';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { shapeStrings } from './strings';
  import { decodeRun, endAngles, isPaper, PAPER, type ShapeRun, type ShapeSettings } from './protocol';
  import replay from '../../../../../research/stability/feher-sipos-varkonyi-2026/reference-results/replay.json';
  import validation from '../../../../../research/stability/feher-sipos-varkonyi-2026/VALIDATION.json';

  type Check = { id: string; computed?: number | null; reference?: number; observed: number | null; passed: boolean; computed_delta?: number | null; reference_delta?: number };
  type Match = { step: number; theta: number; delta: number; median_distance: number; paper_theta: number; paper_delta: number };
  type Row = { quantity: string; note: string; paper: string; ours: string; difference: string; passed: boolean };

  const s = $derived(shapeStrings());
  const shared = $derived(rs());
  const fill = (template: string, values: Record<string, string>) => Object.entries(values).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), template);
  const playback = new Playback(90);
  const replayRun = decodeRun(replay);
  let run = $state.raw<ShapeRun>(replayRun);
  let tab = $state<'strip' | 'path'>('strip');
  let settings = $state<ShapeSettings>({ ...PAPER });
  let source = $state<'replay' | 'live'>('replay');
  let busy = $state(false);
  let failed = $state(false);
  let startLost = $state(false);
  let host: HTMLDivElement;
  let worker: Worker | null = null;

  const matches = validation.figure_9c_matches as Record<string, Match>;
  const published = validation.published_checks as Check[];
  const checks = validation.checks as Check[];
  const byId = (id: string) => [...published, ...checks].find(c => c.id === id)!;

  const frame = $derived(run.frames[Math.min(playback.shown, run.frames.length - 1)]);
  const angles = $derived(endAngles(frame));
  const leg = $derived(Math.max(0, run.corners.findIndex(c => playback.shown <= c)));
  const xy = $derived(Array.from({ length: run.elements + 1 }, (_, i) => [i / run.elements, 0]).flat());
  const cells = $derived(Array.from({ length: run.elements }, (_, i) => [i, i + 1]).flat());
  const displacement = $derived(frame.ux.flatMap((u, i) => [u, frame.uz[i]]));
  const heightSeries = $derived([{ name: s.height, color: 'var(--rs-plot-ours)', points: run.frames.map((f, i) => [i, f.y_mid] as [number, number]) }]);
  const atPaper = $derived(isPaper(settings));
  const changes = $derived.by(() => {
    const list: string[] = [];
    if (settings.q !== PAPER.q) list.push(`q = ${num(settings.q, { dp: 1 })}`);
    if (settings.half !== PAPER.half) list.push(s.half);
    if (settings.elements !== PAPER.elements) list.push(`${settings.elements} ${s.members.toLocaleLowerCase(publicI18n.locale)}`);
    if (settings.theta !== PAPER.theta || settings.delta !== PAPER.delta) list.push(`${s.cornerShort} (${num(settings.theta, { dp: 2 })}; ${num(settings.delta, { dp: 2 })})`);
    return list.join(', ');
  });
  const ending = $derived.by(() => {
    if (startLost) return s.startLost;
    if (run.lost) return fill(s.lost, { t: num(run.lost.theta, { dp: 2 }), d: num(run.lost.delta, { dp: 2 }) });
    if (run.snaps.length) {
      const f = run.frames[run.snaps[0]];
      return fill(s.jumped, { t: num(f.theta, { dp: 2 }), d: num(f.delta, { dp: 2 }) });
    }
    return run.frames[run.frames.length - 1].y_mid < 0 ? s.inverted : s.back;
  });

  const thetaMax = $derived(Math.max(1.6, run.corner[0] + 0.1));
  const px = (theta: number) => 50 + ((theta - 0.9) / (thetaMax - 0.9)) * 236;
  const py = (delta: number) => 184 - (delta / 1.8) * 166;
  const plane = $derived(run.frames.map(f => `${px(f.theta).toFixed(1)},${py(f.delta).toFixed(1)}`).join(' '));
  const markers = $derived(Object.entries(matches).reduce<{ label: string; theta: number; delta: number }[]>((all, [label, m]) => {
    const same = all.find(p => Math.abs(p.theta - m.theta) < 0.03 && Math.abs(p.delta - m.delta) < 0.03);
    if (same) same.label += `·${label}`;
    else all.push({ label, theta: m.theta, delta: m.delta });
    return all;
  }, []));
  const thetaTicks = $derived([1, 1.2, 1.4, 1.6].filter(t => t <= thetaMax));

  const scientific = (v: number) => {
    const exponent = Math.floor(Math.log10(Math.abs(v)));
    const sup = String(exponent).replace('-', '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]);
    return `${num(v / 10 ** exponent, { dp: 1 })} × 10${sup}`;
  };
  const percent = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${num(Math.abs(100 * d), { dp: 1 })} %`;
  const groups = $derived.by(() => {
    const setting = (t: number, d: number) => fill(s.setting, { t: num(t, { dp: 2 }), d: num(d, { dp: 2 }) });
    const signed = (d: number, dp: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${num(Math.abs(d), { dp })}`;
    const figure: Row[] = Object.entries(matches).map(([k, m]) => {
      const c = byId(`figure-9c-${k}`);
      return {
        quantity: fill(s.shapeRow, { k }),
        note: setting(m.paper_theta, m.paper_delta),
        paper: num(c.reference!, { dp: 3 }),
        ours: num(c.computed!, { dp: 3 }),
        difference: signed(c.computed! - c.reference!, 3),
        passed: c.passed,
      };
    });
    const afterSnap = new Set(['kappa-half-0.96-0', 'kappa-uniform-0.64-1.16']);
    const values: Row[] = published.filter(c => c.id.startsWith('qlim-') || c.id.startsWith('kappa-')).map(c => {
      const reference = c.reference!;
      const computed = c.computed ?? null;
      const difference = computed === null ? '—' : percent((computed - reference) / reference);
      const ours = computed === null ? s.notReached : num(computed, { dp: 2 });
      if (c.id === 'qlim-half-optimum') {
        return {
          quantity: s.optimumRow,
          note: fill(s.optimumNote, { p: num(c.reference_delta!, { dp: 2 }), o: c.computed_delta == null ? '—' : num(c.computed_delta, { dp: 2 }) }),
          paper: `≈ ${num(reference, { dp: 1 })}`, ours, difference, passed: c.passed,
        };
      }
      const [kind, load, t, d] = c.id.split('-');
      const where = setting(Number(t), Number(d));
      return {
        quantity: fill(kind === 'qlim' ? s.limitRow : s.curvatureRow, { load: load === 'uniform' ? s.uniform : s.half }),
        note: afterSnap.has(c.id) ? `${where} · ${s.afterSnap}` : where,
        paper: kind === 'qlim' ? `≈ ${num(reference, { dp: 1 })}` : num(reference, { dp: 2 }),
        ours, difference, passed: c.passed,
      };
    });
    const arc = byId('arc-radius');
    const exact: Row[] = [{ quantity: s.arcRow, note: s.arcNote, paper: s.exactZero, ours: scientific(arc.observed!), difference: scientific(arc.observed!), passed: arc.passed }];
    return [{ title: s.groups.figure, rows: figure }, { title: s.groups.values, rows: values }, { title: s.groups.exact, rows: exact }];
  });

  function stop() { playback.interact(); worker?.terminate(); worker = null; busy = false; }
  function compute() {
    stop(); busy = true; failed = false; startLost = false;
    const active = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = event => {
      if (worker !== active) return;
      try {
        if (event.data.error === 'start') { startLost = true; active.terminate(); worker = null; busy = false; return; }
        if (event.data.error) throw new Error();
        run = decodeRun(event.data.result); source = 'live'; playback.setCount(run.frames.length); playback.seek(0); playback.play();
      } catch { failed = true; }
      active.terminate(); worker = null; busy = false;
    };
    active.onerror = () => { if (worker === active) { failed = true; stop(); } };
    active.postMessage($state.snapshot(settings));
  }
  function restart() { stop(); playback.seek(0); playback.play(); }
  function backToPaper() {
    stop(); settings = { ...PAPER }; failed = false; startLost = false;
    run = replayRun; source = 'replay'; playback.setCount(run.frames.length); playback.seek(0); playback.play();
  }
  function setTab(next: string) {
    if (next === 'strip' || next === 'path') tab = next;
  }
  function goToStep(step: number) {
    playback.interact();
    if (source === 'live') { run = replayRun; source = 'replay'; playback.setCount(run.frames.length); }
    playback.seek(step);
  }
  function setParams(params: Record<string, number | string | boolean>) {
    const next: ShapeSettings = { ...PAPER };
    for (const key of ['theta', 'delta', 'q', 'elements'] as const) if (typeof params[key] === 'number') next[key] = params[key] as number;
    if (typeof params.half === 'boolean') next.half = params.half;
    settings = next; setTab('strip');
    if (isPaper(next)) backToPaper(); else compute();
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

<ExperimentShell paperId="feher-sipos-varkonyi-2026" name={s.title} lead={s.lead} introInArticle compactHeader locale={publicI18n.locale}
  sourcePath="research/stability/feher-sipos-varkonyi-2026"
  referenceLabel={s.referenceLabel}
  verification={{ reference: { kind: 'checks', passed: checks.filter(c => c.passed).length, total: checks.length, href: '#checks' }, published: { kind: 'checks', passed: published.filter(c => c.passed).length, total: published.length, href: '#checks' } }}
  actions={{ goToStep, setParams, showTab: setTab }}>
  {#snippet article()}
    <h2>{s.modelHeading}</h2>
    <p>{s.theory}</p>
    <h2>{s.shapesHeading}</h2>
    <p>{s.targets}</p>
    <p>{s.shapeLinks} {#each Object.entries(matches) as [label, m], i}{#if i > 0}{' · '}{/if}<ExperimentLink step={m.step} tab="strip">{s.shape} {label}</ExperimentLink>{/each}</p>
    <h2>{s.methodHeading}</h2>
    <p>{s.method}</p>
    <p>{s.convention}</p>
    <h2>{s.runHeading}</h2>
    <p>{fill(s.runText, { start: num(replayRun.frames[0].y_mid, { dp: 3 }), end: num(replayRun.frames[replayRun.frames.length - 1].y_mid, { dp: 3 }) })}</p>
    <p>{s.cusp}</p>
    <p><ExperimentLink params={{ theta: 1.3, delta: 0.6 }}>{s.tryBelow}</ExperimentLink> · <ExperimentLink params={{ theta: 1.05, delta: 1.3 }}>{s.tryFold}</ExperimentLink></p>
    <p>{s.interactive}</p>
    <p><ExperimentLink params={{ q: 1.5 }}>{s.tryLight}</ExperimentLink> · <ExperimentLink params={{ q: 4 }}>{s.tryHeavy}</ExperimentLink></p>
    <h2>{s.limitsHeading}</h2>
    <p>{s.limits}</p>
    <h2 id="checks">{s.checksHeading}</h2>
    <p>{s.tableIntro}</p>
    <div class="table-scroll">
      <table class="checks">
        <thead><tr><th scope="col">{s.table.quantity}</th><th scope="col">{s.table.paper}</th><th scope="col">{s.table.ours}</th><th scope="col">{s.table.difference}</th></tr></thead>
        {#each groups as group}
          <tbody>
            <tr class="group"><th scope="rowgroup" colspan="4">{group.title}</th></tr>
            {#each group.rows as row}
              <tr class:open={!row.passed}>
                <th scope="row">{row.quantity}{#if row.note}<span>{row.note}</span>{/if}</th>
                <td>{row.paper}</td>
                <td>{row.ours}</td>
                <td><span class="mark" aria-hidden="true">{row.passed ? '✓' : '✗'}</span> {row.difference}</td>
              </tr>
            {/each}
          </tbody>
        {/each}
      </table>
    </div>
    <p>{s.openNote}</p>
    <h2 id="why">{s.why.heading}</h2>
    <p>{s.why.intro}</p>
    <div class="why">
      {#each s.why.items as item}
        <details><summary>{item.title}</summary><p>{item.body}</p></details>
      {/each}
    </div>
    <p><a href="https://arxiv.org/abs/2509.12916v1">{s.paper}</a> · <a href="https://doi.org/10.1016/j.euromechsol.2025.106000">{s.journal}</a></p>
  {/snippet}
  {#snippet app()}
    <div lang={publicI18n.locale} class="shape-app" bind:this={host} data-source={source} data-step={playback.shown} data-tab={tab}
      data-theta={frame.theta} data-delta={frame.delta} data-ymid={frame.y_mid} data-stable={frame.stable}
      data-load={run.load} data-distribution={run.distribution} data-elements={run.elements} data-paper={atPaper && source === 'replay'} data-stale={startLost}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <PaneTabs label={s.caseLabel} tabs={[{ id: 'strip', label: s.tabs.strip }, { id: 'path', label: s.tabs.path }]}
        bind:active={() => tab, setTab} oninteract={() => playback.interact()} />
      <p class="source">{source === 'replay' ? shared.replaySource : shared.liveSource}</p>
      <div id="rs-panel-strip" role="tabpanel" aria-labelledby="rs-tab-strip" hidden={tab !== 'strip'} class:stale={startLost}>
        <StabileoViewer editorButton={false} {xy} {cells} cellSize={2} values={frame.curvature} {displacement} deformScale={1}
          range={{ min: -10, max: 10 }} colourMap="diverging" title={s.curvature} height="max(240px, min(20rem, 38svh))" view={[-0.12, -0.27, 1.08, 0.3]} lineWidth={5} showAxes={false} />
        <p class="caption">{s.coordinates}</p>
        <dl class="summary">
          <dt>Θ · Δ</dt><dd>{num(frame.theta, { dp: 2 })} · {num(frame.delta, { dp: 2 })}</dd>
          <dt>{s.ends}</dt><dd>{num(angles[0], { dp: 2 })} · {num(angles[1], { dp: 2 })} rad</dd>
          <dt>{s.height}</dt><dd>{num(frame.y_mid, { dp: 3 })}</dd>
          <dt>{s.maxCurvature}</dt><dd>{num(frame.max_curvature, { dp: 2 })}</dd>
          <dt>{s.stability}</dt><dd class:bad={!frame.stable}>{frame.stable ? s.stable : s.unstable}</dd>
        </dl>
      </div>
      <div id="rs-panel-path" role="tabpanel" aria-labelledby="rs-tab-path" hidden={tab !== 'path'} class:stale={startLost}>
        {#if tab === 'path'}
          <svg class="plane" viewBox="0 0 300 218" role="img" aria-label={s.plane}>
            <title>{s.plane}</title>
            <line x1="50" y1="184" x2="292" y2="184" class="axis" /><line x1="50" y1="12" x2="50" y2="184" class="axis" />
            {#each thetaTicks as t}<line x1={px(t)} y1="184" x2={px(t)} y2="189" class="axis" /><text x={px(t)} y="203" text-anchor="middle">{num(t, { dp: 1 })}</text>{/each}
            {#each [0, 0.5, 1, 1.5] as d}<line x1="45" y1={py(d)} x2="50" y2={py(d)} class="axis" /><text x="41" y={py(d) + 4} text-anchor="end">{num(d, { dp: 1 })}</text>{/each}
            <text x="292" y="216" text-anchor="end">Θ</text><text x="8" y="14">Δ</text>
            <polyline points={plane} class="route" />
            {#if source === 'replay'}
              {#each markers as m}
                <rect x={px(m.theta) - 5 - 3.6 * m.label.length} y={py(m.delta) - 9} width={10 + 7.2 * m.label.length} height="18" rx="9" class="marker" /><text x={px(m.theta)} y={py(m.delta) + 4} text-anchor="middle" class="marker-label">{m.label}</text>
              {/each}
            {/if}
            <circle cx={px(frame.theta)} cy={py(frame.delta)} r="6" class:bad={!frame.stable} class="now" />
          </svg>
          <LineChart dataTable series={heightSeries} xLabel={s.stepAxis} yLabel={s.pathPlot} height={180} marker={playback.shown} />
        {/if}
      </div>
      <label class="step">
        <span><strong>{s.legs[leg]}</strong>{' · '}{shared.step} {playback.shown + 1}/{run.frames.length}</span>
        <input id="shape-step" type="range" min="0" max={run.frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      {#if source === 'replay'}
        <div class="buttons">{#each Object.entries(matches) as [label, m]}<button onclick={() => goToStep(m.step)}>{s.shape} {label}</button>{/each}</div>
      {/if}
      <fieldset class="params-box">
        <legend>{s.paramsHeading}</legend>
        <p class="status" class:changed={!atPaper}>{atPaper ? s.atPaper : fill(s.changed, { list: changes })}</p>
        <div class="params">
          <label>{s.load} <strong>{num(settings.q, { dp: 1 })}</strong><input id="shape-q" type="range" min="0" max="4" step="0.1" bind:value={settings.q} onchange={compute} /></label>
          <div class="choice" role="radiogroup" aria-label={s.distribution}>
            <span>{s.distribution}</span>
            <div class="buttons">
              <button role="radio" aria-checked={!settings.half} onclick={() => { if (settings.half) { settings.half = false; compute(); } }}>{s.uniformShort}</button>
              <button role="radio" aria-checked={settings.half} onclick={() => { if (!settings.half) { settings.half = true; compute(); } }}>{s.halfShort}</button>
            </div>
          </div>
          <label>{s.cornerTheta} <strong>{num(settings.theta, { dp: 2 })}</strong><input id="shape-theta" type="range" min="1.05" max="1.6" step="0.05" bind:value={settings.theta} onchange={compute} /></label>
          <label>{s.cornerDelta} <strong>{num(settings.delta, { dp: 2 })}</strong><input id="shape-delta" type="range" min="0.2" max="1.8" step="0.1" bind:value={settings.delta} onchange={compute} /></label>
          <label>{s.members} <strong>{settings.elements}</strong><input id="shape-members" type="range" min="20" max="120" step="10" bind:value={settings.elements} onchange={compute} /></label>
        </div>
        <div class="buttons">
          <button class="primary" onclick={backToPaper} disabled={atPaper && source === 'replay'}>{s.backToPaper}</button>
        </div>
      </fieldset>
      <p class="caption">{s.runNote} {s.computedCorner} Θ = {num(run.corner[0], { dp: 2 })}, Δ = {num(run.corner[1], { dp: 2 })}.</p>
      <div class="buttons">
        <button onclick={compute} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button>
      </div>
      <p class="outcome" aria-live="polite">{busy ? s.computing : ending}</p>
      {#if failed}<p role="alert">{s.error}</p>{/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .shape-app { min-width: 0; height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  [role='tabpanel'] { display: flex; flex-direction: column; gap: 0.5rem; }
  [role='tabpanel'][hidden] { display: none; }
  p { font-size: 0.85rem; margin: 0; }
  .source, .caption { color: var(--fg-2); font-size: 0.8rem; }
  .stale { opacity: 0.45; }
  .outcome { font-size: 0.85rem; }
  label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
  input[type='range'] { width: 100%; min-height: 44px; margin: 0; }
  .params { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0 1rem; }
  .buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { min-height: 44px; min-width: 44px; font: inherit; font-size: max(12px, 0.85rem); padding: 0.4rem 0.7rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--lp-ink); cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  .summary { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.8rem; font-size: 0.85rem; margin: 0; font-variant-numeric: tabular-nums; }
  .summary dt { color: var(--fg-2); }
  .summary dd { margin: 0; }
  .bad { color: #e5484d; }
  .plane { width: 100%; max-width: 24rem; display: block; }
  .plane text { font-size: 12px; fill: var(--fg-2); }
  .plane .axis { stroke: var(--hair); }
  .plane .route { fill: none; stroke: var(--rs-plot-ours); stroke-width: 3; }
  .plane .marker { fill: var(--bg, #0d1b2a); stroke: var(--fg-2); }
  .plane .marker-label { fill: var(--fg); }
  .plane .now { fill: var(--rs-plot-ours); }
  .plane .now.bad { fill: #e5484d; }
  .params-box { border: 1px solid var(--hair); border-radius: 6px; padding: 0.5rem 0.75rem 0.75rem; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .params-box legend { font-size: 0.85rem; font-weight: 600; padding: 0 0.3rem; }
  .status { color: var(--fg-2); }
  .status.changed { color: var(--fg); }
  .choice { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
  button[aria-checked='true'] { border-color: var(--rs-plot-ours); box-shadow: inset 0 0 0 1px var(--rs-plot-ours); }
  button.primary:not(:disabled) { border-color: var(--rs-plot-ours); }
  .why { display: flex; flex-direction: column; gap: 0.4rem; }
  .why details { border: 1px solid var(--hair); border-radius: 6px; padding: 0.55rem 0.75rem; }
  .why summary { cursor: pointer; font-weight: 600; font-size: 0.9rem; line-height: 1.35; }
  .why details[open] summary { margin-bottom: 0.5rem; }
  .why details p { font-size: 0.9rem; line-height: 1.5; }
  .table-scroll { overflow-x: auto; }
  .checks { width: 100%; border-collapse: collapse; font-size: 0.85rem; line-height: 1.35; }
  .checks th, .checks td { text-align: left; vertical-align: top; padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--hair); }
  .checks thead th { color: var(--fg-2); font-weight: 500; }
  .checks thead th + th { text-align: right; }
  .checks td { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .checks tbody th { font-weight: 500; min-width: 9rem; }
  .checks tbody th span { display: block; color: var(--fg-2); font-weight: 400; font-size: 0.8rem; }
  .checks .group th { color: var(--fg-2); font-weight: 600; font-size: 0.8rem; padding-top: 0.9rem; }
  .checks .mark { color: var(--rs-plot-ours); }
  .checks tr.open .mark { color: #e5484d; }
</style>
