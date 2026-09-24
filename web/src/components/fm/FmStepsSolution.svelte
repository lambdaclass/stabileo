<script lang="ts">
  /**
   * Steps 5–9 of the flexibility method: the coefficients, the compatibility
   * system, superposition and the check against the stiffness method.
   *
   * Each coefficient can be opened into its contributions bar by bar, and
   * shows beside it the same number read as a displacement of the primary
   * structure — the two routes the engine computes, side by side, so a reader
   * checking a δ by hand has two things to compare against.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore } from '../../lib/store';
  import type { ForceMethodResult, TermRow } from '../../lib/engine/force-method/solve';
  import MatrixDisplay from '../dsm/MatrixDisplay.svelte';
  import VectorDisplay from '../dsm/VectorDisplay.svelte';
  import MathEquation from '../dsm/MathEquation.svelte';
  import FmSketch from './FmSketch.svelte';
  import { xName, num, componentName, sub, redundantText } from './fm-text';

  let { r, step }: { r: ForceMethodResult; step: number } = $props();

  const n = $derived(r.redundants.length);
  const labels = $derived(r.redundants.map((x) => xName(x.index)));
  const i = $derived(Math.min(fmStepsStore.selectedI, n - 1));
  const j = $derived(Math.min(fmStepsStore.selectedJ, n - 1));

  /** Group a coefficient's terms: one row per bar (bending, axial), then the rest. */
  function grouped(rows: TermRow[]) {
    const perBar = new Map<number, { bending: number; axial: number; thermal: number }>();
    const other: TermRow[] = [];
    for (const row of rows) {
      if (row.elementId !== null && (row.source === 'bending' || row.source === 'axial' || row.source === 'thermal')) {
        const cur = perBar.get(row.elementId) ?? { bending: 0, axial: 0, thermal: 0 };
        cur[row.source] += row.value;
        perBar.set(row.elementId, cur);
      } else other.push(row);
    }
    return { perBar: [...perBar.entries()].sort((a, b) => a[0] - b[0]), other };
  }
  const total = (rows: TermRow[]) => rows.reduce((s, x) => s + x.value, 0);

  const unit = (k: number) => {
    const x = r.redundants[k];
    return x.kind === 'cutM' || (x.kind === 'reaction' && x.component === 2) ? 'kN·m' : 'kN';
  };
  const rotated = (nodeId: number) => r.original.supports.some((s) => s.nodeId === nodeId && s.angle !== undefined);

  /** The largest discrepancy with the stiffness method, as a share of the largest force. */
  const worst = $derived(Math.max(r.verification.maxForceDiff, r.verification.maxReactionDiff));

  const eqDelta = '\\delta_{ij} = \\sum \\int \\frac{m_i\\,m_j}{EI}\\,dx + \\sum \\int \\frac{n_i\\,n_j}{EA}\\,dx';
  const eqDelta0 = '\\delta_{i0} = \\sum \\int \\frac{m_i\\,M_0}{EI}\\,dx + \\sum \\int \\frac{n_i\\,N_0}{EA}\\,dx';
  const eqCompat = '[\\delta]\\,\\{X\\} = \\{\\Delta\\} - \\{\\delta_0\\}';
  const eqSuper = 'M = M_0 + \\sum_i X_i\\, m_i';
  const hasExtras = $derived(r.delta0Terms.some((rows) => rows.some((x) => x.source === 'thermal' || x.source === 'settlement')));
</script>

{#snippet breakdown(rows: TermRow[], check: number, testid: string)}
  {@const g = grouped(rows)}
  <table class="fm-table" data-testid={testid}>
    <thead><tr><th>{t('fm.s3.bar')}</th><th>{t('fm.src.bending')}</th><th>{t('fm.src.axial')}</th>{#if g.perBar.some(([, v]) => v.thermal)}<th>{t('fm.src.thermal')}</th>{/if}</tr></thead>
    <tbody>
      {#each g.perBar as [id, v] (id)}
        <tr><td>{id}</td><td>{num(v.bending, 4)}</td><td>{num(v.axial, 4)}</td>{#if g.perBar.some(([, w]) => w.thermal)}<td>{num(v.thermal, 4)}</td>{/if}</tr>
      {/each}
      {#each g.other as o, k (k)}
        <tr><td colspan="2">{t(`fm.src.${o.source}`)}{o.elementId !== null ? ` (${o.elementId})` : ''}</td><td>{num(o.value, 4)}</td></tr>
      {/each}
      <tr class="fm-sum"><td colspan="2">{t('fm.total')}</td><td>{num(total(rows), 5)}</td></tr>
    </tbody>
  </table>
  <p class="fm-note" data-testid="{testid}-check">{t('fm.s5.check').replace('{v}', num(check, 5))}</p>
{/snippet}

{#if step === 5}
  <p class="fm-exp">{t('fm.s5.explanation')}</p>
  <div class="fm-eq"><MathEquation equation={eqDelta} displayMode /></div>
  <MatrixDisplay matrix={r.delta} rowLabels={labels} colLabels={labels} precision={4} title="[δ]  (m/kN, rad/kN·m…)" />
  <p class="fm-note">{t('fm.s5.symmetry')}</p>
  <p class="fm-note">{t('fm.s5.pick')}</p>
  <div class="fm-pick" role="group">
    {#each r.redundants as a, p (a.index)}
      {#each r.redundants.slice(p) as b, q (b.index)}
        <button class="fm-chip" class:on={i === p && j === p + q}
          onclick={() => fmStepsStore.selectCoefficient(p, p + q)} data-testid="fm-coef-{p + 1}{p + q + 1}">δ{sub(p + 1)}{sub(p + q + 1)}</button>
      {/each}
    {/each}
  </div>
  <h5 class="fm-h">{t('fm.s5.breakdown')} — δ{sub(i + 1)}{sub(j + 1)}</h5>
  {@render breakdown(r.deltaTerms[i][j], r.deltaCheck[i][j], 'fm-delta-terms')}
{:else if step === 6}
  <p class="fm-exp">{t('fm.s6.explanation')}</p>
  <div class="fm-eq"><MathEquation equation={eqDelta0} displayMode /></div>
  {#if hasExtras}<p class="fm-note">{t('fm.s6.extras')}</p>{/if}
  <VectorDisplay vector={r.delta0} labels={r.redundants.map((x) => `δ${sub(x.index)}${sub(0)}`)} precision={4} title={'{δ₀}'} />
  <div class="fm-pick" role="group">
    {#each r.redundants as a, p (a.index)}
      <button class="fm-chip" class:on={i === p} onclick={() => fmStepsStore.selectCoefficient(p, j)}
        data-testid="fm-coef0-{p + 1}">δ{sub(p + 1)}{sub(0)}</button>
    {/each}
  </div>
  <h5 class="fm-h">{t('fm.s5.breakdown')} — δ{sub(i + 1)}{sub(0)}</h5>
  {@render breakdown(r.delta0Terms[i], r.delta0Check[i], 'fm-delta0-terms')}
{:else if step === 7}
  <p class="fm-exp">{t('fm.s7.explanation')}</p>
  <div class="fm-eq"><MathEquation equation={eqCompat} displayMode /></div>
  <h5 class="fm-h">{t('fm.s7.system')}</h5>
  <div class="fm-system" data-testid="fm-system">
    {#each r.redundants as a, p (a.index)}
      <div class="fm-row">
        {#each r.redundants as b, q (b.index)}
          <span>{q > 0 ? (r.delta[p][q] < 0 ? ' − ' : ' + ') : r.delta[p][q] < 0 ? '−' : ''}{num(Math.abs(r.delta[p][q]), 4)}·{xName(b.index)}</span>
        {/each}
        <span>{r.delta0[p] < 0 ? ' − ' : ' + '}{num(Math.abs(r.delta0[p]), 4)}</span>
        <span> = {num(r.prescribed[p], 4)}</span>
      </div>
    {/each}
  </div>
  <h5 class="fm-h">{t('fm.s7.solution')}</h5>
  <table class="fm-table" data-testid="fm-solution">
    <tbody>
      {#each r.redundants as a, p (a.index)}
        <tr><th>{xName(a.index)} <span class="fm-dim">{redundantText(a, r.original)}</span></th><td>{num(r.X[p], 4)} {unit(p)}</td></tr>
      {/each}
    </tbody>
  </table>
{:else if step === 8}
  <p class="fm-exp">{t('fm.s8.explanation')}</p>
  <div class="fm-eq"><MathEquation equation={eqSuper} displayMode /></div>
  <FmSketch geometry={r.original} state={r.final} stateLabel="M" testId="fm-final" />
  <p class="fm-note">{t('fm.s3.drawn')}</p>
  <h5 class="fm-h">{t('fm.s3.reactions')}</h5>
  <table class="fm-table">
    <tbody>
      {#each r.final.reactions.filter((q) => Math.abs(q.value) > 1e-9) as q (q.nodeId + ':' + q.component)}
        <tr><td>{q.nodeId}</td><td>{componentName(q.component, rotated(q.nodeId))}</td><td>{num(q.value)}</td></tr>
      {/each}
    </tbody>
  </table>
  <h5 class="fm-h">{t('fm.s3.endMoments')}</h5>
  <table class="fm-table">
    <thead><tr><th>{t('fm.s3.bar')}</th><th>N i</th><th>M i</th><th>M j</th></tr></thead>
    <tbody>
      {#each r.final.bars as b (b.elementId)}
        <tr><td>{b.elementId}</td><td>{num(b.ends.nStart)}</td><td>{num(b.ends.mStart)}</td><td>{num(b.ends.mEnd)}</td></tr>
      {/each}
    </tbody>
  </table>
{:else if step === 9}
  <p class="fm-exp">{t('fm.s9.explanation')}</p>
  <p class="fm-verdict" class:bad={!r.verification.ok} data-testid="fm-verdict">
    {r.verification.ok
      ? t('fm.s9.ok').replace('{d}', num(worst, 2)).replace('{pct}', `${num((worst / r.verification.scale) * 100, 2)} %`)
      : t('fm.s9.bad').replace('{d}', num(worst, 3))}
  </p>
  <table class="fm-table" data-testid="fm-compare">
    <thead><tr><th>{t('fm.s3.node')}</th><th></th><th>{t('fm.s9.flex')}</th><th>{t('fm.s9.stiff')}</th></tr></thead>
    <tbody>
      {#each r.stiffness.reactions.filter((q) => Math.abs(q.value) > 1e-9) as q (q.nodeId + ':' + q.component)}
        {@const mine = r.final.reactions.find((m) => m.nodeId === q.nodeId && m.component === q.component)}
        <tr><td>{q.nodeId}</td><td>{componentName(q.component, rotated(q.nodeId))}</td><td>{num(mine?.value ?? 0)}</td><td>{num(q.value)}</td></tr>
      {/each}
    </tbody>
  </table>
  <table class="fm-table">
    <thead><tr><th>{t('fm.s3.bar')}</th><th>M i · M j ({t('fm.s9.flex')})</th><th>({t('fm.s9.stiff')})</th></tr></thead>
    <tbody>
      {#each r.stiffness.bars as b (b.elementId)}
        {@const mine = r.final.bars.find((m) => m.elementId === b.elementId)}
        <tr><td>{b.elementId}</td><td>{num(mine?.ends.mStart ?? 0)} · {num(mine?.ends.mEnd ?? 0)}</td><td>{num(b.ends.mStart)} · {num(b.ends.mEnd)}</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .fm-exp { font-size: 0.72rem; line-height: 1.5; color: var(--st-text-2); margin: 0 0 6px; }
  .fm-note { font-size: 0.64rem; line-height: 1.45; color: var(--st-text-3); margin: 2px 0 6px; }
  .fm-dim { color: var(--st-text-3); font-size: 0.6rem; }
  .fm-h { margin: 8px 0 2px; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-text-3); }
  .fm-eq { overflow-x: auto; margin: 2px 0 6px; font-size: 0.8rem; }
  .fm-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; margin-bottom: 4px; }
  .fm-table th { text-align: left; font-weight: 400; color: var(--st-text-3); padding: 2px 6px 2px 0; }
  .fm-table td { text-align: right; padding: 2px 0 2px 8px; color: var(--st-text); white-space: nowrap; }
  .fm-table thead th { text-align: right; font-size: 0.58rem; }
  .fm-table thead th:first-child { text-align: left; }
  .fm-table td:first-child { text-align: left; padding-left: 0; }
  .fm-sum td { border-top: 1px solid var(--st-hair); font-weight: 600; }
  .fm-pick { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .fm-chip {
    padding: 2px 8px; border: 1px solid var(--st-hair); border-radius: 10px; background: transparent;
    color: var(--st-text-3); font-size: 0.66rem; cursor: pointer; font-family: inherit;
  }
  .fm-chip.on { border-color: var(--st-accent); color: var(--st-accent); }
  .fm-system { font-size: 0.66rem; font-variant-numeric: tabular-nums; overflow-x: auto; line-height: 1.7; }
  .fm-row { white-space: nowrap; }
  .fm-verdict { font-size: 0.74rem; color: var(--st-ok); margin: 4px 0 8px; }
  .fm-verdict.bad { color: var(--st-danger); }
</style>
