<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import ParamRow from '../research/shell/ParamRow.svelte';
  import Sci from '../research/shell/Sci.svelte';
  import FigureBoard from './figures/FigureBoard.svelte';
  import { peakOf, type Figure } from './figures/figure';
  import { publicI18n, tPublic as t } from '../../lib/i18n/store.svelte';
  import { publicUrl } from '../../lib/i18n/public-routes';
  import { findExample } from '../examples/catalog';
  import { readValues, writeValues, mergeQuery, referenceGap, type Outcome, type Values } from '../examples/define';
  import { editorHref } from '../examples/editor';
  import { te } from '../examples/strings';
  import { liveSolver } from './live-solve';

  let { id }: { id: string } = $props();
  const example = $derived(findExample(id)!);
  let values = $state<Values>({});
  let outcome = $state.raw<Outcome | null>(null);
  let stale = $state(false);
  let copied = $state(false);
  let worker: Worker | null = null;
  let sequence = 0;
  const pending = new Map<number, (outcome: Outcome) => void>();

  function post(tool: string, snapshot: Values): Promise<Outcome> {
    if (!worker) {
      worker = new Worker(new URL('../examples/run.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<{ token: number; outcome: Outcome }>) => {
        pending.get(data.token)?.(data.outcome);
        pending.delete(data.token);
      };
      worker.onerror = (event) => {
        for (const resolve of pending.values()) resolve({ status: 'refused', code: 'engine', reason: event.message });
        pending.clear();
      };
    }
    const token = ++sequence;
    return new Promise(resolve => {
      pending.set(token, resolve);
      worker!.postMessage({ id: tool, values: snapshot, token });
    });
  }
  const solver = liveSolver(
    ({ tool, snapshot }: { tool: string; snapshot: Values }) => post(tool, snapshot),
    (answer, input, superseded) => {
      if (input.tool !== id) return;
      outcome = answer.ok ? answer.value : { status: 'refused', code: 'engine', reason: String(answer.error) };
      stale = superseded;
    },
  );
  onDestroy(() => { solver.stop(); worker?.terminate(); });

  $effect(() => {
    const current = example;
    untrack(() => {
      outcome = null;
      values = readValues(current.params, location.search);
    });
  });
  $effect(() => {
    const current = example;
    const snapshot = { ...values };
    if (Object.keys(snapshot).length === 0) return;
    untrack(() => {
      const query = mergeQuery(current.params, snapshot, location.search);
      if (location.search !== query) history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`);
      stale = true;
      solver.request({ tool: current.id, snapshot });
    });
  });

  const title = $derived(t(`tools.${id}`));
  const shareLink = $derived(`${publicUrl(`/tools/${id}`, publicI18n.locale)}${writeValues(example.params, values)}`);
  const editorLink = $derived.by(() => {
    if (!example.editor || Object.keys(values).length === 0) return '';
    try { return editorHref(example.editor(example.build(values), title), title); } catch { return ''; }
  });
  async function copy() {
    try { await navigator.clipboard.writeText(shareLink); copied = true; setTimeout(() => (copied = false), 2000); } catch { copied = false; }
  }
  const number = (n: number, digits = 5) => new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: digits }).format(n);
  const viewerNote = (notes: string[]) => `note.${['chord', 'drawing', 'modeShapes'].find(n => notes.includes(n)) ?? 'magnified'}`;
  const along = (xUnit: string, xLabel?: string) => xUnit === 's' ? { symbol: 't', unit: 's' } : xUnit === 'm' ? { symbol: xLabel?.split(' ')[0] ?? 'x', unit: 'm' } : undefined;

  const figures = $derived.by((): Figure[] => {
    if (outcome?.status !== 'ok') return [];
    const charted = new Set(outcome.charts.map(c => c.key));
    const drawn = Object.entries(outcome.views).filter(([key]) => !charted.has(key)).map(([key, view]): Figure => {
      const label = view.peak?.label ?? 'max';
      const unit = view.peak?.unit ?? view.unit;
      return { key, title: te(`pane.${key}`), unit: label === 'max' && view.peak ? unit : '', sketch: view, peak: view.peak && { value: view.peak.value, unit, label } };
    });
    const plotted = outcome.charts.map((chart): Figure => {
      const at = peakOf(chart.points);
      const name = te(`c.${chart.key}`);
      return {
        key: chart.key, title: name, unit: chart.yUnit,
        peak: { value: Math.abs(at[1]), unit: chart.yUnit, label: 'max', at },
        chart: {
          series: [{ name, color: 'var(--lp-accent)', points: chart.points }, ...(chart.overlays ?? []).map(o => ({ name: te(`c.${o.key}`), color: 'var(--fg)', points: o.points, dashed: o.dashed, markers: o.markers }))],
          xLabel: chart.xLabel ?? (chart.xUnit === 's' ? 't (s)' : 'x (m)'), yLabel: chart.yUnit, marker: chart.marker ?? null, along: along(chart.xUnit, chart.xLabel),
        },
      };
    });
    return [...drawn, ...plotted];
  });
</script>

<div class="tool-layout">
  <div class="tool-side">
    <header class="tool-intro">
      <p class="crumb"><PublicLink to="/tools">{t('tools.index')}</PublicLink></p>
      <h1>{title}</h1>
      <p class="lead">{t(`tools.${id}.subtitle`)}</p>
    </header>
    <section class="tool-inputs" aria-labelledby="tool-parameters">
      <h2 id="tool-parameters">{t('tools.parameters')}</h2>
      <form onsubmit={(event) => event.preventDefault()}>
        {#each example.params as p (p.key)}
          <ParamRow id={`p-${p.key}`} name={te(`${id}.p.${p.key}`)} unit={p.options ? '' : p.unit}>
            {#if p.options}
              <select id={`p-${p.key}`} data-testid={`param-${p.key}`} value={values[p.key]} onchange={(e) => (values = { ...values, [p.key]: Number(e.currentTarget.value) })}>
                {#each p.options as option, k (option)}<option value={k}>{te(`${id}.o.${option}`)}</option>{/each}
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
      <p class="status" role="status">{#if stale}{te('solving')}{/if}</p>
      <div class="actions">
        {#if editorLink}<a class="btn btn-primary" data-testid="open-editor" href={editorLink}>{te('editor')} ↗</a>{/if}
        <button class="btn" type="button" data-testid="copy-share" onclick={copy}>{copied ? te('copied') : te('share')}</button>
      </div>
      {#if outcome?.status === 'ok' && outcome.notes.includes('editorFrameOnly')}<p class="fine" data-testid="editor-note">{te('note.editorFrameOnly')}</p>{/if}
      <p class="share"><a data-testid="share-link" href={shareLink}>{shareLink}</a></p>
    </section>
  </div>
  <div class="tool-main">
    {#if outcome?.status === 'refused'}
      <div class="viewer-refusal" class:dim={stale} data-testid="viewer-refusal" data-code={outcome.code}>
        <p class="warning">{te('refused')} {te(`refuse.${outcome.code}`)}</p>
      </div>
    {:else if figures.length}
      <FigureBoard {figures} {stale} label={t('tools.figures')} />
      <p class="fine">{te(viewerNote(outcome?.status === 'ok' ? outcome.notes : []))}</p>
    {:else}
      <div class="placeholder" aria-busy="true"></div>
    {/if}
    <article class="tool-results rs-prose">
      <h2>{te('results')}</h2>
      <div aria-live="polite">
        {#if outcome?.status === 'refused'}
          <p class="warning" role="alert" data-testid="refusal" data-code={outcome.code}>{te('refused')} {te(`refuse.${outcome.code}`)}{#if outcome.reason}{' '}<span lang="en">({outcome.reason})</span>{/if}</p>
        {:else if outcome?.status === 'ok'}
          {#if outcome.stopped}<p class="warning" role="alert" data-testid="stopped" data-load-factor={outcome.stopped.loadFactor}>{te('stopped').replace('{lambda}', number(outcome.stopped.loadFactor, 3))} <span lang="en">({outcome.stopped.reason})</span></p>{/if}
          <div class="results">
            {#each outcome.readouts as r (r.key)}
              <div class="result" data-testid={`readout-${r.key}`} data-value={r.value}>
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
          <p class="verification" data-testid="certificate" data-status={c.status}>
            {#if c.status === 'certified'}{te('cert.certified')} ({te(`cert.${c.kind}`)}){#if c.bound !== null} · {te(`cert.${c.measure}`)} ≤ <Sci value={c.bound} unit="" />{/if}{#if c.kind === 'timeHistory'}. {te('cert.timeNote')}{/if}
            {:else}{te(`cert.${c.status}`)} {te(`cert.${c.kind}`)}: {te(`cert.code.${c.code}`)}{#if c.reason}{' '}<span lang="en">({c.reason})</span>{/if}{/if}
          </p>
        {/if}
      </div>
      <p>{te(`${id}.about`)}</p>
      {#if example.benchmark}<p>{te('benchmark')}: <PublicLink to={example.benchmark.path}>{te(`${id}.benchmark`)}</PublicLink></p>{/if}
      <p class="fine">{te('notDesign')} {te('publisher')}</p>
    </article>
  </div>
</div>

<style>
  .share { font: .75rem var(--lp-mono); color: var(--fg-2); overflow-wrap: anywhere; margin: .5rem 0 0; }
  .share a { display: block; min-height: 44px; padding: .75rem 0; }
  .viewer-refusal { display: grid; place-items: center start; min-height: 14rem; padding: 1.5rem; border: 1px solid var(--card-hair); border-radius: 6px; background: var(--card); }
  .viewer-refusal .warning { max-width: 36rem; margin: 0; font-size: 1rem; line-height: 1.5; }
  .dim { opacity: .55; }
  .placeholder { min-height: 16rem; border: 1px solid var(--card-hair); border-radius: 6px; background: var(--lp-ink-2); }
</style>
