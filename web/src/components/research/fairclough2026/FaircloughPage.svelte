<script lang="ts">
  import { onMount } from 'svelte';
  import ExperimentShell from '../shell/ExperimentShell.svelte';
  import StabileoViewer from '../shell/StabileoViewer.svelte';
  import { Playback } from '../shell/playback.svelte';
  import { rs, researchLocale } from '../i18n';
  import { fs } from './i18n';
  import { editorHash, validateLayout, viewerData, type Layout } from './model';
  import result from '../../../../../research/optimisation/fairclough-2026/results/stabileo_results.json';
  import reference from '../../../../../research/optimisation/fairclough-2026/reference-results/five-node.json';
  import validation from '../../../../../research/optimisation/fairclough-2026/VALIDATION.json';

  const text = $derived(fs());
  const common = $derived(rs());
  const playback = new Playback();
  const publishedChecks = validation.checks.filter(c => c.name === 'Table 1 printed volume absolute error');
  let layout = $state<Layout>(result.layout);
  let plan = $state(false);
  let author = $state(false);
  let source = $state<'replay' | 'live' | 'cached'>('replay');
  let busy = $state(false);
  let hasLive = false;
  let failed = $state(false);
  let editor = $state('');
  let worker: Worker | undefined;
  let host: HTMLDivElement;
  const referenceCurves = reference.curves.map(c => c[0].map((_,i) => [c[0][i],c[1][i],c[2][i],Math.PI*c[3][i]**2]));
  const view = $derived(viewerData(author ? referenceCurves : layout.curves,plan));
  const format = (v:number) => new Intl.NumberFormat(researchLocale(), {maximumSignificantDigits:10}).format(v);
  function stop() { playback.interact(); worker?.terminate(); worker = undefined; busy = false; if (source === 'live') source = hasLive ? 'cached' : 'replay'; }
  function restart() { stop(); layout = result.layout; hasLive = false; source = 'replay'; author = false; playback.play(); }
  function run() {
    stop(); failed = false; busy = true; author = false;
    worker = new Worker(new URL('./solve.worker.ts',import.meta.url), {type:'module'});
    worker.onmessage = (event) => {
      try { layout = validateLayout(event.data.layout); hasLive = true; source = 'cached'; }
      catch { failed = true; source = hasLive ? 'cached' : 'replay'; }
      worker?.terminate(); worker = undefined; busy = false;
    };
    worker.onerror = () => { stop(); failed = true; };
    source = 'live';
    worker.postMessage(new URL(`${import.meta.env.BASE_URL}research-wasm/fairclough-2026/gridshell_fairclough_2026.js`,location.origin).href);
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
    editorHash(result.engine_input,label).then(hash => { if (!cancelled) editor = `${import.meta.env.BASE_URL}app/basic${location.search.includes('e2e=1') ? '?e2e=1' : ''}${hash}`; }).catch(() => { failed = true; });
    return () => { cancelled = true; };
  });
</script>

<div class="fairclough">
<ExperimentShell paperId="fairclough-2026" name={text.title} lead={text.lead}
  sourcePath="research/optimisation/fairclough-2026"
  checks={{passed:validation.checks.filter(c=>c.passed).length,total:validation.checks.length}}
  verification={{reference:{kind:'checks',passed:validation.checks.filter(c=>c.passed).length,total:validation.checks.length},published:{kind:'checks',passed:publishedChecks.filter(c=>c.passed).length,total:publishedChecks.length}}}
  actions={{goToStep:()=>restart(),setParams:()=>stop(),showTab:()=>{plan=!plan;stop();}}}>
  {#snippet article()}
    <h2>{text.model}</h2><p>{text.method}</p>
    <h2>{text.comparison}</h2>
    <dl><dt>{text.published}</dt><dd>{format(13.8394)}</dd><dt>{text.reference}</dt><dd>{format(reference.volume)}</dd><dt>{text.rust}</dt><dd data-testid="volume">{format(layout.volume)}</dd></dl>
    <p>{text.source}</p><p><a href="https://doi.org/10.15131/shef.data.29046755.v1">{text.reference}</a></p>
    <h2 id="checks">{text.scope}</h2><p>{text.agreement}</p>
    <h2>{text.engine}</h2><p>{text.engineText}</p>
    <p>{text.balance}: {format(result.engine.relative_balance_error)}</p>
    <h2>{text.limitations}</h2><p>{text.missing}</p>
    <h2>{text.authors}</h2><p>{text.questions}</p>
  {/snippet}
  {#snippet app()}
    <div bind:this={host} class="experiment">
      <p class="notice">{common.notDesign}.</p>
      <p aria-live="polite" data-testid="source">{author ? text.reference : text[source]}</p>
      <div class="controls">
        <button onclick={run} disabled={busy}>{text.run}</button>
        <button onclick={stop}>{text.stop}</button>
        <button onclick={restart}>{text.restart}</button>
      </div>
      <div class="controls">
        <button aria-pressed={!plan} onclick={()=>{stop();plan=false;}}>{text.section}</button>
        <button aria-pressed={plan} onclick={()=>{stop();plan=true;}}>{text.plan}</button>
        <button aria-pressed={author} onclick={()=>{stop();author=!author;}}>{author?text.author:text.own}</button>
      </div>
      <StabileoViewer {...view} cellSize={2} title={text.area} unit="F/σ" height="23rem" lineWidth={5}
        showMesh={false} oninteract={stop} editorButton={false} ariaLabel={text.alt}/>
      <p>{text.volume}: <strong>{format(layout.volume)}</strong> · {text.height}: {format(layout.nodes[4][2])}</p>
      <a id="edit" class="editor" href={editor || undefined} onclick={stop}>{text.open}</a>
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
  .notice {font-weight:700;}
  dl {display:grid;grid-template-columns:minmax(0,1fr) auto;gap:0.5rem;font-size:0.9rem;}
  dd {margin:0;}
  .fairclough :global(.rs-shell-app) {height:auto;overflow:visible;}
  .fairclough :global(.rs-shell-grid) {min-width:0;}
  @media(max-width:900px) {
    .fairclough :global(.rs-shell-app) {grid-row:1;position:static;}
    .fairclough :global(.rs-shell-grid) {display:grid;grid-template-columns:minmax(0,1fr);}
    .fairclough :global(.rs-shell-head .rs-cite) {display:none;}
    .fairclough :global(.rs-shell-head h1) {font-size:1.7rem;}
  }
</style>
