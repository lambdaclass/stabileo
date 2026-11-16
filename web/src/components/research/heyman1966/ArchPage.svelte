<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import ArchChecks from './ArchChecks.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { rs } from '../i18n';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { archStrings } from './strings';
  import { archMesh, decodeRun, loadOf, sameLoad, sameWeight, weightOf, KINEMATIC_MAX, PAPER_LOAD, PAPER_WEIGHT, type ArchRun, type LoadSettings, type WeightSettings } from './protocol';
  import type { ArchRequest } from './sim.worker';
  import replay from '../../../../../research/mechanics/heyman-1966/reference-results/replay.json';
  import validation from '../../../../../research/mechanics/heyman-1966/VALIDATION.json';

  type Tab = 'weight' | 'load';
  const s = $derived(archStrings());
  const shared = $derived(rs());
  const fill = (template: string, values: Record<string, string>) => Object.entries(values).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), template);
  const playback = new Playback(140);
  const replayRuns: Record<Tab, ArchRun> = { weight: decodeRun(replay.self_weight), load: decodeRun(replay.point_load) };
  let runs = $state.raw<Record<Tab, ArchRun>>({ ...replayRuns });
  let sources = $state<Record<Tab, 'replay' | 'live'>>({ weight: 'replay', load: 'replay' });
  let tab = $state<Tab>('weight');
  let weight = $state<WeightSettings>({ ...PAPER_WEIGHT });
  let load = $state<LoadSettings>({ ...PAPER_LOAD });
  let busy = $state(false);
  let failed = $state(false);
  let thin = $state(false);
  let host: HTMLDivElement;
  let worker: Worker | null = null;

  const checks = validation.checks;
  const run = $derived(runs[tab]);
  const source = $derived(sources[tab]);
  const frame = $derived(run.frames[Math.min(playback.shown, run.frames.length - 1)]);
  const geometry = $derived(archMesh(run, run.frames[0]));
  const shown = $derived(archMesh(run, frame));
  const outer = $derived(run.r + run.t_max / 2);
  const alpha = $derived((run.alpha * Math.PI) / 180);
  const view = $derived.by((): [number, number, number, number] => {
    const x = outer * (run.alpha >= 90 ? 1 : Math.sin(alpha)) + 0.05 * run.r;
    const top = run.load ? run.load.y + run.t_max / 2 + 0.35 * run.r : outer + 0.05 * run.r;
    return [-x, Math.min(0, outer * Math.cos(alpha)) - 0.05 * run.r, x, top];
  });
  const stale = $derived(thin || (tab === 'weight' ? !sameWeight(weightOf(run), weight) : !sameLoad(loadOf(run), load)));
  const atPaper = $derived(tab === 'weight' ? sameWeight(weight, PAPER_WEIGHT) : sameLoad(load, PAPER_LOAD));
  const sideName = (side: 'intrados' | 'extrados') => s.sides[side];
  const hingeList = (r: ArchRun) => r.result.hinges.map(h => `${num(h.angle, { dp: 1 })}° ${sideName(h.side)}`).join(', ');
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
      if (weight.centreline) list.push(s.centrelineShort);
    } else {
      if (load.n !== PAPER_LOAD.n) list.push(`N = ${load.n}`);
      if (Math.abs(load.t - PAPER_LOAD.t) > 1e-9) list.push(`t = ${num(load.t, { dp: 2 })} m`);
      if (Math.abs(load.position - PAPER_LOAD.position) > 1e-9) list.push(`${s.position} ${num(load.position, { dp: 2 })}`);
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

  function restartPlayback() { playback.setCount(runs[tab].frames.length); playback.seek(0); playback.play(); }
  function stop() { playback.interact(); worker?.terminate(); worker = null; busy = false; }
  function compute() {
    stop(); busy = true; failed = false; thin = false;
    const which = tab;
    const active = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker = active;
    active.onmessage = event => {
      if (worker !== active) return;
      try {
        if (event.data.error === 'thin') thin = true;
        else if (event.data.error) throw new Error();
        else {
          runs = { ...runs, [which]: decodeRun(event.data.result) };
          sources = { ...sources, [which]: 'live' };
          if (tab === which) restartPlayback();
        }
      } catch { failed = true; }
      active.terminate(); worker = null; busy = false;
    };
    active.onerror = () => { if (worker === active) { failed = true; stop(); } };
    const request: ArchRequest = which === 'weight' ? { case: 'weight', settings: $state.snapshot(weight) } : { case: 'load', settings: $state.snapshot(load) };
    active.postMessage(request);
  }
  function restart() { stop(); restartPlayback(); }
  function backToPaper() {
    stop(); failed = false; thin = false;
    if (tab === 'weight') weight = { ...PAPER_WEIGHT }; else load = { ...PAPER_LOAD };
    runs = { ...runs, [tab]: replayRuns[tab] }; sources = { ...sources, [tab]: 'replay' };
    restartPlayback();
  }
  function setTab(next: string) {
    if ((next !== 'weight' && next !== 'load') || next === tab) return;
    tab = next; thin = false; failed = false;
    restartPlayback();
  }
  function goToStep(step: number) {
    playback.interact();
    if (sources[tab] === 'live') { runs = { ...runs, [tab]: replayRuns[tab] }; sources = { ...sources, [tab]: 'replay' }; playback.setCount(runs[tab].frames.length); }
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
  const firstOf = (kind: string) => replayRuns.weight.frames.findIndex(f => f.kind === kind);

  onMount(() => {
    playback.setCount(run.frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: innerWidth < 640 });
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
      data-kind={frame.kind} data-n={run.n} data-alpha={run.alpha} data-stale={stale} data-paper={atPaper && source === 'replay'}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <PaneTabs label={s.caseLabel} tabs={[{ id: 'weight', label: s.tabs.weight }, { id: 'load', label: s.tabs.load }]}
        bind:active={() => tab, setTab} oninteract={() => playback.interact()} />
      <p class="source">{source === 'replay' ? shared.replaySource : shared.liveSource}</p>
      <p class="caption result-settings">{s.computedWith}: {#if tab === 'weight'}α = {num(run.alpha)}°, N = {run.n}, {run.weights === 'centreline' ? s.centrelineShort : s.trueShort}{:else}N = {run.n}, t = {num(run.t_max, { dp: 2 })} m, {s.position} {num(run.position ?? 0, { dp: 2 })}{/if}.</p>
      {#if stale}<p class="result-stale" role="status">{thin ? s.thin : s.staleResult}</p>{/if}
      <div id={`rs-panel-${tab}`} role="tabpanel" aria-labelledby={`rs-tab-${tab}`} class:stale={stale}>
        <StabileoViewer editorButton={false} xy={geometry.xy} cells={geometry.cells} cellSize={2} values={shown.values} displacement={shown.displacement} deformScale={1}
          range={{ min: -1, max: 1 }} colourMap="diverging" title={s.viewerTitle} height="max(280px, min(22rem, 42svh))" {view} lineWidth={2} showAxes={false}
          lengthUnit={tab === 'load' ? 'm' : undefined} oninteract={() => playback.interact()} />
        <p class="caption">{tab === 'weight' ? s.captionWeight : s.captionLoad}{#if tab === 'load'} {s.notOrduna}{/if}</p>
        <dl class="summary">
          <dt>{s.summary.shown}</dt><dd>{stepLabel}</dd>
          {#if tab === 'weight'}
            <dt>{s.summary.thickness}</dt><dd>{eta(run.result.eta!)}</dd>
            <dt>{s.summary.beta}</dt><dd>{num(run.result.beta!, { dp: 2 })}°</dd>
            <dt>{s.summary.h}</dt><dd>{num(run.result.h, { dp: 5 })}</dd>
          {:else}
            <dt>{s.summary.load}</dt><dd>{num(run.result.lambda!, { dp: 4 })} kN</dd>
            <dt>{s.summary.kinematic}</dt><dd>{run.n <= KINEMATIC_MAX && run.result.lambda_kinematic != null ? `${num(run.result.lambda_kinematic, { dp: 4 })} kN` : s.summary.kinematicSkipped}</dd>
            <dt>{s.summary.thrust}</dt><dd>{num(run.result.h, { dp: 3 })} kN</dd>
          {/if}
          <dt>{s.summary.hinges}</dt><dd>{hingeList(run)}</dd>
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
          <div class="choice" role="radiogroup" aria-label={s.weightModel}>
            <span>{s.weightModel}</span>
            <div class="buttons">
              <button role="radio" aria-checked={!weight.centreline} onclick={() => { if (weight.centreline) { weight.centreline = false; compute(); } }}>{s.trueShort}</button>
              <button role="radio" aria-checked={weight.centreline} onclick={() => { if (!weight.centreline) { weight.centreline = true; compute(); } }}>{s.centrelineShort}</button>
            </div>
          </div>
        {:else}
          <div class="params">
            <label>{s.voussoirs} <strong>{load.n}</strong><input id="arch-ring-voussoirs" type="range" min="6" max="120" step="1" bind:value={load.n} onchange={compute} /></label>
            <label>{s.thickness} <strong>{num(load.t, { dp: 2 })}</strong><input id="arch-thickness" type="range" min="0.2" max="0.6" step="0.01" bind:value={load.t} onchange={compute} /></label>
            <label>{s.position} <strong>{num(load.position, { dp: 2 })}</strong><input id="arch-position" type="range" min="0.05" max="0.5" step="0.05" bind:value={load.position} onchange={compute} /></label>
          </div>
        {/if}
        <div class="buttons">
          <button class="primary" onclick={backToPaper} disabled={atPaper && source === 'replay'}>{s.backToPaper}</button>
        </div>
      </fieldset>
      <div class="buttons">
        <button onclick={compute} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={restart}>{s.restart}</button>
      </div>
      <p class="outcome" aria-live="polite">{busy ? s.computing : ''}</p>
      {#if failed}<p role="alert">{s.error}</p>{/if}
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
  .summary { display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.8rem; font-size: 0.85rem; margin: 0; font-variant-numeric: tabular-nums; }
  .summary dt { color: var(--fg-2); }
  .summary dd { margin: 0; min-width: 0; }
  .params-box { border: 1px solid var(--hair); border-radius: 6px; padding: 0.5rem 0.75rem 0.75rem; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .params-box legend { font-size: 0.85rem; font-weight: 600; padding: 0 0.3rem; }
  .status { color: var(--fg-2); }
  .status.changed { color: var(--fg); }
  .choice { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
  button[aria-checked='true'] { border-color: var(--rs-plot-ours); box-shadow: inset 0 0 0 1px var(--rs-plot-ours); }
  button.primary:not(:disabled) { border-color: var(--rs-plot-ours); }
  .table-scroll { overflow-x: auto; }
  .ring { border-collapse: collapse; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .ring th, .ring td { padding: 0.35rem 0.75rem; border-bottom: 1px solid var(--hair); text-align: right; }
  .ring thead th { color: var(--fg-2); font-weight: 500; }
</style>
