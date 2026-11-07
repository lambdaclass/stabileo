<script lang="ts">
  import '../tools/register-i18n';
  import { onDestroy, untrack } from 'svelte';
  import LandingFooter from '../landing/LandingFooter.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import ScalarFieldViewer from '../viewport/ScalarFieldViewer.svelte';
  import ParamRow from '../research/shell/ParamRow.svelte';
  import PaneTabs from '../research/shell/PaneTabs.svelte';
  import Sci from '../research/shell/Sci.svelte';
  import LineChart from '../research/shauer2025/LineChart.svelte';
  import ExampleThumb from './ExampleThumb.svelte';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta, stabileoCalculator, stabileoSoftware, breadcrumbs, WEBSITE_ID } from '../../lib/page-meta';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { EXAMPLES, findExample } from './catalog';
  import { readValues, writeValues, mergeQuery, referenceGap, type Outcome, type Values } from './define';
  import { editorHref } from './editor';
  import { te } from './strings';
  import '../landing/landing.css';
  import '../blog/blog.css';
  import '../research/research.css';

  let { path }: { path: string } = $props();
  const example = $derived(findExample(path.replace(/\/$/, '').split('/')[2]));
  let values = $state<Values>({});
  let outcome = $state<Outcome | null>(null);
  let busy = $state(false);
  let copied = $state(false);
  let active = $state('');
  let worker: Worker | null = null;
  let token = 0;

  $effect(() => {
    const route = example ? `/examples/${example.id}` : '/examples';
    const title = example ? te(`${example.id}.title`) : te('index.title');
    const locale = publicI18n.locale, url = publicUrl(route, locale);
    const description = example ? te(`${example.id}.subtitle`) : te('index.meta');
    const trail: [string, string][] = example ? [['Stabileo', '/'], [te('index.title'), '/examples'], [title, route]] : [['Stabileo', '/'], [title, '/examples']];
    applyPageMeta({
      title: `${title} — Stabileo`, description, locale, path: route,
      graph: [
        ...(example ? [stabileoCalculator(locale, { '@id': `${url}#example`, name: title, description, url }), stabileoSoftware(locale)] : [{ '@type': 'CollectionPage', '@id': url, url, name: title, description, inLanguage: locale, isPartOf: { '@id': WEBSITE_ID } }]),
        breadcrumbs(locale, trail),
      ],
    });
    return () => restorePageMeta();
  });

  $effect(() => {
    const current = example;
    untrack(() => {
      outcome = null;
      active = '';
      values = current ? readValues(current.params, location.search) : {};
    });
  });

  $effect(() => {
    const current = example;
    const snapshot = { ...values };
    if (!current || Object.keys(snapshot).length === 0) return;
    const query = mergeQuery(current.params, snapshot, location.search);
    if (location.search !== query) history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`);
    busy = true;
    const mine = ++token;
    const timer = setTimeout(() => solve(current.id, snapshot, mine), 180);
    return () => clearTimeout(timer);
  });

  function solve(id: string, snapshot: Values, mine: number) {
    if (!worker) {
      worker = new Worker(new URL('./run.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<{ token: number; outcome: Outcome }>) => {
        if (data.token !== token) return;
        outcome = data.outcome;
        busy = false;
        if (outcome.status === 'ok' && !(active in outcome.views)) active = Object.keys(outcome.views)[0];
      };
      worker.onerror = (event) => { outcome = { status: 'refused', code: 'engine', reason: event.message }; busy = false; };
    }
    worker.postMessage({ id, values: snapshot, token: mine });
  }
  onDestroy(() => worker?.terminate());

  const shareLink = $derived(example ? `${publicUrl(`/examples/${example.id}`, publicI18n.locale)}${writeValues(example.params, values)}` : '');
  const editorLink = $derived.by(() => {
    if (!example?.editor || Object.keys(values).length === 0) return '';
    try { return editorHref(example.editor(example.build(values), te(`${example.id}.title`)), te(`${example.id}.title`)); } catch { return ''; }
  });
  async function copy() {
    try { await navigator.clipboard.writeText(shareLink); copied = true; setTimeout(() => (copied = false), 2000); } catch { copied = false; }
  }
  const viewerNote = (notes: string[]) => `note.${['chord', 'drawing', 'modeShapes'].find(n => notes.includes(n)) ?? 'magnified'}`;
  const number = (n: number, digits = 5) => new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: digits }).format(n);
  const view = $derived(outcome?.status === 'ok' ? outcome.views[active] : undefined);
</script>

<div class="landing blog research examples">
  <main class="sec sec--ink">
    <div class="wrap examples-wrap" class:gallery={!example}>
    {#if example}
      {@const id = example.id}
      <div class="ex-layout">
        <header class="ex-intro">
          <p class="crumb"><PublicLink to="/examples">{te('back')}</PublicLink></p>
          <h1>{te(`${id}.title`)}</h1>
          <p class="lead">{te(`${id}.subtitle`)}</p>
        </header>
        <aside class="ex-viewer" aria-label={te(`${id}.title`)}>
          {#if outcome?.status === 'ok'}
            {#if Object.keys(outcome.views).length > 1}
              <PaneTabs tabs={Object.keys(outcome.views).map(v => ({ id: v, label: te(`pane.${v}`) }))} bind:active label={te(`${id}.title`)} />
            {:else}
              <p class="viewer-heading">{te(`pane.${active}`)}</p>
            {/if}
            {#if view}
              <div class="viewer-body" class:stale={busy} aria-busy={busy} data-testid="viewer-body">
              <ScalarFieldViewer xy={view.xy} cells={view.cells} cellSize={view.cellSize} values={view.values} perCell={view.perCell} lineWidth={view.lineWidth ?? 3}
                colourMap={view.geometryOnly ? 'diverging' : 'sequential'} geometryOnly={view.geometryOnly} range={view.range} title={te(`pane.${view.field}`)} unit={view.unit}
                view={view.bounds} height="clamp(15rem, 34vh, 26rem)" editorButton={false} />
              </div>
            {/if}
            <p class="note">{busy ? te('stale') : te(viewerNote(outcome.notes))}</p>
          {:else}
            <div class="placeholder"><ExampleThumb {id} /></div>
          {/if}
        </aside>
        <section class="ex-inputs">
          <h2>{te('parameters')}</h2>
          <form onsubmit={(event) => event.preventDefault()}>
            {#each example.params as p (p.key)}
              <ParamRow id={`p-${p.key}`} name={te(`${id}.p.${p.key}`)} unit={p.options ? '' : p.unit}>
                {#if p.options}
                  <select id={`p-${p.key}`} data-testid={`param-${p.key}`} value={values[p.key]} onchange={(e) => (values = { ...values, [p.key]: Number(e.currentTarget.value) })}>
                    {#each p.options as option, k}<option value={k}>{te(`${id}.o.${option}`)}</option>{/each}
                  </select>
                {:else}
                  <span class="slider">
                    <input id={`p-${p.key}`} data-testid={`param-${p.key}`} type="range" min={p.min} max={p.max} step={p.step} value={values[p.key] ?? p.value} oninput={(e) => (values = { ...values, [p.key]: Number(e.currentTarget.value) })} />
                    <output for={`p-${p.key}`} data-testid={`value-${p.key}`}>{number(values[p.key] ?? p.value)}</output>
                  </span>
                {/if}
              </ParamRow>
            {/each}
          </form>
          <div class="actions">
            {#if editorLink}<a class="btn btn-primary" data-testid="open-editor" href={editorLink}>{te('editor')} ↗</a>{/if}
            <button class="btn" type="button" data-testid="copy-share" onclick={copy}>{copied ? te('copied') : te('share')}</button>
          </div>
          {#if outcome?.status === 'ok' && outcome.notes.includes('editorFrameOnly')}<p class="fine" data-testid="editor-note">{te('note.editorFrameOnly')}</p>{/if}
          <p class="share"><a data-testid="share-link" href={shareLink}>{shareLink}</a></p>
        </section>
        <article class="ex-results rs-prose">
          <h2>{te('results')}</h2>
          <div aria-live="polite">
            {#if busy}<p role="status" data-testid="solving">{te('solving')}</p>{/if}
            {#if outcome?.status === 'refused'}
              <p class="warning" role="alert" data-testid="refusal" data-code={outcome.code}>{te('refused')} {te(`refuse.${outcome.code}`)}{#if outcome.reason}{' '}<span lang="en">({outcome.reason})</span>{/if}</p>
            {:else if outcome?.status === 'ok' && !busy}
              {#if outcome.stopped}<p class="warning" role="alert" data-testid="stopped" data-load-factor={outcome.stopped.loadFactor}>{te(outcome.stopped.crushed ? 'crushed' : 'stopped').replace('{lambda}', number(outcome.stopped.loadFactor, 3))} <span lang="en">({outcome.stopped.reason})</span></p>{/if}
              <div class="readouts">
                {#each outcome.readouts as r (r.key)}
                  <div class="readout" data-testid={`readout-${r.key}`} data-value={r.value}>
                    <span>{te(`r.${r.key}`)}</span>
                    <strong>{number(r.value)} <small>{r.unit}</small></strong>
                    {#if r.reference}
                      {@const gap = referenceGap(r.value, r.reference.value)}
                      <span data-testid={`reference-${r.key}`} data-value={r.reference.value}>{te('reference')} {r.reference.source} = {number(r.reference.value)} {r.unit} · {te('difference')} {#if gap.relative}<Sci value={gap.value} unit="%" />{:else}<Sci value={gap.value} unit={r.unit} />{/if}</span>
                    {/if}
                  </div>
                {/each}
              </div>
              {#if outcome.notes.includes('elasticShear')}<p class="fine" data-testid="elastic-shear-note">{te('note.elasticShear')}</p>{/if}
              {@const c = outcome.certificate}
              <p class="certificate" data-testid="certificate" data-status={c.status}>
                {#if c.status === 'certified'}{te('cert.certified')} ({te(`cert.${c.kind}`)}){#if c.bound !== null} · {te(`cert.${c.measure}`)} ≤ <Sci value={c.bound} unit="" />{/if}{#if c.kind === 'timeHistory'}. {te('cert.timeNote')}{/if}
                {:else}{te(`cert.${c.status}`)} {te(`cert.${c.kind}`)}: {te(`cert.code.${c.code}`)}{#if c.reason}{' '}<span lang="en">({c.reason})</span>{/if}{/if}
              </p>
              {#each outcome.charts as chart (chart.key)}
                <div class="chart">
                  <h3>{te(`c.${chart.key}`)} ({chart.yUnit})</h3>
                  <LineChart ariaLabel={te(`c.${chart.key}`)} series={[{ name: te(`c.${chart.key}`), color: 'var(--lp-accent)', points: chart.points }, ...(chart.overlays ?? []).map(o => ({ name: te(`c.${o.key}`), color: 'var(--fg)', points: o.points, dashed: o.dashed, markers: o.markers }))]} xLabel={chart.xLabel ?? (chart.xUnit === 's' ? 't (s)' : 'x (m)')} yLabel={chart.yUnit} height={200} marker={chart.marker ?? null} />
                </div>
              {/each}
            {/if}
          </div>
          <p>{te(`${id}.about`)}</p>
          {#if example.benchmark}<p>{te('benchmark')}: <PublicLink to={example.benchmark.path}>{te(`${id}.benchmark`)}</PublicLink></p>{/if}
          <p class="fine">{te('notDesign')} {te('publisher')}</p>
        </article>
      </div>
    {:else}
      <header><h1>{te('index.title')}</h1><p class="lead">{te('index.lead')}</p><p class="fine">{te('publisher')}</p></header>
      <ul class="ex-cards">
        {#each EXAMPLES as e (e.id)}
          <li class="ex-card" data-testid={`card-${e.id}`}>
            <PublicLink to={`/examples/${e.id}`} class="preview" aria-label={te(`${e.id}.title`)}><ExampleThumb id={e.id} /></PublicLink>
            <div class="card-body">
              <h2><PublicLink to={`/examples/${e.id}`}>{te(`${e.id}.title`)}</PublicLink></h2>
              <p>{te(`${e.id}.subtitle`)}</p>
              <PublicLink to={`/examples/${e.id}`} class="btn btn-primary btn-sm">{te('open')} ↗</PublicLink>
            </div>
          </li>
        {/each}
      </ul>
      <p class="fine">{te('notDesign')}</p>
    {/if}
    </div>
  </main>
  <LandingFooter />
</div>

<style>
  .examples { font-synthesis: none; font-variant-numeric: tabular-nums; }
  .examples :global(.nav) { background: var(--lp-ink); }
  .examples main.sec { padding: clamp(5rem, 7vw, 6rem) 0 4rem; }
  .examples-wrap { max-width: 96rem; --lp-gut: clamp(1rem, 3vw, 2.5rem); }
  .gallery { max-width: 68rem; }
  .ex-layout { display: grid; gap: 1.5rem; }
  .ex-layout > * { min-width: 0; }
  h1 { font: 600 clamp(2rem, 4.5vw, 3rem)/1.1 var(--lp-display); margin: .75rem 0; overflow-wrap: anywhere; hyphens: auto; }
  h2 { font: 500 1.25rem/1.3 var(--lp-display); margin: 1rem 0 .5rem; }
  h3 { font: .875rem var(--lp-mono); color: var(--fg-2); margin: 1rem 0 .25rem; }
  .lead { font-size: 1.05rem; color: var(--fg); margin-bottom: 0; }
  .fine { font-size: .875rem; color: var(--fg-2); }
  .crumb { font-size: .95rem; color: var(--fg-2); margin-bottom: 1rem; }
  .crumb :global(a), .card-body :global(h2 a) { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; }
  .examples :global(a:not(.btn)), .examples :global(a:visited:not(.btn)) { color: inherit; text-underline-offset: 3px; }
  .examples :global(.btn) { min-height: 44px; min-width: 44px; }
  .examples :global(.rs-tabs button) { min-height: 44px; min-width: 44px; }
  .examples :global(.rs-tabs) { flex-wrap: wrap; }
  .examples :global(.rs-param) { grid-template-columns: minmax(0, 1fr) minmax(8rem, 14rem) 3.5rem; }
  .examples :global(.sfv-wrap button) { min-height: 44px; min-width: 44px; font-size: 12px; }
  form { border-top: 1px solid var(--hair); padding-top: .75rem; }
  select { min-height: 44px; min-width: 0; background: var(--card); color: var(--fg); border: 1px solid var(--hair); border-radius: 3px; padding: .4rem; font: .875rem var(--lp-mono); }
  .slider { display: grid; grid-template-columns: minmax(0, 1fr) 3.5rem; align-items: center; gap: .5rem; }
  .slider input { min-height: 44px; width: 100%; accent-color: var(--lp-accent); }
  output { font: .875rem var(--lp-mono); text-align: right; color: var(--fg); }
  .actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1rem; }
  .share { font: .75rem var(--lp-mono); color: var(--fg-2); overflow-wrap: anywhere; }
  .share a { display: block; min-height: 44px; padding: .75rem 0; }
  .ex-results :global(a) { display: inline-flex; align-items: center; min-height: 44px; }
  .ex-viewer { border: 1px solid var(--card-hair); border-radius: 6px; background: var(--card); overflow: hidden; }
  .viewer-heading { padding: .75rem 1rem; font: .875rem var(--lp-mono); color: var(--fg); border-bottom: 1px solid var(--hair); margin: 0; }
  .placeholder { display: grid; place-items: center; min-height: clamp(15rem, 34vh, 26rem); background: var(--lp-ink-2); }
  .stale { opacity: .3; pointer-events: none; transition: opacity .15s; }
  .note { padding: .75rem 1rem; color: var(--fg-2); font-size: .8125rem; line-height: 1.5; margin: 0; }
  .readouts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; padding: 1.25rem 0; border-block: 1px solid var(--hair); }
  .readout { display: grid; gap: .25rem; font-size: .875rem; color: var(--fg-2); align-content: start; }
  .readout strong { font: 500 clamp(1.5rem, 3vw, 2.25rem) var(--lp-display); color: var(--fg); overflow-wrap: anywhere; }
  .readout small { font: .875rem var(--lp-mono); }
  .certificate { font-size: .875rem; color: var(--fg-2); overflow-wrap: anywhere; }
  .warning { border-left: 3px solid var(--st-warn, #e5482a); padding-left: .75rem; color: var(--fg); }
  .chart { overflow: hidden; }
  .ex-cards { display: grid; gap: 1.5rem; list-style: none; padding: 0; margin: 2rem 0; }
  .ex-card { display: grid; background: var(--card); border: 1px solid var(--card-hair); border-radius: 6px; overflow: hidden; }
  .card-body { padding: 1.5rem; }
  .card-body h2 { font: 500 1.5rem/1.2 var(--lp-display); margin: .5rem 0 1rem; }
  .card-body p { margin-bottom: 1.5rem; }
  .card-body :global(h2 a) { text-decoration: none; }
  .ex-card :global(.preview) { display: grid; place-items: center; background: var(--lp-ink-2); min-height: 13rem; }
  @media (max-width: 30rem) { .readouts { grid-template-columns: minmax(0, 1fr); } .examples :global(.rs-param) { grid-template-columns: minmax(0, 1fr); } }
  @media (min-width: 52rem) { .ex-card { grid-template-columns: 1fr 1.1fr; } }
  @media (max-height: 450px) and (max-width: 69.99rem) { .examples main.sec { padding-top: .75rem; } h1 { margin: .5rem 0; font-size: 2rem; } .ex-layout { gap: 1rem; } }
  @media (min-width: 70rem), (min-width: 44rem) and (max-height: 450px) {
    .ex-layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); column-gap: 1.5rem; align-items: start; }
    .ex-intro { grid-column: 1; grid-row: 1; }
    .ex-inputs { grid-column: 1; grid-row: 2; }
    .ex-results { grid-column: 1; grid-row: 3; }
    .ex-viewer { grid-column: 2; grid-row: 1 / 4; position: sticky; top: calc(var(--lp-nav-h, 3.6rem) + .75rem); }
  }
  @media (min-width: 70rem) { .ex-layout { grid-template-columns: minmax(25rem, 36rem) minmax(0, 1fr); column-gap: 3rem; } }
  @media (max-height: 450px) { .ex-viewer { position: static; } }
</style>
