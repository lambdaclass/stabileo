<script lang="ts">
  import { t } from '../lib/i18n';
  import { uiStore, modelStore } from '../lib/store';
  import { solve2D, solve3D, EXAMPLE_INPUT_2D } from '../lib/engine/api';
  import type { ApiModelInput } from '../lib/engine/api';

  let { onclose }: { onclose: () => void } = $props();

  let inputJson = $state(JSON.stringify(EXAMPLE_INPUT_2D, null, 2));
  let outputJson = $state('');
  let solveTime = $state<number | null>(null);
  let error = $state<string | null>(null);
  let mode = $state<'2d' | '3d'>('2d');
  let includeSelfWeight = $state(false);
  let copyFeedback = $state(false);

  function handleSolve() {
    error = null;
    outputJson = '';
    solveTime = null;
    let input: ApiModelInput;
    try {
      input = JSON.parse(inputJson);
    } catch (e: any) {
      error = `JSON parse error: ${e.message}`;
      return;
    }
    const t0 = performance.now();
    const result = mode === '3d'
      ? solve3D(input, { includeSelfWeight })
      : solve2D(input, { includeSelfWeight });
    solveTime = performance.now() - t0;
    if (result.ok) {
      outputJson = JSON.stringify(result.data, null, 2);
    } else {
      error = result.error ?? 'Unknown error';
    }
  }

  function loadCurrentModel() {
    const snap = modelStore.snapshot();
    const apiInput: ApiModelInput = {
      nodes: snap.nodes,
      materials: snap.materials,
      sections: snap.sections,
      elements: snap.elements,
      supports: snap.supports,
      loads: snap.loads,
      plates: snap.plates,
      quads: snap.quads,
      constraints: (snap as any).constraints,
    };
    inputJson = JSON.stringify(apiInput, null, 2);
    mode = uiStore.analysisMode === '2d' ? '2d' : '3d';
  }

  function loadExample() {
    inputJson = JSON.stringify(EXAMPLE_INPUT_2D, null, 2);
    mode = '2d';
  }

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(outputJson);
      copyFeedback = true;
      setTimeout(() => { copyFeedback = false; }, 1500);
    } catch {
      uiStore.toast(t('api.copyError'), 'error');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="api-overlay" onclick={onclose} role="presentation">
  <div class="api-dialog" onclick={(e) => e.stopPropagation()} role="dialog">
    <div class="api-header">
      <h2>{t('api.title')}</h2>
      <div class="api-controls">
        <select bind:value={mode}>
          <option value="2d">2D</option>
          <option value="3d">3D</option>
        </select>
        <label class="api-checkbox">
          <input type="checkbox" bind:checked={includeSelfWeight} />
          {t('api.selfWeight')}
        </label>
        <button class="api-btn secondary" onclick={loadCurrentModel} title={t('api.loadCurrentHint')}>
          {t('api.loadCurrent')}
        </button>
        <button class="api-btn secondary" onclick={loadExample}>
          {t('api.loadExample')}
        </button>
        <button class="api-btn primary" onclick={handleSolve}>
          {t('api.solve')}
        </button>
      </div>
      <button class="close-btn" onclick={onclose}>✕</button>
    </div>

    <div class="api-hint">
      {t('api.hint')}
      <code>stabileo.solve2D(stabileo.EXAMPLE)</code>
    </div>

    <div class="api-panels">
      <div class="api-panel">
        <div class="panel-header">{t('api.input')}</div>
        <textarea
          class="api-textarea"
          bind:value={inputJson}
          spellcheck="false"
        ></textarea>
      </div>
      <div class="api-panel">
        <div class="panel-header">
          {t('api.output')}
          {#if solveTime !== null}
            <span class="solve-time">{solveTime.toFixed(1)} ms</span>
          {/if}
          {#if outputJson}
            <button class="copy-btn" onclick={copyOutput}>
              {copyFeedback ? t('api.copied') : t('api.copy')}
            </button>
          {/if}
        </div>
        {#if error}
          <div class="api-error">{error}</div>
        {/if}
        <textarea
          class="api-textarea"
          value={outputJson}
          readonly
          spellcheck="false"
        ></textarea>
      </div>
    </div>
  </div>
</div>

<style>
  .api-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .api-dialog {
    background: #1a1a2e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    width: 90vw;
    max-width: 1200px;
    height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .api-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
  }
  .api-header h2 {
    font-size: 0.9rem;
    color: #4ecdc4;
    margin: 0;
    white-space: nowrap;
  }
  .api-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    flex-wrap: wrap;
  }
  .api-controls select {
    background: #0f0f1e;
    color: #ccc;
    border: 1px solid #333;
    padding: 3px 6px;
    border-radius: 3px;
    font-size: 0.7rem;
  }
  .api-checkbox {
    font-size: 0.65rem;
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .api-checkbox input { margin: 0; }
  .api-btn {
    padding: 4px 12px;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .api-btn.secondary {
    background: transparent;
    color: #888;
  }
  .api-btn.secondary:hover {
    color: #ddd;
    border-color: #4ecdc4;
  }
  .api-btn.primary {
    background: #4ecdc4;
    color: #1a1a2e;
    border-color: #4ecdc4;
    font-weight: 600;
  }
  .api-btn.primary:hover {
    background: #5eddd4;
  }
  .close-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem;
    margin-left: auto;
  }
  .close-btn:hover { color: #e94560; }
  .api-hint {
    padding: 6px 14px;
    font-size: 0.65rem;
    color: #666;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
  }
  .api-hint code {
    background: #0f0f1e;
    padding: 1px 5px;
    border-radius: 3px;
    color: #4ecdc4;
    font-size: 0.65rem;
  }
  .api-panels {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .api-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .api-panel + .api-panel {
    border-left: 1px solid #0f3460;
  }
  .panel-header {
    padding: 4px 10px;
    font-size: 0.65rem;
    color: #888;
    font-weight: 600;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .solve-time {
    color: #4ecdc4;
    font-weight: 400;
  }
  .copy-btn {
    margin-left: auto;
    padding: 1px 8px;
    font-size: 0.6rem;
    color: #888;
    background: transparent;
    border: 1px solid #333;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .copy-btn:hover {
    color: #ddd;
    border-color: #4ecdc4;
  }
  .api-textarea {
    flex: 1;
    background: #0f0f1e;
    color: #ccc;
    border: none;
    padding: 10px;
    font-family: 'Courier New', monospace;
    font-size: 0.65rem;
    resize: none;
    outline: none;
    line-height: 1.4;
  }
  .api-textarea:focus {
    background: #111122;
  }
  .api-error {
    padding: 6px 10px;
    background: rgba(233,69,96,0.1);
    color: #e94560;
    font-size: 0.65rem;
    border-bottom: 1px solid rgba(233,69,96,0.2);
  }
</style>
