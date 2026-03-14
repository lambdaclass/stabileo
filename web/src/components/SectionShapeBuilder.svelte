<script lang="ts">
  import {
    SECTION_SHAPES, STEEL_SHAPES, CONCRETE_SHAPES,
    computeSectionProperties, generateSectionName,
    type ShapeType, type SectionProperties, type MaterialCategory,
  } from '../lib/data/section-shapes';
  import { crossSectionPath, type SectionDrawingParams } from '../lib/utils/section-drawing';
  import type { SectionShape } from '../lib/data/steel-profiles';
  import { t } from '../lib/i18n';

  interface Props {
    open: boolean;
    onselect: (name: string, props: SectionProperties) => void;
    onclose: () => void;
  }

  let { open, onselect, onclose }: Props = $props();

  let activeCategory = $state<MaterialCategory>('steel');
  let activeShape = $state<ShapeType>('rect');
  let paramValues = $state<Record<string, number>>({});

  // Display unit toggle: 'm' for meters, 'cm' for centimeters
  type DisplayUnit = 'm' | 'cm';
  let displayUnit = $state<DisplayUnit>('m');

  // Conversion factors for display
  const dimFactor = $derived(displayUnit === 'cm' ? 100 : 1);
  const dimLabel = $derived(displayUnit === 'cm' ? 'cm' : 'm');
  const areaLabel = $derived(displayUnit === 'cm' ? 'cm²' : 'm²');
  const izLabel = $derived(displayUnit === 'cm' ? 'cm⁴' : 'm⁴');

  const categoryShapes = $derived(
    activeCategory === 'steel' ? STEEL_SHAPES : CONCRETE_SHAPES
  );

  // When category changes, reset to first shape in that category if current doesn't match
  let prevCategory = $state<MaterialCategory | null>(null);
  $effect(() => {
    const cat = activeCategory;
    if (cat !== prevCategory) {
      prevCategory = cat;
      const shapes = cat === 'steel' ? STEEL_SHAPES : CONCRETE_SHAPES;
      if (shapes.length > 0 && !shapes.find(s => s.id === activeShape)) {
        activeShape = shapes[0].id;
      }
    }
  });

  // Initialize params when shape changes
  let prevShape = $state<ShapeType | null>(null);
  $effect(() => {
    const shape = activeShape;
    if (shape !== prevShape) {
      prevShape = shape;
      const def = SECTION_SHAPES.find(s => s.id === shape);
      if (def) {
        const vals: Record<string, number> = {};
        for (const p of def.params) {
          vals[p.id] = p.defaultValue;
        }
        paramValues = vals;
      }
    }
  });

  const shapeDef = $derived(SECTION_SHAPES.find(s => s.id === activeShape)!);
  const computed = $derived(computeSectionProperties(activeShape, paramValues));
  const autoName = $derived(generateSectionName(activeShape, paramValues));

  // Preview SVG path from computed properties
  const previewPath = $derived.by(() => {
    if (!computed || !computed.h || !computed.b) return null;
    return crossSectionPath({
      shape: (computed.shape ?? 'rect') as SectionShape,
      h: computed.h,
      b: computed.b,
      tw: computed.tw ?? 0,
      tf: computed.tf ?? 0,
      t: computed.t ?? 0,
      tl: computed.tl,
    });
  });

  // Format display value for a param (convert from m to display unit)
  function displayValue(valueInMeters: number): string {
    const v = valueInMeters * dimFactor;
    // Show enough decimals: in cm show 2 decimals (0.01 cm = 0.1 mm), in m show 4 decimals (0.0001 m = 0.1 mm)
    if (displayUnit === 'cm') {
      return v.toFixed(2);
    }
    // In meters, show up to 4 decimals, trimming trailing zeros
    return v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0');
  }

  // Convert display input back to meters for internal storage
  function parseDisplayInput(displayVal: number): number {
    return displayVal / dimFactor;
  }

  // Step size adjusted for display unit
  function displayStep(stepInMeters: number): number {
    return stepInMeters * dimFactor;
  }

  // Format area for display
  function fmtArea(aInM2: number): string {
    if (displayUnit === 'cm') {
      return (aInM2 * 1e4).toPrecision(4); // m² → cm²
    }
    return aInM2.toPrecision(4);
  }

  // Format moment of inertia for display
  function fmtIz(izInM4: number): string {
    if (displayUnit === 'cm') {
      return (izInM4 * 1e8).toPrecision(4); // m⁴ → cm⁴
    }
    return izInM4.toPrecision(4);
  }

  function handleConfirm() {
    if (!computed) return;
    onselect(autoName, computed);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="shape-overlay" onclick={onclose} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="shape-modal" onclick={(e) => e.stopPropagation()}>
      <div class="shape-header">
        <h3>{t('shapeBuilder.title')}</h3>
        <button class="close-btn" onclick={onclose}>✕</button>
      </div>

      <!-- Material category toggle -->
      <div class="category-tabs">
        <button
          class:active={activeCategory === 'steel'}
          onclick={() => { activeCategory = 'steel'; }}
        >{t('shapeBuilder.steel')}</button>
        <button
          class:active={activeCategory === 'concrete'}
          onclick={() => { activeCategory = 'concrete'; }}
        >{t('shapeBuilder.concrete')}</button>
      </div>

      <!-- Shape sub-tabs (filtered by category) -->
      <div class="shape-tabs">
        {#each categoryShapes as shape}
          <button
            class="tab-btn"
            class:active={activeShape === shape.id}
            onclick={() => { activeShape = shape.id; }}
          >{shape.label}</button>
        {/each}
      </div>

      <div class="shape-body">
        <!-- Section preview drawing -->
        {#if previewPath}
          <div class="preview-container">
            <svg viewBox="-90 -90 180 180" class="section-preview">
              <path
                d={previewPath}
                fill="none"
                stroke="#4ecdc4"
                stroke-width="1.5"
                fill-rule="evenodd"
              />
              <!-- Centroid dot -->
              <circle cx="0" cy="0" r="2" fill="#e94560" opacity="0.7" />
            </svg>
          </div>
        {/if}

        <p class="shape-desc">{shapeDef.description}</p>

        <!-- Unit toggle -->
        <div class="unit-toggle">
          <span class="unit-toggle-label">{t('shapeBuilder.units')}</span>
          <button
            class="unit-btn"
            class:active={displayUnit === 'm'}
            onclick={() => { displayUnit = 'm'; }}
          >m</button>
          <button
            class="unit-btn"
            class:active={displayUnit === 'cm'}
            onclick={() => { displayUnit = 'cm'; }}
          >cm</button>
        </div>

        <div class="param-grid">
          {#each shapeDef.params as p}
            <label class="param-field">
              <span>{p.label.replace(/\(.*\)/, '').trim()}</span>
              <div class="param-input">
                <input
                  type="number"
                  step={displayStep(p.step)}
                  value={displayValue(paramValues[p.id] ?? p.defaultValue)}
                  oninput={(e) => {
                    const v = parseFloat(e.currentTarget.value);
                    if (!isNaN(v)) paramValues = { ...paramValues, [p.id]: parseDisplayInput(v) };
                  }}
                />
                <span class="param-unit">{dimLabel}</span>
              </div>
            </label>
          {/each}
        </div>

        {#if computed}
          <div class="results-box">
            <div class="result-row">
              <span>{t('shapeBuilder.name')}</span>
              <span class="result-val">{autoName}</span>
            </div>
            <div class="result-row">
              <span>A =</span>
              <span class="result-val">{fmtArea(computed.a)} {areaLabel}</span>
            </div>
            <div class="result-row">
              <span>Iz =</span>
              <span class="result-val">{fmtIz(computed.iz)} {izLabel}</span>
            </div>
          </div>

          <button class="confirm-btn" onclick={handleConfirm}>
            {t('shapeBuilder.applySection')}
          </button>
        {:else}
          <div class="results-box error">
            <span>{t('shapeBuilder.invalidDimensions')}</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .shape-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .shape-modal {
    background: #16213e;
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    width: 400px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  .shape-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #1a4a7a;
  }

  .shape-header h3 {
    color: #4ecdc4;
    font-size: 0.9rem;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
  }
  .close-btn:hover { color: #e94560; }

  /* Category toggle (Acero / Hormigón) */
  .category-tabs {
    display: flex;
    justify-content: center;
    padding: 0.6rem 1rem 0.3rem;
    gap: 0;
  }
  .category-tabs button {
    flex: 1;
    padding: 0.35rem 0.75rem;
    border: 1px solid #1a4a7a;
    background: transparent;
    color: #888;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .category-tabs button:first-child {
    border-radius: 6px 0 0 6px;
    border-right: none;
  }
  .category-tabs button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .category-tabs button.active {
    background: #0f3460;
    color: #4ecdc4;
    border-color: #4ecdc4;
  }
  .category-tabs button:not(.active):hover {
    background: rgba(15, 52, 96, 0.4);
    color: #ccc;
  }

  .shape-tabs {
    display: flex;
    flex-wrap: wrap;
    border-bottom: 1px solid #0f3460;
    padding: 0 0.5rem;
  }

  .tab-btn {
    padding: 0.4rem 0.5rem;
    border: none;
    background: transparent;
    color: #888;
    cursor: pointer;
    font-size: 0.72rem;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }
  .tab-btn:hover { color: #eee; }
  .tab-btn.active { color: #4ecdc4; border-bottom-color: #4ecdc4; }

  .shape-body {
    padding: 0.75rem 1rem;
    overflow-y: auto;
  }

  /* Section preview SVG */
  .preview-container {
    display: flex;
    justify-content: center;
    margin-bottom: 0.5rem;
  }
  .section-preview {
    width: 120px;
    height: 120px;
    background: rgba(15, 52, 96, 0.3);
    border-radius: 6px;
    border: 1px solid rgba(26, 74, 122, 0.4);
  }

  .shape-desc {
    font-size: 0.75rem;
    color: #888;
    margin: 0 0 0.5rem;
    font-style: italic;
  }

  /* Unit toggle (m / cm) */
  .unit-toggle {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.6rem;
  }
  .unit-toggle-label {
    font-size: 0.7rem;
    color: #888;
    margin-right: 0.2rem;
  }
  .unit-btn {
    padding: 0.2rem 0.5rem;
    border: 1px solid #1a4a7a;
    background: transparent;
    color: #888;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .unit-btn:first-of-type {
    border-radius: 4px 0 0 4px;
    border-right: none;
  }
  .unit-btn:last-of-type {
    border-radius: 0 4px 4px 0;
  }
  .unit-btn.active {
    background: #0f3460;
    color: #4ecdc4;
    border-color: #4ecdc4;
  }
  .unit-btn:not(.active):hover {
    background: rgba(15, 52, 96, 0.4);
    color: #ccc;
  }

  .param-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .param-field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: #ccc;
  }

  .param-input {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .param-input input {
    width: 80px;
    padding: 0.3rem 0.4rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    font-size: 0.8rem;
    text-align: right;
  }

  .param-unit {
    font-size: 0.7rem;
    color: #888;
    min-width: 1.5rem;
  }

  .results-box {
    margin-top: 0.75rem;
    padding: 0.6rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
  }

  .results-box.error {
    border-color: #e94560;
    color: #e94560;
    text-align: center;
    font-size: 0.8rem;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #aaa;
    padding: 0.15rem 0;
  }

  .result-val {
    color: #4ecdc4;
    font-family: monospace;
  }

  .confirm-btn {
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.5rem;
    background: #0f4a3a;
    border: 1px solid #1a7a5a;
    border-radius: 6px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.15s;
  }

  .confirm-btn:hover {
    background: #1a7a5a;
    color: white;
  }
</style>
