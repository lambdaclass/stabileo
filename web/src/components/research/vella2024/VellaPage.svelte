<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import PaneTabs from '../shell/PaneTabs.svelte';
  import Segmented from '../shell/Segmented.svelte';
  import LineChart from '../shauer2025/LineChart.svelte';
  import SnapChecks from './SnapChecks.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { num } from '../shell/format';
  import { rs } from '../i18n';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { snapStrings } from './strings';
  import { ALPHA_RANGE, ASYMMETRIC, RATE_RANGE, SEED_RANGE, asymmetry, decodeRun, displacementOf, logStep, logValue, parseFigure, restGeometry, sameSettings, snapFrame, thetaPeaks, type Settings, type SnapRun } from './protocol';
  import replay from '../../../../../research/mechanics/vella-2024/reference-results/replay.json';
  import study from '../../../../../research/mechanics/vella-2024/reference-results/study.json';
  import published from '../../../../../research/mechanics/vella-2024/reference-results/published.json';
  import validation from '../../../../../research/mechanics/vella-2024/VALIDATION.json';
  import catalog from '../../../../../research/papers.json';
  import figureCsv from '../../../../../research/mechanics/vella-2024/reference-results/fig2c_digitized.csv?raw';

  type Tab = 'snap' | 'stability' | 'rates';
  const s = $derived(snapStrings());
  const shared = $derived(rs());
  const fill = (template: string, values: Record<string, string>) => Object.entries(values).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), template);
  const pct = (v: number) => `${num(100 * v, { sig: 2 })} %`;
  const DOI = '10.1103/PhysRevLett.132.267201';
  const TITLE = catalog.papers.find(p => p.id === 'wang-2024')!.crossref.title;
  const citation = $derived(s.citation.split('{title}'));
  const RATE_STEPS = 60;
  const SEED_STEPS = 40;
  const reference = decodeRun(replay);
  const PAPER: Settings = { ...reference.settings };
  const playback = new Playback(120);
  let run = $state.raw<SnapRun>(reference);
  let source = $state<'replay' | 'live'>('replay');
  let tab = $state<Tab>('snap');
  let settings = $state<Settings>({ ...PAPER });
  let busy = $state(false);
  let failed = $state(false);
  let narrow = $state(false);
  let host: HTMLDivElement;
  let worker: Worker | null = null;

  const n = $derived(run.settings.n);
  const geometry = $derived(restGeometry(n));
  const frame = $derived(run.frames[Math.min(playback.shown, run.frames.length - 1)]);
  const asymmetryRange = $derived(Math.max(1e-6, ...run.frames.map(f => Math.max(...asymmetry(f.z).map(Math.abs)))));
  const showMode = $derived(tab === 'stability');
  const displacement = $derived(showMode ? displacementOf(run.mode.x.map((x, i) => x + run.mode.dx[i]), run.mode.z.map((z, i) => z + run.mode.dz[i])) : displacementOf(frame.x, frame.z));
  const values = $derived(showMode ? run.mode.dz : asymmetry(frame.z));
  const range = $derived(showMode ? Math.max(...run.mode.dz.map(Math.abs)) : asymmetryRange);
  const snapped = $derived(run.outcome.snapped);
  const symmetric = $derived(snapped && run.outcome.amplification! < ASYMMETRIC);
  const stale = $derived(!sameSettings(run.settings, settings));
  const atPaper = $derived(sameSettings(settings, PAPER));

  const d = study.dynamics;
  const peaks = $derived(thetaPeaks(run.trace));
  const thetaSeries = $derived([{ name: s.thetaChart, color: 'var(--rs-plot-ours)', points: peaks.points }]);
  const heightSeries = $derived([{ name: s.heightChart, color: 'var(--rs-plot-ours)', points: run.trace.t.map((t, i) => [t, run.trace.height[i]] as [number, number]) }]);
  const figure = parseFigure(figureCsv);
  const EXPERIMENT_FACTOR = study.units.rate_factor_experiments;
  const rateSeries = $derived([
    { name: s.paperSimulations, color: 'var(--rs-plot-ref)', markers: true, points: figure.simulation.filter(p => p[1] > 0) },
    { name: s.paperExperiments, color: 'var(--fg-2)', markers: true, points: published.table_s1.rows.map(r => [r[1] * EXPERIMENT_FACTOR, r[2]] as [number, number]).filter(p => p[0] <= RATE_RANGE[1]).sort((a, b) => a[0] - b[0]) },
    { name: s.oursOneEnd, color: 'var(--rs-plot-ours)', points: d.one_end.map(p => [p.rate, p.amplification] as [number, number]) },
    { name: s.oursSeeded, color: 'var(--rs-plot-variant)', points: d.seeded.map(p => [p.rate, p.amplification] as [number, number]) },
    { name: s.oursEnvelope, color: 'var(--rs-plot-variant)', dashed: true, points: d.seeded.map(p => [p.rate, p.envelope] as [number, number]) },
  ]);
  const D = study.diagram;
  const referenceCritical = { muA: D.critical.muA, muStar: D.critical.muStar };
  const liveModel = $derived(run.settings.alpha !== D.alpha || run.settings.n !== D.n);
  const diagramSeries = $derived([
    { name: s.shallowNatural, color: 'var(--rs-plot-ref)', dashed: true, points: D.shallow_natural as [number, number][] },
    { name: s.shallowInverted, color: 'var(--rs-plot-ref)', dashed: true, points: D.shallow_inverted as [number, number][] },
    { name: s.oursNatural, color: 'var(--rs-plot-ours)', points: D.natural.map(p => [p.mu, p.height] as [number, number]) },
    { name: s.oursInverted, color: 'var(--rs-plot-variant)', points: D.inverted.map(p => [p.mu, p.height] as [number, number]) },
  ]);
  const branchToFold = D.inverted.slice(0, D.inverted.findIndex(p => p.mu === Math.min(...D.inverted.map(q => q.mu))) + 1);
  const spectrumSeries = $derived([
    { name: s.symmetric, color: 'var(--rs-plot-ours)', points: branchToFold.map(p => [p.mu, p.spectrum.omega2_symmetric / 1000] as [number, number]) },
    { name: s.antisymmetric, color: 'var(--rs-plot-ref)', points: branchToFold.map(p => [p.mu, p.spectrum.omega2_antisymmetric / 1000] as [number, number]) },
  ]);

  const check = (id: string) => validation.checks.find(c => c.id === id)!;
  const published_ = validation.checks.filter(c => 'reference' in c || c.source.startsWith('arXiv'));
  const own = validation.checks.filter(c => !published_.includes(c));
  const paper = study.paper;
  const shallowRef = study.shallow_analytic.mu_star;
  const unseeded = Math.max(...d.unseeded.map(u => u[1]));
  const fast = d.seeded.find(p => p.rate === 0.3)!;
  const diff = validation.differences;
  const sens = (parameter: string, rate: number) => d.sensitivity.filter(x => x.parameter === parameter && x.rate === rate);
  const meshChange = Math.abs(sens('n', 0.03).find(x => x.value === 96)!.amplification / sens('n', 0.03).find(x => x.value === 48)!.amplification - 1);
  const meshEnvelopeChange = Math.abs(sens('n', 0.03).find(x => x.value === 96)!.envelope / sens('n', 0.03).find(x => x.value === 48)!.envelope - 1);
  const changes = $derived.by(() => {
    const list: string[] = [];
    if (settings.rate !== PAPER.rate) list.push(`|µ̇| = ${num(settings.rate, { sig: 3 })}`);
    if (settings.imperfection !== PAPER.imperfection) list.push(`θ₀ = ${num(settings.imperfection, { sig: 2 })}`);
    if (settings.alpha !== PAPER.alpha) list.push(`α = ${num(settings.alpha, { dp: 2 })}`);
    if (settings.oneEnd !== PAPER.oneEnd) list.push(settings.oneEnd ? s.protocols.one : s.protocols.both);
    return list.join(', ');
  });
  const degrees = (a: number) => `${num((a * 180) / Math.PI, { dp: 1 })}°`;

  function showFromStart() {
    playback.setCount(run.frames.length);
    playback.seek(0);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) playback.play();
    else playback.seek(snapFrame(run) ?? run.frames.length - 1);
  }
  function cancel() { worker?.terminate(); worker = null; busy = false; }
  function stop() { playback.interact(); cancel(); }
  function compute() {
    playback.interact();
    if (busy) cancel();
    busy = true; failed = false;
    if (!worker) worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    const active = worker;
    active.onmessage = event => {
      if (worker !== active) return;
      busy = false;
      try {
        if (event.data.error) throw new Error();
        run = decodeRun(event.data.result);
        source = 'live';
        showFromStart();
      } catch { failed = true; }
    };
    active.onerror = () => { if (worker === active) { failed = true; cancel(); } };
    active.postMessage($state.snapshot(settings));
  }
  function restart() { playback.seek(0); playback.play(); }
  function backToPaper() {
    stop();
    settings = { ...PAPER };
    run = reference; source = 'replay'; failed = false;
    showFromStart();
  }
  function setTab(next: string) {
    if (next !== 'snap' && next !== 'stability' && next !== 'rates') return;
    tab = next;
  }
  function goToStep(step: number) {
    stop();
    if (source === 'live') { run = reference; source = 'replay'; settings = { ...PAPER }; }
    tab = 'snap';
    playback.setCount(run.frames.length);
    playback.seek(step < 0 ? (snapFrame(run) ?? 0) : step);
  }
  function setParams(params: Record<string, number | string | boolean>) {
    const next = { ...PAPER };
    if (typeof params.rate === 'number') next.rate = params.rate;
    if (params.oneEnd === true) { next.oneEnd = true; next.imperfection = 0; }
    settings = next;
    tab = 'snap';
    if (sameSettings(next, PAPER)) backToPaper(); else compute();
  }
  function setProtocol(id: string) {
    const one = id === 'one';
    if (one === settings.oneEnd) return;
    settings.oneEnd = one;
    settings.imperfection = one ? 0 : PAPER.imperfection;
    compute();
  }

  onMount(() => {
    playback.setCount(run.frames.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: innerWidth < 640 });
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    const phone = matchMedia('(max-width: 639px)');
    const sync = () => { narrow = phone.matches; };
    sync();
    phone.addEventListener('change', sync);
    return () => { observer.disconnect(); phone.removeEventListener('change', sync); };
  });
  onDestroy(() => { cancel(); playback.dispose(); });
</script>

<ExperimentShell paperId="wang-2024" name={s.title} lead={s.lead} introInArticle compactHeader locale={publicI18n.locale}
  sourcePath="research/mechanics/vella-2024"
  referenceLabel={s.referenceLabel}
  verification={{ reference: { kind: 'checks', passed: own.filter(c => c.passed).length, total: own.length, href: '#checks' }, published: { kind: 'checks', passed: published_.filter(c => c.passed).length, total: published_.length + validation.not_reproduced.length, href: '#checks' } }}
  actions={{ goToStep, setParams, showTab: setTab }}>
  {#snippet article()}
    <h2>{s.showsHeading}</h2>
    <p>{s.shows}</p>
    <h2>{s.modelHeading}</h2>
    <p>{fill(s.model, { n: String(PAPER.n) })}</p>
    <p>{s.staticsMethod}</p>
    <p>{fill(s.dynamicsMethod, { start: num(PAPER.start, { dp: 1 }) })}</p>
    <p>{fill(s.seedText, { seed: num(PAPER.imperfection, { sig: 1 }), unseeded: num(unseeded, { sig: 1 }) })}</p>
    <h2>{s.staticsHeading}</h2>
    <p>{fill(s.staticsResults, {
      muAShallow: num(study.shallow.mu_a.value, { dp: 5 }), muStarShallow: num(study.shallow.mu_star.value, { dp: 5 }),
      muAShallowErr: pct(check('mu-a-fe').observed), muStarShallowErr: pct(check('mu-star-fe').observed),
      omega: num(study.shallow.omega.value, { dp: 3 }), omegaErr: pct(check('omega-fe').observed),
      muA: num(paper.mu_a.value, { dp: 4 }), muStar: num(paper.mu_star.value, { dp: 4 }),
      muAPct: pct(1 - paper.mu_a.value / 0.25), muStarPct: pct(1 - paper.mu_star.value / shallowRef),
      gap: num(paper.mu_a.value - paper.mu_star.value, { dp: 4 }),
    })}</p>
    <p><ExperimentLink tab="stability">{s.showStability}</ExperimentLink> · <ExperimentLink tab="stability">{s.showMode}</ExperimentLink></p>
    <h2>{s.dynamicsHeading}</h2>
    <p>{fill(s.dynamicsResults, {
      rate: num(reference.settings.rate, { sig: 2 }), rateMS: `${num(reference.rateMS * 1000, { sig: 3 })} mm/s`,
      before: num(reference.outcome.thetaBefore, { sig: 2 }), during: num(reference.outcome.thetaDuring!, { sig: 2 }), amp: num(reference.outcome.amplification!, { sig: 3 }),
      threshold: String(ASYMMETRIC), transitionEnvelope: num(d.transition_envelope, { sig: 2 }), muSnapFast: num(fast.mu_snap, { dp: 3 }),
    })}</p>
    <p><ExperimentLink step={-1}>{s.watchSnap}</ExperimentLink> · <ExperimentLink params={{ rate: 0.005 }}>{s.trySlow}</ExperimentLink> · <ExperimentLink params={{ rate: 0.3 }}>{s.tryFast}</ExperimentLink> · <ExperimentLink params={{ oneEnd: true }}>{s.tryOneEnd}</ExperimentLink></p>
    <h2 id="checks">{s.checksHeading}</h2>
    <p>{s.checksIntro}</p>
    <SnapChecks {s} rows={[...published_, ...validation.not_reproduced]} />
    <h3>{s.differencesHeading}</h3>
    <p>{fill(s.toyRate, { paper: num(diff.toy_critical_rate.paper, { dp: 4 }), ours: num(diff.toy_critical_rate.ours, { dp: 4 }), diff: `+${pct(diff.toy_critical_rate.relative)}` })}</p>
    <p>{fill(s.figureCompare, { oneEnd: pct(diff.figure_2c.median_abs_error_one_end), envelope: pct(diff.figure_2c.median_abs_error_envelope), paperBelow: num(diff.figure_2c.paper_first_rate_below_2, { sig: 2 }), oursBelow: num(diff.figure_2c.ours_one_end_first_rate_below_2, { sig: 2 }) })}</p>
    <p>{s.experiments}</p>
    <h2>{s.sensitivityHeading}</h2>
    <p>{s.sensitivityIntro}</p>
    <SnapChecks {s} sensitivity={d.sensitivity} />
    <p>{fill(s.sensitivityText, { dt: pct(check('dt').observed), meshPhase: pct(meshChange), meshEnvelope: pct(meshEnvelopeChange) })}</p>
    <h2>{s.reproducesHeading}</h2>
    <ul>{#each s.reproduces as item}<li>{item}</li>{/each}</ul>
    <ul class="not">{#each s.doesnt as item}<li>{item}</li>{/each}</ul>
    <p>{s.assumptionsText} <a href="https://github.com/lambdaclass/stabileo/blob/main/research/mechanics/vella-2024/reference/paper-extraction.md">{s.extraction}</a></p>
    <h2>{s.citeHeading}</h2>
    <p>{citation[0]}<span lang="en">{TITLE}</span>{citation[1]} <a href={`https://doi.org/${DOI}`}>{`doi:${DOI}`}</a> · <a href="https://arxiv.org/abs/2312.13908v2">{s.arxiv}</a></p>
  {/snippet}
  {#snippet app()}
    <div lang={publicI18n.locale} class="snap-app" bind:this={host} data-source={source} data-step={playback.shown} data-tab={tab}
      data-rate={run.settings.rate} data-alpha={run.settings.alpha} data-one-end={run.settings.oneEnd} data-amplification={run.outcome.amplification}
      data-snapped={snapped} data-symmetric={symmetric} data-stale={stale} data-busy={busy}
      onpointerdowncapture={() => playback.interact()} onkeydowncapture={() => playback.interact()} onwheelcapture={() => playback.interact()} role="group" aria-label={s.title}>
      <PaneTabs label={s.tabsLabel} tabs={[{ id: 'snap', label: s.tabs.snap }, { id: 'stability', label: s.tabs.stability }, { id: 'rates', label: s.tabs.rates }]}
        bind:active={() => tab, setTab} oninteract={() => playback.interact()} />
      <p class="source">{source === 'replay' ? shared.replaySource : shared.liveSource}</p>
      <p class="caption">{s.computedWith}: |µ̇| = {num(run.settings.rate, { sig: 3 })}, α = {degrees(run.settings.alpha)}, {(run.settings.oneEnd ? s.protocols.one : `${s.protocols.both}, θ₀ = ${num(run.settings.imperfection, { sig: 2 })}`).toLocaleLowerCase(publicI18n.locale)}, {run.settings.n} {s.elements}</p>
      {#if stale}<p class="result-stale" role="status">{s.stale}</p>{/if}
      <div id={`rs-panel-${tab}`} role="tabpanel" aria-labelledby={`rs-tab-${tab}`}>
        <StabileoViewer plane="elevation" editorButton={false} xy={geometry.xy} cells={geometry.cells} cellSize={2} {values} {displacement} deformScale={1}
          range={{ min: -range, max: range }} colourMap="diverging" title={showMode ? s.viewerMode : s.viewerSnap} height="max(280px, min(20rem, 40svh, 75vw))"
          view={[-0.05, narrow ? -0.55 : -0.32, 1.05, 0.14]} lineWidth={5} showMesh={false} oninteract={() => playback.interact()} />
        <p class="caption">{s.caption}{#if showMode}{' '}{s.modeCaption}{/if}</p>
        {#if tab === 'stability'}
          <LineChart series={diagramSeries} xLabel={s.muAxis} yLabel={s.diagramAxis} height={220} marker={referenceCritical.muA} markerLabel={s.muAMark} nearest="xy" />
          <LineChart series={spectrumSeries} xLabel={s.muAxis} yLabel={s.spectrumAxis} height={200} marker={referenceCritical.muStar} markerLabel={s.muStarMark} rules={[{ y: 0, text: '0' }]} nearest="xy" dataTable />
          <p class="caption" data-reference-curves>{fill(s.diagramReference, { alpha: degrees(D.alpha), n: String(D.n) })}{#if liveModel}{' '}{s.diagramLive}{/if}</p>
        {:else}
          <dl class="summary">
            <dt>{s.frame.time}</dt><dd>{num(frame.t, { dp: 2 })}</dd>
            <dt>{s.frame.mu}</dt><dd>{num(frame.mu, { dp: 4 })}</dd>
            <dt>{s.frame.theta}</dt><dd>{num(frame.theta, { sig: 3 })}</dd>
            <dt>{s.frame.height}</dt><dd>{num(frame.height, { dp: 4 })}</dd>
          </dl>
          <label class="step">
            <span>{shared.step} {playback.shown + 1}/{run.frames.length}</span>
            <input id="snap-step" type="range" min="0" max={run.frames.length - 1} value={playback.shown} oninput={e => playback.seek(Number(e.currentTarget.value))} />
          </label>
          {#if tab === 'snap'}
            <LineChart series={thetaSeries} xLabel={s.timeAxis} yLabel={s.thetaAxis} height={200} log marker={frame.t} />
            {#if peaks.zeros > 0}<p class="caption">{fill(s.thetaZero, { count: String(peaks.zeros) })}</p>{/if}
            <LineChart series={heightSeries} xLabel={s.timeAxis} yLabel={s.heightAxis} height={160} marker={frame.t} />
          {:else}
            <LineChart series={rateSeries} xLabel={s.rateAxis} yLabel={s.ratesAxis} height={240} log marker={run.settings.rate} rules={[{ y: ASYMMETRIC, text: `A = ${ASYMMETRIC}` }]} dataTable />
          {/if}
        {/if}
        <dl class="summary">
          {#if run.outcome.snapped}
            <dt>{s.summary.amplification}</dt><dd>{num(run.outcome.amplification!, { sig: 3 })}</dd>
            <dt>{s.summary.verdict}</dt><dd>{symmetric ? s.summary.symmetric : s.summary.asymmetric}</dd>
            <dt>{s.summary.snapAt}</dt><dd>{fill('t = {t} T_osc, µ = {mu}', { t: num(run.outcome.tSnap!, { dp: 2 }), mu: num(run.outcome.muSnap!, { dp: 4 }) })}</dd>
          {:else}
            <dt>{s.summary.verdict}</dt><dd data-no-snap>{s.summary.noSnap}</dd>
          {/if}
          <dt>{s.summary.before}</dt><dd>{num(run.outcome.thetaBefore, { sig: 3 })} rad</dd>
          {#if run.outcome.snapped}<dt>{s.summary.during}</dt><dd>{num(run.outcome.thetaDuring!, { sig: 3 })} rad</dd>{/if}
          <dt>{s.summary.critical}</dt><dd>{num(run.critical.muA, { dp: 4 })} · {num(run.critical.muStar, { dp: 4 })}</dd>
          <dt>{s.summary.physical}</dt><dd>{num(run.rateMS * 1000, { sig: 3 })} mm/s</dd>
        </dl>
      </div>
      <fieldset class="params-box">
        <legend>{s.paramsHeading}</legend>
        <p class="status" class:changed={!atPaper}>{atPaper ? s.atPaper : fill(s.changed, { list: changes })}</p>
        <Segmented label={s.protocol} options={[{ id: 'both', label: s.protocols.both }, { id: 'one', label: s.protocols.one }]}
          bind:value={() => (settings.oneEnd ? 'one' : 'both'), setProtocol} />
        <div class="params">
          <label>{s.rate} <strong>{num(settings.rate, { sig: 3 })}</strong>
            <input id="snap-rate" type="range" min="0" max={RATE_STEPS} step="1" value={logStep(RATE_RANGE, RATE_STEPS, settings.rate)}
              oninput={e => (settings.rate = logValue(RATE_RANGE, RATE_STEPS, Number(e.currentTarget.value)))} onchange={compute} /></label>
          <label>{s.seed} <strong>{num(settings.imperfection, { sig: 2 })}</strong>
            <input id="snap-seed" type="range" min="0" max={SEED_STEPS} step="1" disabled={settings.oneEnd} value={logStep(SEED_RANGE, SEED_STEPS, Math.max(SEED_RANGE[0], settings.imperfection))}
              oninput={e => (settings.imperfection = logValue(SEED_RANGE, SEED_STEPS, Number(e.currentTarget.value)))} onchange={compute} /></label>
          <label>{s.alpha} <strong>{degrees(settings.alpha)}</strong>
            <input id="snap-alpha" type="range" min={ALPHA_RANGE[0]} max={ALPHA_RANGE[1]} step="0.01" value={settings.alpha}
              oninput={e => (settings.alpha = Number(e.currentTarget.value))} onchange={compute} /></label>
        </div>
        <div class="buttons"><button class="primary" onclick={backToPaper} disabled={atPaper && source === 'replay'}>{s.backToPaper}</button></div>
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
  .snap-app { min-width: 0; height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  [role='tabpanel'] { display: flex; flex-direction: column; gap: 0.5rem; }
  p { font-size: 0.85rem; margin: 0; }
  .source, .caption { color: var(--fg-2); font-size: 0.8rem; }
  .result-stale { border: 1px solid var(--fg-2); padding: 0.5rem; }
  .outcome { font-size: 0.85rem; min-height: 1em; }
  label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
  input[type='range'] { width: 100%; min-height: 44px; margin: 0; }
  .params { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0 1rem; }
  .buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  button { min-height: 44px; min-width: 44px; font: inherit; font-size: max(12px, 0.85rem); padding: 0.4rem 0.7rem; border: 1px solid var(--hair); border-radius: 4px; color: var(--fg); background: var(--lp-ink); cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: default; }
  button.primary:not(:disabled) { border-color: var(--rs-plot-ours); }
  .summary { display: grid; grid-template-columns: fit-content(55%) minmax(0, 1fr); gap: 0.2rem 0.8rem; font-size: 0.85rem; margin: 0; font-variant-numeric: tabular-nums; }
  .summary dt { color: var(--fg-2); }
  .summary dt, .summary dd { min-width: 0; overflow-wrap: break-word; }
  .summary dd { margin: 0; }
  .params-box { border: 1px solid var(--hair); border-radius: 6px; padding: 0.5rem 0.75rem 0.75rem; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .params-box legend { font-size: 0.85rem; font-weight: 600; padding: 0 0.3rem; }
  .status { color: var(--fg-2); }
  .status.changed { color: var(--fg); }
  .not li::marker { content: '✗ '; }
</style>
