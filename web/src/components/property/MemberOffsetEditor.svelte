<script lang="ts">
  import { uiStore, modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import type { MemberOffset } from '../../lib/model/element-3d-metadata';

  // Analytical member offset editor. Applies a single parallel offset vector to
  // BOTH ends (i = j) — the supported "parallel member offset" case. Works on the
  // selected element(s); batch-applies to a multi-selection. 3D/PRO only.

  const is3D = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');
  const selectedIds = $derived([...uiStore.selectedElements]);
  const count = $derived(selectedIds.length);

  let frame = $state<'local' | 'global'>('local');
  let ox = $state('0');
  let oy = $state('0');
  let oz = $state('0');

  // Prefill from the single selected element's offset (if any).
  $effect(() => {
    if (count === 1) {
      const e = modelStore.elements.get(selectedIds[0]);
      const off = e?.offset;
      if (off && off.i) {
        frame = off.frame;
        ox = String(off.i.x); oy = String(off.i.y); oz = String(off.i.z);
      }
    }
  });

  const current = $derived(count === 1 ? modelStore.elements.get(selectedIds[0])?.offset : undefined);

  function apply() {
    const x = parseFloat(ox) || 0, y = parseFloat(oy) || 0, z = parseFloat(oz) || 0;
    if (x === 0 && y === 0 && z === 0) { clear(); return; }
    const offset: MemberOffset = { frame, i: { x, y, z }, j: { x, y, z } };
    if (count === 1) modelStore.setElementOffset(selectedIds[0], offset);
    else modelStore.setElementsOffset(selectedIds, offset);
  }

  function clear() {
    if (count === 1) modelStore.setElementOffset(selectedIds[0], null);
    else modelStore.setElementsOffset(selectedIds, null);
    ox = '0'; oy = '0'; oz = '0';
  }
</script>

{#if is3D && count > 0}
  <div class="mo">
    <div class="mo-title">{t('pro.memberOffset')} <span class="mo-count">({count})</span></div>

    <div class="mo-row">
      <label>{t('pro.offsetFrame')}
        <select bind:value={frame}>
          <option value="local">{t('pro.offsetLocal')}</option>
          <option value="global">{t('pro.offsetGlobal')}</option>
        </select>
      </label>
    </div>
    <div class="mo-row mo-vec">
      <label>{frame === 'local' ? 'x∥' : 'X'}<input type="number" step="any" bind:value={ox} /></label>
      <label>{frame === 'local' ? 'y' : 'Y'}<input type="number" step="any" bind:value={oy} /></label>
      <label>{frame === 'local' ? 'z↑' : 'Z'}<input type="number" step="any" bind:value={oz} /></label>
      <span class="mo-unit">m</span>
    </div>

    <div class="mo-actions">
      <button class="mo-btn" onclick={apply}>{t('pro.offsetApply')}</button>
      <button class="mo-btn mo-clear" onclick={clear} disabled={count === 1 && !current}>{t('pro.offsetClear')}</button>
    </div>

    {#if current}
      <div class="mo-active">{t('pro.offsetActive')}</div>
    {/if}
    <div class="mo-warn">⚠ {t('pro.offsetWarn')}</div>
  </div>
{/if}

<style>
  .mo { border-top: 1px solid #1a3050; padding-top: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .mo-title { font-size: 0.78rem; font-weight: 600; color: #4ecdc4; }
  .mo-count { color: #888; font-weight: 400; }
  .mo-row { display: flex; align-items: center; gap: 0.4rem; }
  .mo-row label { font-size: 0.72rem; color: #aaa; display: flex; align-items: center; gap: 4px; }
  .mo-vec input { width: 56px; padding: 3px 5px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ddd; font-family: monospace; font-size: 0.72rem; }
  .mo-vec select, .mo-row select { padding: 3px 5px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ccc; font-size: 0.72rem; }
  .mo-unit { font-size: 0.68rem; color: #777; }
  .mo-actions { display: flex; gap: 6px; }
  .mo-btn { padding: 4px 10px; font-size: 0.72rem; color: #ccc; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; cursor: pointer; }
  .mo-btn:hover { background: #1a4a7a; color: #fff; }
  .mo-clear { color: #ff9b9b; border-color: #5a2a2a; background: transparent; }
  .mo-clear:disabled { opacity: 0.4; cursor: not-allowed; }
  .mo-active { font-size: 0.66rem; color: #4ecdc4; }
  .mo-warn { font-size: 0.66rem; color: #e0a030; font-style: italic; }
</style>
