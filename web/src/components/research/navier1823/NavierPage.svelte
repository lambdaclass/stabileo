<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { fill, navierLocale, navierStrings } from './strings';
  import { rs } from '../i18n';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ParamRow from '../shell/ParamRow.svelte';
  import Segmented from '../shell/Segmented.svelte';
  import { Playback } from '../shell/playback.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import type { PublishedRow } from '../shell/context';
  import { parameters, cases, mesh, geometry, build, difference, convergence, reduction, runState, navierCenter, seriesFor, validPlate, LIMITS, PAPER_PLATE, type Family, type Plate, type Row } from './model';
  import type { WorkerError } from './solve.worker';
  import replay from '../../../../../research/benchmarks/navier-plate/results/stabileo_results.json';
  import validation from '../../../../../research/benchmarks/navier-plate/VALIDATION.json';
  import published from '../../../../../research/benchmarks/navier-plate/reference-results/published_comparison.json';

  const locale = $derived(navierLocale(publicI18n.locale));
  const s = $derived(navierStrings(locale));
  const common = $derived(rs());
  const nf = (v: number, digits = 6) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
  const signed = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3, signDisplay: 'exceptZero' }).format(v);
  const passed = validation.checks.filter(c => c.passed).length;
  const comparison = published.checks as PublishedRow[];
  const DIVISIONS = Array.from({ length: (LIMITS.n.max - LIMITS.n.min) / LIMITS.n.step + 1 }, (_, i) => LIMITS.n.min + i * LIMITS.n.step);
  const THICKNESSES = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5];

  const playback = new Playback(1300, 2200);
  let rows = $state<Row[]>(replay.rows);
  let source = $state<'replay' | 'live'>('replay');
  let running = $state(false);
  let error = $state<WorkerError | null>(null);
  let showMesh = $state(true);
  let view = $state<'paper' | 'plate'>('paper');
  let plate = $state<Plate>({ ...PAPER_PLATE });
  let support = $state<'soft' | 'hard'>(PAPER_PLATE.hard ? 'hard' : 'soft');
  let plateRow = $state<Row | null>(null);
  let plateBusy = $state(false);
  let plateStopped = $state(false);
  let plateError = $state<WorkerError | null>(null);
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  let plateWorker: Worker | null = null;
  let plateToken = 0;

  const index = $derived(playback.shown);
  const selected = $derived(rows[index]);
  const series = $derived(seriesFor(plate));
  const plateGeometry = $derived(geometry(build(plate.family, plate.n, plate.hard, plate.thickness).input, plate.family));
  const shown = $derived(view === 'plate'
    ? plateRow && { geometry: plateGeometry, values: plateRow.values, name: `${plate.family} ${plate.n} × ${plate.n}`, top: series?.mm ?? plateRow?.center_mm ?? 1 }
    : selected ? { geometry: mesh(index), values: selected.values, name: `${selected.family} ${selected.n} × ${selected.n}`, top: parameters.reference_mm } : null);
  const phase = $derived(runState(source, running, error !== null, rows.length));
  const status = $derived(view === 'plate'
    ? (plateBusy ? s.plateRunning : plateStopped ? s.cancelled : plateError ? s.failed : s.plateLive)
    : phase === 'partial' ? fill(s.partial, { k: nf(rows.length, 0), n: nf(cases.length, 0) }) : s[phase]);
  const viewerLabel = $derived(shown ? fill(s.viewerLabel, { mesh: shown.name, min: nf(Math.min(...shown.values), 4), max: nf(Math.max(...shown.values), 4) }) : '');
  const mindlin = parameters.mindlin_reference_mm;
  const dktReduction = $derived(reduction(rows, 'DKT'));
  const plateLabel = $derived(fill(s.plateLabel, { family: plate.family, n: String(plate.n), support: (plate.hard ? s.hard : s.soft).toLocaleLowerCase(locale), t: nf(plate.thickness, 2) }));

  function stop() {
    playback.interact();
    worker?.terminate();
    worker = null;
    running = false;
    if (plateWorker) {
      plateToken++;
      plateWorker.terminate();
      plateWorker = null;
      plateBusy = false;
      plateStopped = true;
    }
  }
  function spawn() {
    return new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });
  }
  function run() {
    stop();
    view = 'paper';
    rows = [];
    playback.setCount(0);
    source = 'live';
    error = null;
    running = true;
    worker = spawn();
    worker.onmessage = ({ data }) => {
      if (data.row) {
        rows = [...rows, data.row];
        playback.setCount(rows.length);
        playback.seek(data.index);
      }
      if (data.error) { error = data.error; stop(); }
      if (data.done) stop();
    };
    worker.onerror = () => { error = 'init'; stop(); };
    worker.postMessage({ run: true });
  }
  function restart() {
    stop();
    view = 'paper';
    rows = replay.rows;
    source = 'replay';
    error = null;
    playback.setCount(rows.length);
    playback.seek(0);
    playback.play();
  }
  function finest() {
    if (source === 'replay' || running || rows.length < cases.length) {
      stop();
      rows = replay.rows;
      source = 'replay';
      error = null;
      playback.setCount(rows.length);
    } else playback.interact();
    view = 'paper';
    playback.seek(cases.length - 1);
  }
  function solvePlate() {
    if (!validPlate(plate)) return;
    stop();
    view = 'plate';
    plateBusy = true;
    plateStopped = false;
    plateError = null;
    plateRow = null;
    const token = ++plateToken;
    const w = spawn();
    plateWorker = w;
    const done = () => { w.terminate(); if (plateWorker === w) plateWorker = null; };
    w.onmessage = ({ data }) => {
      if (data.token !== token || token !== plateToken || plateWorker !== w) return;
      if (data.plateRow) plateRow = data.plateRow;
      if (data.error) plateError = data.error;
      plateBusy = false;
      done();
    };
    w.onerror = () => { if (token === plateToken) { plateError = 'init'; plateBusy = false; } done(); };
    w.postMessage({ plate: $state.snapshot(plate), token });
  }
  function setParams(p: Record<string, number | string | boolean>) {
    const next: Plate = {
      family: p.family === 'DKT' || p.family === 'MITC4' ? p.family as Family : plate.family,
      n: p.n !== undefined ? Number(p.n) : plate.n,
      hard: p.support !== undefined ? p.support === 'hard' : plate.hard,
      thickness: p.t !== undefined ? Number(p.t) : plate.thickness,
    };
    if (!validPlate(next)) return;
    plate = next;
    support = next.hard ? 'hard' : 'soft';
    solvePlate();
  }
  function backToPaper() {
    stop();
    view = 'paper';
  }
  onMount(() => {
    showMesh = !matchMedia('(max-width: 600px)').matches;
    playback.setCount(rows.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 600px)').matches });
    const observer = new IntersectionObserver(entries => playback.setVisible(entries[0].isIntersecting));
    observer.observe(host);
    return () => observer.disconnect();
  });
  onDestroy(() => { worker?.terminate(); plateWorker?.terminate(); playback.dispose(); });
</script>

<svelte:window onpointerdown={() => playback.interact()} onkeydown={() => playback.interact()} />

<ExperimentShell paperId="navier-plate" name={s.title} lead={s.lead} {locale} compactHeader citationRelation={common.benchmarkAfter}
  referenceLabel={common.againstBenchmark}
  verification={{ reference: { kind: 'checks', passed, total: validation.checks.length, href: '#checks' }, published: { kind: 'checks', passed: comparison.filter(r => r.passed).length, total: comparison.length, href: '#comparison' } }}
  {comparison} comparisonNames={s.names}
  sourcePath="research/benchmarks/navier-plate"
  actions={{ goToStep: i => { view = 'paper'; playback.interact(); playback.seek(i); }, setParams, showTab: () => {} }}>
  {#snippet article()}
    <p><strong>{s.notDesign}</strong></p>
    <h2>{s.model}</h2>
    <p>{s.method}</p>
    <p>{s.series}</p>
    <p class="equation" translate="no">w(a/2,b/2) = 16q/(π⁶D) Σ sin(mπ/2) sin(nπ/2) / [mn(m²/a² + n²/b²)²]</p>
    <p translate="no">m, n = 1, 3, 5, …, 199</p>
    <p>{s.reference}: <strong data-testid="navier-reference">{nf(parameters.reference_mm)}</strong></p>
    <h2>{s.plateHeading}</h2>
    <p>{s.plateText}</p>
    <ul class="links">
      <li><ExperimentLink params={{ family: 'MITC4', support: 'hard', n: 16, t: 0.2 }}>{s.linkThick}</ExperimentLink></li>
      <li><ExperimentLink params={{ family: 'DKT', support: 'soft', n: 32, t: 0.1 }}>{s.linkFine}</ExperimentLink></li>
      <li><ExperimentLink params={{ family: 'MITC4', support: 'soft', n: 2, t: 0.1 }}>{s.linkCoarse}</ExperimentLink></li>
    </ul>
    <h2 id="checks">{s.convergence}</h2>
    <p>{s.comparison}</p>
    <p data-testid="navier-closer">{s.closer}: {convergence(rows).map(item => `${item.n}×${item.n}: ${item.best ?? '—'}`).join('; ')}</p>
    <p data-testid="navier-reduction">{s.reduction}: {s.reductionDkt}: {dktReduction === null ? '—' : nf(dktReduction, 2)}×; {s.reductionHard}: {nf(reduction(replay.hard_rows, 'MITC4', mindlin)!, 2)}×</p>
    <p>{s.difference}: 100 × (w / w<sub>0</sub> − 1)</p>
    <p data-testid="navier-checks">{fill(s.checksText, { passed: nf(passed, 0), total: nf(validation.checks.length, 0) })} <a href="https://github.com/lambdaclass/stabileo/blob/main/research/benchmarks/navier-plate/README.md">{s.readme}</a></p>
    <h2>{s.hardHeading}</h2>
    <p>{s.hardText}</p>
    <p class="equation" translate="no">w<sub>RM</sub> = w<sub>0</sub> + 16q/(π⁴κGt) Σ sin(mπ/2) sin(nπ/2) / [mn(m²/a² + n²/b²)]</p>
    <p>{s.mindlinReference}: <strong data-testid="navier-mindlin">{nf(mindlin)}</strong></p>
    <div class="table-scroll">
      <table data-testid="navier-hard">
        <caption>{s.hardCaption}</caption>
        <thead><tr><th scope="col">{s.mesh}</th><th scope="col">{s.result}</th><th scope="col">{s.difference}</th></tr></thead>
        <tbody>{#each replay.hard_rows as row (row.n)}<tr><td>{row.n}×{row.n}</td><td>{nf(row.center_mm)}</td><td>{signed(difference(row, mindlin))}</td></tr>{/each}</tbody>
      </table>
    </div>
    <h2>{s.notYet}</h2>
    <ul>{#each s.limitations as item (item)}<li>{item}</li>{/each}</ul>
    <h2>{s.cite}</h2>
    <p>{s.history}</p>
    <p lang="en"><a href="https://doi.org/10.1201/9780203908723-3">{s.chapterCitation}</a></p>
    <p lang="en"><a href="https://civil-terje.sites.olt.ubc.ca/files/2019/06/Naviers-Plate-Solution-for-Uniform-Load.pdf">{s.exampleCitation}</a></p>
  {/snippet}
  {#snippet app()}
    <div class="navier" bind:this={host}>
      <p class="status" data-testid="navier-source" role="status" aria-live="polite">{status}</p>
      {#if shown}
        <StabileoViewer plane="plan" {...shown.geometry} values={shown.values} range={{ min: 0, max: Math.max(shown.top, ...shown.values) }} title={s.field} ariaLabel={viewerLabel} unit="mm" {showMesh} {locale} height="var(--navier-viewer-h)" editorButton={false} oninteract={() => playback.interact()} />
      {/if}
      {#if view === 'paper' && selected}
        <label class="step">{s.step}: {selected.family} {selected.n} × {selected.n}
          <input type="range" min="0" max={rows.length - 1} value={index} oninput={e => playback.seek(Number(e.currentTarget.value))} />
        </label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={showMesh} onchange={() => playback.interact()} /> {s.showMesh}</label>
      <div class="controls">
        <button onclick={run} disabled={running}>{s.run}</button>
        <button onclick={stop}>{s.stop}</button>
        <button onclick={restart}>{s.restart}</button>
        <button onclick={finest}>{s.try}</button>
      </div>
      {#if view === 'paper' && error}<p role="alert">{s.error}: {s.errors[error]}</p>{/if}
      {#if view === 'plate' && (series?.mm ?? navierCenter(parameters.terms, plate.thickness)) > 1000 * plate.thickness}<p data-testid="navier-small-deflection">{s.smallDeflection}</p>{/if}
      {#if view === 'plate' && plateError}<p role="alert">{s.error}: {s.errors[plateError]}</p>{/if}
      <section class="plate" aria-labelledby="navier-plate-heading">
        <h2 id="navier-plate-heading">{s.plateHeading}</h2>
        <Segmented label={s.element} options={[{ id: 'DKT', label: 'DKT' }, { id: 'MITC4', label: 'MITC4' }]} bind:value={plate.family} onchange={solvePlate} />
        <Segmented label={s.support} options={[{ id: 'soft', label: s.soft }, { id: 'hard', label: s.hard }]} bind:value={support} onchange={() => { plate.hard = support === 'hard'; solvePlate(); }} />
        <ParamRow id="navier-n" name={s.divisions}>
          <select id="navier-n" data-testid="navier-n" value={plate.n} onchange={e => { plate.n = Number(e.currentTarget.value); solvePlate(); }}>
            {#each DIVISIONS as n (n)}<option value={n}>{n} × {n}</option>{/each}
          </select>
        </ParamRow>
        <ParamRow id="navier-t" name={s.thickness} unit="m">
          <select id="navier-t" data-testid="navier-t" value={plate.thickness} onchange={e => { plate.thickness = Number(e.currentTarget.value); solvePlate(); }}>
            {#each THICKNESSES as t (t)}<option value={t}>{nf(t, 2)}</option>{/each}
          </select>
        </ParamRow>
        {#if view === 'plate'}
          <dl class="plate-result" data-testid="navier-plate">
            <dt>{plateLabel}</dt><dd></dd>
            <dt>{s.centre}</dt><dd data-testid="navier-plate-centre">{plateRow ? nf(plateRow.center_mm) : '…'}</dd>
            {#if series}
              <dt>{series.kind === 'kirchhoff' ? s.reference : s.mindlinReference}</dt><dd data-testid="navier-plate-series">{nf(series.mm)}</dd>
              <dt>{s.difference}</dt><dd data-testid="navier-plate-difference">{plateRow ? signed(difference(plateRow, series.mm)) : '…'}</dd>
            {:else}
              <dt class="wide">{s.noSeries}</dt>
            {/if}
          </dl>
          <button onclick={backToPaper}>{s.backToPaper}</button>
        {/if}
      </section>
      <div class="table-scroll" aria-busy={running}>
        <table data-testid="navier-results">
          <caption>{s.tableCaption}</caption>
          <thead><tr><th scope="col">{s.element}</th><th scope="col">{s.mesh}</th><th scope="col">{s.result}</th><th scope="col">{s.difference}</th></tr></thead>
          <tbody>{#each rows as row, i (`${row.family}${row.n}`)}<tr class:selected={view === 'paper' && i === index}><td>{row.family}</td><td>{row.n}×{row.n}</td><td>{nf(row.center_mm)}</td><td>{signed(difference(row))}</td></tr>{/each}</tbody>
        </table>
      </div>
    </div>
  {/snippet}
</ExperimentShell>

<style>
  .navier { --navier-viewer-h: clamp(17.5rem, 42vh, 22rem); height: 100%; overflow: auto; padding: 0 0.25rem 1rem 0; color: var(--fg); }
  .status { margin: 0 0 .5rem; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; margin: .75rem 0; }
  button { min-height: 44px; min-width: 44px; padding: .5rem .8rem; border: 1px solid var(--hair); border-radius: 4px; background: var(--bg-2); color: inherit; cursor: pointer; font: inherit; }
  button:disabled { opacity: .5; }
  label { display: block; margin: .5rem 0; }
  select { min-height: 44px; font: inherit; background: var(--bg-2); color: inherit; border: 1px solid var(--hair); border-radius: 4px; padding: 0 .4rem; }
  .step input[type=range] { display: block; width: 100%; min-height: 44px; margin: 0; }
  .check { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; cursor: pointer; }
  .check input { width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--lp-accent, #e5482a); }
  .plate { border-top: 1px solid var(--hair); margin-top: .5rem; padding-top: .5rem; display: grid; gap: .35rem; }
  .plate h2 { font-size: 1.05rem; margin: .25rem 0; }
  .plate-result { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .2rem 1rem; margin: .25rem 0; font-variant-numeric: tabular-nums; }
  .plate-result dd { margin: 0; text-align: right; }
  .plate-result .wide { grid-column: 1 / -1; color: var(--fg-2); }
  .table-scroll { overflow-x: auto; margin-top: .75rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  caption { text-align: left; font-size: .8rem; color: var(--fg-2, inherit); padding-bottom: .4rem; }
  th, td { padding: .5rem .25rem; text-align: right; border-bottom: 1px solid var(--hair); }
  th:first-child, td:first-child { text-align: left; }
  tr.selected { background: var(--bg-2); font-weight: 700; }
  .equation { overflow-wrap: anywhere; }
  .links { padding-left: 1.1rem; }
  @media (max-height: 500px) and (orientation: landscape) {
    .navier { --navier-viewer-h: min(60vh, 22rem); }
  }
</style>
