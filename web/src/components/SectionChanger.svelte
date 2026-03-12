<script lang="ts">
  import {
    FAMILY_LIST, PROFILE_FAMILIES, searchProfiles, profileToSection, familyToShape,
    type ProfileFamily, type SteelProfile, type SectionShape,
  } from '../lib/data/steel-profiles';
  import {
    SECTION_SHAPES, STEEL_SHAPES, CONCRETE_SHAPES,
    computeSectionProperties, generateSectionName,
    type ShapeType, type SectionProperties, type MaterialCategory,
  } from '../lib/data/section-shapes';
  import { crossSectionPath } from '../lib/utils/section-drawing';
  import { t } from '../lib/i18n';

  interface Props {
    open: boolean;
    /** Called when a standard steel profile is selected */
    onprofileselect: (profile: SteelProfile, section: { a: number; iy: number; iz: number; b: number; h: number }) => void;
    /** Called when a custom shape section is built */
    onshapeselect: (name: string, props: SectionProperties) => void;
    /** Called when an amorphous section is defined (no geometric shape) */
    onamorphousselect?: (data: { name: string; a: number; iy: number; iz: number; j?: number }) => void;
    onclose: () => void;
    /** Which tab to start on (default: 'profile') */
    initialTab?: 'profile' | 'shape';
    /** Whether we're in 3D mode (shows J field for amorphous) */
    is3D?: boolean;
  }

  let { open, onprofileselect, onshapeselect, onamorphousselect, onclose, initialTab = 'profile', is3D = false }: Props = $props();

  type MainTab = 'profile' | 'shape' | 'amorphous';
  let activeMainTab = $state<MainTab>('profile');

  // Reset tab when opened
  $effect(() => {
    if (open) {
      activeMainTab = initialTab;
    }
  });

  // ─── Profile Selector state ──────────────────
  let activeFamily = $state<ProfileFamily>('IPN');
  let searchQuery = $state('');
  let filteredProfiles = $derived(searchProfiles(searchQuery, activeFamily));

  const profilePreviewPath = $derived.by(() => {
    const profiles = PROFILE_FAMILIES[activeFamily];
    if (!profiles || profiles.length === 0) return null;
    const rep = profiles[Math.floor(profiles.length / 2)];
    const shape = familyToShape(activeFamily);
    return crossSectionPath({
      shape,
      h: rep.h,
      b: rep.b,
      tw: rep.tw ?? 0,
      tf: rep.tf ?? 0,
      t: rep.t ?? 0,
    });
  });

  function handleProfileClick(p: SteelProfile) {
    onprofileselect(p, profileToSection(p));
  }

  // ─── Shape Builder state ─────────────────────
  let activeCategory = $state<MaterialCategory>('steel');
  let activeShape = $state<ShapeType>('rect');
  let paramValues = $state<Record<string, number>>({});

  const categoryShapes = $derived(
    activeCategory === 'steel' ? STEEL_SHAPES : CONCRETE_SHAPES
  );

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

  const shapePreviewPath = $derived.by(() => {
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

  function handleShapeConfirm() {
    if (!computed) return;
    onshapeselect(autoName, computed);
  }

  // ─── Amorphous Section state ────────────────
  let amorphName = $state(t('section.amorphousDefault'));
  let amorphA = $state(0.005);
  let amorphIy = $state(0.00008);
  let amorphIz = $state(0.00002);
  let amorphJ = $state(0.0000001);

  const amorphValid = $derived(amorphA > 0 && amorphIy > 0 && amorphIz > 0 && (!is3D || amorphJ > 0));

  function handleAmorphousConfirm() {
    if (!amorphValid || !onamorphousselect) return;
    onamorphousselect({
      name: amorphName || t('section.amorphousDefault'),
      a: amorphA,
      iy: amorphIy,
      iz: amorphIz,
      j: is3D ? amorphJ : undefined,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
  <div class="sc-overlay" role="dialog" aria-label={t('dialog.changeSection')} onkeydown={handleKeydown}>
    <div class="sc-backdrop" onclick={onclose}></div>
    <div class="sc-modal">
      <div class="sc-header">
        <h2>{t('dialog.changeSection')}</h2>
        <button class="sc-close" onclick={onclose}>&#x2715;</button>
      </div>

      <!-- Main tabs: Profile vs Shape vs Amorphous -->
      <div class="sc-main-tabs">
        <button
          class:active={activeMainTab === 'profile'}
          onclick={() => { activeMainTab = 'profile'; }}
        >{t('dialog.chooseStandardProfile')}</button>
        <button
          class:active={activeMainTab === 'shape'}
          onclick={() => { activeMainTab = 'shape'; }}
        >{t('dialog.buildSection')}</button>
        {#if onamorphousselect}
          <button
            class:active={activeMainTab === 'amorphous'}
            onclick={() => { activeMainTab = 'amorphous'; }}
          >{t('dialog.defineAmorphousSection')}</button>
        {/if}
      </div>

      <!-- ═══ Profile Selector Tab ═══ -->
      {#if activeMainTab === 'profile'}
        <div class="sc-body sc-profile-body">
          <div class="profile-tabs">
            {#each FAMILY_LIST as fam}
              <button
                class="tab-btn"
                class:active={activeFamily === fam}
                onclick={() => { activeFamily = fam; searchQuery = ''; }}
              >{fam}</button>
            {/each}
          </div>

          {#if profilePreviewPath}
            <div class="profile-preview">
              <svg viewBox="-90 -90 180 180" class="preview-svg">
                <path d={profilePreviewPath} fill="none" stroke="#4ecdc4" stroke-width="1.5" fill-rule="evenodd" />
              </svg>
            </div>
          {/if}

          <div class="profile-search">
            <input type="text" placeholder={t('search.profile')} bind:value={searchQuery} />
          </div>

          <div class="profile-table-wrap">
            <table class="profile-table">
              <thead>
                <tr>
                  <th>{t('table.profile')}</th>
                  <th>h (mm)</th>
                  <th>b (mm)</th>
                  <th>A (cm&#178;)</th>
                  <th>Iy (cm&#8308;)</th>
                  <th>Iz (cm&#8308;)</th>
                  <th>kg/m</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredProfiles as p}
                  <tr onclick={() => handleProfileClick(p)} class="profile-row">
                    <td class="name-cell">{p.name}</td>
                    <td>{p.h}</td>
                    <td>{p.b}</td>
                    <td>{p.a.toFixed(1)}</td>
                    <td>{p.iy.toFixed(0)}</td>
                    <td>{p.iz.toFixed(0)}</td>
                    <td>{p.weight.toFixed(1)}</td>
                  </tr>
                {/each}
                {#if filteredProfiles.length === 0}
                  <tr><td colspan="7" class="no-results">{t('search.noResults')}</td></tr>
                {/if}
              </tbody>
            </table>
          </div>
        </div>

      <!-- ═══ Amorphous Section Tab ═══ -->
      {:else if activeMainTab === 'amorphous'}
        <div class="sc-body sc-shape-body">
          <p class="shape-desc">{t('dialog.amorphousSectionDesc')}</p>

          <div class="param-grid">
            <label class="param-field">
              <span>{t('field.name')}</span>
              <div class="param-input">
                <input type="text" bind:value={amorphName} style="width: 120px;" />
              </div>
            </label>
            <label class="param-field">
              <span>{t('field.area')}</span>
              <div class="param-input">
                <input type="number" step="0.0001" bind:value={amorphA} />
                <span class="param-unit">m²</span>
              </div>
            </label>
            <label class="param-field">
              <span>{t('field.iyHoriz')}</span>
              <div class="param-input">
                <input type="number" step="0.000001" bind:value={amorphIy} />
                <span class="param-unit">m⁴</span>
              </div>
            </label>
            <label class="param-field">
              <span>{t('field.izVert')}</span>
              <div class="param-input">
                <input type="number" step="0.000001" bind:value={amorphIz} />
                <span class="param-unit">m⁴</span>
              </div>
            </label>
            {#if is3D}
              <label class="param-field">
                <span>{t('field.jTorsion')}</span>
                <div class="param-input">
                  <input type="number" step="0.000001" bind:value={amorphJ} />
                  <span class="param-unit">m⁴</span>
                </div>
              </label>
            {/if}
          </div>

          <div class="amorph-warning">{t('warning.amorphousNoStress')}</div>

          {#if amorphValid}
            <div class="results-box">
              <div class="result-row"><span>{t('field.resultName')}</span><span class="result-val">{amorphName}</span></div>
              <div class="result-row"><span>A =</span><span class="result-val">{amorphA.toPrecision(4)} m²</span></div>
              <div class="result-row"><span>Iy =</span><span class="result-val">{amorphIy.toPrecision(4)} m⁴</span></div>
              <div class="result-row"><span>Iz =</span><span class="result-val">{amorphIz.toPrecision(4)} m⁴</span></div>
              {#if is3D}
                <div class="result-row"><span>J =</span><span class="result-val">{amorphJ.toPrecision(4)} m⁴</span></div>
              {/if}
            </div>
            <button class="confirm-btn" onclick={handleAmorphousConfirm}>{t('action.applyAmorphousSection')}</button>
          {:else}
            <div class="results-box error"><span>{t('error.allPositive')}</span></div>
          {/if}
        </div>

      <!-- ═══ Shape Builder Tab ═══ -->
      {:else}
        <div class="sc-body sc-shape-body">
          <div class="category-tabs">
            <button class:active={activeCategory === 'steel'} onclick={() => { activeCategory = 'steel'; }}>{t('shapeBuilder.steel')}</button>
            <button class:active={activeCategory === 'concrete'} onclick={() => { activeCategory = 'concrete'; }}>{t('shapeBuilder.concrete')}</button>
          </div>

          <div class="shape-tabs">
            {#each categoryShapes as shape}
              <button
                class="tab-btn"
                class:active={activeShape === shape.id}
                onclick={() => { activeShape = shape.id; }}
              >{t(shape.label)}</button>
            {/each}
          </div>

          {#if shapePreviewPath}
            <div class="preview-container">
              <svg viewBox="-90 -90 180 180" class="section-preview">
                <path d={shapePreviewPath} fill="none" stroke="#4ecdc4" stroke-width="1.5" fill-rule="evenodd" />
                <circle cx="0" cy="0" r="2" fill="#e94560" opacity="0.7" />
              </svg>
            </div>
          {/if}

          <p class="shape-desc">{t(shapeDef.description)}</p>

          <div class="param-grid">
            {#each shapeDef.params as p}
              <label class="param-field">
                <span>{t(p.label)}</span>
                <div class="param-input">
                  <input
                    type="number"
                    step={p.step}
                    value={paramValues[p.id] ?? p.defaultValue}
                    oninput={(e) => {
                      const v = parseFloat(e.currentTarget.value);
                      if (!isNaN(v)) paramValues = { ...paramValues, [p.id]: v };
                    }}
                  />
                  <span class="param-unit">{p.unit}</span>
                </div>
              </label>
            {/each}
          </div>

          {#if computed}
            <div class="results-box">
              <div class="result-row"><span>{t('field.resultName')}</span><span class="result-val">{autoName}</span></div>
              <div class="result-row"><span>A =</span><span class="result-val">{computed.a.toPrecision(4)} m²</span></div>
              <div class="result-row"><span>Iz =</span><span class="result-val">{computed.iz.toPrecision(4)} m⁴</span></div>
            </div>
            <button class="confirm-btn" onclick={handleShapeConfirm}>{t('action.applySection')}</button>
          {:else}
            <div class="results-box error"><span>{t('shapeBuilder.invalidDimensions')}</span></div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .sc-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sc-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .sc-modal {
    position: relative;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    width: 700px;
    max-width: 95vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .sc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.85rem 1.25rem 0.5rem;
    border-bottom: 1px solid #1a4a7a;
  }

  .sc-header h2 {
    font-size: 1.05rem;
    color: #4ecdc4;
    margin: 0;
  }

  .sc-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }
  .sc-close:hover { color: #eee; }

  /* ─── Main Tabs ─── */
  .sc-main-tabs {
    display: flex;
    border-bottom: 2px solid #0f3460;
  }

  .sc-main-tabs button {
    flex: 1;
    padding: 0.55rem 0.75rem;
    border: none;
    background: transparent;
    color: #888;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.15s;
  }

  .sc-main-tabs button:hover {
    color: #ccc;
    background: rgba(15, 52, 96, 0.3);
  }

  .sc-main-tabs button.active {
    color: #4ecdc4;
    border-bottom-color: #4ecdc4;
  }

  /* ─── Body ─── */
  .sc-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .sc-profile-body {
    display: flex;
    flex-direction: column;
  }

  .sc-shape-body {
    padding: 0.5rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  /* ─── Profile Selector Styles ─── */
  .profile-tabs {
    display: flex;
    gap: 0.2rem;
    padding: 0.6rem 1.25rem 0.3rem;
    flex-wrap: wrap;
  }

  .tab-btn {
    padding: 0.3rem 0.7rem;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    background: transparent;
    color: #aaa;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { background: #0f3460; color: #eee; }
  .tab-btn.active { background: #e94560; border-color: #e94560; color: white; }

  .profile-preview {
    display: flex;
    justify-content: center;
    padding: 0.25rem 1.25rem 0.4rem;
  }
  .preview-svg {
    width: 90px;
    height: 90px;
    background: rgba(15, 52, 96, 0.3);
    border-radius: 6px;
    border: 1px solid rgba(26, 74, 122, 0.4);
  }

  .profile-search {
    padding: 0 1.25rem 0.5rem;
  }
  .profile-search input {
    width: 100%;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }
  .profile-search input::placeholder { color: #666; }
  .profile-search input:focus { outline: none; border-color: #4ecdc4; }

  .profile-table-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.25rem 1rem;
  }

  .profile-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .profile-table thead th {
    position: sticky;
    top: 0;
    background: #16213e;
    color: #888;
    font-weight: 500;
    text-align: right;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #0f3460;
    font-size: 0.75rem;
  }
  .profile-table thead th:first-child { text-align: left; }

  .profile-row { cursor: pointer; transition: background 0.1s; }
  .profile-row:hover { background: #0f3460; }
  .profile-row td {
    padding: 0.35rem 0.5rem;
    text-align: right;
    color: #ccc;
    border-bottom: 1px solid rgba(15, 52, 96, 0.5);
  }
  .name-cell { text-align: left !important; font-weight: 500; color: #eee !important; }
  .no-results { text-align: center !important; color: #666 !important; padding: 2rem 0 !important; }

  /* ─── Shape Builder Styles ─── */
  .category-tabs {
    display: flex;
    justify-content: center;
    gap: 0;
    margin-bottom: 0.3rem;
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
  .category-tabs button:first-child { border-radius: 6px 0 0 6px; border-right: none; }
  .category-tabs button:last-child { border-radius: 0 6px 6px 0; }
  .category-tabs button.active { background: #0f3460; color: #4ecdc4; border-color: #4ecdc4; }
  .category-tabs button:not(.active):hover { background: rgba(15, 52, 96, 0.4); color: #ccc; }

  .shape-tabs {
    display: flex;
    flex-wrap: wrap;
    border-bottom: 1px solid #0f3460;
    padding: 0;
  }

  .shape-desc {
    font-size: 0.75rem;
    color: #888;
    margin: 0.5rem 0 0.5rem;
    font-style: italic;
  }

  .preview-container {
    display: flex;
    justify-content: center;
    margin: 0.4rem 0;
  }
  .section-preview {
    width: 120px;
    height: 120px;
    background: rgba(15, 52, 96, 0.3);
    border-radius: 6px;
    border: 1px solid rgba(26, 74, 122, 0.4);
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
  .param-input { display: flex; align-items: center; gap: 0.3rem; }
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
  .param-unit { font-size: 0.7rem; color: #888; min-width: 1.5rem; }

  .results-box {
    margin-top: 0.75rem;
    padding: 0.6rem;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 6px;
  }
  .results-box.error { border-color: #e94560; color: #e94560; text-align: center; font-size: 0.8rem; }
  .result-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: #aaa; padding: 0.15rem 0; }
  .result-val { color: #4ecdc4; font-family: monospace; }

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
  .confirm-btn:hover { background: #1a7a5a; color: white; }

  .amorph-warning {
    margin-top: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: rgba(233, 69, 96, 0.1);
    border: 1px solid rgba(233, 69, 96, 0.3);
    border-radius: 4px;
    color: #e9a845;
    font-size: 0.75rem;
  }
</style>
