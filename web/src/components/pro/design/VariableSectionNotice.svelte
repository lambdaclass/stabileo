<script lang="ts">
  /**
   * Members of variable section are analysed and left out of design (`isDesignedMember`): their
   * checks need the methods for non-prismatic members. Every design surface says so with this one
   * notice, so none drops them silently.
   */
  import { modelStore } from '../../../lib/store';
  import { isVariableMember } from '../../../lib/section/variable';
  import { tp } from '../../../lib/i18n';

  let { testid = 'banner-variable-section' }: { testid?: string } = $props();
  const count = $derived([...modelStore.elements.values()].filter((e) => isVariableMember(modelStore.sections, e)).length);
</script>

{#if count > 0}
  <div class="variable-notice" role="status" data-testid={testid}>{tp('spec.variable.notDesigned', { n: count })}</div>
{/if}

<style>
  .variable-notice { padding: 5px 9px; border-radius: 4px; font-size: 0.73rem; line-height: 1.45;
    background: var(--st-warn-bg); border: 1px solid var(--st-warn); color: var(--st-text); }
</style>
