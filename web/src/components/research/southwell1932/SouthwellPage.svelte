<script lang="ts">
  import { onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import ScalarFieldViewer from '../../viewport/ScalarFieldViewer.svelte';
  import { rs, researchLocale } from '../i18n';
  import { benchmark, compute, editorURL, euler, viewerData, type Row } from './benchmark';
  import { strings } from './i18n';
  import Plot from './Plot.svelte';
  const s = $derived(strings());
  let rows = $state<Row[]>([]);
  let result = $state<Awaited<ReturnType<typeof compute>>>(null);
  let busy = $state(false);
  let status = $state<'pending' | 'running' | 'live' | 'cached' | 'stopped' | 'failure'>('pending');
  let error = $state('');
  let index = $state(0);
  let narrow = $state(false);
  let generation = 0;
  const row = $derived(rows[index]);
  const view = $derived(viewerData(row));
  const fmt = (v: number) => new Intl.NumberFormat(researchLocale(), { maximumSignificantDigits: 7 }).format(v);
  const exact = benchmark.loadFractions.map(f => [benchmark.imperfection * f / (1 - f) * 1000, f * euler] as [number, number]);
  const xmax = $derived(Math.max(...rows.map(r => r.delta), benchmark.imperfection * 4));
  function stop() { generation++; busy = false; if (status === 'running') status = 'stopped'; }
  async function run() {
    stop(); const token = generation; rows = []; result = null; index = 0; error = ''; busy = true; status = 'running';
    try {
      const output = await compute(r => { if (generation === token) { rows = [...rows, r]; index = rows.length - 1; } }, () => token !== generation);
      if (generation === token && output) { result = output; status = 'live'; }
    } catch (e) { if (generation === token) { status = 'failure'; error = String(e); } }
    finally { if (generation === token) busy = false; }
  }
  function seek(i: number) { index = Math.max(0, Math.min(rows.length - 1, i)); if (status === 'live') status = 'cached'; }
  function open() { window.open(editorURL(row?.load ?? euler * .8, new URL(`${import.meta.env.BASE_URL}app`, location.origin).href), '_blank', 'noopener'); }
  onMount(() => { narrow = matchMedia('(max-width: 600px)').matches; void run(); return stop; });
</script>
<ExperimentShell paperId="southwell-1932" name={s.title} lead={s.lead}
  sourcePath="research/stability/southwell-1932"
  actions={{ goToStep: seek, setParams: () => {}, showTab: () => {} }}>
  {#snippet article()}
    <p><strong>{s.stage}</strong></p><p><strong>{rs().disclaimer}</strong></p>
    <h2>{s.model}</h2><p>{s.description}</p><p>{s.method}</p>
    <ExperimentLink step={6}>{s.sample}: 80% {s.euler}</ExperimentLink>
    <h2>{s.reference}</h2><p>{s.formula}</p><p>{s.tolerance}</p>
    <h2 id="checks">{s.comparison}</h2>
    <div class="table-wrap"><table><thead><tr><th></th><th>kN</th><th>{s.difference} (%)</th></tr></thead>
      <tbody><tr><th>{s.euler}</th><td>{fmt(euler)}</td><td>0</td></tr>
      {#each [{ label: s.linear, value: result?.linear, tolerance: benchmark.bucklingTolerance }, { label: 'Southwell', value: result?.estimated, tolerance: benchmark.relativeTolerance }] as r}
        <tr><th>{r.label}</th><td>{r.value == null ? '—' : fmt(r.value)}</td><td>{r.value == null ? '—' : fmt((r.value / euler - 1) * 100)}{#if r.value != null}<br />{Math.abs(r.value / euler - 1) < r.tolerance ? s.pass : s.fail}{/if}</td></tr>
      {/each}</tbody></table></div>
    <h2>{s.notYet}</h2><ul>{#each s.limitations as item}<li>{item}</li>{/each}</ul>
  {/snippet}
  {#snippet app()}
    <div class="experiment">
      <p role="status" data-testid="source">{s[status]} · {rows.length}/{benchmark.loadFractions.length}</p>
      <div class="controls"><button onclick={run} disabled={busy}>{s.run}</button><button onclick={stop}>{s.stop}</button><button onclick={run}>{s.restart}</button></div>
      {#if error}<p role="alert">{error}</p>{/if}
      <ScalarFieldViewer {...view} cellSize={2} deformScale={100} showMesh={!narrow} title={s.title} unit="m" height="17rem" onOpenEditor={open} />
      <small>{s.scaled}</small>
      <label>{s.sample}: {row ? fmt(row.load) : '—'} kN<input type="range" aria-label={s.sample} min="0" max={Math.max(0, rows.length - 1)} value={index} disabled={busy || !rows.length} oninput={e => seek(Number(e.currentTarget.value))} /></label>
      <button onclick={open}>{s.open}</button><small>{s.handoff}</small>
      {#if result}<p data-testid="comparison" data-estimated={result.estimated} data-linear={result.linear} data-error={Math.abs(result.estimated / euler - 1)}>{s.estimate}: {fmt(result.estimated)} kN · {s.difference}: {fmt((result.estimated / euler - 1) * 100)}%</p>{/if}
      <Plot title={s.loadCurve} xLabel="δ (mm)" yLabel="P (kN)" series={[{ label: 'Stabileo', color: '#60a5fa', points: rows.map(r => [r.delta * 1000, r.load]) }, { label: s.reference, color: '#e59b44', points: exact }]} />
      <Plot title={s.southwell} xLabel="δ (mm)" yLabel="δ/P (mm/kN)" series={[{ label: 'Stabileo', color: '#60a5fa', points: rows.map(r => [r.delta * 1000, r.delta / r.load * 1000]) }, ...(result ? [{ label: s.fit, color: '#e59b44', points: [[0, result.intercept * 1000], [xmax * 1000, (result.intercept + result.slope * xmax) * 1000]] as [number, number][] }] : [])]} />
    </div>
  {/snippet}
</ExperimentShell>
<style>
  .experiment { height: 100%; overflow: auto; padding: .5rem; min-width: 0; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; }
  button { min-height: 44px; padding: .5rem; background: var(--lp-ink); color: var(--fg); border: 1px solid var(--hair); border-radius: 4px; }
  label, small { display: block; margin: .5rem 0; } input { width: 100%; min-height: 36px; }
  small, p { font-size: .85rem; } .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .8rem; } th, td { padding: .5rem .25rem; text-align: right; border-bottom: 1px solid var(--hair); }
</style>
