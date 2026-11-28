<script lang="ts">
  import { planNamesIn } from '../../../lib/axes/typed-frame';
  import { t } from '../../../lib/i18n';
  import Hint from '../Hint.svelte';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import type { PlateMeshPreview } from './plate-mesh-preview.svelte';

  let { settings }: { settings: PlateMeshPreview['settings'] } = $props();
  const gridOn = $derived(settings.element === 'quad' && settings.pattern !== 'free');
</script>

<div class="pmd-row">
  <div class="pmd-seg" role="group" aria-label={t('plates.element')}>
    <button class:on={settings.element === 'quad'} aria-pressed={settings.element === 'quad'} onclick={() => (settings.element = 'quad')} data-testid="plate-mesh-quad">{t('plates.elementQuad')}</button>
    <button class:on={settings.element === 'tri'} aria-pressed={settings.element === 'tri'} onclick={() => (settings.element = 'tri')} data-testid="plate-mesh-tri">{t('plates.elementTri')}</button>
  </div>
  <label>{gridOn ? t(settings.pattern === 'square' ? 'plates.side' : 'plates.sideA') : t('plates.size')} <QuantityInput min={0.01} value={settings.size} quantity="length" cls="pmd-num" testid="plate-mesh-size" onchange={(v) => { if (v > 0) settings.size = v; }} /></label>
  {#if gridOn && settings.pattern === 'rect'}
    <label>{t('plates.sideB')} <QuantityInput min={0.01} value={settings.sizeV} quantity="length" cls="pmd-num" testid="plate-mesh-size-v" onchange={(v) => { if (v > 0) settings.sizeV = v; }} /></label>
  {/if}
</div>
{#if settings.element === 'quad'}
  <div class="pmd-row">
    <span>{t('plates.pattern')}</span>
    <div class="pmd-seg" role="group" aria-label={t('plates.pattern')}>
      <button class:on={settings.pattern === 'free'} aria-pressed={settings.pattern === 'free'} onclick={() => (settings.pattern = 'free')} data-testid="plate-mesh-free">{t('plates.patternFree')}</button>
      <button class:on={settings.pattern === 'rect'} aria-pressed={settings.pattern === 'rect'} onclick={() => (settings.pattern = 'rect')} data-testid="plate-mesh-rect">{t('plates.patternRect')}</button>
      <button class:on={settings.pattern === 'square'} aria-pressed={settings.pattern === 'square'} onclick={() => (settings.pattern = 'square')} data-testid="plate-mesh-square">{t('plates.patternSquare')}</button>
    </div>
    {#if gridOn}
      <label>{t('plates.orient')}
        <select bind:value={settings.orient} data-testid="plate-mesh-orient">
          <option value="plate">{t('plates.orientPlate')}</option>
          <option value="globalX">{planNamesIn(t('plates.orientX'))}</option>
        </select>
      </label>
    {/if}
  </div>
  {#if gridOn}<Hint text={t('plates.patternHint')} />{/if}
{/if}
<label class="pmd-check" title={t('plates.followMembersHint')}>
  <input type="checkbox" bind:checked={settings.followMembers} data-testid="plate-mesh-follow" /> {t('plates.followMembers')}
</label>
<Hint text={t('plates.followMembersHint')} />

<style>
  .pmd-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .pmd-row label, .pmd-check { display: inline-flex; gap: 5px; align-items: center; }
  select { padding: 2px 4px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; }
  .pmd-row :global(input.pmd-num) { width: 64px; padding: 2px 5px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font-family: var(--st-font-mono, monospace); }
  .pmd-seg { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .pmd-seg button { padding: 3px 9px; background: none; border: none; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .pmd-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .pmd-seg button.on { background: var(--st-accent); color: #fff; }
</style>
