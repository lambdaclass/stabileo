<script lang="ts">
  import { untrack } from 'svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { supportTypeOptions } from '../../lib/pro/support-types';
  import { drawState } from '../../lib/store/draw-state.svelte';
  import WriteInPanelButton from './WriteInPanelButton.svelte';
  import LoadTargetPicker, { type PickedSpec } from './loads/LoadTargetPicker.svelte';
  import { resolveTargets } from '../../lib/model/loads/load-targets';
  import WriteCard from './WriteCard.svelte';
  import SupportDofFields from './SupportDofFields.svelte';
  import { DOF_SPRING } from '../../lib/model/support-3d';

  const is3D = $derived(uiStore.is3DWorkspace);

  const supportTypes = $derived(supportTypeOptions(is3D, t));

  /*
   * One way to add a support, as one way to add a load: the card's support (`drawState`'s draft)
   * on what "Apply to" names (the selection, numbers, a group, a range), all in one undo step. A
   * node that already has a support takes the new one in its place (one support per node).
   */
  let target = $state<PickedSpec>({ by: 'selection' });
  let summary = $state<{ text: string; warn: boolean }>({ text: '', warn: false });
  let wError = $state<string | null>(null);
  let done = $state<string | null>(null);

  const supports = $derived([...modelStore.supports.values()]);

  // Opened on the selection from the model's context menu: an open card turns to it.
  $effect.pre(() => {
    if (drawState.writeSeq > 0) untrack(() => { target = { by: 'selection' }; done = null; wError = null; });
  });

  function addSupport() {
    const ids = resolveTargets('nodes', target as never, modelStore.model as never, { nodes: uiStore.selectedNodes, elements: uiStore.selectedElements });
    if (ids.length === 0) { wError = t('pro.supportNoTarget'); done = null; return; }
    const held = new Set([...modelStore.supports.values()].map((s) => s.nodeId));
    const replaced = ids.filter((id) => held.has(id)).length;
    modelStore.batch(() => { for (const id of ids) drawState.addSupportAt(id); });
    wError = null;
    done = tp('pro.supportsAdded', { n: ids.length, replaced });
  }

  function removeSupport(id: number) {
    modelStore.removeSupport(id);
  }

  const DOF_NAME: Record<string, string> = { tx: 'Fx', ty: 'Fy', tz: 'Fz', rx: 'Mx', ry: 'My', rz: 'Mz' };
  /**
   * Fixed and pinned by name; any other support by what it holds (`Fx Fy · Mz`) and what it
   * holds elastically (`kz`), the same reading its symbol in the model gives.
   */
  function kindLabel(s: { type: string; dofRestraints?: Record<string, boolean> } & Partial<Record<'kx' | 'ky' | 'kz' | 'krx' | 'kry' | 'krz', number>>): string {
    if (s.type === 'fixed3d' || s.type === 'pinned3d' || !s.dofRestraints && s.type !== 'spring3d') {
      return supportTypes.find((st) => st.value === s.type)?.label ?? s.type;
    }
    const held = DOF_SPRING.filter(([d]) => s.dofRestraints?.[d]).map(([d]) => DOF_NAME[d]);
    const springs = DOF_SPRING.filter(([, k]) => (s[k] ?? 0) > 0).map(([, k]) => k);
    return [held.join(' '), springs.join(' ')].filter(Boolean).join(' · ') || t('pro.supportFree');
  }

  /** What a support adds to its type: it lifts off, it has springs or curves, it is inclined. */
  function supportTags(s: { type: string; dofRestraints?: unknown; uplift?: boolean; isInclined?: boolean; curves?: unknown; kx?: number; ky?: number; kz?: number; krx?: number; kry?: number; krz?: number }): string[] {
    const tags: string[] = [];
    // A support described by its restraints already names its springs (`kindLabel`).
    const named = !!s.dofRestraints || s.type === 'spring3d';
    if (s.uplift) tags.push(t('support.uplift'));
    if (s.curves) tags.push(t('spec.list.curves'));
    else if (!named && ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'].some((k) => ((s as unknown as Record<string, number | undefined>)[k] ?? 0) > 0)) tags.push(t('spec.list.springs'));
    if (s.isInclined) tags.push(t('spec.list.inclined'));
    return tags;
  }
  function openSpec(id: number) {
    uiStore.specSection = 'supports';
    uiStore.proActiveTab = 'specifications';
    uiStore.clearSelection();
    uiStore.selectSupport(id, true);
  }
</script>

<div class="pro-sup">
  <div class="pro-sup-header">
    <WriteInPanelButton kind="support" verb="add" label={t('pro.oneSupport')} testid="write-support" />
    <span class="pro-sup-count">{t('pro.nSupports').replace('{n}', String(supports.length))}</span>
  </div>

  {#if drawState.writing === 'support'}
    <WriteCard title={`${t('pro.add')} ${t('pro.oneSupport')}`} submitLabel={`${t('pro.add')} ${t('pro.oneSupport')}`} onsubmit={addSupport} error={wError} testid="write-support-card">
      <SupportDofFields />
      {#key drawState.writeSeq}<LoadTargetPicker entity="nodes" bind:spec={target} bind:summary />{/key}
      {#if done}<p class="pro-sup-done" role="status" data-testid="write-support-done">{done}</p>{/if}
      {#snippet aside()}<span class="pro-sup-count-to" class:warn={summary.warn} data-testid="load-target-count">{summary.text}</span>{/snippet}
    </WriteCard>
  {/if}

  <div class="pro-sup-table-wrap">
    <table class="pro-sup-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>{t('pro.thNode')}</th>
          <th>{t('pro.thType')}</th>
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each supports as s}
          <tr class:selected={uiStore.selectedSupports.has(s.id)} onclick={() => { uiStore.selectMode = 'supports'; uiStore.selectSupport(s.id, false); }}>
            <td class="col-id">{s.id}</td>
            <td class="col-num">{s.nodeId}</td>
            <!-- What the support is, read here; edited in its one place, Specifications › Supports. -->
            <td class="sup-kind" data-testid="sup-kind-{s.id}">{kindLabel(s)}{#each supportTags(s) as tag (tag)}<span class="sup-tag">{tag}</span>{/each}</td>
            <td><button class="pro-edit-btn" title={t('spec.supports.open')} aria-label={t('spec.supports.open')}
                  onclick={(e) => { e.stopPropagation(); openSpec(s.id); }} data-testid="sup-spec-{s.id}">✎</button></td>
            <td><button class="pro-delete-btn" onclick={() => removeSupport(s.id)}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .sup-kind { white-space: nowrap; }
  .pro-sup-done { margin: 0; font-size: 0.66rem; color: var(--st-ok); }
  .pro-sup-count-to { font-size: 0.66rem; color: var(--st-text-2); }
  .pro-sup-count-to.warn { color: var(--st-warn); }
  .sup-tag { margin-left: 4px; padding: 0 4px; border: 1px solid var(--st-hair); border-radius: 3px; font-size: 0.58rem; color: var(--st-text-3); }
  .pro-edit-btn { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.72rem; }
  .pro-edit-btn:hover { color: var(--st-accent); }


  .pro-sup { display: flex; flex-direction: column; height: 100%; }

  .pro-sup-header {
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
  }

  .pro-sup-count { font-size: 0.82rem; color: var(--st-value); font-weight: 600; }
  .pro-sup-table-wrap { flex: 1; overflow: auto; }

  .pro-sup-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .pro-sup-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-sup-table th {
    padding: 6px 8px; text-align: left; font-size: 0.7rem; font-weight: 600;
    color: var(--st-text-3); text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3);
  }
  .pro-sup-table td { padding: 5px 8px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .pro-sup-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .pro-sup-table tbody tr:hover { background: rgba(127, 212, 204, 0.08); }
  .pro-sup-table tbody tr.selected { background: rgba(127, 212, 204, 0.18); box-shadow: inset 3px 0 0 var(--st-value); }
  .col-id { width: 34px; color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; }
  .pro-delete-btn { background: none; border:  none; color: var(--st-text-3); font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: var(--st-danger); }
</style>
