<script lang="ts">
  /**
   * The bielas and springs of one coefficient, written as the classroom
   * writes them: a table of nᵢ·nⱼ·L/EA per biela and of rᵢ·rⱼ/k per spring,
   * with the redundant's own term (a cut biela's L/EA, a released spring's
   * 1/k) marked as such.
   */
  import { t } from '../../lib/i18n';
  import type { TermRow } from '../../lib/engine/force-method/solve';
  import { num, sub } from './fm-text';

  let { rows, i, j }: { rows: TermRow[]; i: number; j: number | 0 } = $props();

  const bielas = $derived(rows.filter((r) => r.detail?.biela));
  const springs = $derived(rows.filter((r) => r.source === 'spring' && r.detail));
  const bi = $derived(`n${sub(i)}`);
  const bj = $derived(j === 0 ? `N${sub(0)}` : `n${sub(j)}`);
  const ri = $derived(`r${sub(i)}`);
  const rj = $derived(j === 0 ? `R${sub(0)}` : `r${sub(j)}`);
  const comp = (c: number | undefined) => (c === 2 ? 'M' : c === 0 ? 'Rx' : 'Rz');
  const total = (xs: TermRow[]) => xs.reduce((s, x) => s + x.value, 0);
</script>

{#if bielas.length}
  <h5 class="fc-h">{t('course.statics.fm.terms.bielas')}</h5>
  <div class="fc-scroll">
    <table class="fc-table" data-testid="fm-biela-terms">
      <thead><tr><th>{t('fm.s3.bar')}</th><th>{bi}</th><th>{bj}</th><th>L</th><th>EA</th><th>{bi}·{bj}·L/EA</th></tr></thead>
      <tbody>
        {#each bielas as b, k (k)}
          <tr class:fc-own={b.source === 'bar'}>
            <td>{b.elementId}{b.source === 'bar' ? ` (${t('course.statics.fm.terms.redundant')})` : ''}</td>
            <td>{num(b.detail!.a ?? 0)}</td><td>{num(b.detail!.b ?? 0)}</td><td>{num(b.detail!.L ?? 0)}</td>
            <td>{num(b.detail!.EA ?? 0)}</td><td>{num(b.value, 4)}</td>
          </tr>
        {/each}
        <tr class="fc-sum"><td colspan="5">Σ</td><td>{num(total(bielas), 4)}</td></tr>
      </tbody>
    </table>
  </div>
  <p class="fc-note">{t('course.statics.fm.terms.bielasWhy')}</p>
  {#if bielas.some((b) => b.source === 'bar')}<p class="fc-note">{t('course.statics.fm.terms.bielaRedundant')}</p>{/if}
{/if}

{#if springs.length}
  <h5 class="fc-h">{t('course.statics.fm.terms.springs')}</h5>
  <div class="fc-scroll">
    <table class="fc-table" data-testid="fm-spring-terms">
      <thead><tr><th>{t('fm.s3.node')}</th><th></th><th>{ri}</th><th>{rj}</th><th>k</th><th>{ri}·{rj}/k</th></tr></thead>
      <tbody>
        {#each springs as s, k (k)}
          <tr class:fc-own={s.detail!.released}>
            <td>{s.detail!.nodeId}{s.detail!.released ? ` (${t('course.statics.fm.terms.redundant')})` : ''}</td><td>{comp(s.detail!.component)}</td>
            <td>{num(s.detail!.a ?? 0)}</td><td>{num(s.detail!.b ?? 0)}</td><td>{num(s.detail!.k ?? 0)}</td><td>{num(s.value, 4)}</td>
          </tr>
        {/each}
        <tr class="fc-sum"><td colspan="5">Σ</td><td>{num(total(springs), 4)}</td></tr>
      </tbody>
    </table>
  </div>
  <p class="fc-note">{t('course.statics.fm.terms.springsWhy')}</p>
  {#if springs.some((s) => s.detail!.released)}<p class="fc-note">{t('course.statics.fm.terms.springRedundant')}</p>{/if}
{/if}

<style>
  .fc-h { margin: 8px 0 2px; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-text-3); }
  .fc-scroll { overflow-x: auto; }
  .fc-table { width: 100%; border-collapse: collapse; font-size: 0.64rem; font-variant-numeric: tabular-nums; }
  .fc-table th { text-align: right; font-weight: 400; color: var(--st-text-3); padding: 2px 0 2px 6px; font-size: 0.58rem; white-space: nowrap; }
  .fc-table th:first-child, .fc-table td:first-child { text-align: left; padding-left: 0; }
  .fc-table td { text-align: right; padding: 2px 0 2px 6px; color: var(--st-text); white-space: nowrap; }
  .fc-own td { color: var(--st-accent); }
  .fc-sum td { border-top: 1px solid var(--st-hair); font-weight: 600; }
  .fc-note { font-size: 0.64rem; line-height: 1.45; color: var(--st-text-3); margin: 2px 0 6px; }
</style>
