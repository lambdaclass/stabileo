<!-- The button that opens the memoria de cálculo, with its dialog: one line wherever it is offered. -->
<script lang="ts">
  import { t } from '../../../lib/i18n';
  import MemoriaDialog from './MemoriaDialog.svelte';

  let open = $state(false);
</script>

<button class="memo-open" data-testid="memoria-open" onclick={() => (open = true)}>{t('memo.ui.open')}</button>
{#if open}<MemoriaDialog onclose={() => (open = false)} />{/if}

<style>
  .memo-open {
    font-size: 0.7rem; padding: 0.2rem 0.5rem; background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer;
  }
  .memo-open:hover { background: var(--st-hair-strong); }
</style>
