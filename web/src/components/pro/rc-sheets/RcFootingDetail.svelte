<script lang="ts">
  import { t, tp } from '../../../lib/i18n';
  import { uiStore } from '../../../lib/store';
  import { setAdopted } from '../../../lib/store/rc-sheets.svelte';
  import { FOOTING_DIAMETERS, writeFootingToModel } from '../../../lib/store/rc-sheets-footings';
  import { isBanded } from '../../../lib/rc-sheets/footing-mesh';
  import type { FootingAdopted, FootingMesh, FootingRow } from '../../../lib/rc-sheets/footing-types';
  import type { SheetCode } from '../../../lib/rc-sheets/types';
  import RcFootingSvg from './RcFootingSvg.svelte';

  let { row, code }: { row: FootingRow; code: SheetCode } = $props();
  const DOWELS = [12, 16, 20, 25, 32];

  // A number box cleared or typed past its limits takes the nearest limit: a size or spacing of 0 would stall the drawings.
  const num = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement | HTMLSelectElement;
    const v = Number(el.value);
    if (!(el instanceof HTMLInputElement)) return v;
    const lo = Number(el.min), hi = Number(el.max);
    const c = el.value.trim() !== '' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
    if (c !== v) el.value = String(c);
    return c;
  };
  const copy = (): FootingAdopted => JSON.parse(JSON.stringify(row.adopted));
  const patch = (p: Partial<FootingAdopted>) => setAdopted(row.key, { ...copy(), ...p });
  const mesh = (dir: 'x' | 'y', p: Partial<FootingMesh>) => {
    const m = { ...row.adopted[dir], ...p };
    if (!(m.spacing > 0)) m.spacing = 0.2;
    patch({ [dir]: m });
  };
  const cmOf = (m: number) => Math.round(m * 1000) / 10;
  function toModel() {
    writeFootingToModel(row);
    uiStore.toast(tp('rcSheets.foot.written', { name: row.name }), 'success');
  }
</script>

<div class="rfd">
  {#if !row.uncovered && row.B > 0}
    <div class="rce" data-testid="rc-footing-editor">
      <fieldset>
        <legend>{t('rcSheets.foot.size')}</legend>
        {#each [['B', 'B'], ['L', 'L'], ['h', 'h']] as const as [k, lab] (k)}
          <label><span>{lab}</span><input type="number" min={k === 'h' ? 20 : 40} max={k === 'h' ? 250 : 1500} step="5" value={cmOf(row.adopted[k])} data-testid="rc-footing-{k}" onchange={(e) => patch({ [k]: num(e) / 100 })} /><span>cm</span></label>
        {/each}
        <label><span>eB · eL</span>
          <input type="number" min="-500" max="500" step="5" value={cmOf(row.adopted.ex)} onchange={(e) => patch({ ex: num(e) / 100 })} />
          <input type="number" min="-500" max="500" step="5" value={cmOf(row.adopted.ey)} onchange={(e) => patch({ ey: num(e) / 100 })} /><span>cm</span>
        </label>
      </fieldset>
      {#each ['x', 'y'] as const as dir (dir)}
        {@const m = row.adopted[dir]}
        <fieldset>
          <legend>{t(`rcSheets.foot.mesh.${dir}`)}</legend>
          <label>
            <select value={m.dia} aria-label={t('rcSheets.ed.dia')} data-testid="rc-footing-dia-{dir}" onchange={(e) => mesh(dir, { dia: num(e) })}>
              {#each FOOTING_DIAMETERS as d (d)}<option value={d}>Ø{d}</option>{/each}
            </select>
            <span>c/</span>
            <input type="number" min="5" max="40" step="2.5" value={cmOf(m.spacing)} aria-label={t('rcSheets.ed.spacing')} data-testid="rc-footing-s-{dir}" onchange={(e) => mesh(dir, { spacing: num(e) / 100 })} />
            <span>cm</span>
          </label>
          {#if isBanded(dir, row.adopted.B, row.adopted.L)}
            <label><span>{t('rcSheets.foot.outer')}</span>
              <input type="number" min="5" max="40" step="2.5" value={cmOf(m.outer ?? m.spacing)} onchange={(e) => mesh(dir, { outer: num(e) / 100 })} /><span>cm</span>
            </label>
          {/if}
        </fieldset>
      {/each}
      {#if row.adopted.dowels}
        {@const dw = row.adopted.dowels}
        <fieldset>
          <legend>{t('rcSheets.foot.dowels')}</legend>
          <label>
            <input type="number" min="4" max="40" step="1" value={dw.count} aria-label={t('rcSheets.ed.count')} onchange={(e) => patch({ dowels: { ...dw, count: num(e) } })} />
            <select value={dw.dia} aria-label={t('rcSheets.ed.dia')} onchange={(e) => patch({ dowels: { ...dw, dia: num(e) } })}>
              {#each DOWELS as d (d)}<option value={d}>Ø{d}</option>{/each}
            </select>
          </label>
        </fieldset>
      {/if}
      <div class="rce-actions">
        {#if row.isAdopted}
          <button type="button" class="rcs-btn" onclick={() => setAdopted(row.key, null)}>{t('rcSheets.useProposal')}</button>
        {:else}
          <span class="hint">{t('rcSheets.showingProposal')}</span>
          <button type="button" class="rcs-btn" onclick={() => setAdopted(row.key, row.proposed, false)} data-testid="rc-footing-adopt">{t('rcSheets.adoptProposal')}</button>
        {/if}
        <button type="button" class="rcs-btn" onclick={toModel} title={t('rcSheets.foot.toModelHint')} data-testid="rc-footing-to-model">{t(row.demand.footing ? 'rcSheets.foot.toModel' : 'rcSheets.foot.newInModel')}</button>
      </div>
    </div>
  {/if}
  {#if row.B > 0}<div class="rcw-secs"><RcFootingSvg {row} {code} /></div>{/if}
</div>

<style>
  .rce { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
  fieldset { border: 1px solid var(--st-hair); border-radius: 6px; padding: 4px 8px 6px; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  legend { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--st-text-2); padding: 0 4px; }
  label { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--st-text); }
  label span { color: var(--st-text-2); }
  input[type='number'] { width: 4.6em; }
  input, select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; padding: 1px 3px; }
  .rce-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; align-self: center; }
  .hint { font-size: 0.7rem; color: var(--st-text-3); }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  .rcw-secs { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin: 6px 0 8px; }
</style>
