<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { setFoundationSystem } from '../../../lib/store/rc-sheets-footings';
  import type { FoundationLayout } from '../../../lib/rc-sheets/footing-layouts';
  import type { FoundationSystem } from '../../../lib/rc-sheets/footing-types';
  import { modelStore } from '../../../lib/store';
  import { designData, patchDesignData } from '../../../lib/store/design-data';
  import { findProfile } from '../../../lib/model/geotechnical';
  import { PRESUMED_BEARING_RANGE } from '../../../lib/model/design-data';

  let { layouts, adopted, preview = $bindable() }: { layouts: readonly FoundationLayout[]; adopted: FoundationSystem | null; preview: FoundationSystem } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const pct = (v: number | null) => (v === null ? '—' : `${fmt(v * 100, 0)} %`);
  const profile = $derived.by(() => {
    const geo = modelStore.model.geotechnical;
    const p = findProfile(geo, geo?.defaultProfileId ?? null);
    return p && p.bearing.kind === 'allowablePressure' && p.bearing.allowableBearingKPa > 0 ? p : null;
  });
  const qadm = $derived.by(() => { void modelStore.designData; return profile && profile.bearing.kind === 'allowablePressure' ? profile.bearing.allowableBearingKPa : designData().presumedBearingKPa; });
  function setQadm(e: Event) {
    const el = e.currentTarget as HTMLInputElement, v = Number(el.value);
    if (!Number.isFinite(v) || v < PRESUMED_BEARING_RANGE.min || v > PRESUMED_BEARING_RANGE.max) { el.value = String(qadm); return; }
    if (profile && profile.bearing.kind === 'allowablePressure') modelStore.updateSoilProfile(profile.id, { bearing: { ...profile.bearing, allowableBearingKPa: v } });
    else patchDesignData({ presumedBearingKPa: v });
  }
</script>

<div class="rfl" data-testid="rc-footing-layouts">
  <div class="rfl-head">
    <span class="rfl-title">{t('rcSheets.foundation.layouts')}</span>
    {#if adopted}
      <span class="rfl-state on" data-testid="rc-foundation-adopted">{t('rcSheets.foundation.adopted')}: {t(`rcSheets.foundation.${adopted}`)}</span>
      <button type="button" class="rcs-btn" onclick={() => setFoundationSystem(null)} data-testid="rc-foundation-clear">{t('rcSheets.foundation.clear')}</button>
    {:else}
      <span class="rfl-state" data-testid="rc-foundation-none">{t('rcSheets.foundation.none')}</span>
    {/if}
  </div>
  <label class="rfl-soil">
    <span>{t('rcSheets.foundation.qadm')}</span>
    <input type="number" min={PRESUMED_BEARING_RANGE.min} max={PRESUMED_BEARING_RANGE.max} step="10" value={qadm} onchange={setQadm} data-testid="rc-foundation-qadm" />
    <span>kPa</span>
    <span class="hint">{profile ? `${t('rcSheets.foundation.qadmProfile')} «${profile.name}»` : t('rcSheets.foundation.qadmPresumed')}</span>
  </label>
  <table>
    <thead><tr><th></th><th>{t('rcSheets.foundation.label')}</th><th class="n">{t('rcSheets.foundation.share')}</th><th class="n">m³</th><th class="n">kg</th><th>{t('rcSheets.foundation.parts')}</th><th class="n">{t('rcSheets.foundation.failing')}</th><th></th></tr></thead>
    <tbody>
      {#each layouts as l (l.system)}
        <tr class:sel={(adopted ?? preview) === l.system} data-testid="rc-foundation-layout-{l.system}">
          <td><input type="radio" name="rc-foundation-preview" checked={(adopted ?? preview) === l.system} disabled={!!adopted} onchange={() => (preview = l.system)} aria-label={t(`rcSheets.foundation.${l.system}`)} /></td>
          <td>{t(`rcSheets.foundation.${l.system}`)}{#if l.system === 'auto'} <span class="rec">{t('rcSheets.foundation.recommended')}</span>{/if}</td>
          <td class="n">{pct(l.summary.share)}</td>
          <td class="n">{fmt(l.summary.concrete, 1)}</td>
          <td class="n">{fmt(l.summary.steel, 0)}</td>
          <td>{l.summary.count.footing ? `${l.summary.count.footing} ${t('rcSheets.foundation.footingsShort')}` : ''}{l.summary.count.strip ? ` ${l.summary.count.strip} ${t('rcSheets.footKind.strip')}` : ''}{l.summary.count.mat ? ` ${l.summary.count.mat} ${t('rcSheets.footKind.mat')}` : ''}</td>
          <td class="n" class:bad={l.summary.failing > 0}>{l.summary.failing}{#if l.summary.needs !== null} <span class="needs" data-testid="rc-foundation-needs-{l.system}">{`qadm ≥ ${fmt(l.summary.needs, 0)} kPa`}</span>{/if}</td>
          <td>{#if adopted !== l.system}<button type="button" class="rcs-btn" onclick={() => setFoundationSystem(l.system)} data-testid="rc-foundation-adopt-{l.system}">{t('rcSheets.foundation.adopt')}</button>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if layouts.some((l) => l.summary.needs !== null)}<p class="hint">{t('rcSheets.foundation.needsHint')}</p>{/if}
  {#if !adopted}<p class="hint">{t('rcSheets.foundation.noneHint')}</p>{/if}
</div>

<style>
  .rfl { display: flex; flex-direction: column; gap: 4px; margin: 4px 0 8px; font-size: 0.72rem; }
  .rfl-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .rfl-title { font-weight: 600; color: var(--st-text-2); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.66rem; }
  .rfl-state { color: var(--st-warn); }
  .rfl-state.on { color: var(--st-ok); }
  table { border-collapse: collapse; }
  th, td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); text-align: left; }
  th.n, td.n { text-align: right; font-variant-numeric: tabular-nums; }
  tr.sel td { background: color-mix(in srgb, var(--st-accent) 10%, transparent); }
  .rec { font-size: 0.64rem; color: var(--st-accent); border: 1px solid var(--st-accent); border-radius: 3px; padding: 0 3px; }
  .bad { color: var(--st-danger); font-weight: 600; }
  .needs { font-weight: 400; white-space: nowrap; }
  .hint { margin: 0; color: var(--st-text-3); }
  .rcs-btn { font-size: 0.7rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 1px 6px; cursor: pointer; }
  .rfl-soil { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0 8px; font-size: 0.78rem; }
  .rfl-soil input { width: 6em; }
</style>
