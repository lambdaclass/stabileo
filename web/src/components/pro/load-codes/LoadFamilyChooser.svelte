<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { FAMILY_STACKS, LOAD_FAMILY_CHOICES, type LoadFamilyChoice } from '../../../lib/codes/families/stacks';

  let { family, onchange }: { family: LoadFamilyChoice; onchange: (applied: boolean) => void } = $props();
  let error = $state<string | null>(null);

  function choose(family: LoadFamilyChoice) {
    const result = regulationsStore.requestStack(FAMILY_STACKS[family]);
    error = result.kind === 'refused' ? result.problems.map(problem => te(problem)).join(' · ') : null;
    onchange(result.kind !== 'refused');
  }
</script>

<label class="al-family" title={t('autoLoad.familyHint')}><span>{t('autoLoad.family')}</span>
  <select value={family} onchange={(event) => choose(event.currentTarget.value as LoadFamilyChoice)} data-testid="al-family">
    {#each LOAD_FAMILY_CHOICES as choice (choice)}<option value={choice}>{t(`autoLoad.familyName.${choice}`)}</option>{/each}
  </select>
</label>
{#if error}<span class="al-warn" data-testid="al-family-error">{error}</span>{/if}

<style>
  .al-family { display: inline-flex; gap: 6px; align-items: center; margin-left: auto; margin-right: 12px; font-size: 0.78rem; color: var(--st-text-2); }
  .al-family select { font: inherit; padding: 3px 6px; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; }
</style>
