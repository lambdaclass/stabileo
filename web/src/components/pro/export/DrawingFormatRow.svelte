<script lang="ts" module>
  export type DrawingFormat = 'dxf' | 'svg' | 'png' | 'jpg';
</script>

<script lang="ts">
  import { t } from '../../../lib/i18n';
  import ExportSection from '../../export/ExportSection.svelte';
  let { current, onpick }: { current: DrawingFormat; onpick: (f: DrawingFormat) => void } = $props();
  const FORMATS: DrawingFormat[] = ['dxf', 'svg', 'png', 'jpg'];
</script>

<ExportSection title={t('proExport.format')} summary={current.toUpperCase()} open testid="drawing-format">
  <div class="xs-seg">
    {#each FORMATS as f (f)}
      <button type="button" class:on={current === f} aria-pressed={current === f} onclick={() => onpick(f)} data-testid={`drawing-format-${f}`}>{f.toUpperCase()}</button>
    {/each}
  </div>
  <p class="xs-note">{t(`proExport.drawingFormatNote.${current}`)}</p>
</ExportSection>

<style>
  .xs-seg { align-self: flex-start; }
</style>
