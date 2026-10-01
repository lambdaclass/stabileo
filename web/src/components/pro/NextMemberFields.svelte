<script lang="ts">
  /**
   * Section, material and the two ends of the next member, each with its name beside it.
   *
   * The same four fields wherever a member is made: in the panel's "Write a member" card and in
   * the drawing bar under the ribbon. The pickers show the name the member will get (the model's
   * first until something else is chosen), and all four share one width so they read as a set.
   * A truss carries no moment, so its ends are not asked for. See `store/next-member.svelte.ts`.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { nextMember, type NextMemberEnd } from '../../lib/store/next-member.svelte';

  const materials = $derived([...modelStore.materials.values()]);
  const sections = $derived([...modelStore.sections.values()]);
  const frame = $derived(uiStore.elementCreateType === 'frame');
  const ENDS: NextMemberEnd[] = ['fixed', 'pinned'];
</script>

<span class="nmf" data-testid="next-member">
  <label class="nmf-field">
    <span class="nmf-name">{t('pro.thSection')}</span>
    <select value={nextMember.resolvedSectionId} onchange={(e) => (nextMember.sectionId = Number(e.currentTarget.value))} data-testid="nm-section">
      {#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
    </select>
  </label>
  <label class="nmf-field">
    <span class="nmf-name">{t('pro.thMaterial')}</span>
    <select value={nextMember.resolvedMaterialId} onchange={(e) => (nextMember.materialId = Number(e.currentTarget.value))} data-testid="nm-material">
      {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
    </select>
  </label>
  {#if frame}
    <label class="nmf-field" title={t('nextMember.endHint')}>
      <span class="nmf-name">{t('stress.endI')}</span>
      <select bind:value={nextMember.endI} data-testid="nm-end-i">
        {#each ENDS as k (k)}<option value={k}>{t(`nextMember.end.${k}`)}</option>{/each}
      </select>
    </label>
    <label class="nmf-field" title={t('nextMember.endHint')}>
      <span class="nmf-name">{t('stress.endJ')}</span>
      <select bind:value={nextMember.endJ} data-testid="nm-end-j">
        {#each ENDS as k (k)}<option value={k}>{t(`nextMember.end.${k}`)}</option>{/each}
      </select>
    </label>
  {/if}
</span>

<style>
  .nmf { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .nmf-field { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .nmf-name { color: var(--st-text-3); }
  .nmf select {
    width: 8.5rem;
    padding: 1px 5px;
    background: var(--st-ink); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    font: inherit;
    text-overflow: ellipsis;
  }
  .nmf select:focus { outline: none; border-color: var(--st-accent); }
</style>
