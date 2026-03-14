<script lang="ts">
  import {
    getTemplateCatalog, getTemplateCatalog3D, generateFromTemplate,
    type TemplateInfo, type TemplateName, type TemplateInfo3D, type TemplateName3D,
  } from '../lib/templates/generators';
  import { modelStore, resultsStore, historyStore, uiStore } from '../lib/store';
  import { t } from '../lib/i18n';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const is3D = $derived(uiStore.analysisMode === '3d');

  let selectedId2D = $state<TemplateName>('simpleBeam');
  let selectedId3D = $state<TemplateName3D>('spaceFrame3D');
  let paramValues = $state<Record<string, number>>({});

  // Group 2D templates by category
  const categories = $derived(() => {
    const cats = new Map<string, TemplateInfo[]>();
    for (const tmpl of getTemplateCatalog()) {
      let arr = cats.get(tmpl.category);
      if (!arr) { arr = []; cats.set(tmpl.category, arr); }
      arr.push(tmpl);
    }
    return cats;
  });

  const selectedTemplate = $derived(
    is3D
      ? getTemplateCatalog3D().find(tmpl => tmpl.id === selectedId3D)!
      : getTemplateCatalog().find(tmpl => tmpl.id === selectedId2D)!
  );

  // Reset param values when template changes (works for both 2D and 3D with params)
  $effect(() => {
    const t = selectedTemplate;
    if (t && 'params' in t && t.params) {
      const vals: Record<string, number> = {};
      for (const p of t.params) {
        vals[p.key] = p.default;
      }
      paramValues = vals;
    } else {
      paramValues = {};
    }
  });

  function handleGenerate() {
    if (is3D) {
      const tmpl = getTemplateCatalog3D().find(tmpl3d => tmpl3d.id === selectedId3D);
      if (tmpl) {
        historyStore.pushState();
        modelStore.clear();
        tmpl.generate(modelStore, tmpl.params ? paramValues : undefined);
        modelStore.model.name = tmpl.name;
        resultsStore.clear();
        resultsStore.clear3D();
      }
    } else {
      const snapshot = generateFromTemplate(selectedId2D, paramValues);
      modelStore.restore(snapshot);
      modelStore.model.name = selectedTemplate.name;
      resultsStore.clear();
      resultsStore.clear3D();
      historyStore.clear();
    }
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
  <div class="tmpl-overlay" role="dialog" aria-label={t('template.title')} onkeydown={handleKeydown}>
    <div class="tmpl-backdrop" onclick={onclose}></div>
    <div class="tmpl-modal">
      <div class="tmpl-header">
        <h2>{t('template.title')}</h2>
        <button class="tmpl-close" onclick={onclose}>&#x2715;</button>
      </div>

      <div class="tmpl-body">
        <div class="tmpl-sidebar">
          {#if is3D}
            <div class="cat-label">{t('template.structures3d')}</div>
            {#each getTemplateCatalog3D() as t}
              <button
                class="tmpl-item"
                class:active={selectedId3D === t.id}
                onclick={() => selectedId3D = t.id}
              >
                {t.name}
              </button>
            {/each}
          {:else}
            {#each [...categories().entries()] as [cat, templates]}
              <div class="cat-label">{cat}</div>
              {#each templates as t}
                <button
                  class="tmpl-item"
                  class:active={selectedId2D === t.id}
                  onclick={() => selectedId2D = t.id}
                >
                  {t.name}
                </button>
              {/each}
            {/each}
          {/if}
        </div>

        <div class="tmpl-params">
          <h3>{selectedTemplate?.name ?? ''}</h3>
          {#if selectedTemplate && 'desc' in selectedTemplate && selectedTemplate.desc}
            <p style="color:#aaa;font-size:0.85rem;margin:0 0 0.5rem">{selectedTemplate.desc}</p>
          {/if}
          {#if selectedTemplate && 'params' in selectedTemplate && selectedTemplate.params}
            {#each selectedTemplate.params as p}
              <div class="param-row">
                <label>{p.label}{p.unit ? ` (${p.unit})` : ''}:</label>
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={paramValues[p.key] ?? p.default}
                  oninput={(e) => {
                    const v = p.integer ? parseInt((e.target as HTMLInputElement).value) : parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) paramValues[p.key] = v;
                  }}
                />
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={paramValues[p.key] ?? p.default}
                  oninput={(e) => {
                    const v = p.integer ? parseInt((e.target as HTMLInputElement).value) : parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(v)) paramValues[p.key] = v;
                  }}
                />
              </div>
            {/each}
          {/if}

          <div class="tmpl-actions">
            <button class="btn-generate" onclick={handleGenerate}>{t('template.generate')}</button>
            <button class="btn-cancel" onclick={onclose}>{t('template.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tmpl-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tmpl-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .tmpl-modal {
    position: relative;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    width: 620px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .tmpl-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem 0.5rem;
  }

  .tmpl-header h2 {
    font-size: 1.05rem;
    color: #4ecdc4;
    margin: 0;
  }

  .tmpl-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
  }

  .tmpl-close:hover { color: #eee; }

  .tmpl-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 300px;
  }

  .tmpl-sidebar {
    width: 180px;
    border-right: 1px solid #0f3460;
    overflow-y: auto;
    padding: 0.5rem;
    flex-shrink: 0;
  }

  .cat-label {
    font-size: 0.7rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.5rem 0.5rem 0.2rem;
  }

  .tmpl-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: #ccc;
    padding: 0.4rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.1s;
  }

  .tmpl-item:hover { background: #0f3460; }
  .tmpl-item.active { background: #e94560; color: white; }

  .tmpl-params {
    flex: 1;
    padding: 1rem 1.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .tmpl-params h3 {
    font-size: 0.95rem;
    color: #eee;
    margin: 0 0 1rem 0;
  }

  .param-row {
    display: grid;
    grid-template-columns: 120px 80px 1fr;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .param-row label {
    font-size: 0.8rem;
    color: #aaa;
  }

  .param-row input[type="number"] {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    padding: 0.3rem 0.4rem;
    font-size: 0.8rem;
    text-align: right;
  }

  .param-row input[type="number"]:focus {
    outline: none;
    border-color: #4ecdc4;
  }

  .param-row input[type="range"] {
    accent-color: #e94560;
  }

  .tmpl-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: auto;
    padding-top: 1rem;
  }

  .btn-generate {
    padding: 0.4rem 1rem;
    background: #e94560;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-generate:hover { background: #ff6b6b; }

  .btn-cancel {
    padding: 0.4rem 1rem;
    background: #2a2a4e;
    border: none;
    border-radius: 4px;
    color: #aaa;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn-cancel:hover { background: #3a3a5e; }
</style>
