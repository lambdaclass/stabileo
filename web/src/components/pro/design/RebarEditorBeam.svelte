<script lang="ts">
  /**
   * Beam reinforcement editor — three independent regions plus per-region stirrups.
   *
   * Every write routes through `rebar-edit.ts` → `modelStore.reinforcementTransaction`,
   * so one control change is one undo step, results survive and the row re-verifies
   * immediately from retained demand.
   */
  import { t } from '../../../lib/i18n';
  import { REBAR_DB } from '../../../lib/engine/codes/argentina/cirsoc201';
  import { rebarGroupArea, layersTotalArea } from '../../../lib/engine/station-design-forces';
  import { maxBarsPerRow } from '../../../lib/engine/design/candidate-enumerate-beam';
  import type { MemberContext } from '../../../lib/engine/design/member-context';
  import {
    getRegionLayers, setRegionLayers, addLayerRow, removeLayerRow, updateLayer,
    getStirrups, setStirrups, type LayerField, type StirrupField,
  } from '../../../lib/store/rebar-edit';

  interface Props { elementId: number; ctx: MemberContext; version: number }
  let { elementId, ctx, version }: Props = $props();

  const LONG_DIAS = REBAR_DB.filter(r => r.diameter >= 10).map(r => r.diameter);
  const STIRRUP_DIAS = REBAR_DB.filter(r => r.diameter <= 12).map(r => r.diameter);

  const REGIONS: Array<{ field: LayerField; key: string }> = [
    { field: 'topStartLayers', key: 'design.batch.fieldTopStart' },
    { field: 'bottomSpanLayers', key: 'design.batch.fieldBottomSpan' },
    { field: 'topEndLayers', key: 'design.batch.fieldTopEnd' },
  ];
  const STIRRUPS: Array<{ field: StirrupField; key: string }> = [
    { field: 'stirrupsSupport', key: 'design.batch.fieldStirrupsSupport' },
    { field: 'stirrupsSpan', key: 'design.batch.fieldStirrupsSpan' },
  ];

  /** `version` is read so every control re-reads the model after a transaction. */
  const layerSets = $derived.by(() => {
    void version;
    return REGIONS.map(r => ({ ...r, layers: getRegionLayers(elementId, r.field) }));
  });
  const stirrupSets = $derived.by(() => {
    void version;
    return STIRRUPS.map(s => ({ ...s, def: getStirrups(elementId, s.field) }));
  });

  function perRow(dia: number): number {
    return maxBarsPerRow(ctx.axes.bFlex, ctx.material.cover, ctx.material.stirrupDia, dia);
  }
  function fits(count: number, dia: number): boolean {
    const pr = perRow(dia);
    return pr > 0 && count <= pr;
  }
  /** Distribute a row's bars across the available width. */
  function autoSplit(field: LayerField) {
    const layers = getRegionLayers(elementId, field);
    if (layers.length === 0) return;
    const total = layers.reduce((s, l) => s + l.count, 0);
    const dia = layers[0].diameter;
    const pr = Math.max(1, perRow(dia));
    const rows = Math.max(1, Math.ceil(total / pr));
    const out = [];
    let left = total;
    for (let r = 0; r < rows; r++) {
      const take = Math.min(pr, left);
      out.push({ count: take, diameter: dia, row: r });
      left -= take;
    }
    setRegionLayers(elementId, field, out);
  }
</script>

<div class="editor" data-testid={`rebar-editor-beam-${elementId}`}>
  {#each layerSets as reg (reg.field)}
    <div class="region">
      <div class="region-head">
        <span class="region-title">{t(reg.key)}</span>
        <button class="mini" data-testid={`add-row-${reg.field}-${elementId}`}
                onclick={() => addLayerRow(elementId, reg.field)}>+ row</button>
        {#if reg.layers.length > 0}
          <button class="mini" data-testid={`auto-split-${reg.field}-${elementId}`}
                  onclick={() => autoSplit(reg.field)}>auto</button>
          <span class="total">{layersTotalArea(reg.layers).toFixed(2)} cm²</span>
        {/if}
      </div>
      {#each reg.layers as layer (layer.row)}
        <div class="line">
          <span class="idx">r{layer.row}</span>
          <input type="number" class="num" min="1" max="20" value={layer.count}
                 data-testid={`count-${reg.field}-${layer.row}-${elementId}`}
                 aria-label={t('design.batch.count')}
                 onchange={(e) => { const v = +e.currentTarget.value; if (v >= 1) updateLayer(elementId, reg.field, layer.row, 'count', v); }} />
          <select class="sel" value={layer.diameter}
                  data-testid={`dia-${reg.field}-${layer.row}-${elementId}`}
                  aria-label={t('design.batch.diameter')}
                  onchange={(e) => updateLayer(elementId, reg.field, layer.row, 'diameter', +e.currentTarget.value)}>
            {#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select>
          <span class="area">{rebarGroupArea(layer).toFixed(2)} cm²</span>
          {#if !fits(layer.count, layer.diameter)}
            <span class="warn" title={`max ${perRow(layer.diameter)} bars/row`}>! fit</span>
          {/if}
          <button class="mini mini-rm" aria-label="remove row"
                  data-testid={`rm-row-${reg.field}-${layer.row}-${elementId}`}
                  onclick={() => removeLayerRow(elementId, reg.field, layer.row)}>×</button>
        </div>
      {/each}
      {#if reg.layers.length === 0}
        <div class="line empty">{t('design.badge.noRebar')}</div>
      {/if}
    </div>
  {/each}

  {#each stirrupSets as st (st.field)}
    <div class="region">
      <div class="region-head"><span class="region-title">{t(st.key)}</span></div>
      <div class="line">
        <span class="sub">eØ</span>
        <select class="sel sel-sm" value={st.def?.diameter ?? 8}
                data-testid={`stir-dia-${st.field}-${elementId}`}
                aria-label={t('design.batch.diameter')}
                onchange={(e) => setStirrups(elementId, st.field, { diameter: +e.currentTarget.value })}>
          {#each STIRRUP_DIAS as d (d)}<option value={d}>{d}</option>{/each}
        </select>
        <input type="number" class="num num-sm" min="2" max="6" value={st.def?.legs ?? 2}
               data-testid={`stir-legs-${st.field}-${elementId}`}
               aria-label={t('design.batch.legs')}
               onchange={(e) => setStirrups(elementId, st.field, { legs: +e.currentTarget.value })} />
        <span class="sub">L c/</span>
        <input type="number" class="num num-sp" min="0.05" max="0.5" step="0.025" value={st.def?.spacing ?? 0.15}
               data-testid={`stir-spacing-${st.field}-${elementId}`}
               aria-label={t('design.batch.spacing')}
               onchange={(e) => setStirrups(elementId, st.field, { spacing: +e.currentTarget.value })} />
        <span class="sub">m</span>
      </div>
    </div>
  {/each}
</div>

<style>
  .editor { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 8px; }
  .region { background: #0d1f36; border: 1px solid #16304f; border-radius: 4px; padding: 5px 7px; }
  .region-head { display: flex; align-items: center; gap: 5px; margin-bottom: 3px; flex-wrap: wrap; }
  .region-title { font-size: 0.7rem; font-weight: 600; color: #8ab; }
  .total { font-size: 0.66rem; color: #7a9; font-family: monospace; margin-left: auto; }
  .line { display: flex; align-items: center; gap: 4px; margin: 2px 0; }
  .line.empty { color: #667; font-size: 0.66rem; font-style: italic; }
  .idx { font-family: monospace; font-size: 0.64rem; color: #678; width: 16px; }
  .num { width: 44px; padding: 1px 4px; background: #0b1c30; border: 1px solid #1d3a5c;
    border-radius: 3px; color: #dde; font-size: 0.7rem; }
  .num-sm { width: 34px; } .num-sp { width: 54px; }
  .sel { padding: 1px 3px; background: #0b1c30; border: 1px solid #1d3a5c;
    border-radius: 3px; color: #dde; font-size: 0.7rem; }
  .sel-sm { width: 46px; }
  .area { font-family: monospace; font-size: 0.64rem; color: #8a9; }
  .sub { font-size: 0.64rem; color: #778; }
  .warn { font-size: 0.64rem; color: #ff8a8a; font-weight: 700; }
  .mini { padding: 0 5px; background: #14304f; border: 1px solid #2a5a8a;
    border-radius: 3px; color: #bcd; font-size: 0.64rem; cursor: pointer; }
  .mini:hover { background: #1e4a78; }
  .mini:focus-visible { outline: 2px solid #4ecdc4; outline-offset: 1px; }
  .mini-rm { color: #f99; border-color: #7a3030; }
  input:focus-visible, select:focus-visible { outline: 2px solid #4ecdc4; outline-offset: 1px; }
</style>
