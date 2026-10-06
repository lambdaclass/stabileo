<script lang="ts">
  /**
   * Where an action of the generator applies: the whole model, a load zone, a group or a box of
   * coordinates (`model/loads/region-nodes.ts`).
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { unitQ } from '../../../lib/store/display-units.svelte';
  import QuantityInput from './QuantityInput.svelte';
  import type { ActionRegion } from '../../../lib/model/loads/region-nodes';

  interface Props { region: ActionRegion; testid: string; onchange?: (r: ActionRegion) => void }
  let { region = $bindable(), testid, onchange }: Props = $props();

  const zones = $derived([...modelStore.model.groups.values()].filter((g) => g.kind === 'loadZone'));
  const groups = $derived([...modelStore.model.groups.values()].filter((g) => g.kind !== 'loadZone' && g.kind !== 'floorLoad'));
  /** SI; an empty field leaves its axis unbounded. */
  let box = $state<Record<'x0' | 'x1' | 'y0' | 'y1' | 'z0' | 'z1', number | null>>({ x0: null, x1: null, y0: null, y1: null, z0: null, z1: null });
  const pair = (x: number | null, y: number | null): [number, number] | undefined => (x !== null && y !== null ? [x, y] : undefined);
  function setBox() {
    const x = pair(box.x0, box.x1), y = pair(box.y0, box.y1), z = pair(box.z0, box.z1);
    region = { kind: 'box', ...(x ? { x } : {}), ...(y ? { y } : {}), ...(z ? { z } : {}) };
    onchange?.(region);
  }
  function pick(v: string) {
    if (v === 'all') region = { kind: 'all' };
    else if (v === 'box') setBox();
    else if (v.startsWith('z:')) region = { kind: 'zone', zoneId: Number(v.slice(2)) };
    else if (v.startsWith('g:')) region = { kind: 'group', groupId: Number(v.slice(2)) };
    if (v !== 'box') onchange?.(region);
  }
  const key = $derived(region.kind === 'zone' ? `z:${region.zoneId}` : region.kind === 'group' ? `g:${region.groupId}` : region.kind);
</script>

<div class="ar">
  <label>{t('actionRegion.on')}
    <select value={key} onchange={(e) => pick(e.currentTarget.value)} data-testid={testid}>
      <option value="all">{t('actionRegion.all')}</option>
      {#each zones as z (z.id)}<option value={`z:${z.id}`}>{t('loadZone.zone')} · {z.name}</option>{/each}
      {#each groups as g (g.id)}<option value={`g:${g.id}`}>{g.name}</option>{/each}
      <option value="box">{t('floorLoad.range')}</option>
    </select>
  </label>
  {#if region.kind === 'box'}
    <span class="ar-box">
      {#each ['x', 'y', 'z'] as a (a)}
        <span>{a.toUpperCase()} <QuantityInput bind:value={box[`${a}0` as 'x0']} nullable quantity="length" showUnit={false} cls="ar-num" onchange={setBox} /> … <QuantityInput bind:value={box[`${a}1` as 'x1']} nullable quantity="length" showUnit={false} cls="ar-num" onchange={setBox} /></span>
      {/each}
      <span class="ar-unit">{unitQ('length')}</span>
    </span>
  {/if}
</div>

<style>
  .ar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; color: var(--st-text-2); }
  .ar label { display: inline-flex; align-items: center; gap: 4px; }
  .ar-box { display: inline-flex; flex-wrap: wrap; gap: 4px 8px; }
  .ar-box :global(.ar-num) { width: 48px; }
  .ar-unit { font-size: 0.66rem; color: var(--st-text-3); }
</style>
