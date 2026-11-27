<script lang="ts">
  import { onMount } from 'svelte';
  import ComparisonTable from '../shell/ComparisonTable.svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import ExperimentLink from '../shell/ExperimentLink.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { rs, researchLocale } from '../i18n';
  import { fs } from './i18n';
  import { editorHash, paperComparison, validateLayout, viewerData, PAPER_UNIT_WEIGHT, type Layout } from './model';
  import { num } from '../shell/format';
  import result from '../../../../../research/optimisation/fairclough-2026/results/stabileo_results.json';
  import reference from '../../../../../research/optimisation/fairclough-2026/reference-results/five-node.json';
  import published from '../../../../../research/optimisation/fairclough-2026/reference-results/published_comparison.json';
  import validation from '../../../../../research/optimisation/fairclough-2026/VALIDATION.json';

  const text = $derived(fs());
  const common = $derived(rs());
  const playback = new Playback();
  const comparison = published.checks;
  const unitWeightOf = (id: string) => Number(id.slice('table1-v5-'.length));
  const comparisonNames = $derived(Object.fromEntries(comparison.map(r => [r.id, text.rowName.replace('{pg}', num(unitWeightOf(r.id), { dp: 2 }))])));
  let layout = $state<Layout>(result.layout);
  let unitWeight = $state(PAPER_UNIT_WEIGHT);
  let computedWeight = $state(PAPER_UNIT_WEIGHT);
  const selectedComparison = $derived(paperComparison(layout, computedWeight));
  const atPaper = $derived(computedWeight === PAPER_UNIT_WEIGHT);
  let plan = $state(false);
  let author = $state(false);
  let source = $state<'replay' | 'live' | 'cached'>('replay');
  let busy = $state(false);
  let hasLive = false;
  let failed = $state(false);
  let editor = $state('');
  let exportFailed = $state(false);
  let worker: Worker | undefined;
  let host: HTMLDivElement;
  const referenceCurves = reference.curves.map(c => c[0].map((_,i) => [c[0][i],c[1][i],c[2][i],Math.PI*c[3][i]**2]));
  const view = $derived(viewerData(author ? referenceCurves : layout.curves,plan));
  const format = (v:number) => new Intl.NumberFormat(researchLocale(), {maximumSignificantDigits:10}).format(v);
  function stop() { playback.interact(); worker?.terminate(); worker = undefined; busy = false; if (source === 'live') source = hasLive ? 'cached' : 'replay'; }
  function restart() { stop(); failed = false; layout = result.layout; unitWeight = PAPER_UNIT_WEIGHT; computedWeight = PAPER_UNIT_WEIGHT; hasLive = false; source = 'replay'; author = false; playback.play(); }
  function run() {
    stop(); failed = false; busy = true; author = false;
    const requested = unitWeight;
    worker = new Worker(new URL('./solve.worker.ts',import.meta.url), {type:'module'});
    worker.onmessage = (event) => {
      try { layout = validateLayout(event.data.layout, requested); computedWeight = requested; hasLive = true; source = 'cached'; }
      catch { failed = true; source = hasLive ? 'cached' : 'replay'; }
      worker?.terminate(); worker = undefined; busy = false;
    };
    worker.onerror = () => { stop(); failed = true; };
    source = 'live';
    worker.postMessage({ url: new URL(`${import.meta.env.BASE_URL}research-wasm/fairclough-2026/gridshell_fairclough_2026.js`,location.origin).href, unitWeight: requested });
  }
  function setParams(params: Record<string, number | string | boolean>) {
    if (typeof params.pg !== 'number') return;
    unitWeight = params.pg;
    run();
  }
  onMount(() => {
    playback.setCount(1);
    playback.startAutoplay({reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,narrow:innerWidth<600});
    const observer = new IntersectionObserver(([entry]) => playback.setVisible(entry.isIntersecting));
    observer.observe(host);
    return () => { observer.disconnect(); stop(); playback.dispose(); };
  });
  $effect(() => {
    const label = `${common.notDesign} · ${text.title}`;
    let cancelled = false;
    editorHash(result.engine_input,label).then(hash => { if (!cancelled) editor = `${import.meta.env.BASE_URL}app/basic${location.search.includes('e2e=1') ? '?e2e=1' : ''}${hash}`; }).catch(() => { exportFailed = true; });
    return () => { cancelled = true; };
  });
</script>

<div class="fairclough">
<ExperimentShell paperId="fairclough-2026" name={text.title} lead={text.lead} introInArticle compactHeader
  sourcePath="research/optimisation/fairclough-2026"
  checks={{passed:validation.checks.filter(c=>c.passed).length,total:validation.checks.length}}
  verification={{reference:{kind:'checks',passed:validation.checks.filter(c=>c.passed).length,total:validation.checks.length,href:'#checks'},published:{kind:'checks',passed:comparison.filter(c=>c.passed).length,total:comparison.length,href:'#comparison'}}}
  {comparison} {comparisonNames}
  actions={{goToStep:()=>restart(),setParams,showTab:()=>{plan=!plan;stop();}}}>
  {#snippet article()}
    <h2>{text.model}</h2><p>{text.method}</p>
    <h2>{text.comparison} · ρgL/σ = {num(PAPER_UNIT_WEIGHT, { dp: 2 })}</h2>
    <dl><dt>{text.published}</dt><dd>{format(published.checks[0].reference)}</dd><dt>{text.reference}</dt><dd>{format(reference.volume)}</dd><dt>{text.rust}</dt><dd data-testid="volume">{format(atPaper ? layout.volume : result.layout.volume)}</dd></dl>
    <p>{text.source}</p><p><a href="https://doi.org/10.15131/shef.data.29046755.v1">{text.reference}</a></p>
    <p>{text.tableRows} {#each comparison as r, i}{#if i > 0}{' · '}{/if}<ExperimentLink params={{ pg: unitWeightOf(r.id) }}>ρgL/σ = {num(unitWeightOf(r.id), { dp: 2 })}</ExperimentLink>{/each}</p>
    <h2 id="checks">{text.scope}</h2><p>{text.agreement}</p>
    <h2>{text.engine}</h2><p>{text.engineText}</p>
    <p>{text.balance} (ρgL/σ = {num(PAPER_UNIT_WEIGHT, { dp: 2 })}): {new Intl.NumberFormat(researchLocale(), {maximumSignificantDigits:3}).format(result.engine.relative_balance_error)}</p>
    <h2>{text.limitations}</h2><p>{text.missing}</p>
  {/snippet}
  {#snippet app()}
    <div bind:this={host} class="experiment">
      <div class="status">
        <p class="notice">{common.notDesign}.</p>
        <p aria-live="polite" data-testid="source">{author ? text.reference : text[source]}</p>
      </div>
      <StabileoViewer plane={plan ? 'plan' : 'elevation'} {...view} cellSize={2} title={text.area} unit="F/σ" height="clamp(10rem, 45dvh, 23rem)" lineWidth={5}
        showMesh={false} oninteract={stop} editorButton={false} ariaLabel={`${author ? text.author : text.own} · ${text.alt}`}/>
      <p>{text.volume}: <strong data-testid="selected-volume">{format(author ? reference.volume : layout.volume)}</strong> · {text.height}: <span data-testid="selected-height">{format(author ? reference.elevations[4] : layout.nodes[4][2])}</span> · ρgL/σ = <span data-testid="unit-weight">{num(computedWeight, { dp: 2 })}</span></p>
      {#if selectedComparison && !author}<ComparisonTable rows={[selectedComparison]} names={comparisonNames} />{/if}
      <label class="weight">{text.unitWeight} <strong>{num(unitWeight, { dp: 2 })}</strong>
        <input id="fairclough-unit-weight" type="range" min="0.5" max="2.2" step="0.01" bind:value={unitWeight} onchange={run} aria-describedby="fairclough-unit-weight-hint" />
        <span id="fairclough-unit-weight-hint" class="hint">{text.unitWeightHint}</span>
      </label>
      <div class="controls">
        <button onclick={run} disabled={busy}>{text.run}</button>
        <button onclick={stop}>{text.stop}</button>
        <button onclick={restart}>{text.restart}</button>
      </div>
      <div class="controls">
        <button aria-pressed={!plan} onclick={()=>{stop();plan=false;}}>{text.section}</button>
        <button aria-pressed={plan} onclick={()=>{stop();plan=true;}}>{text.plan}</button>
        <button aria-pressed={!author} onclick={()=>{stop();author=false;}}>{text.own}</button>
        <button aria-pressed={author} disabled={!atPaper} onclick={()=>{stop();author=true;}}>{text.author}</button>
      </div>
      {#if !atPaper}<p class="hint">{text.paperOnly}</p>{/if}
      {#if editor && atPaper}<a id="edit" class="editor" href={editor} onclick={stop}>{text.open} · {text.own}</a>{/if}
      {#if exportFailed}<p role="alert">{text.exportFailed}</p>{/if}
      {#if failed}<p role="alert">{text.failed}</p>{/if}
    </div>
  {/snippet}
</ExperimentShell>
</div>

<style>
  .experiment { min-width:0; font-size:0.9rem; }
  .controls {display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.6rem 0;}
  button,.editor {min-height:44px;padding:0.65rem 0.85rem;font-size:0.875rem;color:var(--fg);background:var(--bg-2);border:1px solid var(--hair);border-radius:0.4rem;}
  button[aria-pressed='true'] {border-color:var(--fg);}
  .editor {display:inline-flex;align-items:center;box-sizing:border-box;}
  .experiment :global(button) {min-height:44px;min-width:44px;font-size:max(12px,0.875rem);}
  .experiment :global(small), .experiment :global(.cam-group-title), .experiment :global(.vc-status) {font-size:12px;}
  .experiment :global(.sfv-mark), .experiment :global(.shell-legend), .experiment :global(.legend-unit-inline), .experiment :global(.status-value) {font-size:12px;}
  .notice {font-weight:700;margin:0.25rem 0;}
  .weight {display:flex;flex-direction:column;gap:0.15rem;}
  .weight input {width:100%;min-height:44px;margin:0;}
  .hint {font-size:0.8rem;color:var(--fg-2);}
  button:disabled {opacity:0.6;cursor:default;}
  dl {display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0.5rem;font-size:0.9rem;}
  dd {margin:0;}
  .fairclough :global(.rs-shell-app) {height:auto;overflow:visible;}
  .fairclough :global(.rs-shell-grid) {min-width:0;}
  @media(max-width:900px) {
    .fairclough :global(.rs-shell) {padding-top:4rem;}
    .fairclough :global(.rs-shell-head) {margin-bottom:0.5rem;}
    .fairclough :global(.rs-crumb) {margin:0;}
    .fairclough :global(.rs-shell-app) {grid-row:1;position:static;}
    .fairclough :global(.rs-shell-grid) {display:grid;grid-template-columns:minmax(0,1fr);}
    .fairclough :global(.rs-shell-head .rs-cite) {display:none;}
    .fairclough :global(.rs-shell-head h1) {font-size:1.25rem;}
  }
  @media(max-width:900px) and (max-height:500px) {
    .fairclough :global(.rs-shell) {padding-top:0.5rem;}
    .fairclough :global(.rs-shell-head) {display:flex;flex-wrap:wrap;align-items:baseline;column-gap:1rem;margin-bottom:0.25rem;}
    .fairclough :global(.rs-shell-head h1) {margin:0;flex:1 1 20rem;min-width:0;max-width:none;}
    .experiment {display:flex;flex-direction:column;}
    .experiment > :global(.rs-viewer-host) {order:-1;}
    .status {display:flex;flex-wrap:wrap;align-items:baseline;column-gap:1rem;}
    .status p {margin:0.25rem 0;}
  }
</style>
