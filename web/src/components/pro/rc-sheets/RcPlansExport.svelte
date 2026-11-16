<script lang="ts">
  /** What to draw to scale, on which sheet and in which files; the drawings themselves are `rc-sheets/plans`. */
  import { t, tp, tpn } from '../../../lib/i18n';
  import { uiStore } from '../../../lib/store';
  import type { SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { defaultPlanAuthor, exportRcPlans } from '../../../lib/store/rc-plans-export';
  import { DEFAULT_PLAN_SCALES, PLAN_FAMILIES, PLAN_FORMATS, type PlanFamily, type PlanFormat } from '../../../lib/rc-sheets/plans/sheets';

  let { rows, current = null, onclose }: { rows: SheetRows; current?: { key: string; name: string } | null; onclose: () => void } = $props();

  const SCALES = [10, 20, 25, 50, 75, 100, 200];
  const allLevels = $derived([...new Set([...rows.line, ...rows.column, ...rows.wall, ...rows.footing].map((r) => r.level ?? '').concat(rows.slabPlan.map((p) => p.level)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  const has = (f: PlanFamily) => (f === 'beam' ? rows.line.length : f === 'column' ? rows.column.length : f === 'slab' ? rows.slabPlan.some((p) => p.packages.length) : f === 'footing' ? rows.footing.filter((r) => !r.uncovered && r.B > 0).length : rows.wall.length) > 0;

  let scope = $state<'current' | 'families'>(current ? 'current' : 'families');
  let families = $state<Record<PlanFamily, boolean>>({ beam: true, column: true, slab: true, wall: true, footing: true });
  let levels = $state<Record<string, boolean>>({});
  let format = $state<PlanFormat>('A3');
  let elevation = $state(DEFAULT_PLAN_SCALES.elevation);
  let plan = $state(DEFAULT_PLAN_SCALES.plan);
  let dxf = $state(true);
  let pdf = $state(true);
  let author = $state(defaultPlanAuthor());
  let licence = $state('');
  let nothing = $state(false);

  const levelOn = (l: string) => levels[l] !== false;
  const ready = $derived((dxf || pdf) && (scope === 'current' ? !!current : PLAN_FAMILIES.some((f) => families[f] && has(f)) && allLevels.some(levelOn)));

  function download() {
    const selection = scope === 'current' && current
      ? { families: [], levels: null, element: current.key }
      : { families: PLAN_FAMILIES.filter((f) => families[f] && has(f)), levels: allLevels.filter(levelOn) };
    const n = exportRcPlans(rows, { selection, format, scales: { elevation, plan }, dxf, pdf, author, licence }, tp);
    if (!n) { nothing = true; return; }
    uiStore.toast(tpn('rcSheets.plans.done', n), 'success');
    onclose();
  }
</script>

<div class="rcp-back" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="rcp" role="dialog" aria-modal="true" aria-label={t('rcSheets.plans.title')} data-testid="rc-plans-dialog">
    <h4>{t('rcSheets.plans.title')}</h4>
    <fieldset>
      <legend>{t('rcSheets.plans.scope')}</legend>
      <label><input type="radio" bind:group={scope} value="current" disabled={!current} data-testid="rc-plans-scope-current" /> {tp('rcSheets.plans.scope.current', { name: current?.name ?? '—' })}</label>
      <label><input type="radio" bind:group={scope} value="families" data-testid="rc-plans-scope-families" /> {t('rcSheets.plans.scope.families')}</label>
      {#if scope === 'families'}
        <div class="rcp-row" role="group" aria-label={t('rcSheets.plans.families')}>
          {#each PLAN_FAMILIES as f (f)}
            <label class:off={!has(f)}><input type="checkbox" bind:checked={families[f]} disabled={!has(f)} data-testid="rc-plans-family-{f}" /> {t(`rcSheets.family.${f}`)}</label>
          {/each}
        </div>
        <div class="rcp-row" role="group" aria-label={t('rcSheets.plans.levels')}>
          <span class="rcp-k">{t('rcSheets.plans.levels')}</span>
          {#each allLevels as l (l)}
            <label><input type="checkbox" checked={levelOn(l)} onchange={(e) => (levels = { ...levels, [l]: e.currentTarget.checked })} data-testid="rc-plans-level" data-level={l} /> {l || '—'}</label>
          {/each}
        </div>
      {/if}
    </fieldset>
    <div class="rcp-grid">
      <label>{t('rcSheets.plans.sheet')}
        <select bind:value={format} data-testid="rc-plans-format">{#each PLAN_FORMATS as f (f)}<option value={f}>{f}</option>{/each}</select>
      </label>
      <label>{t('rcSheets.plans.scaleElevation')}
        <select bind:value={elevation} data-testid="rc-plans-scale-elevation">{#each SCALES as s (s)}<option value={s}>1:{s}</option>{/each}</select>
      </label>
      <label>{t('rcSheets.plans.scalePlan')}
        <select bind:value={plan} data-testid="rc-plans-scale-plan">{#each SCALES as s (s)}<option value={s}>1:{s}</option>{/each}</select>
      </label>
      <label>{t('rcSheets.plans.author')}<input type="text" bind:value={author} data-testid="rc-plans-author" /></label>
      <label>{t('rcSheets.plans.licence')}<input type="text" bind:value={licence} data-testid="rc-plans-licence" /></label>
      <div class="rcp-row" role="group" aria-label={t('rcSheets.plans.formats')}>
        <span class="rcp-k">{t('rcSheets.plans.formats')}</span>
        <label><input type="checkbox" bind:checked={dxf} data-testid="rc-plans-dxf" /> DXF</label>
        <label><input type="checkbox" bind:checked={pdf} data-testid="rc-plans-pdf" /> PDF</label>
      </div>
    </div>
    <p class="rcp-note">{t('rcSheets.plans.note')}</p>
    {#if nothing}<p class="rcp-note bad" data-testid="rc-plans-none">{t('rcSheets.plans.none')}</p>{/if}
    <div class="rcp-actions">
      <button type="button" class="rcs-btn" onclick={onclose}>{t('rcSheets.plans.cancel')}</button>
      <button type="button" class="rcs-btn primary" onclick={download} disabled={!ready} data-testid="rc-plans-download">{t('rcSheets.plans.download')}</button>
    </div>
  </div>
</div>

<style>
  .rcp-back { position: absolute; inset: 0; z-index: 5; background: rgba(0, 0, 0, 0.35); display: flex; align-items: flex-start; justify-content: center; padding-top: 64px; }
  .rcp { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 96px); overflow: auto; background: var(--st-surface); border: 1px solid var(--st-hair); border-radius: 8px; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; font-size: 0.74rem; color: var(--st-text); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3); }
  h4 { margin: 0; font-family: var(--st-display); font-size: 0.86rem; }
  fieldset { border: 1px solid var(--st-hair); border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; gap: 4px; }
  legend { font-weight: 600; color: var(--st-text-2); padding: 0 4px; }
  label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  label.off { opacity: 0.5; cursor: default; }
  .rcp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
  .rcp-k { color: var(--st-text-2); font-weight: 600; }
  .rcp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px 12px; }
  .rcp-grid > label { flex-direction: column; align-items: stretch; gap: 2px; color: var(--st-text-2); }
  .rcp-grid select, .rcp-grid input[type='text'] { font-size: 0.74rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; padding: 2px 4px; }
  .rcp-note { margin: 0; color: var(--st-text-3); font-size: 0.68rem; }
  .rcp-note.bad { color: var(--st-danger); }
  .rcp-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 10px; cursor: pointer; }
  .rcs-btn.primary { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
  .rcs-btn:disabled { opacity: 0.5; cursor: default; }
</style>
