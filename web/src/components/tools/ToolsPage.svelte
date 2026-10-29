<script lang="ts">
  import SiteHeader from '../site/SiteHeader.svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import { tPublic as t, publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { TOOL_IDS, EXAMPLE, FORMULAS, format, formula, valid, workedExamples, type ToolId, type Parameters } from './calculators';
  import { knownIssueMessage } from '../../lib/engine/known-issues';
  import type { calculate } from './solve';
  import '../landing/landing.css';
  import '../blog/blog.css';

  let { path }: { path: string } = $props();
  const id = $derived(TOOL_IDS.find(id => path.replace(/\/$/, '') === `/tools/${id}`));
  const title = $derived(t(id ? `tools.${id}` : 'tools.index'));
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
    const route = id ? `/tools/${id}` : '/tools';
    applyPageMeta({ title: `${title} — Stabileo Tools`, description: `${title}. ${t('tools.lead')}`, locale: publicI18n.locale, path: route,
      graph: [{ '@type': 'WebApplication', name: title, url: publicUrl(route, publicI18n.locale), applicationCategory: 'EducationalApplication', operatingSystem: 'Any', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }] });
    return () => restorePageMeta();
  });
  $effect(() => {
    const current = id;
    p = { ...EXAMPLE };
    result = null;
    href = '';
    error = '';
    revision++;
    if (current) void run(current, { ...EXAMPLE });
  });
  function invalidate() { revision++; result = null; href = ''; error = ''; busy = false; }
  async function run(tool: ToolId, values: Parameters) {
    const token = ++revision;
    result = null; href = ''; error = '';
    if (!valid(values)) { error = t('tools.invalid'); return; }
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
  function plot(points: [number, number][]) {
    const scale = Math.max(...points.map(v => Math.abs(v[1])), 1e-20);
    return points.map(v => `${35 + v[0] / p.length * 530},${100 - v[1] / scale * 65}`).join(' ');
  }
</script>

<div class="landing blog tools">
  <SiteHeader current="tools" />
  <main class="wrap">
    <PublicLink to="/tools">{t('tools.index')}</PublicLink>
    <h1>{title}</h1>
    <p>{t('tools.lead')}</p>
    {#if id}
      <section class="calculator" aria-label={title}>
        <form onsubmit={(event) => { event.preventDefault(); void run(id!, { ...p }); }} oninput={invalidate} onchange={invalidate}>
          {#each fields as [key, label, unit, min, max]}
            <label>{t(`tools.${label}`)} ({unit})
              <input data-testid={key} type="number" bind:value={p[key]} {min} {max} step="any" required />
            </label>
          {/each}
          {#if id === 'column-buckling'}
            <label>{t('tools.ends')} (K)
              <select bind:value={p.k}>{#each ends as [k, label]}<option value={k}>{t(`tools.${label}`)} — {k}</option>{/each}</select>
            </label>
          {:else}
            <label>{t('tools.load')}
              <select bind:value={p.uniform}><option value={true}>{t('tools.uniform')}</option><option value={false}>{t('tools.point')}</option></select>
            </label>
            <label>{t('tools.load')} ({p.uniform ? 'kN/m' : 'kN'})<input data-testid="load" type="number" bind:value={p.load} min="0.000001" max="1000000" step="any" required /></label>
            {#if !p.uniform}<label>{t('tools.position')} (m)<input type="number" bind:value={p.position} min="0" max={p.length} step="any" required /></label>{/if}
          {/if}
          <button type="submit" disabled={busy}>{t(busy ? 'tools.loading' : 'tools.calculate')}</button>
        </form>
        {#if error}<p role="alert">{error}</p>{/if}
        {#if result}
          <div data-testid="agreement" data-difference={result.difference} aria-live="polite">
            <h2>{t('tools.comparison')}</h2>
            <p>{t(id === 'column-buckling' ? 'tools.critical' : 'tools.deflection')} ({id === 'column-buckling' ? 'kN' : 'm'})</p>
            <dl>
              <div><dt>{t('tools.engine')}</dt><dd data-testid="engine-value">{format(result.value)}</dd></div>
              <div><dt>{t('tools.formula')}</dt><dd>{format(result.expected)}</dd></div>
              <div><dt>{t('tools.difference')}</dt><dd>{format(result.difference * 100)} %</dd></div>
            </dl>
            <a class="open-editor" href={href}>{t('tools.open')}</a>
          </div>
          {#each [...(result.linear.structuredDiagnostics ?? []), ...(result.buckling?.structuredDiagnostics ?? [])] as warning}<p role="status">{knownIssueMessage(warning)}</p>{/each}
          {#each result.linear.solverDiagnostics ?? [] as warning}<p role="status">{warning.message}</p>{/each}
          <h2>{t('tools.reactions')}</h2>
          {#each result.linear.reactions as r}<p>x = {format(result.model.nodes.get(r.nodeId)!.x)} m: Rₓ = {format(r.rx)} kN; Rz = {format(r.rz)} kN; M = {format(r.my)} kN·m</p>{/each}
          {#each ['moment', 'shear', 'deflection'] as key}
            {@const metric = key as keyof typeof units}
            <h3>{t(`tools.${key}`)} ({units[metric]})</h3>
            <p>|max| = {format(Math.abs(result.maxima[metric][1]))} {units[metric]} {t('tools.at')} x = {format(result.maxima[metric][0])} m</p>
            <p>{t('tools.formula')}: {format(result.reference[metric])} {units[metric]}
              {#if result.reference[metric] !== 0} · {t('tools.difference')}: {format(Math.abs(Math.abs(result.maxima[metric][1]) / result.reference[metric] - 1) * 100)} %{/if}
            </p>
            <svg viewBox="0 0 600 200" role="img" aria-label={`${t(`tools.${key}`)} (${units[metric]})`}>
              <line x1="35" y1="100" x2="565" y2="100" stroke="currentColor" opacity="0.4" />
              <polyline points={plot(result.charts[metric])} fill="none" stroke="currentColor" stroke-width="2" />
              <text x="35" y="190">0</text><text x="565" y="190" text-anchor="end">{format(p.length)} m</text>
            </svg>
          {/each}
        {/if}
      </section>
      <p>{t('tools.assumptions')}</p>
      {#if id === 'column-buckling'}<p>{t('tools.bucklingNote')}</p><p>{t('tools.columnNote')}</p>{/if}
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
    {:else}
      <div class="tool-links">{#each TOOL_IDS as tool}<PublicLink to={`/tools/${tool}`}>{t(`tools.${tool}`)}</PublicLink>{/each}</div>
      <p>{t('tools.assumptions')}</p>
    {/if}
  </main>
  <LandingFooter />
</div>

<style>
  .tools { font-size: 16px; }
  main { padding-top: 7rem; padding-bottom: 4rem; max-width: 1000px; overflow-wrap: anywhere; }
  h1 { font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.15; margin: 1rem 0; }
  h2 { font-size: 1.4rem; margin-top: 1.5rem; }
  h3 { margin-top: 1rem; }
  p { margin: 0.75rem 0; line-height: 1.6; }
  .calculator { border: 1px solid #a7ada9; border-radius: 8px; padding: 1rem; margin: 1.5rem 0; }
  form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; align-items: end; }
  label { display: grid; gap: 0.35rem; font-size: 14px; }
  input, select, button, .open-editor { min-height: 44px; font-size: 16px; border: 1px solid #68776f; border-radius: 4px; padding: 0.6rem; min-width: 0; width: 100%; box-sizing: border-box; }
  input, select { background: white; color: #162c23; }
  button, .open-editor { background: #183e2e; color: white; cursor: pointer; }
  .open-editor { display: inline-flex; width: auto; align-items: center; }
  dl { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 1rem 0; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  svg { display: block; width: 100%; color: #24694c; }
  svg text { font-size: 28px; fill: currentColor; }
  .formula { font-family: monospace; }
  .tool-links { display: grid; gap: 1rem; margin: 2rem 0; }
  .tool-links :global(a) { padding: 1rem; border: 1px solid #a7ada9; border-radius: 6px; }
  @media(max-width: 600px) { form { grid-template-columns: repeat(2, minmax(0, 1fr)); } main { padding-top: 5rem; } .calculator { padding: 0.75rem; } }
</style>
