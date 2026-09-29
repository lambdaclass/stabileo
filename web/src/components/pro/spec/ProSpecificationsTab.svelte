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
  function navKey(e: KeyboardEvent) {
    const k = SECTIONS.indexOf(uiStore.specSection);
    const next = e.key === 'ArrowRight' ? k + 1 : e.key === 'ArrowLeft' ? k - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? SECTIONS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const s = SECTIONS[(next + SECTIONS.length) % SECTIONS.length]!;
    uiStore.specSection = s;
    document.getElementById(`spec-tab-${s}`)?.focus();
  }
</script>

<div class="spec" data-testid="spec-tab">
  <!-- A tab list a keyboard walks with the arrows, as tabs are walked. -->
  <div class="spec-nav" role="tablist" tabindex="-1" onkeydown={navKey}>
    {#each SECTIONS as s (s)}
      <button role="tab" id="spec-tab-{s}" aria-controls="spec-panel" aria-selected={uiStore.specSection === s}
        tabindex={uiStore.specSection === s ? 0 : -1} class:active={uiStore.specSection === s}
        onclick={() => (uiStore.specSection = s)} data-testid="spec-section-{s}">{t(`spec.section.${s}`)}</button>
    {/each}
  </div>
  <div class="spec-body" id="spec-panel" role="tabpanel" aria-labelledby="spec-tab-{uiStore.specSection}">
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
  .spec-nav button:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 1px; }
  /* A finger, not a pointer: tabs a thumb can hit. */
  @media (max-width: 767px) { .spec-nav button { font-size: 0.74rem; padding: 6px 12px; } }
</style>
