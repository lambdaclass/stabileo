<script lang="ts">
  /** Each support: what it restrains, and on which node it stands (any node without a support of its own). */
  import { uiStore, modelStore } from '../../lib/store';
  import { whatIf } from '../../lib/store/whatif.svelte';
  import { supportTypeOptions } from '../../lib/pro/support-types';
  import { supportNameShown } from '../../lib/axes/user-names';
  import type { SupportType } from '../../lib/store/model.svelte';
  import { t } from '../../lib/i18n';
  import WifPlace from './WifPlace.svelte';

  const is3D = $derived(uiStore.is3DWorkspace);
  /* As they were on entry: a moved support is still the same support. */
  const supports = $derived((whatIf.baseline ? whatIf.baseline.supports.map(([, sup]) => ({ ...sup, type: sup.type as SupportType }))
    : [...modelStore.supports.values()]).sort((a, b) => a.id - b.id));
  const nodeIds = $derived((whatIf.baseline?.nodes ?? []).map(([id]) => id).sort((a, b) => a - b));
  const nodeOf = (s: { id: number; nodeId: number }) => whatIf.supportNode[s.id] ?? s.nodeId;
  /* A node can hold one support: the others' nodes are not offered. */
  const free = (s: { id: number; nodeId: number }) => {
    const taken = new Set(supports.filter((o) => o.id !== s.id && !whatIf.supportAlong[o.id]).map(nodeOf));
    return nodeIds.filter((id) => !taken.has(id));
  };

  const SUPPORTS_2D: Array<{ v: SupportType; k: string }> = [
    { v: 'fixed', k: 'table.fixed' }, { v: 'pinned', k: 'table.pinned' },
    { v: 'rollerX', k: 'table.rollerX' }, { v: 'rollerZ', k: 'table.rollerY' },
  ];
  const SUPPORTS_3D: Array<{ v: SupportType; k: string }> = [
    { v: 'fixed3d', k: 'pro.fixed3d' }, { v: 'pinned3d', k: 'pro.pinned3d' },
    { v: 'rollerX', k: 'pro.rollerX' }, { v: 'rollerY', k: 'pro.rollerY' }, { v: 'rollerZ', k: 'pro.rollerZ' },
    { v: 'rollerXY', k: 'pro.rollerXY' }, { v: 'rollerXZ', k: 'pro.rollerXZ' }, { v: 'rollerYZ', k: 'pro.rollerYZ' },
  ];
  const options = $derived(is3D ? SUPPORTS_3D : SUPPORTS_2D);
  function currentLabel(type: SupportType): string {
    return supportTypeOptions(is3D, t).find(o => o.value === type)?.label ?? supportNameShown(type, type, is3D);
  }
  function label(o: { v: SupportType; k: string }): string {
    return supportNameShown(o.v, t(o.k), is3D);
  }
</script>

{#if !supports.length}<p class="wif-empty">{t('whatif.noSupports')}</p>{/if}
{#each supports as s (s.id)}
  {@const type = whatIf.supportTypes[s.id] ?? s.type}
  {@const moved = nodeOf(s) !== s.nodeId || s.id in whatIf.supportAlong}
  <div class="wif-item" class:changed={s.id in whatIf.supportTypes || moved}>
    <div class="wif-item-title">{t('whatif.supportN').replace('{n}', String(s.id))}</div>
    <label class="wif-row">
      <span class="wif-label">{t('whatif.supportType')}</span>
      <select class="wif-select" value={type} onchange={(e) => whatIf.setSupportType(s.id, e.currentTarget.value as SupportType)}
        data-testid="whatif-support-{s.id}">
        {#if !options.some((o) => o.v === type)}<option value={type}>{currentLabel(type)}</option>{/if}
        {#each options as o (o.v)}<option value={o.v}>{label(o)}</option>{/each}
      </select>
    </label>
    <WifPlace nodeId={nodeOf(s)} along={whatIf.supportAlong[s.id]} nodes={free(s)}
      onNode={(id) => whatIf.setSupportNode(s.id, id)} onAlong={(el, at) => whatIf.setSupportAlong(s.id, el, at)} testid="whatif-supportnode-{s.id}" />
  </div>
{/each}
