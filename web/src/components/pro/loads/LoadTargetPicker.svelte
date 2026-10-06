<script lang="ts" module>
  import type { TargetSpec as Spec } from '../../../lib/model/loads/load-targets';
  /** A target, or the selected members taken as one physical member. */
  export type PickedSpec = Spec | { by: 'chain' };
</script>

<script lang="ts">
  /**
   * What a load or a support goes on, the same choice everywhere (`model/loads/load-targets.ts`):
   * the selection, ids, a group, a range of coordinates, a section, a kind of member, for a member
   * load a physical member (the selected members as one straight chain), and for the self-weight
   * the whole model.
   *
   * On the selection, a button beside the choice puts the pointer on selecting what it needs when
   * another tool has it; clicking in the model then only selects, and nothing is added until the
   * card's Add. What the choice resolves to (`summary`) is shown by the card, beside its Add.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { drawState } from '../../../lib/store/draw-state.svelte';
  import { resolveTargets, type TargetEntity } from '../../../lib/model/loads/load-targets';
  import { orderedChain } from '../../../lib/model/loads/member-load-tools';
  import QuantityInput from './QuantityInput.svelte';

  interface Props {
    entity: TargetEntity;
    /** Offer the physical member: the selected members as one chain (member loads only). */
    allowChain?: boolean;
    /** Offer the whole model (the self-weight). */
    allowAll?: boolean;
    spec: PickedSpec;
    /** What the choice resolves to, said: for the card to show beside its Add. */
    summary?: { text: string; warn: boolean };
  }
  let { entity, allowChain = false, allowAll = false, spec = $bindable(), summary = $bindable() }: Props = $props();

  type By = PickedSpec['by'];
  const modes = $derived<By[]>([
    ...(allowAll ? ['all' as const] : []),
    ...(entity === 'members' ? ['selection', 'ids', 'group', 'range', 'section', 'kind', ...(allowChain ? ['chain' as const] : [])] as By[]
      : ['selection', 'ids', 'group', 'range'] as By[]),
  ]);
  let by = $state<By>(spec.by);
  let idsText = $state('');
  let groupId = $state<number | null>(null);
  let axis = $state<'X' | 'Y' | 'Z'>('Z');
  let min = $state(0);
  let max = $state(0);
  let sectionId = $state<number | null>(null);
  let kind = $state<'column' | 'beam' | 'inclined' | 'truss'>('beam');

  const groups = $derived([...modelStore.model.groups.values()].filter((g) => g.kind !== 'floorLoad' &&
    (entity === 'nodes' ? (g.members.nodes?.length ?? 0) > 0 : entity === 'members' ? (g.members.elements?.length ?? 0) > 0 : (g.members.quads?.length ?? 0) + (g.members.plates?.length ?? 0) > 0)));
  const sections = $derived([...modelStore.sections.values()]);

  /** The spec, from the fields alone: written out, never read back, so it cannot loop. */
  $effect(() => {
    const mode: By = modes.includes(by) ? by : modes[0]!;
    switch (mode) {
      case 'all': case 'selection': case 'chain': spec = { by: mode }; break;
      case 'ids': spec = { by: 'ids', text: idsText }; break;
      case 'group': spec = { by: 'group', groupId: groupId ?? groups[0]?.id ?? -1 }; break;
      case 'range': spec = { by: 'range', axis, min, max }; break;
      case 'section': spec = { by: 'section', sectionId: sectionId ?? sections[0]?.id ?? -1 }; break;
      case 'kind': spec = { by: 'kind', kind }; break;
    }
  });

  const quadSelection = $derived([...uiStore.selectedShells].filter((k) => k[0] === 'q').map((k) => Number(k.slice(1))));
  const plateSelection = $derived([...uiStore.selectedShells].filter((k) => k[0] === 'p').map((k) => Number(k.slice(1))));
  const count = $derived.by(() => {
    if (spec.by === 'chain') return null;
    const sel = { nodes: uiStore.selectedNodes, elements: uiStore.selectedElements, quads: quadSelection, plates: plateSelection };
    const n = resolveTargets(entity, spec, modelStore.model as never, sel).length;
    // Shells are quads and triangles; typed ids name quads.
    return entity === 'quads' && spec.by !== 'ids' ? n + resolveTargets('plates', spec, modelStore.model as never, sel).length : n;
  });
  const chain = $derived(spec.by === 'chain'
    ? orderedChain([...uiStore.selectedElements], (id) => modelStore.elements.get(id), (id) => modelStore.nodes.get(id))
    : null);
  const noun = $derived(t(entity === 'nodes' ? 'loadTarget.nodes' : entity === 'members' ? 'loadTarget.members' : 'loadTarget.slabs'));

  $effect(() => {
    summary = spec.by === 'chain'
      ? (chain ? { text: tp('loadTarget.chainOk', { n: chain.links.length, L: chain.total.toFixed(3) }), warn: false } : { text: t('loadTarget.chainBad'), warn: true })
      : spec.by === 'all' && entity === 'members'
        ? { text: tp('loadTarget.countAll', { members: modelStore.elements.size, slabs: modelStore.quads.size + modelStore.plates.size }), warn: false }
        : { text: tp('loadTarget.count', { n: count ?? 0, what: noun }), warn: false };
  });

  /** On the selection: whether the pointer selects what this picks, and the button that makes it. */
  const pickMode = $derived(entity === 'nodes' ? 'nodes' : entity === 'members' ? 'elements' : 'shells');
  const selecting = $derived(uiStore.currentTool === 'select' && uiStore.selectMode === pickMode);
  function selectWithMouse() {
    if (drawState.active) drawState.stop();
    uiStore.currentTool = 'select';
    uiStore.selectMode = pickMode as never;
  }
</script>

<div class="lt" data-testid="load-target">
  <div class="lt-row"><span class="lt-label">{t('loadTarget.applyTo')}</span>
    <select bind:value={by} aria-label={t('loadTarget.applyTo')} data-testid="load-target-by">
      {#each modes as m (m)}<option value={m}>{t(`loadTarget.by.${m}`)}</option>{/each}
    </select>
    {#if (spec.by === 'selection' || spec.by === 'chain') && !selecting}
      <button type="button" class="pk" onclick={selectWithMouse} title={tp('loadTarget.activateSelectHint', { what: noun })} data-testid="load-target-activate">{t('loadTarget.activateSelect')}</button>
    {/if}
  </div>

  {#if spec.by === 'ids'}
    <label class="lt-row"><span class="lt-label">{t('loadTarget.ids')}</span>
      <input type="text" bind:value={idsText} placeholder="1, 4, 7-12" class="lt-wide" data-testid="load-target-ids" /></label>
  {:else if spec.by === 'group'}
    <label class="lt-row"><span class="lt-label">{t('loadTarget.group')}</span>
      {#if groups.length}
        <select value={groupId ?? groups[0]?.id} onchange={(e) => (groupId = Number(e.currentTarget.value))} data-testid="load-target-group">
          {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
        </select>
      {:else}<span class="lt-hint">{t('loadTarget.noGroups')}</span>{/if}
    </label>
  {:else if spec.by === 'range'}
    <div class="lt-row">
      <select bind:value={axis} data-testid="load-target-axis" aria-label={t('loadTarget.axis')}>
        <option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option>
      </select>
      <label>{t('loadTarget.from')} <QuantityInput bind:value={min} quantity="length" cls="lt-num" testid="load-target-min" /></label>
      <label>{t('loadTarget.to')} <QuantityInput bind:value={max} quantity="length" cls="lt-num" testid="load-target-max" /></label>
    </div>
  {:else if spec.by === 'section'}
    <label class="lt-row"><span class="lt-label">{t('loadTarget.section')}</span>
      <select value={sectionId ?? sections[0]?.id} onchange={(e) => (sectionId = Number(e.currentTarget.value))} data-testid="load-target-section">
        {#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      </select>
    </label>
  {:else if spec.by === 'kind'}
    <label class="lt-row"><span class="lt-label">{t('loadTarget.kind')}</span>
      <select bind:value={kind} data-testid="load-target-kind">
        {#each ['beam', 'column', 'inclined', 'truss'] as k (k)}<option value={k}>{t(`loadTarget.kind.${k}`)}</option>{/each}
      </select>
    </label>
  {/if}

</div>

<style>
  .lt { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; border-top: 1px solid var(--st-surface-3); margin-top: 4px; }
  .lt-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.72rem; color: var(--st-text-3); }
  .lt-label { min-width: 4.5rem; }
  .lt-row :global(.lt-num) { width: 60px; }
  .lt-wide { flex: 1; min-width: 8rem; }
  .lt-row :global(input), .lt-row select { padding: 3px 5px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text); font-size: 0.74rem; font-family: var(--st-mono); }
  .lt-hint { font-size: 0.64rem; color: var(--st-text-3); }
  .pk { padding: 1px 8px; font-size: 0.64rem; background: none; border: 1px dashed var(--st-hair); border-radius: 4px; color: var(--st-text-2); cursor: pointer; }
  .pk:hover { border-color: var(--st-interactive); color: var(--st-text); }
</style>
