<script lang="ts">
  /**
   * A steel member's sheet: the profile, its length and weight, and every check with its clause,
   * demand, capacity, ratio and combination; a check opens to its working, line by line, as the
   * checker wrote it. The member's state stays the experimental one of every metallic result.
   *
   * The same sheet shows the members of the other materials (timber, aluminium, cold-formed,
   * composite) from their own rows (`store/material-check.svelte.ts`): pass `rows` and `elementId`.
   */
  import type { CheckRow } from '../../../../lib/design-contract';
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { steelCheckRows } from '../../../../lib/engine/design/check-rows';
  import type { SteelVerification } from '../../../../lib/engine/codes/argentina/cirsoc301';

  let { v, rows: given, elementId, note }: { v?: SteelVerification; rows?: CheckRow[]; elementId?: number; note?: string } = $props();
  const rows = $derived(given ?? (v ? steelCheckRows(v) : []));
  const e = $derived(modelStore.elements.get(v?.elementId ?? elementId ?? -1));
  const sec = $derived(e ? modelStore.sections.get(e.sectionId) : undefined);
  const mat = $derived(e ? modelStore.materials.get(e.materialId) : undefined);
  const len = $derived.by(() => {
    const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
  });
  // kg: A (m²) × L × ρ (kN/m³ → kg via g).
  const kg = $derived(sec?.a ? (sec.a * len * ((mat as { rho?: number } | undefined)?.rho ?? 77)) / 9.80665 * 1000 : 0);
  let open = $state<number | null>(null);
  const worst = $derived(Math.max(...rows.map((r) => r.ratio ?? 0)));
  const clauseKey = (c?: string) => `steel.sheet.check.${(c ?? '').replace(/[^A-Za-z0-9]/g, '')}`;
  const label = (r: CheckRow) => (given ? (r.titleKey ? t(r.titleKey) : r.title) : t(clauseKey(r.clause)));
</script>

<div class="sms" data-testid={given ? 'member-rows-sheet' : 'steel-member-sheet'}>
{#if v?.fabrication?.basis === 'undeclared'}<p class="sms-head" data-testid="steel-sheet-fabrication">{tp('steel.sheet.fabricationUndeclared', { rolled: v.fabrication.rolled.ratio.toFixed(2), welded: v.fabrication.welded.ratio.toFixed(2), shown: t(`steel.fabrication.${v.fabrication.governs}`) })}</p>{/if}
{#if v?.loadHeight?.basis === 'undeclared'}<p class="sms-head" data-testid="steel-sheet-load-height">{v.loadHeight.web ? tp('steel.sheet.loadHeightBoth', { top: v.loadHeight.top.ratio.toFixed(2), web: v.loadHeight.web.ratio.toFixed(2) }) : tp('steel.sheet.loadHeightTop', { top: v.loadHeight.top.ratio.toFixed(2) })}</p>{/if}
{#if e}<p class="sms-head">{sec?.name ?? '—'} · {tp('steel.sheet.lengthWeight', { l: len.toFixed(2), kg: kg.toFixed(1) })} · {tp('steel.sheet.worst', { r: worst.toFixed(2) })}</p>{/if}
  <table class="sms-t">
    <thead><tr><th>{t('steel.sheet.check')}</th><th>{t('steel.sheet.clause')}</th><th class="num">{t('steel.sheet.demand')}</th><th class="num">{t('steel.sheet.capacity')}</th><th class="num">η</th></tr></thead>
    <tbody>
      {#each rows as r, i (i)}
        <tr class:bad={(r.ratio ?? 0) > 1} class:on={open === i} onclick={() => (open = open === i ? null : i)} data-testid="steel-sheet-row-{i}">
          <td><button class="sms-row" aria-expanded={open === i}>{label(r)}</button>{#if r.combination}<span class="sms-c"> · {r.combination}</span>{/if}</td>
          <td>{r.clause}</td>
          <td class="num">{r.demand !== undefined ? `${r.demand.toFixed(1)} ${r.unit ?? ''}` : ''}</td>
          <td class="num">{r.capacity !== undefined ? `${r.capacity.toFixed(1)} ${r.unit ?? ''}` : ''}</td>
          <td class="num">{r.ratio !== null ? r.ratio.toFixed(2) : '—'}</td>
        </tr>
        {#if open === i && r.derivation?.length}
          <tr class="sms-d"><td colspan="5"><pre data-testid="steel-sheet-derivation">{r.derivation.join('\n')}</pre></td></tr>
        {/if}
      {/each}
    </tbody>
  </table>
  <p class="sms-note">{note ?? t('steel.sheet.note')}</p>
</div>

<style>
  .sms { font-size: 0.7rem; }
  .sms-head { margin: 0 0 4px; color: var(--st-text-2); }
  .sms-t { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  .sms-t th, .sms-t td { padding: 1px 4px; border-top: 1px solid var(--st-hair); text-align: left; font-weight: 400; }
  .sms-t .num { text-align: right; }
  .sms-t tr.bad td { color: var(--st-danger); }
  .sms-t tr.on td { background: var(--st-surface-3); }
  .sms-row { background: none; border: none; color: inherit; font: inherit; padding: 0; cursor: pointer; text-align: left; }
  .sms-row:focus-visible { outline: 2px solid var(--st-value); }
  .sms-c { color: var(--st-text-3); }
  .sms-d pre { margin: 2px 0; white-space: pre-wrap; font-size: 0.64rem; color: var(--st-text-2); }
  .sms-note { color: var(--st-text-3); font-size: 0.64rem; margin: 4px 0 0; }
</style>
