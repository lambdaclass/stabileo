<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import ParamRow from '../research/shell/ParamRow.svelte';
  import Sci from '../research/shell/Sci.svelte';
  import FigureBoard from './figures/FigureBoard.svelte';
  import { Sketch, boundsOf } from '../examples/draw';
  import { chartFigure, peakOf, type Figure } from './figures/figure';
  import { RESULT, drawStructure, modelSize, structureView } from './figures/structure';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { tBatch as t } from './batch-i18n';
  import { EXAMPLE, FORMULAS, format, formula, valid, workedExamples, type ToolId, type Parameters } from './calculators';
  import { type Warning } from './validity';
  import { solverMessages } from './solver-messages';
  import { liveSolver } from './live-solve';
  import { widen, type Span } from './slider';
  import { prerenderedResult, recordPrerenderedResult } from './prerendered-result';
  import type { calculate } from './solve';

  type Result = Awaited<ReturnType<typeof calculate>>;
  let { id }: { id: ToolId } = $props();
  let p = $state<Parameters>({ ...EXAMPLE });
  let result = $state.raw<Result | null>(null);
  let error = $state('');
  let stale = $state(false);
  let href = $state('');
  const column = $derived(id === 'column-buckling');
  const title = $derived(t(`tools.${id}`));
  const units = { moment: 'kN·m', shear: 'kN', deflection: 'm' };
  const fields = [['length', 'length', 'm', 0.1, 100, true], ['e', 'modulus', 'MPa', 1, 1000000, false], ['i', 'inertia', 'm⁴', 1e-10, 10, false]] as const;
  let spans = $state<Record<'length' | 'load', Span>>({ length: [0.5, 30, 0.1], load: [1, 100, 1] });
  const ends = [[0.5, 'fixedFixed'], [0.7, 'fixedPinned'], [1, 'pinnedPinned'], [2, 'fixedFree']] as const;

  const solver = liveSolver(
    async (values: Parameters) => {
      if (!valid(values)) throw new Error('tools.invalid');
      const { calculate } = await import('./solve');
      return calculate(id, values);
    },
    (outcome, values, superseded) => {
      stale = superseded;
      if (!outcome.ok) {
        error = t(outcome.error instanceof Error && outcome.error.message === 'tools.invalid' ? 'tools.invalid' : 'tools.failed');
        stale = true;
        return;
      }
      error = '';
      result = outcome.value;
      recordPrerenderedResult(id, values, outcome.value);
      void link(outcome.value);
    },
  );
  onDestroy(() => solver.stop());
  async function link(answer: Result) {
    const { editorUrl } = await import('./share');
    if (result === answer) href = editorUrl(answer.model, title);
  }
  $effect(() => {
    const values = { ...p };
    untrack(() => {
      spans = { length: widen(spans.length, values.length), load: widen(spans.load, values.load) };
      const ready = result ? null : prerenderedResult<Result>(id, values);
      if (ready) { result = ready; void link(ready); return; }
      stale = true;
      solver.request(values);
    });
  });

  const warmSolver = () => { void import('../../lib/engine/wasm-solver').then(m => m.initSolver()).catch(() => {}); };
  const number = (n: number, digits = 5) => new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: digits }).format(n);
  const warning = (w: Warning) => Object.entries(w.values ?? {}).reduce((text, [k, v]) => text.replace(`{${k}}`, typeof v === 'number' ? new Intl.NumberFormat(publicI18n.locale, { maximumSignificantDigits: 3, notation: v >= 1e5 ? 'scientific' : 'standard' }).format(v) : v), t(w.key));
  const expression = $derived(id === 'column-buckling' ? 'π²EI/(KL)²' : id === 'cantilever-beam' ? (p.uniform ? 'wL⁴/8EI' : 'Pa²(3L − a)/6EI') : p.uniform ? '5wL⁴/384EI' : p.position === p.length / 2 ? 'PL³/48EI' : 'δ(x)');

  function bucklingView(r: Result) {
    const s = new Sketch();
    const size = modelSize(r.model);
    drawStructure(s, r.model, size * 0.025);
    const shape = (r.buckling!.modes[0].displacements as { nodeId: number; uz: number }[]).map(d => [r.model.nodes.get(d.nodeId)!.x, d.uz] as [number, number]);
    const scale = size * 0.12 / Math.max(...shape.map(v => Math.abs(v[1])), 1e-20);
    s.category = RESULT;
    const drawn = shape.map(([x, v]) => [x, v * scale] as [number, number]);
    s.polyline(drawn);
    const at = peakOf(drawn);
    return { ...s.view('buckling', '', boundsOf(s.xy, 0.08)), peak: { value: r.value, at }, legend: { shape: 'mode' as const } };
  }
  const figures = $derived.by((): Figure[] => {
    if (!result) return [];
    const structure: Figure = { key: 'structure', title: t('tools.fig.structure'), unit: '', sketch: structureView(result.model) };
    if (result.buckling) return [structure, { key: 'buckling', title: t('tools.fig.buckling'), unit: '', peak: { value: result.value, unit: 'kN', label: 'pcr' }, sketch: bucklingView(result) }];
    return [
      structure,
      chartFigure('deflection', t('tools.fig.deflection'), 'm', result.charts.deflection),
      chartFigure('shear', t('tools.fig.shear'), 'kN', result.charts.shear),
      chartFigure('moment', t('tools.fig.moment'), 'kN·m', result.charts.moment),
    ];
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
      <form onsubmit={(event) => event.preventDefault()} onfocusin={warmSolver} onpointerdown={warmSolver}>
        {#each fields as [key, label, unit, min, max, slider] (key)}
          <ParamRow id={key} name={t(`tools.${label}`)} {unit}>
            <input id={key} data-testid={key} type="number" bind:value={p[key]} {min} {max} step="any" required />
          </ParamRow>
          {#if slider}{#key spans.length.join()}<input type="range" data-testid={`slider-${key}`} aria-label={t(`tools.${label}`)} min={spans.length[0]} max={spans.length[1]} step={spans.length[2]} bind:value={p.length} />{/key}{/if}
        {/each}
        {#if column}
          <ParamRow id="ends" name={t('tools.ends')} unit={`K=${p.k}`}>
            <select id="ends" bind:value={p.k}>{#each ends as [k, label] (k)}<option value={k}>{t(`tools.${label}`)}</option>{/each}</select>
          </ParamRow>
        {:else}
          <ParamRow id="load-type" name={t('tools.loadType')}>
            <select id="load-type" bind:value={p.uniform}><option value={true}>{t('tools.uniform')}</option><option value={false}>{t('tools.point')}</option></select>
          </ParamRow>
          <ParamRow id="load" name={t('tools.load')} unit={p.uniform ? 'kN/m' : 'kN'}>
            <input id="load" data-testid="load" type="number" bind:value={p.load} min="0.000001" max="1000000" step="any" required />
          </ParamRow>
          {#key spans.load.join()}<input type="range" data-testid="slider-load" aria-label={t('tools.load')} min={spans.load[0]} max={spans.load[1]} step={spans.load[2]} bind:value={p.load} />{/key}
          {#if !p.uniform}
            <ParamRow id="position" name={t('tools.position')} unit="m"><input id="position" data-testid="position" type="number" bind:value={p.position} min="0" max={p.length} step="any" required /></ParamRow>
            <input type="range" data-testid="slider-position" aria-label={t('tools.position')} min="0" max={p.length} step={p.length / 100} bind:value={p.position} />
          {/if}
        {/if}
      </form>
      <p class="status" role="status">{#if stale && !error}{t('tools.loading')}{/if}</p>
      {#if error}<p class="warning" role="alert">{error}</p>{/if}
    </section>
  </div>
  <div class="tool-main">
    {#if figures.length}<FigureBoard {figures} stale={stale || !!error} label={t('tools.figures')} />{/if}
    <article class="tool-results rs-prose" class:stale aria-busy={stale} data-testid="tool-results">
      <div aria-live="polite">
        {#if result && !error}
          {#each result.warnings as w, k (k)}<p class="warning" role="alert" data-testid="validity-warning">{warning(w)}</p>{/each}
          <div class="results">
            <div class="result"><span>{t(column ? 'tools.critical' : 'tools.deflection')}</span><strong data-testid="engine-value">{number(result.value)} <small>{column ? 'kN' : 'm'}</small></strong>
              {#if !column && !result.absolute}<span>{t('tools.at')} x = {number(result.x)} m</span>{/if}
            </div>
            {#if column}
              <div class="result"><span>{t('tools.effectiveLength')}</span><strong>{number(p.k * p.length)} <small>m</small></strong><span>K = {number(p.k)}</span></div>
            {:else}
              {#each ['shear', 'moment'] as key (key)}
                {@const metric = key as keyof typeof units}
                <div class="result"><span>{t(`tools.${key}`)}</span><strong>{number(Math.abs(result.maxima[metric][1]))} <small>{units[metric]}</small></strong><span>{t('tools.at')} x = {number(result.maxima[metric][0])} m</span></div>
              {/each}
            {/if}
          </div>
          <p class="verification" data-testid="agreement" data-difference={result.difference} data-absolute={result.absolute}>{t('tools.comparison')}: {expression} · {#if result.absolute}{t('tools.absoluteDifference')} <Sci value={result.difference} unit="m" />{:else}{t('tools.difference')} <Sci value={result.difference * 100} unit="%" />{/if}</p>
          <a class="btn btn-primary open-editor" href={href}>{t('tools.open')} ↗</a>
          {#each solverMessages([...(result.linear.structuredDiagnostics ?? []), ...(result.buckling?.structuredDiagnostics ?? [])], t) as message, k (k)}<p class="warning" role="alert">{message}</p>{/each}
        {/if}
      </div>
      <h2>{t('tools.assumptionsTitle')}</h2>
      <p>{t('tools.assumptions')}</p>
      {#if column}<p>{t('tools.bucklingNote')}</p><p>{t('tools.modeNote')}</p><p>{t('tools.columnNote')}</p>{:else}<p>{t('tools.signConvention')}</p>{/if}
      <h2>{t('tools.formula')}</h2><p class="formula" translate="no">{FORMULAS[id]}</p>
      <h2>{t('tools.example')}</h2>
      <p>L = {number(EXAMPLE.length)} m; E = {number(EXAMPLE.e, 10)} MPa; I = {number(EXAMPLE.i)} m⁴; EI = {number(EXAMPLE.e * 1000 * EXAMPLE.i, 10)} kN·m²</p>
      {#each workedExamples(id) as example, k (k)}
        <p data-testid="worked-example" data-value={format(formula(id, example).value)}>
          {#if column}K = {number(example.k)}{:else}{t(example.uniform ? 'tools.uniform' : 'tools.point')}: {example.uniform ? 'w' : 'P'} = {number(example.load)} {example.uniform ? 'kN/m' : 'kN'}{#if !example.uniform}; a = {number(example.position)} m{/if}{/if}
          → {column ? 'Pcr' : 'δmax'} = {number(formula(id, example).value, 10)} {column ? 'kN' : 'm'}
        </p>
      {/each}
      <h2>{t('tools.references')}</h2>
      <p>{t('tools.referenceBooks')}</p>
      <details><summary>{t('tools.technical')}</summary>
        <p>{t('tools.solverNote')}</p>
        {#if result}<p>{t('tools.dofs')}: {result.model.nodes.size * 3}</p><p>{t('tools.residualNote')}: <Sci value={result.residual} unit="kN" /></p>{/if}
      </details>
    </article>
  </div>
</div>
