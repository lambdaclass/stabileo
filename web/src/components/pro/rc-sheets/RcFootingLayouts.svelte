<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { setFoundationSystem } from '../../../lib/store/rc-sheets-footings';
  import type { FoundationLayout } from '../../../lib/rc-sheets/footing-layouts';
  import { FOUNDATION_SYSTEMS, type FoundationSystem } from '../../../lib/rc-sheets/footing-types';
  import { footingPreview } from '../../../lib/store/rc-sheets-footing-preview.svelte';
  import { modelStore } from '../../../lib/store';
  import { designData, patchDesignData } from '../../../lib/store/design-data';
  import { findProfile } from '../../../lib/model/geotechnical';
  import { FOUNDING_RANGE, PRESUMED_BEARING_RANGE, PRESUMED_PILE_RANGE, presumedPileOf, type PileLayer } from '../../../lib/model/design-data';
  import { pileSpec } from '../../../lib/store/rc-sheets-footings';

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
  const pile = $derived.by(() => { void modelStore.designData; return presumedPileOf(designData().presumedPile); });
  const shown = $derived(adopted ?? preview);
  const depth = $derived.by(() => { void modelStore.designData; const z = designData().foundingElevation; return z === undefined ? '' : String(Math.round(-z * 100) / 100); });
  function setDepth(e: Event) {
    const el = e.currentTarget as HTMLInputElement, raw = el.value.trim();
    if (raw === '') { patchDesignData({ foundingElevation: undefined }); return; }
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || -v < FOUNDING_RANGE.min || -v > FOUNDING_RANGE.max || v < 0) { el.value = depth; return; }
    patchDesignData({ foundingElevation: -v });
  }
  const strata = $derived(!!profile?.strata?.length);
  const spec = $derived.by(() => { void modelStore.designData; void modelStore.model.geotechnical; return pileSpec(); });
  const layers = $derived(pile.layers ?? []);
  const setLayers = (next: PileLayer[]) => patchDesignData({ presumedPile: { ...pile, layers: next } });
  function setLayer(i: number, k: keyof PileLayer, e: Event) {
    const el = e.currentTarget as HTMLInputElement, v = Number(el.value.replace(',', '.'));
    const lim = k === 'to' ? [0.1, 200] : k === 'shaft' ? [0, 2000] : [0, 50000];
    if (!Number.isFinite(v) || v < lim[0]! || v > lim[1]!) { el.value = String(layers[i]![k]); return; }
    setLayers(layers.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  }
  const addLayer = () => setLayers([...layers, { to: Math.max(pile.length + 5, (layers.at(-1)?.to ?? 0) + 5), shaft: layers.at(-1)?.shaft ?? 30, tip: layers.at(-1)?.tip ?? 1500 }]);
  const removeLayer = (i: number) => setLayers(layers.filter((_, j) => j !== i));
  function setPile(k: 'diameter' | 'length' | 'capacity', scale: number) {
    return (e: Event) => {
      const el = e.currentTarget as HTMLInputElement, v = Number(el.value) / scale, r = PRESUMED_PILE_RANGE[k];
      if (!Number.isFinite(v) || v < r.min || v > r.max) { el.value = String(pile[k] * scale); return; }
      patchDesignData({ presumedPile: { ...pile, [k]: v } });
    };
  }
</script>

<div class="rfl" data-testid="rc-footing-layouts">
  <div class="rfl-head">
    <span class="rfl-title">{t('rcSheets.foundation.layouts')}</span>
    {#if adopted}
      <span class="rfl-state on" data-testid="rc-foundation-adopted">{t('rcSheets.foundation.adopted')}: {t(`rcSheets.foundation.${adopted}`)}</span>
      <button type="button" class="pk-btn" onclick={() => setFoundationSystem(null)} data-testid="rc-foundation-clear">{t('rcSheets.foundation.clear')}</button>
    {:else}
      <span class="rfl-state" data-testid="rc-foundation-none">{t('rcSheets.foundation.none')}</span>
    {/if}
  </div>
  <div class="rfl-fields">
    <label class="rfl-soil">
      <span>{t('rcSheets.foundation.qadm')}</span>
      <input type="number" min={PRESUMED_BEARING_RANGE.min} max={PRESUMED_BEARING_RANGE.max} step="10" value={qadm} onchange={setQadm} data-testid="rc-foundation-qadm" />
      <span>kPa</span>
      <span class="hint">{profile ? `${t('rcSheets.foundation.qadmProfile')} «${profile.name}»` : t('rcSheets.foundation.qadmPresumed')}</span>
    </label>
    <label class="rfl-soil">
      <span>{t('rcSheets.foundation.depth')}</span>
      <input type="number" min="0" max={-FOUNDING_RANGE.min} step="0.1" value={depth} placeholder={t('rcSheets.foundation.depthAuto')} onchange={setDepth} data-testid="rc-foundation-depth" />
      <span>m</span>
      <span class="hint">{t('rcSheets.foundation.depthHint')}</span>
    </label>
  </div>
  {#if shown === 'piles'}
    <label class="rfl-soil">
      <span>{t('rcSheets.foundation.pile')}</span>
      <span>{t('rcSheets.foundation.pileDiameter')}</span><input type="number" min={PRESUMED_PILE_RANGE.diameter.min * 100} max={PRESUMED_PILE_RANGE.diameter.max * 100} step="5" value={pile.diameter * 100} onchange={setPile('diameter', 100)} data-testid="rc-foundation-pile-diameter" /><span>cm</span>
      <span>{t('rcSheets.foundation.pileLength')}</span><input type="number" min={PRESUMED_PILE_RANGE.length.min} max={PRESUMED_PILE_RANGE.length.max} step="0.5" value={pile.length} onchange={setPile('length', 1)} data-testid="rc-foundation-pile-length" /><span>m</span>
      {#if !strata && !layers.length}<span>{t('rcSheets.foundation.pileCapacity')}</span><input type="number" min={PRESUMED_PILE_RANGE.capacity.min} max={PRESUMED_PILE_RANGE.capacity.max} step="50" value={pile.capacity} onchange={setPile('capacity', 1)} data-testid="rc-foundation-pile-capacity" /><span>kN</span>{/if}
      <span class="hint">{strata ? t('rcSheets.foundation.pileStrata') : layers.length ? '' : t('rcSheets.foundation.pilePresumed')}</span>
    </label>
    {#if !strata}
      <div class="rfl-layers" data-testid="rc-foundation-pile-layers">
        <span class="rfl-sub">{t('rcSheets.foundation.pileLayers')}</span>
        {#each layers as l, i (i)}
          <div class="rfl-soil" data-testid="rc-foundation-pile-layer">
            <span>{t('rcSheets.foundation.pileLayerTo')}</span><input type="number" min="0.1" max="200" step="0.5" value={l.to} onchange={(e) => setLayer(i, 'to', e)} data-testid="rc-foundation-pile-layer-to" /><span>m</span>
            <span>{t('rcSheets.foundation.pileShaft')}</span><input type="number" min="0" max="2000" step="5" value={l.shaft} onchange={(e) => setLayer(i, 'shaft', e)} data-testid="rc-foundation-pile-layer-shaft" /><span>kPa</span>
            <span>{t('rcSheets.foundation.pileTip')}</span><input type="number" min="0" max="50000" step="100" value={l.tip} onchange={(e) => setLayer(i, 'tip', e)} data-testid="rc-foundation-pile-layer-tip" /><span>kPa</span>
            <button type="button" class="pk-btn" onclick={() => removeLayer(i)} data-testid="rc-foundation-pile-layer-remove">{t('rcSheets.foundation.pileRemoveLayer')}</button>
          </div>
        {/each}
        <button type="button" class="pk-btn rfl-compare" onclick={addLayer} data-testid="rc-foundation-pile-add-layer">{t('rcSheets.foundation.pileAddLayer')}</button>
        <span class="hint">{t('rcSheets.foundation.pileLayersHint')}</span>
      </div>
    {/if}
    <span class="rfl-soil" data-testid="rc-foundation-pile-capacity-read">{t('rcSheets.foundation.pileComputed')}: <b>{fmt(spec.capacity, 0)} kN</b></span>
  {/if}
  <table>
    <thead><tr><th>{t('rcSheets.foundation.label')}</th><th class="n">{t('rcSheets.foundation.share')}</th><th class="n">m³</th><th class="n">kg</th><th>{t('rcSheets.foundation.parts')}</th><th class="n">{t('rcSheets.foundation.failing')}</th><th></th></tr></thead>
    <tbody>
      {#each FOUNDATION_SYSTEMS.map((sys) => ({ system: sys, done: layouts.find((x) => x.system === sys) })) as l (l.system)}
        <tr class:sel={shown === l.system} class:pick={!adopted} data-testid="rc-foundation-layout-{l.system}">
          <td>
            {#if adopted}{t(`rcSheets.foundation.${l.system}`)}{:else}<button type="button" class="rfl-name" aria-pressed={shown === l.system} onclick={() => (preview = l.system)} data-testid="rc-foundation-view-{l.system}">{t(`rcSheets.foundation.${l.system}`)}</button>{/if}
            {#if l.system === 'auto'} <span class="rec">{t('rcSheets.foundation.recommended')}</span>{/if}
            {#if adopted === l.system}<span class="tag on" data-testid="rc-foundation-adopted-tag">{t('rcSheets.foundation.adoptedTag')}</span>{:else if !adopted && shown === l.system}<span class="tag" data-testid="rc-foundation-shown-tag">{t('rcSheets.foundation.shownTag')}</span>{/if}
          </td>
          {#if l.done}
            {@const sm = l.done.summary}
            <td class="n">{pct(sm.share)}</td>
            <td class="n">{fmt(sm.concrete, 1)}</td>
            <td class="n">{fmt(sm.steel, 0)}</td>
            <td>{sm.count.footing ? `${sm.count.footing} ${t('rcSheets.foundation.footingsShort')}` : ''}{sm.count.strip ? ` ${sm.count.strip} ${t('rcSheets.footKind.strip')}` : ''}{sm.count.mat ? ` ${sm.count.mat} ${t('rcSheets.footKind.mat')}` : ''}{sm.count.cap ? ` ${sm.count.cap} ${t('rcSheets.footKind.pileCap')}` : ''}</td>
            <td class="n" class:bad={sm.failing > 0}>{sm.failing}{#if sm.needs !== null} <span class="needs" data-testid="rc-foundation-needs-{l.system}">{`qadm ≥ ${fmt(sm.needs, 0)} kPa`}</span>{/if}</td>
          {:else}
            <td class="n pending" colspan="5" data-testid="rc-foundation-pending-{l.system}">{t('rcSheets.foundation.notCompared')}</td>
          {/if}
          <td>{#if adopted !== l.system}<button type="button" class="pk-btn" class:pk-btn-primary={shown === l.system} onclick={() => setFoundationSystem(l.system)} data-testid="rc-foundation-adopt-{l.system}">{t('rcSheets.foundation.adopt')}</button>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if footingPreview.compare}<button type="button" class="pk-btn rfl-compare" onclick={() => (footingPreview.compare = false)} data-testid="rc-foundation-compare-off">{t('rcSheets.foundation.compareOff')}</button>
  {:else if layouts.length < FOUNDATION_SYSTEMS.length}<button type="button" class="pk-btn rfl-compare" onclick={() => (footingPreview.compare = true)} data-testid="rc-foundation-compare">{t('rcSheets.foundation.compareAll')}</button>{/if}
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
  tr.pick { cursor: pointer; }
  tr.pick:hover td { background: color-mix(in srgb, var(--st-accent) 6%, transparent); }
  .rfl-name { padding: 0; border: none; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left; }
  .rfl-name[aria-pressed='true'] { font-weight: 600; }
  .tag { margin-left: 4px; font-size: 0.64rem; padding: 0 4px; border-radius: 3px; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); }
  .tag.on { border-color: var(--st-ok); color: var(--st-ok); }
  .rfl-fields { display: flex; flex-direction: column; gap: 2px; }
  td.pending { text-align: left; color: var(--st-text-3); font-style: italic; }
  .rfl-compare { align-self: flex-start; }
  .rfl-layers { display: flex; flex-direction: column; gap: 2px; margin: 0 0 6px 12px; }
  .rfl-sub { color: var(--st-text-2); }
  .rec { font-size: 0.64rem; color: var(--st-accent); border: 1px solid var(--st-accent); border-radius: 3px; padding: 0 3px; }
  .bad { color: var(--st-danger); font-weight: 600; }
  .needs { font-weight: 400; white-space: nowrap; }
  .hint { margin: 0; color: var(--st-text-3); }
  .rfl-soil { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 4px 0 8px; font-size: 0.78rem; }
  .rfl-soil input { width: 6em; }
</style>
