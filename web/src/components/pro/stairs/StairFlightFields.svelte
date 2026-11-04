<!--
  A stair's flight: riser, tread, number of risers and waist, with what that geometry is (rise,
  run, angle, the Blondel stride) and its warnings. One component for the two places a stair is
  stated: the inclined plate the analysis meshes (Model › Shells) and the stair the desk designs.
  Values in metres; the inputs show the display units.
-->
<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { blondel, checkStairSpec, flightGeometry } from '../../../lib/model/stair';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import QuantityInput from '../loads/QuantityInput.svelte';

  let { riser = $bindable(), tread = $bindable(), steps = $bindable(), waist = $bindable(), testid = 'stair' }:
    { riser: number; tread: number; steps: number; waist: number; testid?: string } = $props();

  const spec = $derived({ riser, tread, steps, waist });
  const geom = $derived(flightGeometry(spec));
  const check = $derived(checkStairSpec(spec));
  const stride = $derived(blondel(spec));
</script>

<div class="sff" data-testid="{testid}-flight">
  <div class="input-row">
    <span class="lbl">{t('stair.riser')}:</span>
    <QuantityInput bind:value={riser} min={0.05} quantity="length" cls="num" ariaLabel={t('stair.riser')} testid="{testid}-riser" />
    <span class="lbl">{t('stair.tread')}:</span>
    <QuantityInput bind:value={tread} min={0.1} quantity="length" cls="num" ariaLabel={t('stair.tread')} testid="{testid}-tread" />
  </div>
  <div class="input-row">
    <label for="{testid}-steps">{t('stair.steps')}:</label>
    <input id="{testid}-steps" type="number" bind:value={steps} step="1" min="2" max="60" class="num" data-testid="{testid}-steps" />
    <span class="lbl">{t('stair.waist')}:</span>
    <QuantityInput bind:value={waist} min={0.05} quantity="length" cls="num" ariaLabel={t('stair.waist')} testid="{testid}-waist" />
  </div>
  <dl class="readout" data-testid="{testid}-readout">
    <div><dt>{t('stair.rise')}</dt><dd>{fmtQ(geom.rise, 'length')} {unitQ('length')}</dd></div>
    <div><dt>{t('stair.run')}</dt><dd>{fmtQ(geom.run, 'length')} {unitQ('length')}</dd></div>
    <div><dt>{t('stair.angle')}</dt><dd>{geom.angleDeg.toFixed(1)}°</dd></div>
    <div><dt>{t('stair.blondel')}</dt><dd>{fmtQ(stride, 'length')} {unitQ('length')}</dd></div>
  </dl>
  {#each check.warnings as w (w.key)}<div class="warn" data-testid="{testid}-warn">⚠ {te(w)}</div>{/each}
  {#each check.errors as w (w.key)}<div class="warn" data-testid="{testid}-error">✕ {te(w)}</div>{/each}
</div>

<style>
  .sff { display: flex; flex-direction: column; gap: 4px; }
  .input-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.72rem; }
  .lbl, label { color: var(--st-text-2); }
  .num { width: 5rem; }
  .readout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 10px; margin: 2px 0; font-size: 0.68rem; }
  .readout div { display: flex; justify-content: space-between; gap: 6px; }
  .readout dt { color: var(--st-text-2); }
  .readout dd { margin: 0; font-variant-numeric: tabular-nums; }
  .warn { font-size: 0.68rem; color: var(--st-warn); }
</style>
