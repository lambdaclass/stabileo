<script lang="ts">
  /**
   * The material and section the next drawn member takes. See `store/next-member.svelte.ts`.
   */
  import { modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { nextMember } from '../../lib/store/next-member.svelte';

  const materials = $derived([...modelStore.materials.values()]);
  const sections = $derived([...modelStore.sections.values()]);
  const parse = (v: string) => (v === '' ? null : Number(v));
</script>

<div class="nm" data-testid="next-member">
  <span class="nm-label">{t('nextMember.label')}</span>
  <select value={nextMember.materialId ?? ''} onchange={(e) => (nextMember.materialId = parse((e.target as HTMLSelectElement).value))} aria-label={t('nextMember.material')} data-testid="nm-material">
    <option value="">{t('nextMember.default')}</option>
    {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
  </select>
  <select value={nextMember.sectionId ?? ''} onchange={(e) => (nextMember.sectionId = parse((e.target as HTMLSelectElement).value))} aria-label={t('nextMember.section')} data-testid="nm-section">
    <option value="">{t('nextMember.default')}</option>
    {#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
  </select>
</div>

<style>
  .nm { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 4px 10px; font-size: 0.68rem; }
  .nm-label { color: var(--st-text-3); }
  select {
    max-width: 150px; padding: 2px 5px; font-size: 0.66rem; background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2);
  }
</style>
