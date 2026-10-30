<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { researchLocale } from '../i18n';
  import { navierStrings } from './strings';
  import { Playback } from '../shell/playback.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { parameters, mesh, difference, convergence, reduction, type Row } from './model';
  import replay from '../../../../../research/benchmarks/navier-plate/results/stabileo_results.json';

  const locale = $derived(researchLocale());
  const s = $derived(navierStrings(locale));
  const nf = (v: number, digits = 6) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
  const playback = new Playback(1300, 2200);
  let rows = $state<Row[]>(replay.rows);
  let source = $state<'replay' | 'live' | 'cached'>('replay');
  let running = $state(false);
  let error = $state('');
  let showMesh = $state(true);
  let host: HTMLDivElement;
  let worker: Worker | null = null;
  const index = $derived(playback.shown);
  const selected = $derived(rows[index]);
  const geometry = $derived(mesh(index));

  function stop() {
    playback.interact();
    worker?.terminate();
    worker = null;
    running = false;
    if (source === 'live') source = 'cached';
  }
  function run() {
    stop();
    rows = [];
    playback.setCount(0);
    source = 'live';
    error = '';
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
    worker.onerror = event => { error = event.message; stop(); };
    worker.postMessage({ run: true });
  }
  function restart() {
    stop();
    rows = replay.rows;
    source = 'replay';
    error = '';
    playback.setCount(rows.length);
    playback.seek(0);
    playback.play();
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
  <h1>{s.title}</h1>
  <p><strong>{s.stage}</strong></p>
  <p>{s.lead}</p>
  <p><strong>{s.notDesign}</strong></p>
  <div class="panes">
    <article>
      <h2>{s.model}</h2>
      <p>{s.method}</p>
      <p>{s.series}</p>
      <p class="equation">w(a/2,b/2) = 16q/(π⁶D) Σ sin(mπ/2) sin(nπ/2) / [mn(m²/a² + n²/b²)²]</p>
      <p>m, n = 1, 3, 5, …, 199</p>
      <p>{s.reference}: <strong>{nf(parameters.reference_mm)}</strong><br />{s.published}: <strong>{nf(parameters.published_mm)}</strong></p>
      <button onclick={() => { stop(); rows = replay.rows; source = 'replay'; playback.setCount(rows.length); playback.seek(5); }}>{s.try}</button>
      <h2>{s.convergence}</h2>
      <p>{s.comparison}</p>
      <p>{s.faster}: {#each convergence(rows) as item}{item.n}×{item.n}: {item.best ?? '—'}; {/each}</p>
      <p>{s.reduction}: {#each ['DKT', 'MITC4'] as family}{@const ratio = reduction(rows, family)}{family}: {ratio === null ? '—' : nf(ratio, 2)}×; {/each}</p>
      <p>{s.difference}: 100 × (w / w<sub>0</sub> − 1)</p>
      <h2>{s.notYet}</h2>
      <ul>{#each s.limitations as item}<li>{item}</li>{/each}</ul>
      <h2>{s.cite}</h2>
      <p>{s.history}</p>
      <p><a href="https://doi.org/10.1201/9780203908723-3">{s.chapterCitation}</a></p>
      <p><a href="https://civil-terje.sites.olt.ubc.ca/files/2019/06/Naviers-Plate-Solution-for-Uniform-Load.pdf">{s.exampleCitation}</a></p>
    </article>
    <div class="app" bind:this={host}>
      <p data-testid="navier-source">{s[source]}</p>
      <div class="controls">
        <button onclick={run} disabled={running}>{s.run}</button>
        <button onclick={stop}>{s.stop}</button>
        <button onclick={restart}>{s.restart}</button>
      </div>
      {#if error}<p role="alert">{s.error}: {error}</p>{/if}
      {#if selected}
        <StabileoViewer {...geometry} values={selected.values} range={{ min: 0, max: Math.max(parameters.reference_mm, ...selected.values) }} title={s.field} unit="mm" {showMesh} height="min(42vh, 22rem)" editorButton={false} oninteract={() => playback.interact()} />
        <label>{s.step}: {selected.family} {selected.n} × {selected.n}
          <input type="range" min="0" max={rows.length - 1} value={index} oninput={e => playback.seek(Number(e.currentTarget.value))} />
        </label>
        <label><input type="checkbox" bind:checked={showMesh} onchange={() => playback.interact()} /> {s.showMesh}</label>
      {/if}
      <div class="table-scroll">
        <table data-testid="navier-results">
          <thead><tr><th>{s.element}</th><th>{s.mesh}</th><th>{s.result}</th><th>{s.difference}</th></tr></thead>
          <tbody>{#each rows as row, i}<tr class:selected={i === index}><td>{row.family}</td><td>{row.n}×{row.n}</td><td>{nf(row.center_mm)}</td><td>{nf(difference(row), 3)}</td></tr>{/each}</tbody>
        </table>
      </div>
      <p>{s.reference}: {nf(parameters.reference_mm)} mm</p>
    </div>
  </div>
</section>

<style>
  .navier { padding-top: 6rem; padding-bottom: 3rem; max-width: 90rem; color: var(--fg); }
  h1 { font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.1; }
  h2 { font-size: 1.35rem; margin-top: 1.5rem; }
  p, li { line-height: 1.6; }
  a { color: inherit; text-decoration: underline; }
  .panes { display: grid; gap: 2rem; margin-top: 2rem; }
  article, .app { min-width: 0; }
  .app { order: -1; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
  button { min-height: 44px; padding: .5rem .8rem; border: 1px solid var(--hair); border-radius: 4px; background: var(--bg-2); color: inherit; cursor: pointer; }
  button:disabled { opacity: .5; }
  label { display: block; margin: .5rem 0; }
  input[type=range] { width: 100%; min-height: 36px; }
  .table-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { padding: .5rem .25rem; text-align: right; border-bottom: 1px solid var(--hair); }
  th:first-child, td:first-child { text-align: left; }
  tr.selected { background: var(--bg-2); font-weight: 700; }
  .equation { overflow-wrap: anywhere; }
  @media (min-width: 1100px) { .panes { grid-template-columns: 1fr 1.2fr; } .app { order: 0; position: sticky; top: 5rem; align-self: start; } }
</style>
