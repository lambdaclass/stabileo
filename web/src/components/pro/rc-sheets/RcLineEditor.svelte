<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { rcSheetsData, setAdopted, setLineBentBars } from '../../../lib/store/rc-sheets.svelte';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { LineAdopted, LineLayout } from '../../../lib/rc-sheets/beam-line';
  import type { BarGroup } from '../../../lib/rc-sheets/types';
  import { designData } from '../../../lib/store/design-data';
  import { editorDiameters, numberInput } from '../../../lib/rc-sheets/view-helpers';

  let { line }: { line: LineLayout } = $props();
  const bentChoice = $derived.by(() => { void modelStore.designData; const v = rcSheetsData().bentLines?.[line.key]; return v === undefined ? 'project' : v ? 'on' : 'off'; });
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const dd = $derived.by(() => { void modelStore.designData; return designData(); });
  const LONG = $derived(editorDiameters(dd, 'beam', [line.adopted.bottom.dia, line.adopted.top.dia, ...line.adopted.supportTop.map((g) => g.dia), ...line.adopted.spanBottom.map((g) => g.dia), ...(line.adopted.bent ?? []).map((g) => g.dia)]));
  const SMALL = $derived(editorDiameters(dd, 'tie', (line.adopted.stirrups ?? []).map((s) => s.dia)));
  // A number box cleared or typed past its limits takes the nearest limit: a spacing or a count of 0 would stall the drawings.
  const num = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement | HTMLSelectElement;
    const v = Number(el.value);
    if (!(el instanceof HTMLInputElement) || el.type !== 'number') return v;
    const lo = el.min === '' ? -Infinity : Number(el.min), hi = el.max === '' ? Infinity : Number(el.max);
    const c = numberInput(el.value, lo, hi, el.step === '' ? 1 : el.step === 'any' ? undefined : Number(el.step));
    if (Number.isFinite(c) && c !== v) el.value = String(c);
    return c;
  };
  const copy = (): LineAdopted => JSON.parse(JSON.stringify(line.adopted));
  function patch(f: (a: LineAdopted) => void) { const a = copy(); f(a); setAdopted(line.key, a); }
  const setGroup = (g: BarGroup, k: 'count' | 'dia', v: number) => { g[k] = v; };
</script>

<div class="rle" data-testid="rc-line-editor">
  <fieldset>
    <legend>{t('rcSheets.line.runs')}</legend>
    {#each ['bottom', 'top'] as const as face (face)}
      <label>
        <span>{t(face === 'bottom' ? 'rcSheets.col.bottom' : 'rcSheets.col.top')}</span>
        <input type="number" min="2" max="12" value={line.adopted[face].count} aria-label={t('rcSheets.ed.count')} onchange={(e) => patch((a) => setGroup(a[face], 'count', num(e)))} />
        <select value={line.adopted[face].dia} aria-label={t('rcSheets.ed.dia')} onchange={(e) => patch((a) => setGroup(a[face], 'dia', num(e)))}>{#each LONG as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
      </label>
    {/each}
  </fieldset>
  <fieldset>
    <legend>{t('rcSheets.line.supports')}</legend>
    {#each line.adopted.supportTop as g, j (j)}
      <label>
        <span>{j + 1}</span>
        <input type="number" min="0" max="12" value={g.count} aria-label={t('rcSheets.ed.count')} onchange={(e) => patch((a) => setGroup(a.supportTop[j]!, 'count', num(e)))} />
        <select value={g.dia} aria-label={t('rcSheets.ed.dia')} onchange={(e) => patch((a) => setGroup(a.supportTop[j]!, 'dia', num(e)))}>{#each LONG as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
      </label>
    {/each}
  </fieldset>
  <fieldset>
    <legend>{t('rcSheets.line.spans')}</legend>
    {#each line.adopted.spanBottom as g, k (k)}
      <label>
        <span>{line.spans[k]?.name}</span>
        <input type="number" min="0" max="12" value={g.count} aria-label={t('rcSheets.ed.count')} onchange={(e) => patch((a) => setGroup(a.spanBottom[k]!, 'count', num(e)))} />
        <select value={g.dia} aria-label={t('rcSheets.ed.dia')} onchange={(e) => patch((a) => setGroup(a.spanBottom[k]!, 'dia', num(e)))}>{#each LONG as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
        {#if line.adopted.stirrups?.[k]}
          {@const st = line.adopted.stirrups[k]!}
          <select value={st.dia} aria-label={t('rcSheets.col.stirrups')} onchange={(e) => patch((a) => { a.stirrups![k] = { ...a.stirrups![k]!, dia: num(e) }; })}>{#each SMALL as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
          <span>c/</span>
          <input type="number" min="5" max="40" step="2.5" value={Math.round(st.spacing * 1000) / 10} aria-label={t('rcSheets.ed.spacing')} onchange={(e) => patch((a) => { a.stirrups![k] = { ...a.stirrups![k]!, spacing: num(e) / 100 }; })} />
        {/if}
      </label>
    {/each}
  </fieldset>
  <label class="rle-bent">
    <span>{t('rcSheets.line.bentOverride')}</span>
    <select value={bentChoice} data-testid="rc-line-bent-choice" onchange={(e) => { const v = e.currentTarget.value; setLineBentBars(line.key, v === 'project' ? null : v === 'on'); }}>
      <option value="project">{t('rcSheets.line.bentProject')}</option>
      <option value="on">{t('rcSheets.line.bentOn')}</option>
      <option value="off">{t('rcSheets.line.bentOff')}</option>
    </select>
  </label>
  {#if line.adopted.bent}
    <fieldset data-testid="rc-line-bent">
      <legend>{t('rcSheets.line.kind.bent')}</legend>
      {#each line.adopted.bent as g, k (k)}
        <label>
          <span>{line.spans[k]?.name}</span>
          <input type="number" min="0" max="12" value={g.count} aria-label={t('rcSheets.ed.count')} onchange={(e) => patch((a) => setGroup(a.bent![k]!, 'count', num(e)))} />
          <select value={g.dia} aria-label={t('rcSheets.ed.dia')} onchange={(e) => patch((a) => setGroup(a.bent![k]!, 'dia', num(e)))}>{#each LONG as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
        </label>
      {/each}
    </fieldset>
  {/if}
  <div class="rle-actions">
    {#if line.isAdopted}
      <button type="button" class="rcs-btn" onclick={() => setAdopted(line.key, null)}>{t('rcSheets.useProposal')}</button>
    {:else}
      <span class="hint">{t('rcSheets.showingProposal')} · {t('rcSheets.s.iterations')}: {line.iterations}</span>
      <button type="button" class="rcs-btn" onclick={() => setAdopted(line.key, line.proposed, false)}>{t('rcSheets.adoptProposal')}</button>
    {/if}
    <span class="hint">{fmt(line.bars.reduce((s, b) => s + b.weight, 0), 1)} kg</span>
  </div>
</div>

<style>
  .rle { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
  fieldset { border: 1px solid var(--st-hair); border-radius: 6px; padding: 4px 8px 6px; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  legend { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--st-text-2); padding: 0 4px; }
  label { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--st-text); }
  label span { color: var(--st-text-2); min-width: 2.5em; }
  input[type='number'] { width: 4em; }
  input, select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; padding: 1px 3px; }
  .rle-actions { display: flex; align-items: center; gap: 8px; align-self: center; flex-wrap: wrap; }
  .hint { font-size: 0.7rem; color: var(--st-text-3); }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
</style>
