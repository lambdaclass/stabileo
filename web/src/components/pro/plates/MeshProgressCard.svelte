<script lang="ts">
  /** At the viewer's foot, with the toasts: the plates being meshed now, whoever asked (`store/mesh-progress.svelte.ts`). */
  import { t } from '../../../lib/i18n';
  import { meshProgress } from '../../../lib/store/mesh-progress.svelte';
  import MeshProgressBar from './MeshProgressBar.svelte';
</script>

{#if meshProgress.now}
  <div class="mpc" data-testid="mesh-progress-card">
    <strong>{t(meshProgress.now.for === 'analysis' ? 'plates.progressTitleAnalysis' : 'plates.progressTitle')}</strong>
    <MeshProgressBar phase={meshProgress.now.phase} done={meshProgress.now.done} total={meshProgress.now.total} />
    <span class="mpc-undo">{t('plates.progressUndo')}</span>
  </div>
{/if}

<style>
  .mpc { pointer-events: auto; display: flex; flex-direction: column; gap: 4px; min-width: 240px; max-width: 350px; padding: 0.6rem 1rem; border-radius: 6px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-left: 3px solid var(--st-accent); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); font-size: 0.8rem; color: var(--st-text); }
  .mpc strong { font-weight: 600; }
  .mpc :global(.mpb) { font-size: 0.74rem; }
  .mpc-undo { font-size: 0.7rem; color: var(--st-text-3); }
</style>
