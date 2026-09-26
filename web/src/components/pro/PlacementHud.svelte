<script lang="ts">
  /**
   * The placement bar over the viewport: what is being placed, where the anchor will land, the
   * welds it will make, typed coordinates, and the keys. While it is up, the keyboard belongs to
   * the placement: R, Shift+R, F, Tab, Enter and Esc drive it, camera keys still move the view,
   * and every other shortcut (undo included) is held back, because nothing is in the model yet.
   */
  import { placementStore } from '../../lib/store/placement.svelte';
  import { t, tp } from '../../lib/i18n';
  import { untrack } from 'svelte';

  const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
  let tx = $state(''), ty = $state(''), tz = $state('');
  let typing = $state(false);

  const preview = $derived.by(() => { void placementStore.revision; return placementStore.mergePreview(); });

  // The fields follow the pointer until the user types in one; from then on they hold what was
  // typed, until the placement ends.
  $effect(() => {
    void placementStore.revision;
    if (!placementStore.active) { untrack(() => { typing = false; }); return; }
    if (untrack(() => typing)) return;
    const p = placementStore.target;
    tx = fmt(p[0]); ty = fmt(p[1]); tz = fmt(p[2]);
  });

  const num = (s: string) => Number(s.replace(',', '.'));
  const typed = $derived.by((): [number, number, number] | null => {
    const v = [num(tx), num(ty), num(tz)];
    return v.every(Number.isFinite) ? (v as [number, number, number]) : null;
  });

  const CAMERA_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift', 'Control', 'Meta', 'Alt']);

  function onKey(e: KeyboardEvent) {
    if (!placementStore.active) return;
    const inField = (e.target as HTMLElement)?.closest?.('[data-placement-hud]') && (e.target as HTMLElement).tagName === 'INPUT';
    const k = e.key;
    const hold = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (k === 'Escape') { hold(); placementStore.cancel(); return; }
    if (k === 'Enter') {
      hold();
      if (inField && typed) placementStore.commitAt(typed, e.shiftKey);
      else placementStore.commit(e.shiftKey);
      return;
    }
    if (k === 'Tab' && !inField) { hold(); placementStore.cycleAnchor(e.shiftKey ? -1 : 1); return; }
    if (inField) return;
    if (!e.ctrlKey && !e.metaKey && (k === 'r' || k === 'R')) { hold(); placementStore.rotate(e.shiftKey ? -90 : 90); return; }
    if (!e.ctrlKey && !e.metaKey && (k === 'f' || k === 'F')) { hold(); placementStore.mirror(); return; }
    if (CAMERA_KEYS.has(k) && !e.ctrlKey && !e.metaKey) return;
    hold();
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if placementStore.active}
  <div class="ph" data-placement-hud data-testid="placement-hud" role="toolbar" aria-label={t('placement.title')}>
    <div class="ph-head">
      <span class="ph-title">{placementStore.label}</span>
      <span class="ph-target" data-testid="placement-target">{placementStore.targetLabel}</span>
    </div>
    <div class="ph-row">
      <span data-testid="placement-anchor">{tp('placement.anchor', { k: placementStore.anchorIndex + 1, n: placementStore.anchors.length })}</span>
      <span data-testid="placement-rotation">{tp('placement.rotation', { deg: placementStore.rotation })}</span>
      {#if placementStore.mirrored}<span data-testid="placement-mirrored">{t('placement.mirrored')}</span>{/if}
      <span class="ph-welds" data-testid="placement-welds">{tp('placement.welds', { n: preview.welds.length })}</span>
      {#if preview.supportKept > 0}<span class="ph-welds">{tp('placement.supportKept', { n: preview.supportKept })}</span>{/if}
    </div>
    <div class="ph-row">
      <label>X <input value={tx} oninput={(e) => { tx = e.currentTarget.value; typing = true; }} data-testid="placement-x" /></label>
      <label>Y <input value={ty} oninput={(e) => { ty = e.currentTarget.value; typing = true; }} data-testid="placement-y" /></label>
      <label>Z <input value={tz} oninput={(e) => { tz = e.currentTarget.value; typing = true; }} data-testid="placement-z" /></label>
      {#if placementStore.mode === 'insert'}
        <label class="ph-check"><input type="checkbox" bind:checked={placementStore.withLoads} /> {t('placement.withLoads')}</label>
        <label class="ph-check"><input type="checkbox" bind:checked={placementStore.withSupports} /> {t('placement.withSupports')}</label>
      {/if}
      <button class="pk-btn pk-btn-primary" disabled={!typed} onclick={() => typed && placementStore.commitAt(typed)} data-testid="placement-place">{t('placement.place')}</button>
      <button class="pk-btn" onclick={() => placementStore.cancel()} data-testid="placement-cancel">{t('placement.cancel')}</button>
    </div>
    <div class="ph-keys">{t('placement.keys')}</div>
  </div>
{/if}

<style>
  .ph {
    position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 30;
    background: var(--st-surface); border: 1px solid var(--st-accent); border-radius: var(--st-radius);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35); padding: 6px 10px; display: flex; flex-direction: column; gap: 4px;
    font-size: 0.68rem; color: var(--st-text-2); max-width: min(760px, calc(100% - 32px));
  }
  .ph-head { display: flex; gap: 10px; align-items: baseline; }
  .ph-title { font-weight: 600; color: var(--st-text); }
  .ph-target { color: var(--st-interactive); font-family: var(--st-mono); }
  .ph-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .ph-row label { display: flex; gap: 4px; align-items: center; }
  .ph-row input:not([type='checkbox']) { width: 64px; font-family: var(--st-mono); }
  .ph-check { font-size: 0.64rem; }
  .ph-welds { color: var(--st-warn); }
  .ph-keys { font-size: 0.6rem; color: var(--st-text-3); }
</style>
