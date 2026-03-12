<script lang="ts">
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { getExercises, type EduExercise } from './exercises';
  import EduExerciseView from './EduExerciseView.svelte';
  import { t } from '../../lib/i18n';
  import { solveForEdu, registerEduSolveHandler } from './edu-solver';
  import { eduStore } from './edu-store.svelte';

  const exerciseList = $derived(getExercises());

  // Register the edu global-solve listener once on mount
  registerEduSolveHandler();

  function loadExercise(ex: EduExercise) {
    modelStore.clear();
    resultsStore.clear();

    // Build the exercise structure via the shared model store
    ex.build({
      addNode: (x, y) => modelStore.addNode(x, y),
      addElement: (nI, nJ) => modelStore.addElement(nI, nJ),
      addSupport: (nodeId, type) => modelStore.addSupport(nodeId, type),
      addNodalLoad: (nodeId, fx, fy, mz) => modelStore.addNodalLoad(nodeId, fx, fy, mz ?? 0),
      addDistributedLoad: (elementId, qI, qJ) => modelStore.addDistributedLoad(elementId, qI, qJ),
    });

    // Track in edu store
    eduStore.loadExercise(ex);

    // Solve internally (results stored but hidden from viewport)
    setTimeout(() => solveForEdu(), 100);

    // Zoom to fit
    setTimeout(() => {
      const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
      if (canvas && modelStore.nodes.size > 0) {
        uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
      }
    }, 150);
  }

  function goBack() {
    eduStore.clearExercise();
    modelStore.clear();
    resultsStore.clear();
  }
</script>

<div class="edu-panel">
  {#if !eduStore.hasExercise}
    <div class="edu-welcome">
      <h2>{t('edu.title')}</h2>
      <p class="edu-subtitle">{t('edu.subtitle')}</p>

      <div class="exercise-list">
        {#each exerciseList as ex}
          <button class="exercise-card" onclick={() => loadExercise(ex)}>
            <div class="exercise-header">
              <span class="exercise-title">{ex.title}</span>
              <span class="difficulty difficulty-{ex.difficulty}">
                {t('edu.' + ex.difficulty)}
              </span>
            </div>
            <p class="exercise-desc">{ex.description}</p>
          </button>
        {/each}
      </div>

      <div class="edu-footer">
        <p>{t('edu.moreExercises')}</p>
      </div>
    </div>
  {:else}
    <div class="edu-exercise-container">
      <div class="edu-topbar">
        <button class="edu-back-btn" onclick={goBack}>
          {t('edu.back')}
        </button>
        <span class="edu-exercise-name">{eduStore.exercise!.title}</span>
      </div>

      {#key eduStore.exerciseKey}
        <EduExerciseView exercise={eduStore.exercise!} />
      {/key}
    </div>
  {/if}
</div>

<style>
  .edu-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #16213e;
    color: #ddd;
    overflow-y: auto;
  }

  .edu-welcome {
    padding: 24px 20px;
  }

  .edu-welcome h2 {
    font-size: 1.3rem;
    color: #4ecdc4;
    margin: 0 0 4px;
  }

  .edu-subtitle {
    font-size: 0.82rem;
    color: #888;
    margin: 0 0 20px;
  }

  .exercise-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .exercise-card {
    text-align: left;
    background: #0f2840;
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    padding: 14px 16px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .exercise-card:hover {
    background: #1a3860;
    border-color: #4ecdc4;
  }

  .exercise-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .exercise-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #eee;
  }

  .difficulty {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .difficulty-easy {
    background: #1a3a2a;
    color: #4caf50;
  }

  .difficulty-medium {
    background: #3a3a1a;
    color: #f0a500;
  }

  .difficulty-hard {
    background: #3a1a1a;
    color: #e94560;
  }

  .exercise-desc {
    font-size: 0.75rem;
    color: #999;
    margin: 0;
    line-height: 1.4;
  }

  .edu-footer {
    margin-top: 24px;
    padding: 10px 16px;
  }

  .edu-footer p {
    font-size: 0.68rem;
    color: #555;
    margin: 0;
    text-align: center;
    font-style: italic;
  }

  .edu-exercise-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .edu-topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #0a1a30;
    border-bottom: 1px solid #1a4a7a;
    flex-shrink: 0;
  }

  .edu-back-btn {
    background: none;
    border: 1px solid #334;
    color: #888;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .edu-back-btn:hover {
    color: #4ecdc4;
    border-color: #4ecdc4;
  }

  .edu-exercise-name {
    font-size: 0.75rem;
    font-weight: 500;
    color: #aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
