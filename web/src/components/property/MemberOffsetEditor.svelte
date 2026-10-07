<script lang="ts">
  import { uiStore, modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { shouldEmbedFlat2DModelIn3D } from '../../lib/engine/solver-service';
  import type { MemberOffset } from '../../lib/model/element-3d-metadata';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import QuantityInput from '../pro/loads/QuantityInput.svelte';

  // Analytical member offset editor. Applies a single parallel offset vector to
  // BOTH ends (i = j) — the supported "parallel member offset" case. Works on the
  // selected element(s); batch-applies to a multi-selection. 3D/PRO only.
  //
  // `bare`: inside a card that already names it (Specifications › Members), without its own title
  // and rule, and in the app's tokens rather than the old blue of the property panel.
  let { bare = false }: { bare?: boolean } = $props();

  const is3D = $derived(uiStore.is3DWorkspace);
  const selectedIds = $derived([...uiStore.selectedElements]);
  const count = $derived(selectedIds.length);

  let frame = $state<'local' | 'global'>('local');
  // SI, typed in the display units.
  let ox = $state(0);
  let oy = $state(0);
  let oz = $state(0);

  // Prefill from the single selected element's offset — and RESET when the
  // selection moves to an element without one: stale fields + Apply would
  // silently write the previous member's eccentricity onto this one.
  $effect(() => {
    if (count !== 1) return;
    const e = modelStore.elements.get(selectedIds[0]);
    const vec = e?.offset?.i ?? e?.offset?.j; // editor edits the parallel (i=j) case
    if (e?.offset && vec) {
      frame = e.offset.frame;
      ox = vec.x; oy = vec.y; oz = vec.z;
    } else {
      ox = 0; oy = 0; oz = 0;
    }
  });

  const current = $derived(count === 1 ? modelStore.elements.get(selectedIds[0])?.offset : undefined);

  // The flat-2D embedding never expands offsets (the embedded solve has its
  // own axis convention) — say so instead of promising an analysis effect.
  const embedBlocksOffsets = $derived(shouldEmbedFlat2DModelIn3D({
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
    plates: modelStore.plates, quads: modelStore.quads,
  }));

  function apply() {
    const x = ox, y = oy, z = oz;
    // Invalid input must NOT silently coerce to 0 — all-zeros clears the
    // member's existing offset, so a parse failure would delete data.
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (x === 0 && y === 0 && z === 0) { clear(); return; }
    const offset: MemberOffset = { frame, i: { x, y, z }, j: { x, y, z } };
    if (count === 1) modelStore.setElementOffset(selectedIds[0], offset);
    else modelStore.setElementsOffset(selectedIds, offset);
  }

  function clear() {
    if (count === 1) modelStore.setElementOffset(selectedIds[0], null);
    else modelStore.setElementsOffset(selectedIds, null);
    ox = 0; oy = 0; oz = 0;
  }
</script>

{#if is3D && count > 0}
  <div class="mo" class:bare>
    {#if !bare}<div class="mo-title">{t('pro.memberOffset')} <span class="mo-count">({count})</span></div>{/if}

    <div class="mo-row">
      <label>{t('pro.offsetFrame')}
        <select bind:value={frame}>
          <option value="local">{t('pro.offsetLocal')}</option>
          <option value="global">{t('pro.offsetGlobal')}</option>
        </select>
      </label>
    </div>
    <div class="mo-row mo-vec">
      <label>{frame === 'local' ? 'x∥' : 'X'}<QuantityInput bind:value={ox} quantity="length" cls="mo-num" showUnit={false} /></label>
      <label>{frame === 'local' ? 'y' : 'Y'}<QuantityInput bind:value={oy} quantity="length" cls="mo-num" showUnit={false} /></label>
      <label>{frame === 'local' ? 'z↑' : 'Z'}<QuantityInput bind:value={oz} quantity="length" cls="mo-num" showUnit={false} /></label>
      <span class="mo-unit">{unitQ('length')}</span>
    </div>

    {#if embedBlocksOffsets}
      <div class="mo-warn">{bare ? '' : '⚠ '}{t('pro.offsetEmbedWarn')}</div>
    {/if}
    <div class="mo-actions">
      <button class={bare ? 'pk-btn pk-btn-primary' : 'mo-btn'} onclick={apply} disabled={embedBlocksOffsets}>{t('pro.offsetApply')}</button>
      <button class={bare ? 'pk-btn' : 'mo-btn mo-clear'} onclick={clear} disabled={count === 1 && !current}>{t('pro.offsetClear')}</button>
    </div>

    {#if current}
      <div class="mo-active">{t('pro.offsetActive')}</div>
    {/if}
    <div class="mo-warn">{bare ? '' : '⚠ '}{t('pro.offsetWarn')}</div>
  </div>
{/if}

<style>
  .mo { border-top: 1px solid #1a3050; padding-top: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .mo-title { font-size: 0.78rem; font-weight: 600; color: #4ecdc4; }
  .mo-count { color: #888; font-weight: 400; }
  .mo-row { display: flex; align-items: center; gap: 0.4rem; }
  .mo-row label { font-size: 0.72rem; color: #aaa; display: flex; align-items: center; gap: 4px; }
  .mo-vec :global(input.mo-num) { width: 56px; padding: 3px 5px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ddd; font-family: monospace; font-size: 0.72rem; }
  .mo-vec select, .mo-row select { padding: 3px 5px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ccc; font-size: 0.72rem; }
  .mo-unit { font-size: 0.68rem; color: #777; }
  .mo-actions { display: flex; gap: 6px; }
  .mo-btn { padding: 4px 10px; font-size: 0.72rem; color: #ccc; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; cursor: pointer; }
  .mo-btn:hover { background: #1a4a7a; color: #fff; }
  .mo-clear { color: #ff9b9b; border-color: #5a2a2a; background: transparent; }
  .mo-clear:disabled { opacity: 0.4; cursor: not-allowed; }
  .mo-active { font-size: 0.66rem; color: #4ecdc4; }
  .mo-warn { font-size: 0.66rem; color: #e0a030; font-style: italic; }
  /* In the PRO panel kit: tokens, no rule, the card's own heading. */
  .mo.bare { border-top: none; padding-top: 0; gap: 0.45rem; }
  .mo.bare .mo-row label { font-size: 0.7rem; color: var(--st-text-2); }
  .mo.bare .mo-vec :global(input.mo-num), .mo.bare .mo-row select {
    background: var(--st-surface-3); border: 1px solid var(--st-hair-strong); color: var(--st-text); font-family: var(--st-mono);
  }
  .mo.bare .mo-row select { font-family: var(--st-sans); }
  .mo.bare .mo-unit { color: var(--st-text-3); }
  .mo.bare .mo-active { color: var(--st-value); }
  .mo.bare .mo-warn { color: var(--st-text-3); font-style: normal; font-size: 0.64rem; }
</style>
