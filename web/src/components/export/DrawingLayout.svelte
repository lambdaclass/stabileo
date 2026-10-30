<script lang="ts">
  /** Several drawings together in one file, or one file each. */
  import { t } from '../../lib/i18n';
  let { together, labels, notes, onpick, testid }: {
    together: boolean;
    labels: [string, string];
    notes: [string, string];
    onpick: (together: boolean) => void;
    testid: string;
  } = $props();
</script>

<div class="xs-field">
  <span>{t('viewExport.layout')}</span>
  <div class="xs-seg dl">
    <button type="button" class:on={together} aria-pressed={together} onclick={() => onpick(true)} data-testid={`${testid}-together`}>{labels[0]}</button>
    <button type="button" class:on={!together} aria-pressed={!together} onclick={() => onpick(false)} data-testid={`${testid}-separate`}>{labels[1]}</button>
  </div>
</div>
<p class="xs-note">{together ? notes[0] : notes[1]}</p>

<style>
  .dl { justify-self: start; }
</style>
