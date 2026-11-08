<script lang="ts">
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { createCircularPlate } from '../../../lib/store/physical-plates';
  import { drawState } from '../../../lib/store/draw-state.svelte';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import Hint from '../Hint.svelte';

  let center = $state('0; 0; 0'), radius = $state(3);
  let withHole = $state(false), holeCenter = $state('0; 0; 0'), holeRadius = $state(0.5);
  const point = (s: string): [number, number, number] | null => {
    const v = s.split(/[;\s]+/).filter(Boolean).map(Number);
    return v.length === 3 && v.every(Number.isFinite) ? [v[0]!, v[1]!, v[2]!] : null;
  };

  function create() {
    const c = point(center), h = point(holeCenter);
    if (!c || (withHole && !h)) { uiStore.toast(t('plates.circle.invalid'), 'error'); return; }
    const r = createCircularPlate({ center: c, radius, ...(withHole ? { hole: { center: h!, radius: holeRadius } } : {}), materialId: drawState.plateMaterialId, thickness: drawState.plateThickness });
    if ('problem' in r) { uiStore.toast(t('plates.circle.invalid'), 'error'); return; }
    uiStore.shellPickScope = 'plate';
    uiStore.selectPlates([r.id]);
    uiStore.toast(tp('plates.circle.created', { name: modelStore.model.groups.get(r.id)?.name ?? '' }), 'success');
  }
</script>

<div class="cp" data-testid="plate-circle">
  <label>{t('plates.circle.center')} <input bind:value={center} placeholder="x; y; z" data-testid="plate-circle-center" /></label>
  <label>{t('plates.circle.radius')} <QuantityInput min={0.01} bind:value={radius} quantity="length" cls="cp-num" testid="plate-circle-radius" /></label>
  <label class="cp-check"><input type="checkbox" bind:checked={withHole} data-testid="plate-circle-hole" /> {t('plates.circle.hole')}</label>
  {#if withHole}
    <label>{t('plates.circle.holeCenter')} <input bind:value={holeCenter} placeholder="x; y; z" data-testid="plate-circle-hole-center" /></label>
    <label>{t('plates.circle.holeRadius')} <QuantityInput min={0.01} bind:value={holeRadius} quantity="length" cls="cp-num" testid="plate-circle-hole-radius" /></label>
  {/if}
  <button class="pro-btn" onclick={create} data-testid="plate-circle-create">{t('plates.circle.create')}</button>
  <Hint text={t('plates.circle.hint')} />
</div>

<style>
  .cp { display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem; color: var(--st-text-2); }
  .cp label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .cp input:not([type='checkbox']) { width: 120px; }
  .cp-check { justify-content: flex-start !important; }
</style>
