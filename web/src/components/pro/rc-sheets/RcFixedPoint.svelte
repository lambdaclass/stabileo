<script lang="ts">
  /** A column's fixed point, chosen for its whole stack: the point of the section the storeys above keep. */
  import { t } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { fixedPointKind, setFixedPoint } from '../../../lib/store/rc-structure-plan';
  import { FIXED_POINT_KINDS, stackKey, type FixedPointKind } from '../../../lib/rc-sheets/fixed-points';
  import type { ColumnRow } from '../../../lib/rc-sheets/column-row';

  let { row }: { row: ColumnRow } = $props();
  const stack = $derived.by(() => { const n = row.demand.nodes?.bottom, p = n !== undefined ? modelStore.nodes.get(n) : undefined; return p ? stackKey([p.x, p.y]) : null; });
  const kind = $derived(stack ? fixedPointKind(stack) : 'c');
</script>

{#if stack}
  <label class="rfp" title={t('rcSheets.fixed.hint')} data-testid="rc-fixed-point">
    <span>{t('rcSheets.fixed.title')}</span>
    <select value={kind} onchange={(e) => setFixedPoint(stack, e.currentTarget.value as FixedPointKind)} data-testid="rc-fixed-point-select">
      {#each FIXED_POINT_KINDS as k (k)}<option value={k}>{t(`rcSheets.fixed.kind.${k}`)}</option>{/each}
    </select>
  </label>
{/if}

<style>
  .rfp { display: inline-flex; gap: 6px; align-items: center; font-size: 0.72rem; margin: 2px 0 6px; }
</style>
