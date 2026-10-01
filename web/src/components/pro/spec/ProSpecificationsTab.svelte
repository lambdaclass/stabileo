<script lang="ts">
  /**
   * Specifications: what the model's members, supports, links and shells are told beyond their
   * geometry, sections and materials, and the rules it is solved by, in one place.
   *
   * Every specification lives in a field of its entity (or in the model's `analysis`), and this
   * is the one editor of each: the other tabs point here. Each part acts on the selection, which
   * opening it sets up for (members, supports, shells); the List reads every value back, grouped.
   */
  import { t } from '../../../lib/i18n';
  import { uiStore } from '../../../lib/store';
  import type { SpecSection } from '../../../lib/store/ui.svelte';
  import SpecMembers from './SpecMembers.svelte';
  import SpecSupports from './SpecSupports.svelte';
  import SpecSurfaces from './SpecSurfaces.svelte';
  import SpecAnalysis from './SpecAnalysis.svelte';
  import SpecList from './SpecList.svelte';
  import ProConstraintsTab from '../ProConstraintsTab.svelte';

  const SECTIONS: SpecSection[] = ['members', 'supports', 'links', 'surfaces', 'analysis', 'list'];
</script>

<div class="spec" data-testid="spec-tab">
  <div class="spec-nav" role="tablist">
    {#each SECTIONS as s (s)}
      <button role="tab" aria-selected={uiStore.specSection === s} class:active={uiStore.specSection === s}
        onclick={() => (uiStore.specSection = s)} data-testid="spec-section-{s}">{t(`spec.section.${s}`)}</button>
    {/each}
  </div>
  <div class="spec-body">
    {#if uiStore.specSection === 'members'}<SpecMembers />
    {:else if uiStore.specSection === 'supports'}<SpecSupports />
    {:else if uiStore.specSection === 'links'}<ProConstraintsTab />
    {:else if uiStore.specSection === 'surfaces'}<SpecSurfaces />
    {:else if uiStore.specSection === 'analysis'}<SpecAnalysis />
    {:else}<SpecList />{/if}
  </div>
</div>

<style>
  .spec { display: flex; flex-direction: column; min-height: 0; }
  .spec-nav { display: flex; flex-wrap: wrap; gap: 2px; padding: 6px 10px; border-bottom: 1px solid var(--st-hair); }
  .spec-nav button { font-size: 0.64rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--st-hair); background: none; color: var(--st-text-2); cursor: pointer; }
  .spec-nav button.active { border-color: var(--st-text-2); color: var(--st-text); background: var(--st-surface-3); }
  .spec-body { overflow-y: auto; min-height: 0; }
</style>
