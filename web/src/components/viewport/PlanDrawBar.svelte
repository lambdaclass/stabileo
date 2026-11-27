<script lang="ts">
  import { untrack } from 'svelte';
  import { planDraw, STRUCTURE_SNAPS, type BeamMode, type ColumnMode } from '../../lib/store/plan-draw.svelte';
  import { OSNAP_MODES } from '../../lib/model/osnap-modes';
  import { t, tp } from '../../lib/i18n';
  import { uiStore } from '../../lib/store/ui.svelte';
  import { modelStore } from '../../lib/store/model.svelte';

  const COLUMN_MODES: ColumnMode[] = ['corners', 'point', 'side'];
  const BEAM_MODES: BeamMode[] = ['rect', 'axis', 'faces'];
  const ALIGN = [[1, '◧'], [0, '◫'], [-1, '◨']] as const;
  const cm = (m: number) => Math.round(m * 1000) / 10;
  const toM = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n / 100 : null; };
  const c = planDraw.column, b = planDraw.beam, sl = planDraw.slab;
  let snapsOpen = $state(false);
  const levels = $derived(planDraw.levels);

  $effect(() => { void uiStore.nodeCreateZ; untrack(() => planDraw.drop()); });
  $effect(() => { if (!uiStore.planView3D || (uiStore.currentTool !== 'pan' && uiStore.currentTool !== 'select')) planDraw.stop(); });

  const sectionName = (id: number | null) => (id === null ? null : modelStore.sections.get(id)?.name ?? null);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Shift') planDraw.ortho = e.type === 'keydown';
    if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'F3') { e.preventDefault(); e.stopPropagation(); planDraw.setSnap('on', !planDraw.snap.on); uiStore.toast(t(planDraw.snap.on ? 'osnap.on' : 'planDraw.snapsOff'), 'info'); return; }
    if (e.key === 'F8') { e.preventDefault(); e.stopPropagation(); planDraw.orthoLock = !planDraw.orthoLock; return; }
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
      if (e.key === 'Escape' || e.key === 'Enter') el.blur();
      return;
    }
    // A dialog, a menu or a focused button keeps its own keys.
    if (el && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.closest('[role="dialog"], [role="menu"], [role="listbox"]'))) return;
    const take = () => { e.preventDefault(); e.stopPropagation(); };
    const pending = planDraw.points.length > 0 || planDraw.typed !== '';
    if (/^[0-9.,]$/.test(e.key)) { if (planDraw.typing) { planDraw.type(e.key); take(); } }
    else if (e.key === 'Enter') { if (planDraw.typed) { planDraw.enter(); take(); } }
    else if (e.key === 'Backspace') { planDraw.back(); take(); }
    else if (e.key === 'Escape') { planDraw.cancel(); if (pending) take(); }
  }
  $effect(() => {
    const keys = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('keyup', keys, true);
    return () => { window.removeEventListener('keydown', keys, true); window.removeEventListener('keyup', keys, true); };
  });
</script>

<div class="pd" role="toolbar" aria-label={t(`planDraw.${planDraw.kind}`)} data-testid="plan-draw-bar">
  <div class="pd-row">
    <strong>{t(`planDraw.${planDraw.kind}`)}</strong>
    <span class="pd-sep"></span>
    {#if planDraw.kind === 'column'}
      <div class="pd-seg" role="radiogroup">
        {#each COLUMN_MODES as m (m)}<button class:on={c.mode === m} role="radio" aria-checked={c.mode === m} onclick={() => planDraw.setMode(m)} data-testid="plan-draw-mode-{m}">{t(`planDraw.mode.${m}`)}</button>{/each}
      </div>
      <span class="pd-sep"></span>
      {#if sectionName(c.sectionId)}
        <span class="pd-size" data-testid="plan-draw-section">{sectionName(c.sectionId)} <button class="pd-x" onclick={() => (c.sectionId = null)} aria-label={t('planDraw.rectangular')} title={t('planDraw.rectangular')}>×</button></span>
      {:else}
        <label class="pd-size" title={t('planDraw.columnSizeHint')}>b <input value={cm(c.b)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) c.b = v; }} data-testid="plan-draw-b" />
          × h <input value={cm(c.h)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) c.h = v; }} data-testid="plan-draw-h" /> cm</label>
      {/if}
      {#if c.mode === 'point'}
        <label class="pd-size">∠ <input value={c.angle} onchange={(e) => { const v = parseFloat(e.currentTarget.value.replace(',', '.')); if (Number.isFinite(v)) c.angle = v; }} data-testid="plan-draw-angle" />°</label>
      {/if}
      <span class="pd-sep"></span>
      <div class="pd-fp" role="radiogroup" aria-label={t('building.fixedPoint')} title={t('building.fixedPoint')}>
        {#each [1, 0, -1] as fy}{#each [-1, 0, 1] as fx}
          <button type="button" class:on={c.fixedPoint[0] === fx && c.fixedPoint[1] === fy} role="radio" aria-checked={c.fixedPoint[0] === fx && c.fixedPoint[1] === fy}
                  aria-label="{fx},{fy}" onclick={() => (c.fixedPoint = [fx, fy])} data-testid="plan-draw-fp-{fx}-{fy}"></button>
        {/each}{/each}
      </div>
      <span class="pd-sep"></span>
      <label class="pd-size">{t('planDraw.from')} <select bind:value={c.levelFrom} data-testid="plan-draw-from"><option value="">{t('planDraw.thisLevel')}</option>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select></label>
      <label class="pd-size">{t('planDraw.to')} <select bind:value={c.levelTo} data-testid="plan-draw-to"><option value="">{t('planDraw.nextLevel')}</option>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select></label>
    {:else if planDraw.kind === 'wall'}
      <span class="pd-size" title={t('planDraw.wallHint')} data-testid="plan-draw-wall-span">{t('planDraw.wallHint')}</span>
      <label class="pd-check"><input type="checkbox" bind:checked={planDraw.wall.fixBase} data-testid="plan-draw-wall-fix" /> {t('building.fixBase')}</label>
    {:else if planDraw.kind === 'slab'}
      <label class="pd-size" title={t('planDraw.slabThicknessHint')}>{t('planDraw.thickness')} <input value={cm(sl.thickness)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) sl.thickness = v; }} data-testid="plan-draw-thickness" /> cm</label>
      {#if planDraw.beamLevel}<span class="pd-size" title={t('planDraw.onLevelHint')} data-testid="plan-draw-level">{tp('planDraw.onLevel', { level: planDraw.beamLevel.name })}</span>{/if}
    {:else}
      <div class="pd-seg" role="radiogroup">
        {#each BEAM_MODES as m (m)}<button class:on={b.mode === m} role="radio" aria-checked={b.mode === m} onclick={() => planDraw.setMode(m)} data-testid="plan-draw-mode-{m}">{t(`planDraw.mode.${m}`)}</button>{/each}
      </div>
      <span class="pd-sep"></span>
      {#if sectionName(b.sectionId)}
        <span class="pd-size" data-testid="plan-draw-section">{sectionName(b.sectionId)} <button class="pd-x" onclick={() => (b.sectionId = null)} aria-label={t('planDraw.rectangular')} title={t('planDraw.rectangular')}>×</button></span>
      {:else}
        <label class="pd-size" title={t('planDraw.beamSizeHint')}>b <input value={cm(b.width)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) b.width = v; }} data-testid="plan-draw-width" />
          × h <input value={cm(b.height)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) b.height = v; }} data-testid="plan-draw-height" /> cm</label>
      {/if}
      {#if b.mode === 'axis'}
        <div class="pd-seg" role="radiogroup" aria-label={t('planDraw.align')} title={t('planDraw.align')}>
          {#each ALIGN as [v, g] (v)}<button class:on={b.align === v} role="radio" aria-checked={b.align === v} onclick={() => (b.align = v)} title={t(`planDraw.align.${v}`)} data-testid="plan-draw-align-{v}">{g}</button>{/each}
        </div>
      {/if}
      {#if planDraw.beamLevel}<span class="pd-size" title={t('planDraw.onLevelHint')} data-testid="plan-draw-level">{tp('planDraw.onLevel', { level: planDraw.beamLevel.name })}</span>{/if}
      <label class="pd-check" title={t('planDraw.topFlushHint')}><input type="checkbox" bind:checked={b.topFlush} data-testid="plan-draw-top-flush" /> {t('planDraw.topFlush')}</label>
    {/if}
    <span class="pd-sep"></span>
    <div class="pd-snaps">
      <button class="pd-snap-btn" class:on={planDraw.snap.on} aria-expanded={snapsOpen} onclick={() => (snapsOpen = !snapsOpen)} title={t('planDraw.snapsHint')} data-testid="plan-draw-snaps">
        {t('planDraw.snaps')}{planDraw.snap.on ? '' : ` · ${t('planDraw.free')}`} ▾</button>
      {#if snapsOpen}
        <div class="pd-snap-pop" role="group" aria-label={t('planDraw.snaps')} data-testid="plan-draw-snaps-pop">
          <label class="pd-check"><input type="checkbox" checked={planDraw.snap.on} onchange={(e) => planDraw.setSnap('on', e.currentTarget.checked)} data-testid="plan-snap-on" /> <b>{t('planDraw.snapsOn')}</b></label>
          <label class="pd-check"><input type="checkbox" checked={planDraw.orthoLock} onchange={(e) => (planDraw.orthoLock = e.currentTarget.checked)} data-testid="plan-snap-ortho" /> {t('planDraw.orthoLock')}</label>
          <div class="pd-snap-group" class:off={!planDraw.snap.on}>
            <span>{t('planDraw.snapGroup.template')}</span>
            <label class="pd-check"><input type="checkbox" checked={planDraw.snap.template} disabled={!planDraw.snap.on} onchange={(e) => planDraw.setSnap('template', e.currentTarget.checked)} data-testid="plan-snap-template" /> {t('planDraw.snapTemplate')}</label>
            {#each OSNAP_MODES as m (m)}
              <label class="pd-check pd-sub"><input type="checkbox" checked={uiStore.osnapModes.has(m)} disabled={!planDraw.snap.on || !planDraw.snap.template} onchange={() => uiStore.toggleOsnap(m)} data-testid="plan-osnap-{m}" /> {t(`osnap.${m}`)}</label>
            {/each}
          </div>
          <div class="pd-snap-group" class:off={!planDraw.snap.on}>
            <span>{t('planDraw.snapGroup.model')}</span>
            {#each STRUCTURE_SNAPS as k (k)}
              <label class="pd-check"><input type="checkbox" checked={planDraw.snap[k]} disabled={!planDraw.snap.on} onchange={(e) => planDraw.setSnap(k, e.currentTarget.checked)} data-testid="plan-snap-{k}" /> {t(`planDraw.snapTo.${k}`)}</label>
            {/each}
          </div>
          <p class="pd-snap-note">{t('planDraw.snapsNote')}</p>
        </div>
      {/if}
    </div>
    <span class="pd-sep"></span>
    <button class="pd-x" onclick={() => planDraw.stop()} aria-label={t('planDraw.exit')} title={t('planDraw.exit')} data-testid="plan-draw-exit">×</button>
  </div>
  <p class="pd-step" data-testid="plan-draw-step">{t(`planDraw.step.${planDraw.step}`)} · {t('planDraw.keys')}</p>
</div>

<style>
  .pd { padding: 4px 8px; font-size: 0.72rem; color: var(--st-text); background: color-mix(in srgb, var(--st-surface) 94%, transparent);
        border: 1px solid color-mix(in srgb, var(--st-accent) 45%, transparent); border-radius: var(--st-radius); box-shadow: 0 4px 14px rgb(0 0 0 / 0.3); }
  .pd-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; white-space: nowrap; }
  .pd-sep { width: 1px; align-self: stretch; margin: 2px 0; background: var(--st-hair-strong); }
  .pd-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 4px; background: var(--st-surface-2); }
  .pd-seg button { border: none; background: none; color: var(--st-text-2); font-size: 0.7rem; padding: 2px 7px; border-radius: 3px; cursor: pointer; }
  .pd-seg button.on { background: var(--st-surface-3); color: var(--st-accent); box-shadow: inset 0 0 0 1px var(--st-hair-strong); }
  .pd-size, .pd-check { display: inline-flex; align-items: center; gap: 3px; color: var(--st-text-2); }
  .pd-size input { width: 3.2em; font: inherit; text-align: right; color: var(--st-text); background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; padding: 1px 4px; }
  .pd-size select { font: inherit; color: var(--st-text); background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; }
  .pd-fp { display: grid; grid-template-columns: repeat(3, 9px); gap: 2px; }
  .pd-fp button { width: 9px; height: 9px; padding: 0; border: 1px solid var(--st-hair-strong); background: var(--st-surface); border-radius: 2px; cursor: pointer; }
  .pd-fp button.on { background: var(--st-accent); border-color: var(--st-accent); }
  .pd-x { border: none; background: none; color: var(--st-text-2); cursor: pointer; font-size: 0.95rem; padding: 0 4px; }
  .pd-x:hover { color: var(--st-text); }
  .pd-snaps { position: relative; }
  .pd-snap-btn { border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text-3); font-size: 0.7rem; padding: 2px 7px; border-radius: 4px; cursor: pointer; }
  .pd-snap-btn.on { color: var(--st-accent); }
  .pd-snap-pop { position: absolute; bottom: calc(100% + 8px); right: 0; z-index: 8; min-width: 15rem; display: flex; flex-direction: column; gap: 3px; padding: 8px 10px;
                 background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); box-shadow: 0 6px 18px rgb(0 0 0 / 0.35); white-space: normal; }
  .pd-snap-group { display: flex; flex-direction: column; gap: 2px; padding-top: 4px; border-top: 1px solid var(--st-hair); }
  .pd-snap-group > span { font-size: 0.64rem; color: var(--st-text-3); text-transform: uppercase; letter-spacing: 0.04em; }
  .pd-snap-group.off { opacity: 0.5; }
  .pd-sub { padding-left: 14px; }
  .pd-snap-note { margin: 2px 0 0; font-size: 0.64rem; color: var(--st-text-3); }
  .pd-step { margin: 3px 0 0; font-size: 0.66rem; color: var(--st-text-3); }
</style>
