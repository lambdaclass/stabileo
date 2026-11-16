<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import Segmented from '../shell/Segmented.svelte';
  import ArchChecks from './ArchChecks.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { rs } from '../i18n';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { archStrings } from './strings';
  import { archFigure, archView, decodeRun, loadOf, sameLoad, sameWeight, weightOf, KINEMATIC_MAX, PAPER_LOAD, PAPER_WEIGHT, type ArchRun, type LoadSettings, type WeightSettings } from './protocol';
  import type { ArchRequest } from './sim.worker';
  import replay from '../../../../../research/mechanics/heyman-1966/reference-results/replay.json';
  import validation from '../../../../../research/mechanics/heyman-1966/VALIDATION.json';

  type Tab = 'weight' | 'load';
  type Issue = 'infeasible' | 'unbounded' | 'solver' | null;
  const s = $derived(archStrings());
  const shared = $derived(rs());
  const fill = (template: string, values: Record<string, string>) => Object.entries(values).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), template);
  const playback = new Playback(140);
  const replayRuns: Record<Tab, ArchRun> = { weight: decodeRun(replay.self_weight), load: decodeRun(replay.point_load) };
  let runs = $state.raw<Record<Tab, ArchRun>>({ ...replayRuns });
  let sources = $state<Record<Tab, 'replay' | 'live'>>({ weight: 'replay', load: 'replay' });
  let issues = $state<Record<Tab, Issue>>({ weight: null, load: null });
  let tab = $state<Tab>('weight');
  let weight = $state<WeightSettings>({ ...PAPER_WEIGHT });
  let load = $state<LoadSettings>({ ...PAPER_LOAD });
  let busy = $state<Tab | null>(null);
  let reducedMotion = false;
  let host: HTMLDivElement;
  let worker: Worker | null = null;

  const checks = validation.checks;
  const run = $derived(runs[tab]);
  const source = $derived(sources[tab]);
  const issue = $derived(issues[tab]);
  const frame = $derived(run.frames[Math.min(playback.shown, run.frames.length - 1)]);
  const geometry = $derived(archFigure(run, run.frames[0]));
  const shown = $derived(archFigure(run, frame));
  const displacement = $derived(shown.xy.map((v, i) => v - geometry.xy[i]));
  const view = $derived(archView(run));
  const refused = $derived(issue === 'infeasible' || issue === 'unbounded');
  const stale = $derived(refused || (tab === 'weight' ? !sameWeight(weightOf(run), weight) : !sameLoad(loadOf(run), load)));
  const atPaper = $derived(tab === 'weight' ? sameWeight(weight, PAPER_WEIGHT) : sameLoad(load, PAPER_LOAD));
  const refusal = $derived(issue === 'unbounded' ? s.unbounded : tab === 'weight' ? s.neverStands : s.thin);
  const hingesNeeded = $derived(tab === 'weight' ? 5 : 4);
  const mechanismNote = $derived(run.bodies.length ? '' : fill(s.noMechanism, { k: String(run.result.hinges.length), m: String(hingesNeeded) }));
  const sideName = (side: 'intrados' | 'extrados') => s.sides[side];
  const hingeList = (r: ArchRun) => r.result.hinges.map(h => `${num(h.angle, { dp: 1 })}° ${sideName(h.side)}`).join(', ');
  const positionText = (p: number) => fill(s.positionAt, { p: num(p, { dp: 2 }) });
  const stepLabel = $derived.by(() => {
    if (frame.kind === 'bisection') {
      const k = run.frames.filter((f, i) => f.kind === 'bisection' && i <= playback.shown).length;
      return `${fill(s.frames.bisection, { k: String(k), t: num(frame.t, { dp: 5 }) })} · ${frame.feasible ? s.fits : s.exits}`;
    }
    if (frame.kind === 'load') return fill(s.frames.load, { p: num(frame.lambda, { dp: 2 }) });
    return s.frames[frame.kind];
  });
  const changes = $derived.by(() => {
    const list: string[] = [];
    if (tab === 'weight') {
      if (weight.alpha !== PAPER_WEIGHT.alpha) list.push(`α = ${num(weight.alpha)}°`);
      if (weight.n !== PAPER_WEIGHT.n) list.push(`N = ${weight.n}`);
      if (weight.centreline) list.push(s.centrelineShort.toLocaleLowerCase(publicI18n.locale));
    } else {
      if (load.n !== PAPER_LOAD.n) list.push(`N = ${load.n}`);
      if (Math.abs(load.t - PAPER_LOAD.t) > 1e-9) list.push(`t = ${num(load.t, { dp: 2 })} m`);
      if (Math.abs(load.position - PAPER_LOAD.position) > 1e-9) list.push(positionText(load.position));
    }
    return list.join(', ');
  });
  const ring = validation.ring;
  const heyman90 = validation.heyman_closed_form.find(r => r.alpha === 90)!;
  const heyman145 = validation.heyman_closed_form.find(r => r.alpha === 145)!;
  const pct = (v: number) => `${num(100 * v, { dp: 1 })} %`;
  const pythonEta = checks.find(c => c.id === 'python-eta')!.observed;
  const eta = (n: number) => num(n, { dp: 6 });
  const convergence = Object.fromEntries(validation.convergence.map(c => [`n${c.n}`, eta(c.eta)]));

  function showFromStart() {
    playback.setCount(runs[tab].frames.length);
    if (reducedMotion) playback.seek(runs[tab].frames.length - 1);
    else { playback.seek(0); playback.play(); }
  }
  function cancel() { worker?.terminate(); worker = null; busy = null; }
  function stop() { playback.interact(); cancel(); }
  function compute() {
    stop();
    const which = tab;
    busy = which; issues = { ...issues, [which]: null };
    const active = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = event => {
      if (worker !== active) return;
      let outcome: Issue = null;
      try {
        if (event.data.error === 'infeasible' || event.data.error === 'unbounded') outcome = event.data.error;
        else if (event.data.error) throw new Error();
        else {
          runs = { ...runs, [which]: decodeRun(event.data.result) };
          sources = { ...sources, [which]: 'live' };
          if (tab === which) showFromStart();
        }
      } catch { outcome = 'solver'; }
      issues = { ...issues, [which]: outcome };
      cancel();
    };
    active.onerror = () => { if (worker === active) { issues = { ...issues, [which]: 'solver' }; cancel(); } };
    const request: ArchRequest = which === 'weight' ? { case: 'weight', settings: $state.snapshot(weight) } : { case: 'load', settings: $state.snapshot(load) };
    active.postMessage(request);
  }
  function restart() { playback.seek(0); playback.play(); }
  function showReference(which: Tab) {
    if (which === 'weight') weight = { ...PAPER_WEIGHT }; else load = { ...PAPER_LOAD };
    runs = { ...runs, [which]: replayRuns[which] }; sources = { ...sources, [which]: 'replay' }; issues = { ...issues, [which]: null };
  }
  function backToPaper() {
    stop();
    showReference(tab);
    showFromStart();
  }
  function setTab(next: string) {
    if ((next !== 'weight' && next !== 'load') || next === tab) return;
    tab = next;
    showFromStart();
  }
  function goToStep(step: number) {
    stop();
    if (sources[tab] === 'live' || issues[tab]) showReference(tab);
    playback.setCount(runs[tab].frames.length);
    playback.seek(step < 0 ? runs[tab].frames.length + step : step);
  }
  function setParams(params: Record<string, number | string | boolean>) {
    if (tab !== 'weight') setTab('weight');
    const next = { ...PAPER_WEIGHT };
    if (typeof params.alpha === 'number') next.alpha = params.alpha;
    if (typeof params.n === 'number') next.n = params.n;
    if (typeof params.centreline === 'boolean') next.centreline = params.centreline;
    weight = next;
    if (sameWeight(next, PAPER_WEIGHT)) backToPaper(); else compute();
  }
  function setWeightModel(id: string) {
    const centreline = id === 'centreline';
    if (centreline === weight.centreline) return;
    weight.centreline = centreline;
    compute();
  }
  const firstOf = (kind: string) => replayRuns.weight.frames.findIndex(f => f.kind === kind);

  onMount(() => {
    reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    playback.setCount(run.frames.length);
    playback.startAutoplay({ reducedMotion, narrow: innerWidth < 640 });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => observer.disconnect();
  });
  onDestroy(() => { stop(); playback.dispose(); });
</script>

<ExperimentShell paperId="heyman-1966" name={s.title} lead={s.lead} introInArticle compactHeader locale={publicI18n.locale}
  sourcePath="research/mechanics/heyman-1966"
  referenceLabel={s.referenceLabel}
  verification={{ reference: { kind: 'checks', passed: checks.filter(c => c.passed).length, total: checks.length, href: '#checks' }, published: { kind: 'none', why: s.publishedWhy } }}
  actions={{ goToStep, setParams, showTab: setTab }}>
  {#snippet article()}
    <h2>{s.ideaHeading}</h2>
    <p>{s.idea}</p>
    <h2>{s.modelHeading}</h2>
    <p>{s.model}</p>
    <p>{s.weights}</p>
    <h2>{s.methodHeading}</h2>
    <p>{s.method}</p>
    <h2>{s.runHeading}</h2>
    <p>{fill(s.runText, { n: String(replayRuns.weight.n), eta: eta(replayRuns.weight.result.eta!), beta: num(replayRuns.weight.result.beta!, { dp: 1 }) })}</p>
    <p><ExperimentLink tab="weight" step={0}>{s.watchBisection}</ExperimentLink> · <ExperimentLink tab="weight" step={firstOf('least')}>{s.watchLeast}</ExperimentLink> · <ExperimentLink tab="weight" step={-1}>{s.watchMechanism}</ExperimentLink></p>
    <p>{s.tryText}</p>
    <p><ExperimentLink params={{ centreline: true }}>{s.tryCentreline}</ExperimentLink> · <ExperimentLink params={{ alpha: 60 }}>{s.tryFlat}</ExperimentLink> · <ExperimentLink params={{ alpha: 145 }}>{s.tryDeep}</ExperimentLink></p>
    <h2 id="checks">{s.checksHeading}</h2>
    <p>{s.tableIntro}</p>
    <ArchChecks {s} />
    <p>{fill(s.heyman, { h90: num(heyman90.eta, { dp: 6 }), d90: pct(heyman90.milankovitch_over_heyman), d145: pct(heyman145.milankovitch_over_heyman) })}</p>
    <p>{fill(s.convergence, { ...convergence, python: `${num(pythonEta * 1e6, { dp: 0 })} × 10⁻⁶` })}</p>
    <h2>{s.ringHeading}</h2>
    <p>{s.ringText}</p>
    <div class="table-scroll">
      <table class="ring">
        <thead><tr><th scope="col">{s.ringTable.voussoirs}</th><th scope="col">{s.ringTable.static}</th><th scope="col">{s.ringTable.kinematic}</th></tr></thead>
        <tbody>
          {#each ring as row}
            <tr><th scope="row">{row.n}</th><td>{num(row.static, { dp: 4 })}</td><td>{row.kinematic == null ? s.notEnumerated : num(row.kinematic, { dp: 4 })}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p>{fill(s.ringHinges, { list: hingeList(replayRuns.load) })}</p>
    <h2>{s.limitsHeading}</h2>
    <p>{s.limits}</p>
    <p><a href="https://doi.org/10.1016/0020-7683(66)90018-7">{s.paper}</a> · <a href="https://doi.org/10.4028/www.scientific.net/AMR.133-134.467">{s.rizzi}</a></p>
  {/snippet}
  {#snippet app()}
    <div lang={publicI18n.locale} class="arch-app" bind:this={host} data-source={source} data-step={playback.shown} data-tab={tab}
      data-kind={frame.kind} data-n={run.n} data-alpha={run.alpha} data-stale={stale} data-issue={issue ?? ''} data-paper={atPaper && source === 'replay'}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <PaneTabs label={s.caseLabel} tabs={[{ id: 'weight', label: s.tabs.weight }, { id: 'load', label: s.tabs.load }]}
        bind:active={() => tab, setTab} oninteract={() => playback.interact()} />
      <p class="source">{source === 'replay' ? shared.replaySource : shared.liveSource}</p>
      <p class="caption result-settings">{s.computedWith}: {#if tab === 'weight'}α = {num(run.alpha)}°, N = {run.n}, {(run.weights === 'centreline' ? s.centrelineShort : s.trueShort).toLocaleLowerCase(publicI18n.locale)}{:else}N = {run.n}, t = {num(run.t_max, { dp: 2 })} m, {positionText(run.position ?? 0)}{/if}.</p>
      {#if stale}<p class="result-stale" role="status">{refused ? refusal : s.staleResult}</p>{/if}
      <div id={`rs-panel-${tab}`} role="tabpanel" aria-labelledby={`rs-tab-${tab}`} class:stale={stale}>
        <StabileoViewer editorButton={false} xy={geometry.xy} cells={geometry.cells} cellSize={4} values={shown.values} perCell {displacement} deformScale={1}
          range={{ min: -1, max: 1 }} colourMap="diverging" geometryOnly showMesh={false} title={s.viewerTitle} height="max(280px, min(22rem, 42svh, 75vw))" {view} showAxes={false}
          lengthUnit={tab === 'load' ? 'm' : undefined} oninteract={() => playback.interact()} />
        <ul class="legend" aria-label={s.legend.title}>
          <li><span class="key stone" aria-hidden="true"></span>{s.legend.stone}</li>
          <li><span class="key line" aria-hidden="true"></span>{s.legend.line}</li>
          {#if tab === 'weight'}<li><span class="key outside" aria-hidden="true"></span>{s.legend.outside}</li>{/if}
          <li><span class="key hinge" aria-hidden="true"></span>{s.legend.hinge}</li>
          {#if tab === 'load'}<li><span class="key load" aria-hidden="true"></span>{s.legend.load}</li>{/if}
        </ul>
        <p class="caption">{tab === 'weight' ? s.captionWeight : s.captionLoad}{#if mechanismNote}{' '}{mechanismNote}{/if}</p>
        <dl class="summary">
          <dt>{s.summary.shown}</dt><dd>{stepLabel}</dd>
          {#if tab === 'weight'}
            <dt>{s.summary.thickness}</dt><dd>{eta(run.result.eta!)}</dd>
            <dt>{s.summary.beta}</dt><dd>{run.result.hinges.length === 5 && Number.isFinite(run.result.beta) ? `${num(run.result.beta!, { dp: 2 })}°` : '—'}</dd>
            <dt>{s.summary.h}</dt><dd>{num(run.result.h, { dp: 5 })}</dd>
          {:else}
            <dt>{s.summary.load}</dt><dd>{num(run.result.lambda!, { dp: 4 })} kN</dd>
            <dt>{s.summary.kinematic}</dt><dd>{run.n <= KINEMATIC_MAX && run.result.lambda_kinematic != null ? `${num(run.result.lambda_kinematic, { dp: 4 })} kN` : s.summary.kinematicSkipped}</dd>
            <dt>{s.summary.thrust}</dt><dd>{num(run.result.h, { dp: 3 })} kN</dd>
          {/if}
          <dt>{s.summary.hinges}</dt><dd>{hingeList(run) || '—'}</dd>
        </dl>
      </div>
      <label class="step">
        <span><strong>{stepLabel}</strong>{' · '}{shared.step} {playback.shown + 1}/{run.frames.length}</span>
        <input id="arch-step" type="range" min="0" max={run.frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
      </label>
      <fieldset class="params-box">
        <legend>{s.paramsHeading}</legend>
        <p class="status" class:changed={!atPaper}>{atPaper ? s.atPaper : fill(s.changed, { list: changes })}</p>
        {#if tab === 'weight'}
          <div class="params">
            <label>{s.alpha} <strong>{num(weight.alpha)}°</strong><input id="arch-alpha" type="range" min="30" max="160" step="5" bind:value={weight.alpha} onchange={compute} /></label>
            <label>{s.voussoirs} <strong>{weight.n}</strong><input id="arch-voussoirs" type="range" min="6" max="201" step="1" bind:value={weight.n} onchange={compute} /></label>
          </div>
          <Segmented label={s.weightModel} options={[{ id: 'true', label: s.trueShort }, { id: 'centreline', label: s.centrelineShort }]}
            bind:value={() => (weight.centreline ? 'centreline' : 'true'), setWeightModel} />
        {:else}
          <div class="params">
            <label>{s.voussoirs} <strong>{load.n}</strong><input id="arch-ring-voussoirs" type="range" min="6" max="120" step="1" bind:value={load.n} onchange={compute} /></label>
            <label>{s.thickness} <strong>{num(load.t, { dp: 2 })}</strong><input id="arch-thickness" type="range" min="0.2" max="0.6" step="0.01" bind:value={load.t} onchange={compute} /></label>
            <label>{s.position} <strong>{num(load.position, { dp: 2 })}</strong><input id="arch-position" type="range" min="0.05" max="0.5" step="0.05" bind:value={load.position} onchange={compute} /></label>
          </div>
        {/if}
        <div class="buttons">
          <button class="primary" onclick={backToPaper} disabled={atPaper && source === 'replay' && !issue}>{s.backToPaper}</button>
        </div>
      </fieldset>
      <div class="buttons">
        <button onclick={compute} disabled={busy === tab}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button>
      </div>
      <p class="outcome" aria-live="polite">{busy === tab ? s.computing : ''}</p>
      {#if issue === 'solver'}<p role="alert">{s.error}</p>{/if}
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .arch-app { min-width: 0; height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  [role='tabpanel'] { display: flex; flex-direction: column; gap: 0.5rem; }
  p { font-size: 0.85rem; margin: 0; }
  .source, .caption { color: var(--fg-2); font-size: 0.8rem; }
  .stale { opacity: 0.45; }
  .result-stale { border: 1px solid var(--fg-2); padding: 0.5rem; }
  .outcome { font-size: 0.85rem; min-height: 1em; }
  label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
  input[type='range'] { width: 100%; min-height: 44px; margin: 0; }
  .params { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0 1rem; }
  .buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { min-height: 44px; min-width: 44px; font: inherit; font-size: max(12px, 0.85rem); padding: 0.4rem 0.7rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--lp-ink); cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  .summary { display: grid; grid-template-columns: fit-content(50%) minmax(0, 1fr); gap: 0.2rem 0.8rem; font-size: 0.85rem; margin: 0; font-variant-numeric: tabular-nums; }
  .summary dt { color: var(--fg-2); }
  .summary dt, .summary dd { min-width: 0; overflow-wrap: break-word; }
  .summary dd { margin: 0; }
  .params-box { border: 1px solid var(--hair); border-radius: 6px; padding: 0.5rem 0.75rem 0.75rem; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .params-box legend { font-size: 0.85rem; font-weight: 600; padding: 0 0.3rem; }
  .status { color: var(--fg-2); }
  .status.changed { color: var(--fg); }
  .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; font-size: 0.8rem; color: var(--fg-2); }
  .legend li { display: flex; align-items: center; gap: 0.4rem; }
  .key { display: inline-block; flex: none; width: 1.1rem; height: 0.7rem; border-radius: 2px; }
  .key.stone { background: linear-gradient(90deg, #d9a08f 0 46%, transparent 46% 54%, #c99a8c 54%); }
  .key.line { height: 0.3rem; background: #2c6cb4; }
  .key.outside { height: 0.3rem; background: #e5482a; }
  .key.hinge { width: 0.8rem; height: 0.8rem; border-radius: 0; background: #e5482a; clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .key.load { width: 0.7rem; height: 1rem; border-radius: 0; background: #e3744f; clip-path: polygon(38% 0, 62% 0, 62% 55%, 100% 55%, 50% 100%, 0 55%, 38% 55%); }
  button.primary:not(:disabled) { border-color: var(--rs-plot-ours); }
  .table-scroll { overflow-x: auto; }
  .ring { border-collapse: collapse; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .ring th, .ring td { padding: 0.35rem 0.75rem; border-bottom: 1px solid var(--hair); text-align: right; }
  .ring thead th { color: var(--fg-2); font-weight: 500; }
</style>
