<script lang="ts">
  /**
   * A new section from where a member is placed: the sections tab's own dialog (catalogue,
   * templates with their dimensioned sketch, drawn sections), and the new section is chosen at once.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import ProSectionModal from '../section/ProSectionModal.svelte';
  import { defaultProfileSpec } from '../../../lib/section/profile-spec';
  import { toSectionFields, type SectionChoice } from '../../../lib/section/section-choice';

  let { onAdded, disabled = false, testid }: { onAdded: (id: number) => void; disabled?: boolean; testid?: string } = $props();
  let open = $state(false);

  function apply(choice: SectionChoice) {
    // A section created here belongs to no member yet: its rotation is 0 (see the sections tab).
    const fields = toSectionFields(choice, 0);
    if (!fields) return;
    onAdded(modelStore.addSection(fields as never));
  }
</script>

<button type="button" class="pk-btn ns" {disabled} title={t('building.newSection')} onclick={() => (open = true)} data-testid={testid}>+</button>
<ProSectionModal {open} spec={defaultProfileSpec('IPE 200')} onApply={apply} onClose={() => { open = false; }} />

<style>
  .ns { min-width: 22px; padding: 0 6px; }
</style>
