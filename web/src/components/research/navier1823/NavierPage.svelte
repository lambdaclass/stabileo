<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { navierLocale, navierStrings } from './strings';
  import { Playback } from '../shell/playback.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { parameters, cases, mesh, difference, convergence, reduction, runState, type Row } from './model';
  import type { WorkerError } from './solve.worker';
  import replay from '../../../../../research/benchmarks/navier-plate/results/stabileo_results.json';

  const locale = $derived(navierLocale(publicI18n.locale));
  const s = $derived(navierStrings(locale));
  const nf = (v: number, digits = 6) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
  const signed = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3, signDisplay: 'exceptZero' }).format(v);
  const playback = new Playback(1300, 2200);
  let rows = $state<Row[]>(replay.rows);
  let source = $state<'replay' | 'live'>('replay');
  let running = $state(false);
  let error = $state<WorkerError | null>(null);
  let showMesh = $state(true);
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  const index = $derived(playback.shown);
  const selected = $derived(rows[index]);
  const geometry = $derived(mesh(index));
  const phase = $derived(runState(source, running, error !== null, rows.length));
  const status = $derived(phase === 'partial' ? s.partial.replace('{k}', nf(rows.length, 0)).replace('{n}', nf(cases.length, 0)) : s[phase]);
  const viewerLabel = $derived(selected ? s.viewerLabel.replace('{mesh}', `${selected.family} ${selected.n} × ${selected.n}`).replace('{min}', nf(Math.min(...selected.values), 4)).replace('{max}', nf(Math.max(...selected.values), 4)) : '');
  const mindlin = parameters.mindlin_reference_mm;
  const dktReduction = $derived(reduction(rows, 'DKT'));

  function stop() {
    playback.interact();
    worker?.terminate();
    worker = null;
    running = false;
  }
  function run() {
    stop();
    rows = [];
    playback.setCount(0);
    source = 'live';
    error = null;
    running = true;
    worker = new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });
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
    playback.seek(cases.length - 1);
  }
  onMount(() => {
    showMesh = !matchMedia('(max-width: 600px)').matches;
    playback.setCount(rows.length);
    playback.startAutoplay({ reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, narrow: matchMedia('(max-width: 600px)').matches });
    const observer = new IntersectionObserver(entries => playback.setVisible(entries[0].isIntersecting));
    observer.observe(host);
    return () => observer.disconnect();
  });
  onDestroy(() => { worker?.terminate(); playback.dispose(); });
</script>

<svelte:window onpointerdown={() => playback.interact()} onkeydown={() => playback.interact()} />

<section class="navier wrap">
  <header class="head">
    <h1>{s.title}</h1>
    <p><strong>{s.stage}</strong> · <strong>{s.notDesign}</strong></p>
  </header>
  <div class="panes">
    <div class="app" bind:this={host}>
      <p class="status" data-testid="navier-source" role="status" aria-live="polite">{status}</p>
      {#if selected}
        <StabileoViewer {...geometry} values={selected.values} range={{ min: 0, max: Math.max(parameters.reference_mm, ...selected.values) }} title={s.field} ariaLabel={viewerLabel} unit="mm" {showMesh} {locale} height="var(--navier-viewer-h)" editorButton={false} oninteract={() => playback.interact()} />
        <label class="step">{s.step}: {selected.family} {selected.n} × {selected.n}
          <input type="range" min="0" max={rows.length - 1} value={index} oninput={e => playback.seek(Number(e.currentTarget.value))} />
        </label>
        <label class="check"><input type="checkbox" bind:checked={showMesh} onchange={() => playback.interact()} /> {s.showMesh}</label>
      {/if}
      <div class="controls">
        <button onclick={run} disabled={running}>{s.run}</button>
        <button onclick={stop}>{s.stop}</button>
        <button onclick={restart}>{s.restart}</button>
        <button onclick={finest}>{s.try}</button>
      </div>
      {#if error}<p role="alert">{s.error}: {s.errors[error]}</p>{/if}
      <div class="table-scroll" aria-busy={running}>
        <table data-testid="navier-results">
          <caption>{s.tableCaption}</caption>
          <thead><tr><th>{s.element}</th><th>{s.mesh}</th><th>{s.result}</th><th>{s.difference}</th></tr></thead>
          <tbody>{#each rows as row, i}<tr class:selected={i === index}><td>{row.family}</td><td>{row.n}×{row.n}</td><td>{nf(row.center_mm)}</td><td>{signed(difference(row))}</td></tr>{/each}</tbody>
        </table>
      </div>
      <p>{s.reference}: <span data-testid="navier-reference">{nf(parameters.reference_mm)}</span></p>
    </div>
    <article>
      <p>{s.lead}</p>
      <h2>{s.model}</h2>
      <p>{s.method}</p>
      <p>{s.series}</p>
      <p class="equation">w(a/2,b/2) = 16q/(π⁶D) Σ sin(mπ/2) sin(nπ/2) / [mn(m²/a² + n²/b²)²]</p>
      <p>m, n = 1, 3, 5, …, 199</p>
      <p>{s.reference}: <strong>{nf(parameters.reference_mm)}</strong><br />{s.published}: <strong data-testid="navier-published">{nf(parameters.published_mm)}</strong></p>
      <h2>{s.convergence}</h2>
      <p>{s.comparison}</p>
      <p data-testid="navier-closer">{s.closer}: {convergence(rows).map(item => `${item.n}×${item.n}: ${item.best ?? '—'}`).join('; ')}</p>
      <p data-testid="navier-reduction">{s.reduction}: {s.reductionDkt}: {dktReduction === null ? '—' : nf(dktReduction, 2)}×; {s.reductionHard}: {nf(reduction(replay.hard_rows, 'MITC4', mindlin)!, 2)}×</p>
      <p>{s.difference}: 100 × (w / w<sub>0</sub> − 1)</p>
      <h2>{s.hardHeading}</h2>
      <p>{s.hardText}</p>
      <p class="equation">w<sub>RM</sub> = w<sub>0</sub> + 16q/(π⁴κGt) Σ sin(mπ/2) sin(nπ/2) / [mn(m²/a² + n²/b²)]</p>
      <p>{s.mindlinReference}: <strong data-testid="navier-mindlin">{nf(mindlin)}</strong></p>
      <div class="table-scroll">
        <table data-testid="navier-hard">
          <caption>{s.hardCaption}</caption>
          <thead><tr><th>{s.mesh}</th><th>{s.result}</th><th>{s.difference}</th></tr></thead>
          <tbody>{#each replay.hard_rows as row}<tr><td>{row.n}×{row.n}</td><td>{nf(row.center_mm)}</td><td>{signed(difference(row, mindlin))}</td></tr>{/each}</tbody>
        </table>
      </div>
      <h2>{s.notYet}</h2>
      <ul>{#each s.limitations as item}<li>{item}</li>{/each}</ul>
      <h2>{s.cite}</h2>
      <p>{s.history}</p>
      <p><a href="https://doi.org/10.1201/9780203908723-3">{s.chapterCitation}</a></p>
      <p><a href="https://civil-terje.sites.olt.ubc.ca/files/2019/06/Naviers-Plate-Solution-for-Uniform-Load.pdf">{s.exampleCitation}</a></p>
    </article>
  </div>
</section>

<style>
  .navier { --navier-viewer-h: min(42vh, 22rem); padding-top: 6rem; padding-bottom: 3rem; max-width: 90rem; color: var(--fg); }
  h1 { font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.1; }
  h2 { font-size: 1.35rem; margin-top: 1.5rem; }
  p, li { line-height: 1.6; }
  a { color: inherit; text-decoration: underline; }
  .panes { display: grid; gap: 2rem; margin-top: 2rem; }
  article, .app { min-width: 0; }
  .status { margin: 0 0 .5rem; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
  button { min-height: 44px; padding: .5rem .8rem; border: 1px solid var(--hair); border-radius: 4px; background: var(--bg-2); color: inherit; cursor: pointer; }
  button:disabled { opacity: .5; }
  label { display: block; margin: .5rem 0; }
  .step input[type=range] { display: block; width: 100%; min-height: 44px; margin: 0; }
  .check { display: inline-flex; align-items: center; gap: .5rem; min-height: 44px; cursor: pointer; }
  .check input { width: 1.25rem; height: 1.25rem; margin: 0; }
  .table-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  caption { text-align: left; font-size: .8rem; color: var(--fg-2, inherit); padding-bottom: .4rem; }
  th, td { padding: .5rem .25rem; text-align: right; border-bottom: 1px solid var(--hair); }
  th:first-child, td:first-child { text-align: left; }
  tr.selected { background: var(--bg-2); font-weight: 700; }
  .equation { overflow-wrap: anywhere; }
  @media (min-width: 1100px) {
    .panes { grid-template-columns: 1fr 1.2fr; }
    article { grid-column: 1; grid-row: 1; }
    .app { grid-column: 2; grid-row: 1; position: sticky; top: 5rem; align-self: start; }
  }
  @media (max-height: 500px) and (orientation: landscape) {
    .navier { --navier-viewer-h: min(60vh, 22rem); padding-top: 1rem; }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .25rem 1rem; }
    h1 { font-size: 1.4rem; margin: 0; max-width: none; }
    .head p { margin: 0; }
    .panes { margin-top: .5rem; }
  }
</style>
