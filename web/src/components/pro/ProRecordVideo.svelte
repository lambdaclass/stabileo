<script lang="ts">
  /**
   * Record the viewport's animation to a WebM file (`lib/export/video.ts`). `before` starts the
   * animation the recording is of; it is stopped again afterwards if it was not running.
   */
  import { t, tp } from '../../lib/i18n';
  import { canRecordVideo, recordViewport } from '../../lib/export/video';
  import { downloadBlob } from '../../lib/store/file';
  import { modelStore } from '../../lib/store';

  let { before, after, testid = 'record-video' }: { before?: () => void; after?: () => void; testid?: string } = $props();
  let seconds = $state(5);
  let recording = $state(false);
  let error = $state<string | null>(null);
  const supported = canRecordVideo();

  async function record() {
    error = null;
    recording = true;
    before?.();
    try {
      const blob = await recordViewport(seconds);
      const name = (modelStore.model.name || 'stabileo').replace(/[^\w.-]+/g, '-');
      downloadBlob(blob, `${name}.webm`);
    } catch (e) {
      error = t(`video.error.${(e as Error).message}`);
    } finally {
      after?.();
      recording = false;
    }
  }
</script>

<div class="rv" data-testid={testid}>
  <label>{t('video.seconds')} <input type="number" min="1" max="60" step="1" bind:value={seconds} /></label>
  <button class="pk-btn" disabled={!supported || recording} onclick={record}>{recording ? tp('video.recording', { s: seconds }) : t('video.record')}</button>
  {#if !supported}<span class="rv-hint">{t('video.error.unsupported')}</span>{/if}
  {#if error}<span class="rv-hint" role="alert">{error}</span>{/if}
</div>

<style>
  .rv { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 0.62rem; color: var(--st-text-2); }
  .rv input { width: 44px; }
  .rv-hint { color: var(--st-text-3); }
  .rv :global(.pk-btn) { min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
</style>
