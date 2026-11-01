<script lang="ts">
  /**
   * How the sheets show: colour by diameter, the layers left off the screen or off the plan, text
   * size and weight per layer, and the bar label's order and affixes; kept with the project, and as
   * the user's default in this browser.
   */
  import { t } from '../../../lib/i18n';
  import { DEFAULT_LABEL, barLabel, type LabelPart, type SheetDisplay } from '../../../lib/sheets/display';

  let { display, onChange }: { display: SheetDisplay | undefined; onChange: (next: SheetDisplay | undefined) => void } = $props();
  const d = $derived(display ?? {});
  const KEY = 'stabileo-sheet-display';
  const LAYERS = ['RC-BAR', 'RC-STIRRUP', 'RC-TEXT', 'RC-DIM', 'RC-MARK', 'FW-OUTLINE', 'FW-AXIS', 'FW-TAG', 'RC-BAND', 'RC-COVER', 'RC-GRID'];
  const PARTS: LabelPart[] = ['mark', 'count', 'dia', 'spacing', 'length'];
  let note = $state<string | null>(null);
  const set = (p: Partial<SheetDisplay>) => onChange({ ...d, ...p });
  const hide = (target: 'screen' | 'plan', layer: string, on: boolean) => {
    const cur = new Set(d.hidden?.[target] ?? []);
    if (on) cur.add(layer); else cur.delete(layer);
    set({ hidden: { ...d.hidden, [target]: [...cur] } });
  };
  const layer = (l: string, p: { text?: number; weight?: number }) => set({ layers: { ...d.layers, [l]: { ...d.layers?.[l], ...p } } });
  const label = $derived(d.barLabel ?? DEFAULT_LABEL);
  const sample = $derived(barLabel({ mark: 'IX3', count: 6, dia: 12, spacing: 20, length: '4,15' }, d));
  function saveDefault() { try { localStorage.setItem(KEY, JSON.stringify(d)); note = t('sheet.ui.displaySaved'); } catch { note = t('sheet.ui.displayNotSaved'); } }
  function loadDefault() { try { const v = localStorage.getItem(KEY); if (v) { onChange(JSON.parse(v)); note = t('sheet.ui.displayLoaded'); } else note = t('sheet.ui.displayNone'); } catch { note = t('sheet.ui.displayNone'); } }
</script>

<details class="sd" data-testid="sheets-display">
  <summary>{t('sheet.ui.display')}</summary>
  <label class="chk"><input type="checkbox" checked={!!d.colorByDiameter} onchange={(e) => set({ colorByDiameter: e.currentTarget.checked || undefined })} data-testid="sheets-color-dia" /> {t('sheet.ui.colorByDia')}</label>
  <table>
    <thead><tr><th>{t('sheet.ui.layer')}</th><th>{t('sheet.ui.onScreen')}</th><th>{t('sheet.ui.onPlan')}</th><th>{t('sheet.ui.textSize')}</th><th>{t('sheet.ui.weight')}</th></tr></thead>
    <tbody>
      {#each LAYERS as l}
        <tr>
          <td>{l}</td>
          <td><input type="checkbox" checked={!(d.hidden?.screen ?? []).includes(l)} onchange={(e) => hide('screen', l, !e.currentTarget.checked)} /></td>
          <td><input type="checkbox" checked={!(d.hidden?.plan ?? []).includes(l)} onchange={(e) => hide('plan', l, !e.currentTarget.checked)} data-testid="sheets-plan-{l}" /></td>
          <td><input type="number" min="0.5" max="3" step="0.1" value={d.layers?.[l]?.text ?? 1} onchange={(e) => layer(l, { text: Number(e.currentTarget.value) })} /></td>
          <td><input type="number" min="0.05" max="2" step="0.05" value={d.layers?.[l]?.weight ?? ''} placeholder="—" onchange={(e) => layer(l, { weight: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="lbl">
    <span>{t('sheet.ui.barLabel')}</span>
    <input class="order" value={label.order.join(' ')} onchange={(e) => set({ barLabel: { ...label, order: e.currentTarget.value.split(/\s+/).filter((x): x is LabelPart => (PARTS as string[]).includes(x)) } })} data-testid="sheets-label-order" />
    {#each PARTS as p}
      <label>{t(`sheet.ui.part.${p}`)}<input class="aff" placeholder={t('sheet.ui.prefixShort')} value={label.prefix?.[p] ?? ''} onchange={(e) => set({ barLabel: { ...label, prefix: { ...label.prefix, [p]: e.currentTarget.value } } })} /><input class="aff" placeholder={t('sheet.ui.suffixShort')} value={label.suffix?.[p] ?? ''} onchange={(e) => set({ barLabel: { ...label, suffix: { ...label.suffix, [p]: e.currentTarget.value } } })} /></label>
    {/each}
    <span class="muted" data-testid="sheets-label-sample">{sample}</span>
  </div>
  <div class="row">
    <button onclick={saveDefault} data-testid="sheets-display-save">{t('sheet.ui.displaySave')}</button>
    <button onclick={loadDefault}>{t('sheet.ui.displayLoad')}</button>
    <button onclick={() => onChange(undefined)}>{t('sheet.ui.displayReset')}</button>
  </div>
  {#if note}<p class="muted" role="status">{note}</p>{/if}
</details>

<style>
  .sd summary { font-size: 0.68rem; cursor: pointer; color: var(--st-text); }
  .sd { font-size: 0.66rem; color: var(--st-text-2); }
  table { border-collapse: collapse; margin: 0.25rem 0; }
  th, td { padding: 0.05rem 0.4rem 0.05rem 0; text-align: left; font-weight: normal; }
  input[type='number'] { width: 3.2rem; }
  input, button { font-size: 0.66rem; padding: 0.05rem 0.3rem; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  button { cursor: pointer; }
  .chk { display: flex; align-items: center; gap: 0.25rem; }
  .lbl { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.6rem; margin: 0.25rem 0; }
  .lbl label { display: inline-flex; align-items: center; gap: 0.15rem; }
  /* The order input holds the five part names: wide enough for them, never wider than the panel. */
  .lbl .order { width: 17rem; max-width: 100%; }
  .aff { width: 2.4rem; }
  .row { display: flex; gap: 0.3rem; }
  .muted { margin: 0; color: var(--st-text-2); }
</style>
