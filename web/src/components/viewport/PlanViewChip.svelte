<script lang="ts">
  /**
   * While the plan view is on: which level is under the camera, a way to take another one (a
   * named level, or the cut moved by hand), and the way out. A state the reader lives in for a
   * while is said on the view itself, not only in the menu that set it.
   *
   * The plan's cut is its own (`uiStore.planCutZ`): the cut plane a person sets in the view menu
   * stays as it was (QA of 20-oct: «que esa sea una función independiente»).
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { tp, t } from '../../lib/i18n';

  const levels = $derived([...(modelStore.grid?.levels ?? [])].sort((a, b) => b.z - a.z));
  const current = $derived(levels.find((l) => Math.abs(l.z - uiStore.nodeCreateZ) < 1e-6));
  const level = $derived(current ? current.name : `+${uiStore.nodeCreateZ.toFixed(2)} m`);
  const cutAbove = $derived((uiStore.planCutZ ?? uiStore.nodeCreateZ) - uiStore.nodeCreateZ);
  const round = (v: number) => Math.round(v * 100) / 100;
  function setCut(above: number) {
    if (Number.isFinite(above)) uiStore.planCutZ = round(uiStore.nodeCreateZ + Math.max(0, above));
  }
  function nudge(e: { shiftKey: boolean }, d: 1 | -1) { setCut(round(cutAbove + d * (e.shiftKey ? 0.5 : 0.05))); }
  let cutEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    const el = cutEl;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
      while (Math.abs(acc) >= 60) { nudge(e, acc < 0 ? 1 : -1); acc -= Math.sign(acc) * 60; }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  /** The level over and under the one the plan is on. */
  const above = $derived([...levels].reverse().find((l) => l.z > uiStore.nodeCreateZ + 1e-6));
  const below = $derived(levels.find((l) => l.z < uiStore.nodeCreateZ - 1e-6));
  function step(d: 1 | -1) {
    const l = d > 0 ? above : below;
    if (l) uiStore.setActiveLevel(l.z);
  }
  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
    if (e.key === 'PageUp') { e.preventDefault(); step(1); }
    if (e.key === 'PageDown') { e.preventDefault(); step(-1); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="pv" role="status" data-testid="plan-view-chip">
  <span>{tp('viewport.planChip', { level })}</span>
  {#if levels.length}
    <button onclick={() => step(1)} disabled={!above} aria-label={t('viewport.planUp')} title={`${t('viewport.planUp')} (PgUp)`} data-testid="plan-view-up">▲</button>
    <button onclick={() => step(-1)} disabled={!below} aria-label={t('viewport.planDown')} title={`${t('viewport.planDown')} (PgDn)`} data-testid="plan-view-down">▼</button>
    <select value={current?.id ?? ''} onchange={(e) => { const l = levels.find((x) => x.id === e.currentTarget.value); if (l) uiStore.setActiveLevel(l.z); }}
            aria-label={t('viewport.planLevel')} title={t('viewport.planLevel')} data-testid="plan-view-level">
      {#if !current}<option value="" disabled>{level}</option>{/if}
      {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
    </select>
  {/if}
  <span class="pv-sep"></span>
  <div class="pv-cut" bind:this={cutEl} title={t('viewport.planCutHint')}>
    <span>{t('viewport.planCutField')}</span>
    <button onclick={(e) => nudge(e, -1)} aria-label="−" data-testid="plan-view-cut-down">−</button>
    <input type="text" inputmode="decimal" value={cutAbove.toFixed(2)} aria-label={t('viewport.planCutHint')}
           onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) setCut(+v.replace(',', '.')); e.currentTarget.value = cutAbove.toFixed(2); }}
           onkeydown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); nudge(e, e.key === 'ArrowUp' ? 1 : -1); } }}
           data-testid="plan-view-cut" />
    <button onclick={(e) => nudge(e, 1)} aria-label="+" data-testid="plan-view-cut-up">+</button>
    <span class="pv-unit">m</span>
  </div>
  <span class="pv-sep"></span>
  <button class="pv-toggle" class:on={uiStore.planBelow === 'ghost'} aria-pressed={uiStore.planBelow === 'ghost'}
          onclick={() => (uiStore.planBelow = uiStore.planBelow === 'ghost' ? 'hidden' : 'ghost')}
          title={t('viewport.planShowBelowHint')} data-testid="plan-view-below">◐ {t('viewport.planShowBelow')}</button>
  <span class="pv-sep"></span>
  <button onclick={() => (uiStore.planRotation -= 90)} aria-label={t('viewport.planRotateLeft')} title={t('viewport.planRotateLeft')} data-testid="plan-view-rotate-left">⟲</button>
  <button onclick={() => (uiStore.planRotation += 90)} aria-label={t('viewport.planRotateRight')} title={t('viewport.planRotateRight')} data-testid="plan-view-rotate-right">⟳</button>
  <span class="pv-sep"></span>
  <button onclick={() => (uiStore.planView3D = false)} aria-label={t('viewport.planExit')} title={t('viewport.planExit')} data-testid="plan-view-exit">×</button>
</div>

<style>
  .pv {
    position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 6;
    display: flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px;
    font-size: 0.72rem; color: var(--st-text); white-space: nowrap;
    background: color-mix(in srgb, var(--st-surface) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--st-value) 45%, transparent); border-radius: var(--st-radius);
    width: max-content; max-width: calc(100% - 24px); flex-wrap: wrap;
  }
  .pv-sep { width: 1px; align-self: stretch; margin: 3px 2px; background: var(--st-hair-strong); }
  select { font: inherit; font-size: 0.7rem; color: var(--st-text); background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; padding: 1px 4px; }
  .pv-cut { display: inline-flex; align-items: center; gap: 2px; color: var(--st-text-2); }
  .pv-cut > span:first-child { margin-right: 2px; }
  .pv-cut input {
    width: 3.6em; font: inherit; font-size: 0.7rem; text-align: right; font-variant-numeric: tabular-nums;
    color: var(--st-text); background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; padding: 1px 4px;
  }
  .pv-unit { color: var(--st-text-3); }
  button { border: none; background: none; color: var(--st-text-2); cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 2px 4px; border-radius: 3px; }
  button:hover { color: var(--st-text); background: var(--st-surface-2); }
  .pv-toggle { font-size: 0.7rem; padding: 3px 6px; }
  .pv-toggle.on { color: var(--st-accent); background: var(--st-surface-3); box-shadow: inset 0 0 0 1px var(--st-hair-strong); }
</style>
