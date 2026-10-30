<script lang="ts">
  import './register-i18n';
  import SiteHeader from '../site/SiteHeader.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { TOOL_IDS, EXAMPLE, FORMULAS, format, formula, valid, workedExamples, type ToolId, type Parameters } from './calculators';
  import { knownIssueMessage } from '../../lib/engine/known-issues';
  import type { calculate } from './solve';
  import '../landing/landing.css';
  import '../blog/blog.css';
  import '../research/research.css';
  import Sci from '../research/shell/Sci.svelte';
  import ParamRow from '../research/shell/ParamRow.svelte';
  import ToolViewer from './ToolViewer.svelte';
  import { tBatch as t } from './batch-i18n';
  import { BATCH_IDS } from './batch';
  import BatchTool from './BatchTool.svelte';
  import ToolPreview from './ToolPreview.svelte';

  let { path }: { path: string } = $props();
  const id = $derived(TOOL_IDS.find(id => path.replace(/\/$/, '') === `/tools/${id}`));
  const batchId = $derived(BATCH_IDS.find(id => path.replace(/\/$/, '') === `/tools/${id}`));
  const title = $derived(t(id || batchId ? `tools.${id || batchId}` : 'tools.index'));
  let p = $state<Parameters>({ ...EXAMPLE });
  let result = $state<Awaited<ReturnType<typeof calculate>> | null>(null);
  let error = $state('');
  let busy = $state(false);
  let href = $state('');
  let revision = 0;
  const units = { moment: 'kN·m', shear: 'kN', deflection: 'm' };
  const fields = [ ['length', 'length', 'm', 0.1, 100], ['e', 'modulus', 'MPa', 1, 1000000], ['i', 'inertia', 'm⁴', 1e-10, 10] ] as const;
  const ends = [[0.5, 'fixedFixed'], [0.7, 'fixedPinned'], [1, 'pinnedPinned'], [2, 'fixedFree']] as const;
  $effect(() => {
    const route = id || batchId ? `/tools/${id || batchId}` : '/tools';
    applyPageMeta({ title: `${title} — Stabileo Tools`, description: batchId ? t(`tools.${batchId}.subtitle`) : `${title}. ${t('tools.lead')}`, locale: publicI18n.locale, path: route,
      graph: [{ '@type': 'WebApplication', name: title, url: publicUrl(route, publicI18n.locale), applicationCategory: 'EducationalApplication', operatingSystem: 'Any', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }] });
    return () => restorePageMeta();
  });
  $effect(() => {
    const current = id;
    const values = { ...p };
    revision++;
    result = null; href = ''; error = ''; busy = !!current;
    const timer = setTimeout(() => { if (current) void run(current, values); }, 250);
    return () => { clearTimeout(timer); revision++; };
  });
  async function run(tool: ToolId, values: Parameters) {
    const token = ++revision;
    result = null; href = ''; error = '';
    if (!valid(values)) { error = t('tools.invalid'); busy = false; return; }
    busy = true;
    try {
      const [{ calculate }, { editorUrl }] = await Promise.all([import('./solve'), import('./share')]);
      const answer = await calculate(tool, values);
      if (token !== revision) return;
      result = answer;
      href = editorUrl(answer.model, t(`tools.${tool}`));
    } catch (e) {
      if (token === revision) error = `${t('tools.failed')} ${e instanceof Error ? e.message : String(e)}`;
    } finally { if (token === revision) busy = false; }
  }
  const number = (n: number) => new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 5 }).format(n);
  const expression = $derived(id === 'column-buckling' ? 'π²EI/(KL)²' : id === 'cantilever-beam' ? (p.uniform ? 'wL⁴/8EI' : 'Pa²(3L − a)/6EI') : p.uniform ? '5wL⁴/384EI' : p.position === p.length / 2 ? 'PL³/48EI' : 'δ(x)');
</script>

<div class="landing blog research tools">
  <SiteHeader current="tools" />
  <main class="sec sec--ink">
    <div class="wrap tools-wrap" class:gallery={!id && !batchId}>
    {#if batchId}
      {#key batchId}<BatchTool id={batchId}/>{/key}
    {:else if id}
      <div class="tool-layout">
        <header class="tool-intro">
          <p class="crumb"><PublicLink to="/tools">{t('tools.index')}</PublicLink></p>
          <span class="badge">{t('tools.firstVersion')}</span>
          <h1>{title}</h1>
          <p class="lead">{t(`tools.${id}.subtitle`)}</p>
        </header>
        <aside class="tool-viewer" aria-label={title}>
          <ToolViewer {id} {p} {result} />
        </aside>
        <section class="tool-inputs">
          <form onsubmit={(event) => event.preventDefault()}>
            {#each fields as [key, label, unit, min, max]}
              <ParamRow id={key} name={t(`tools.${label}`)} {unit}>
                <input id={key} data-testid={key} type="number" bind:value={p[key]} {min} {max} step="any" required />
              </ParamRow>
            {/each}
            {#if id === 'column-buckling'}
              <ParamRow id="ends" name={t('tools.ends')} unit={`K=${p.k}`}>
                <select id="ends" bind:value={p.k}>{#each ends as [k, label]}<option value={k}>{t(`tools.${label}`)}</option>{/each}</select>
              </ParamRow>
            {:else}
              <ParamRow id="load-type" name={t('tools.loadType')}>
                <select id="load-type" bind:value={p.uniform}><option value={true}>{t('tools.uniform')}</option><option value={false}>{t('tools.point')}</option></select>
              </ParamRow>
              <ParamRow id="load" name={t('tools.load')} unit={p.uniform ? 'kN/m' : 'kN'}>
                <input id="load" data-testid="load" type="number" bind:value={p.load} min="0.000001" max="1000000" step="any" required />
              </ParamRow>
              {#if !p.uniform}<ParamRow id="position" name={t('tools.position')} unit="m"><input id="position" type="number" bind:value={p.position} min="0" max={p.length} step="any" required /></ParamRow>{/if}
            {/if}
          </form>
          {#if busy}<p role="status">{t('tools.loading')}</p>{/if}
          {#if error}<p role="alert">{error}</p>{/if}
        </section>
        <article class="tool-results rs-prose">
          {#if result}
            <div class="results" aria-live="polite">
              <div class="result"><span>{t(id === 'column-buckling' ? 'tools.critical' : 'tools.deflection')}</span><strong data-testid="engine-value">{number(result.value)} <small>{id === 'column-buckling' ? 'kN' : 'm'}</small></strong>
                {#if id !== 'column-buckling'}<span>{t('tools.at')} x = {number(formula(id, p).x)} m</span>{/if}
              </div>
              {#if id === 'column-buckling'}
                <div class="result"><span>{t('tools.effectiveLength')}</span><strong>{number(p.k * p.length)} <small>m</small></strong><span>K = {p.k}</span></div>
              {:else}
                {#each ['shear', 'moment'] as key}
                  {@const metric = key as keyof typeof units}
                  <div class="result"><span>{t(`tools.${key}`)}</span><strong>{number(Math.abs(result.maxima[metric][1]))} <small>{units[metric]}</small></strong><span>{t('tools.at')} x = {number(result.maxima[metric][0])} m</span></div>
                {/each}
              {/if}
            </div>
            <p class="verification" data-testid="agreement" data-difference={result.difference}>{t('tools.comparison')}: {expression} · {t('tools.difference')} <Sci value={result.difference * 100} unit="%" /></p>
            <a class="btn btn-primary" href={href}>{t('tools.open')} ↗</a>
            {#each [...(result.linear.structuredDiagnostics ?? []), ...(result.buckling?.structuredDiagnostics ?? [])] as warning}<p role="status">{knownIssueMessage(warning)}</p>{/each}
          {/if}
          <h2>{t('tools.assumptionsTitle')}</h2>
          <p>{t('tools.assumptions')}</p>
          {#if id === 'column-buckling'}<p>{t('tools.bucklingNote')}</p><p>{t('tools.modeNote')}</p>{/if}
      <h2>{t('tools.formula')}</h2><p class="formula">{FORMULAS[id]}</p>
      <h2>{t('tools.example')}</h2>
      <p>L = 6 m; E = 200000 MPa; I = 0.00008 m⁴; EI = 16000 kN·m²</p>
      {#each workedExamples(id) as example}
        <p data-testid="worked-example" data-value={format(formula(id, example).value)}>
          {#if id === 'column-buckling'}K = {example.k}{:else}{t(example.uniform ? 'tools.uniform' : 'tools.point')}: {example.uniform ? 'w' : 'P'} = 10 {example.uniform ? 'kN/m' : 'kN'}{#if !example.uniform}; a = {example.position} m{/if}{/if}
          → {id === 'column-buckling' ? 'Pcr' : 'δmax'} = {format(formula(id, example).value)} {id === 'column-buckling' ? 'kN' : 'm'}
        </p>
      {/each}
      <h2>{t('tools.references')}</h2>
      <p>{t('tools.referenceBooks')}</p>

          <details><summary>{t('tools.technical')}</summary>
            <p>{t('tools.solverNote')}</p>
            {#if result}<p>{t('tools.dofs')}: {result.model.nodes.size * 3}</p><p>{t('tools.residualNote')}: <Sci value={Math.hypot(result.linear.reactions.reduce((sum, r) => sum + r.rx, 0) - (id === 'column-buckling' ? 1 : 0), result.linear.reactions.reduce((sum, r) => sum + r.rz, 0) - (id === 'column-buckling' ? 0 : p.load * (p.uniform ? p.length : 1)))} unit="kN" /></p>{/if}
          </details>
        </article>
      </div>
    {:else}
      <header><h1>{title}</h1><p class="lead">{t('tools.lead')}</p></header>
      <ul class="tool-cards">
        {#each [...TOOL_IDS, ...BATCH_IDS] as tool}
          <li class="tool-card">
            <PublicLink to={`/tools/${tool}`} class="preview" aria-label={t(`tools.${tool}`)}><ToolPreview id={tool} /></PublicLink>
            <div class="card-body"><span class="badge">{t('tools.firstVersion')}</span><h2><PublicLink to={`/tools/${tool}`}>{t(`tools.${tool}`)}</PublicLink></h2><p>{t(`tools.${tool}.subtitle`)}</p><PublicLink to={`/tools/${tool}`} class="btn btn-primary btn-sm">{t('tools.openTool')} ↗</PublicLink></div>
          </li>
        {/each}
      </ul>
      <p>{t('tools.assumptions')}</p>
    {/if}
    </div>
  </main>
  <LandingFooter />
</div>

<style>
  .tools { font-synthesis: none; font-variant-numeric: tabular-nums; }
  .tools :global(.nav) { background: var(--lp-ink); }
  .tools main.sec { padding: clamp(5rem, 7vw, 6rem) 0 4rem; }
  .tools-wrap { max-width: 96rem; --lp-gut: clamp(1rem, 3vw, 2.5rem); }
  .gallery { max-width: 68rem; }
  .tool-layout { display: grid; gap: 1.5rem; }
  .tool-layout > * { min-width: 0; }
  h1 { font: 600 clamp(2rem, 4.5vw, 3rem)/1.1 var(--lp-display); margin: .75rem 0; }
  .lead { font-size: 1.05rem; color: var(--fg); margin-bottom: 0; }
  .crumb { font-size: .95rem; color: var(--fg-2); margin-bottom: 1rem; }
  .tools :global(a:not(.btn)), .tools :global(a:visited:not(.btn)) { color: inherit; text-underline-offset: 3px; }
  .badge { border: 1px solid var(--hair); border-radius: 3px; padding: .2rem .4rem; font: 500 .75rem var(--lp-mono); color: var(--fg-2); }
  form { border-top: 1px solid var(--hair); padding-top: 1rem; }
  input, select { min-height: 44px; min-width: 0; background: var(--card); color: var(--fg); border: 1px solid var(--hair); border-radius: 3px; padding: .4rem; font: .875rem var(--lp-mono); }
  .tools :global(.rs-param) { grid-template-columns: minmax(0, 1fr) minmax(6rem, 10rem) 3.5rem; }
  .tools :global(.btn), .tools :global(.rs-tabs button) { min-height: 44px; }
  .tool-viewer { border: 1px solid var(--card-hair); border-radius: 6px; background: var(--card); overflow: hidden; }
  .results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; padding: 1.25rem 0; border-block: 1px solid var(--hair); }
  .result { display: grid; gap: .25rem; font-size: .875rem; color: var(--fg-2); }
  .result:first-child { grid-column: 1 / -1; }
  .result strong { font: 500 clamp(1.75rem, 3vw, 2.5rem) var(--lp-display); color: var(--fg); }
  .result small { font: .875rem var(--lp-mono); }
  .verification { font-size: .875rem; color: var(--fg-2); }
  .formula { font: .875rem/1.8 var(--lp-mono); overflow-wrap: anywhere; }
  details { border-top: 1px solid var(--hair); margin-top: 2rem; padding-top: 1rem; font-size: .875rem; }
  summary { min-height: 44px; cursor: pointer; }
  .tool-cards { display: grid; gap: 1.5rem; list-style: none; padding: 0; margin: 2rem 0; }
  .tool-card { display: grid; background: var(--card); border: 1px solid var(--card-hair); border-radius: 6px; overflow: hidden; }
  .card-body { padding: 1.5rem; }
  .card-body h2 { font: 500 1.5rem/1.2 var(--lp-display); margin: 1rem 0; }
  .card-body p { margin-bottom: 1.5rem; }
  .card-body :global(h2 a) { text-decoration: none; }
  .tool-card :global(.preview) { display: grid; align-items: center; background: var(--lp-ink-2); min-height: 15rem; }
  @media(min-width: 52rem) { .tool-card { grid-template-columns: 1.1fr 1fr; } }
  @media(min-width: 70rem) {
    .tool-layout { grid-template-columns: minmax(25rem, 38rem) minmax(0, 1fr); column-gap: 3rem; align-items: start; }
    .tool-intro { grid-column: 1; grid-row: 1; }
    .tool-inputs { grid-column: 1; grid-row: 2; }
    .tool-results { grid-column: 1; grid-row: 3; }
    .tool-viewer { grid-column: 2; grid-row: 1 / 4; position: sticky; top: calc(var(--lp-nav-h, 3.6rem) + .75rem); }
  }
</style>
