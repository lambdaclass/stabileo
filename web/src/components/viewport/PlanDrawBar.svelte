<script lang="ts">
  import { planDraw, type BeamMode, type ColumnMode } from '../../lib/store/plan-draw.svelte';
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store/ui.svelte';

  const COLUMN_MODES: ColumnMode[] = ['corners', 'point', 'side'];
  const BEAM_MODES: BeamMode[] = ['axis', 'faces'];
  const ALIGN = [[1, '◧'], [0, '◫'], [-1, '◨']] as const;
  const cm = (m: number) => Math.round(m * 1000) / 10;
  const toM = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n / 100 : null; };
  const c = planDraw.column, b = planDraw.beam;
  const levels = $derived(planDraw.levels);

  $effect(() => { if (!uiStore.planView3D || (uiStore.currentTool !== 'pan' && uiStore.currentTool !== 'select')) planDraw.stop(); });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Shift') planDraw.ortho = e.type === 'keydown';
    if (e.type !== 'keydown') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) { if (e.key === 'Escape') el.blur(); return; }
    if (/^[0-9.,]$/.test(e.key)) { planDraw.type(e.key); e.preventDefault(); }
    else if (e.key === 'Enter') { planDraw.enter(); e.preventDefault(); }
    else if (e.key === 'Backspace') { planDraw.back(); e.preventDefault(); }
    else if (e.key === 'Escape') { planDraw.cancel(); e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={onKey} onkeyup={onKey} />

<div class="pd" role="toolbar" aria-label={t(`planDraw.${planDraw.kind}`)} data-testid="plan-draw-bar">
  <div class="pd-row">
    <strong>{t(`planDraw.${planDraw.kind}`)}</strong>
    <span class="pd-sep"></span>
    {#if planDraw.kind === 'column'}
      <div class="pd-seg" role="radiogroup">
        {#each COLUMN_MODES as m (m)}<button class:on={c.mode === m} role="radio" aria-checked={c.mode === m} onclick={() => (c.mode = m)} data-testid="plan-draw-mode-{m}">{t(`planDraw.mode.${m}`)}</button>{/each}
      </div>
      <span class="pd-sep"></span>
      <label class="pd-size" title={t('planDraw.columnSizeHint')}>b <input value={cm(c.b)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) c.b = v; }} data-testid="plan-draw-b" />
        × h <input value={cm(c.h)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) c.h = v; }} data-testid="plan-draw-h" /> cm</label>
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
    {:else}
      <div class="pd-seg" role="radiogroup">
        {#each BEAM_MODES as m (m)}<button class:on={b.mode === m} role="radio" aria-checked={b.mode === m} onclick={() => (b.mode = m)} data-testid="plan-draw-mode-{m}">{t(`planDraw.mode.${m}`)}</button>{/each}
      </div>
      <span class="pd-sep"></span>
      <label class="pd-size" title={t('planDraw.beamSizeHint')}>b <input value={cm(b.width)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) b.width = v; }} data-testid="plan-draw-width" />
        × h <input value={cm(b.height)} onchange={(e) => { const v = toM(e.currentTarget.value); if (v) b.height = v; }} data-testid="plan-draw-height" /> cm</label>
      {#if b.mode === 'axis'}
        <div class="pd-seg" role="radiogroup" aria-label={t('planDraw.align')} title={t('planDraw.align')}>
          {#each ALIGN as [v, g] (v)}<button class:on={b.align === v} role="radio" aria-checked={b.align === v} onclick={() => (b.align = v)} title={t(`planDraw.align.${v}`)} data-testid="plan-draw-align-{v}">{g}</button>{/each}
        </div>
      {/if}
      <label class="pd-check" title={t('planDraw.topFlushHint')}><input type="checkbox" bind:checked={b.topFlush} data-testid="plan-draw-top-flush" /> {t('planDraw.topFlush')}</label>
    {/if}
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
  .pd-step { margin: 3px 0 0; font-size: 0.66rem; color: var(--st-text-3); }
</style>
