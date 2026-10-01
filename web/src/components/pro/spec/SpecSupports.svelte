<script lang="ts">
  /**
   * Specifications › Supports: the selected supports' type and uplift over the whole selection,
   * one undo step per change; the full editor (restraints, springs, curves, inclined) for one
   * support at a time. Foundation springs, made on selected shells, are under Surfaces.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import type { Support, SupportType } from '../../../lib/store/model.svelte';
  import { supportTypeOptions } from '../../../lib/pro/support-types';
  import ProSupportEditor from '../ProSupportEditor.svelte';
  import SpecEmpty from './SpecEmpty.svelte';

  const is3D = $derived(uiStore.analysisMode !== '2d');
  const types = $derived(supportTypeOptions(is3D, t));
  const selected = $derived([...uiStore.selectedSupports].map((id) => modelStore.supports.get(id)).filter((s): s is Support => !!s));
  const same = <T,>(f: (s: Support) => T): T | undefined => {
    const v = selected.map(f);
    return v.length && v.every((x) => x === v[0]) ? v[0] : undefined;
  };
  const type = $derived(same((s) => s.type) ?? 'mixed');
  const uplift = $derived(same((s) => !!s.uplift));

  function setType(v: SupportType) {
    modelStore.batch(() => { for (const s of selected) modelStore.updateSupport(s.id, { type: v }); });
  }
  function setUplift(on: boolean) {
    modelStore.batch(() => { for (const s of selected) modelStore.updateSupport(s.id, { uplift: on }); });
  }
</script>

{#if selected.length === 0}
  <SpecEmpty kind="supports" items={[
    { title: 'pro.thType', hint: 'spec.item.supportType' },
    { title: 'support.uplift', hint: 'spec.item.uplift' },
    { title: 'spec.item.restraintsTitle', hint: 'spec.item.restraints' },
  ]} />
{:else}
<div class="pk" data-testid="spec-supports">
  <p class="ss-title">{tp('spec.supports.title', { n: selected.length })}</p>
  <section class="pk-card">
    <h4 class="pk-heading">{t('pro.thType')}</h4>
    <select value={type} onchange={(e) => setType(e.currentTarget.value as SupportType)} data-testid="spec-support-type">
      {#if type === 'mixed'}<option value="mixed" disabled>{t('behaviour.mixed')}</option>{/if}
      {#each types as st (st.value)}<option value={st.value}>{st.label}</option>{/each}
    </select>
    <label class="pk-check" title={t('support.upliftHint')}>
      <input type="checkbox" checked={!!uplift} indeterminate={uplift === undefined} onchange={(e) => setUplift(e.currentTarget.checked)} data-testid="spec-support-uplift" />
      {t('support.uplift')}
    </label>
    <p class="pk-hint">{t('support.upliftHint')}</p>
  </section>
  <section class="pk-card">
    <h4 class="pk-heading">{t('spec.item.restraintsTitle')}</h4>
    {#if selected.length === 1}
      <ProSupportEditor support={selected[0]!} />
    {:else}
      <p class="pk-hint">{t('spec.supports.oneForDetail')}</p>
    {/if}
  </section>
</div>
{/if}

<style>
  .ss-title { margin: 0; font-weight: 600; color: var(--st-text); font-size: 0.74rem; }
</style>
