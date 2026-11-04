<script lang="ts">
  /**
   * The composition of the sheet on screen, adjusted after it is laid out: each drawing's point on
   * the sheet, its scale, the sheet of another drawing it goes to (with its tables), aligned with
   * another drawing; texts and dimensions moved inside it; annotations of one's own. Every
   * adjustment is kept by the drawing's key and applied again when the sheets are laid out anew.
   */
  import { t, tp } from '../../../lib/i18n';
  import { SCALES } from '../../../lib/sheets/formats';
  import { textKeys } from '../../../lib/sheets/sheet-layout';
  import type { SetSheet } from '../../../lib/sheets/sheet-set';
  import { addAnnotation, adjustDrawing, clearAdjust, removeAnnotation, sheetLayout } from '../../../lib/store/sheet-set';
  import { modelStore } from '../../../lib/store';

  let { sheet, all, onChange }: { sheet: SetSheet; all: SetSheet[]; onChange: () => void } = $props();
  const placed = $derived(sheet.placed ?? []);
  let sel = $state<string | null>(null);
  const p = $derived(placed.find((x) => x.key === sel) ?? placed[0] ?? null);
  const layout = $derived.by(() => { void modelStore.designData; return sheetLayout(); });
  const adj = $derived(p ? layout.drawings[p.key] : undefined);
  const others = $derived(all.flatMap((s) => (s.placed ?? []).filter((x) => !p || x.key !== p.key).map((x) => ({ key: x.key, label: `${s.number} · ${x.title}` }))));
  let x = $state(0), y = $state(0), alignWith = $state(''), noteText = $state(''), nx = $state(40), ny = $state(80);
  $effect(() => { if (p) { x = +p.x.toFixed(1); y = +p.y.toFixed(1); } });
  const texts = $derived.by(() => {
    if (!p) return [];
    const ps = sheet.primitives.slice((sheet.blockCount ?? 0) + p.from, (sheet.blockCount ?? 0) + p.to - 1);
    return [...textKeys(ps)].map(([, k]) => k).slice(0, 40);
  });
  let tk = $state(''), tdx = $state(0), tdy = $state(0);
  const done = (f: () => void) => { f(); onChange(); };
  function align(edge: 'left' | 'bottom') {
    const o = placed.find((q) => q.key === alignWith);
    if (!p || !o) return;
    done(() => adjustDrawing(p, { at: edge === 'left' ? { x: o.x, y: p.y } : { x: p.x, y: o.y } }));
  }
  const annotations = $derived(layout.annotations.filter((n) => sheet.drawings.includes(n.onDrawing)));
</script>

{#if placed.length}
  <details class="sc" data-testid="sheets-composer">
    <summary>{tp('sheet.ui.composer', { n: placed.length })}{adj ? ' · ' + t('sheet.ui.adjusted') : ''}</summary>
    <div class="row">
      <select value={p?.key ?? ''} onchange={(e) => (sel = e.currentTarget.value)} data-testid="sheets-composer-drawing">
        {#each placed as q (q.key)}<option value={q.key}>{q.title}{layout.drawings[q.key] ? ' ✎' : ''}</option>{/each}
      </select>
    </div>
    {#if p}
      <div class="row">
        <label>x<input type="number" step="1" bind:value={x} data-testid="sheets-composer-x" /></label>
        <label>y<input type="number" step="1" bind:value={y} /></label>
        <button onclick={() => done(() => adjustDrawing(p!, { at: { x, y } }))} data-testid="sheets-composer-place">{t('sheet.ui.place')}</button>
        {#if !p.paper}
          <label>{t('sheet.ui.scale')}<select value={adj?.scale ?? p.scale} onchange={(e) => done(() => adjustDrawing(p!, { scale: Number(e.currentTarget.value) }))} data-testid="sheets-composer-scale">
            {#each SCALES as s}<option value={s}>1:{s}</option>{/each}</select></label>
        {/if}
      </div>
      <div class="row">
        <label>{t('sheet.ui.moveTo')}<select value={adj?.withDrawing ?? ''} onchange={(e) => done(() => adjustDrawing(p!, { withDrawing: e.currentTarget.value || undefined, at: undefined }))} data-testid="sheets-composer-move">
          <option value="">{t('sheet.ui.moveNone')}</option>{#each others as o (o.key)}<option value={o.key}>{o.label}</option>{/each}</select></label>
      </div>
      <div class="row">
        <label>{t('sheet.ui.alignWith')}<select bind:value={alignWith}><option value="">—</option>{#each placed.filter((q) => q.key !== p!.key) as q (q.key)}<option value={q.key}>{q.title}</option>{/each}</select></label>
        <button disabled={!alignWith} onclick={() => align('left')}>{t('sheet.ui.alignLeft')}</button>
        <button disabled={!alignWith} onclick={() => align('bottom')}>{t('sheet.ui.alignBottom')}</button>
      </div>
      {#if texts.length}
        <div class="row">
          <label>{t('sheet.ui.text')}<select bind:value={tk}><option value="">—</option>{#each texts as k}<option value={k}>{k.replace(/^[td]\d+:?/, '') || k}</option>{/each}</select></label>
          <label>Δx<input type="number" step="0.5" bind:value={tdx} /></label><label>Δy<input type="number" step="0.5" bind:value={tdy} /></label>
          <button disabled={!tk} onclick={() => done(() => adjustDrawing(p!, { moves: { ...adj?.moves, [tk]: { x: tdx, y: tdy } } }))} data-testid="sheets-composer-text">{t('sheet.ui.moveText')}</button>
        </div>
      {/if}
      {#if adj}<button onclick={() => done(() => clearAdjust(p!.key))} data-testid="sheets-composer-reset">{t('sheet.ui.resetAdjust')}</button>{/if}
    {/if}
    <div class="row">
      <input placeholder={t('sheet.ui.annotation')} bind:value={noteText} data-testid="sheets-composer-note" />
      <label>x<input type="number" bind:value={nx} /></label><label>y<input type="number" bind:value={ny} /></label>
      <button disabled={!noteText.trim() || !p} onclick={() => done(() => { addAnnotation(p!.key, { x: nx, y: ny }, noteText.trim()); noteText = ''; })} data-testid="sheets-composer-note-add">{t('sheet.ui.addNote')}</button>
    </div>
    {#each annotations as n (n.id)}<div class="row"><span>«{n.text}» ({n.at.x}, {n.at.y})</span><button onclick={() => done(() => removeAnnotation(n.id))}>×</button></div>{/each}
  </details>
{/if}

<style>
  .sc summary { font-size: 0.68rem; cursor: pointer; color: var(--st-text); }
  .sc { font-size: 0.66rem; color: var(--st-text-2); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; margin: 0.2rem 0; }
  label { display: inline-flex; align-items: center; gap: 0.2rem; }
  input, select, button { font-size: 0.66rem; padding: 0.05rem 0.3rem; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; max-width: 100%; }
  input[type='number'] { width: 3.6rem; }
  button { cursor: pointer; }
  button:disabled { opacity: 0.45; }
</style>
