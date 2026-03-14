<script lang="ts">
  import { modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import {
    FAMILY_LIST, PROFILE_FAMILIES, searchProfiles, familyToShape,
    type ProfileFamily, type SteelProfile,
  } from '../../lib/data/steel-profiles';
  import {
    SECTION_SHAPES, STEEL_SHAPES, CONCRETE_SHAPES,
    computeSectionProperties, generateSectionName,
    type ShapeType, type SectionProperties, type MaterialCategory,
  } from '../../lib/data/section-shapes';
  import { crossSectionPath } from '../../lib/utils/section-drawing';

  type MainTab = 'catalog' | 'builder';
  let activeTab = $state<MainTab>('catalog');

  // ─── Profile Catalog state ──────────────────
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

  function shapeForFamily(f: ProfileFamily): string {
    if (f === 'IPE' || f === 'IPN') return 'I';
    if (f === 'HEB' || f === 'HEA') return 'H';
    if (f === 'UPN') return 'U';
    if (f === 'L') return 'L';
    if (f === 'RHS') return 'RHS';
    return 'CHS';
  }

  function addProfile(p: SteelProfile) {
    modelStore.addSection({
      name: p.name,
      a: p.a * 1e-4,
      iz: p.iz * 1e-8,
      iy: p.iy * 1e-8,
      b: p.b / 1000,
      h: p.h / 1000,
      shape: shapeForFamily(p.family),
      tw: p.tw ? p.tw / 1000 : undefined,
      tf: p.tf ? p.tf / 1000 : undefined,
      t: p.t ? p.t / 1000 : undefined,
    });
  }

  // ─── Shape Builder state ──────────────────
  let activeCategory = $state<MaterialCategory>('concrete');
  let activeShape = $state<ShapeType>('concrete-rect');
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
      shape: (computed.shape ?? 'rect') as any,
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
    modelStore.addSection({
      name: autoName,
      a: computed.a,
      iz: computed.iz,
      iy: computed.iy,
      j: computed.j,
      b: computed.b,
      h: computed.h,
      shape: computed.shape,
      tw: computed.tw,
      tf: computed.tf,
      t: computed.t,
    });
  }

  // ─── Sections list ──────────────────────
  const sections = $derived([...modelStore.sections.values()]);

  function removeSec(id: number) {
    modelStore.removeSection(id);
  }

  function fmtNum(n: number): string {
    if (n === 0) return '0';
    if (Math.abs(n) < 0.001) return n.toExponential(2);
    return n.toPrecision(4);
  }
</script>

<div class="pro-sec">
  <!-- Collapsible add-section panel -->
  <details class="add-panel">
    <summary class="add-panel-summary">{t('pro.addSectionPanel')}</summary>
    <div class="add-panel-body">

  <!-- Main tabs -->
  <div class="main-tabs">
    <button class:active={activeTab === 'catalog'} onclick={() => activeTab = 'catalog'}>
      {t('dialog.chooseStandardProfile')}
    </button>
    <button class:active={activeTab === 'builder'} onclick={() => activeTab = 'builder'}>
      {t('dialog.buildSection')}
    </button>
  </div>

  <!-- ═══ Profile Catalog ═══ -->
  {#if activeTab === 'catalog'}
    <div class="tab-body catalog-body">
      <div class="family-tabs">
        {#each FAMILY_LIST as fam}
          <button
            class="fam-btn"
            class:active={activeFamily === fam}
            onclick={() => { activeFamily = fam; searchQuery = ''; }}
          >{fam}</button>
        {/each}
      </div>

      <div class="catalog-top">
        {#if profilePreviewPath}
          <div class="profile-preview">
            <svg viewBox="-90 -90 180 180" class="preview-svg">
              <path d={profilePreviewPath} fill="none" stroke="#4ecdc4" stroke-width="1.5" fill-rule="evenodd" />
            </svg>
          </div>
        {/if}
        <div class="search-wrap">
          <input type="text" placeholder={t('search.profile')} bind:value={searchQuery} />
        </div>
      </div>

      <div class="profile-table-wrap">
        <table class="profile-table">
          <thead>
            <tr>
              <th>{t('table.profile')}</th>
              <th>h</th>
              <th>b</th>
              <th>A (cm²)</th>
              <th>Iy (cm⁴)</th>
              <th>Iz (cm⁴)</th>
              <th>kg/m</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredProfiles as p}
              <tr class="profile-row" onclick={() => addProfile(p)}>
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

  <!-- ═══ Shape Builder ═══ -->
  {:else}
    <div class="tab-body builder-body">
      <div class="cat-toggle">
        <button class:active={activeCategory === 'concrete'} onclick={() => { activeCategory = 'concrete'; }}>
          {t('shapeBuilder.concrete')}
        </button>
        <button class:active={activeCategory === 'steel'} onclick={() => { activeCategory = 'steel'; }}>
          {t('shapeBuilder.steel')}
        </button>
      </div>

      <div class="shape-tabs">
        {#each categoryShapes as shape}
          <button
            class="shape-btn"
            class:active={activeShape === shape.id}
            onclick={() => { activeShape = shape.id; }}
          >{t(shape.label)}</button>
        {/each}
      </div>

      <div class="builder-content">
        {#if shapePreviewPath}
          <div class="shape-preview">
            <svg viewBox="-90 -90 180 180" class="preview-svg">
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
            <div class="result-row"><span>Iy =</span><span class="result-val">{computed.iy.toPrecision(4)} m⁴</span></div>
            <div class="result-row"><span>Iz =</span><span class="result-val">{computed.iz.toPrecision(4)} m⁴</span></div>
            {#if computed.j}
              <div class="result-row"><span>J =</span><span class="result-val">{computed.j.toPrecision(4)} m⁴</span></div>
            {/if}
          </div>
          <button class="confirm-btn" onclick={handleShapeConfirm}>{t('pro.addSection')}</button>
        {:else}
          <div class="results-box error"><span>{t('shapeBuilder.invalidDimensions')}</span></div>
        {/if}
      </div>
    </div>
  {/if}

    </div>
  </details>

  <!-- Sections table (always visible) -->
  <div class="sec-list">
    <div class="sec-list-header">
      <span class="sec-count">{t('pro.nSections').replace('{n}', String(sections.length))}</span>
    </div>
    <div class="sec-table-wrap">
      <table class="sec-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>{t('pro.thName')}</th>
            <th>A (m²)</th>
            <th>Iz (m⁴)</th>
            <th>Iy (m⁴)</th>
            <th>J (m⁴)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each sections as s}
            <tr>
              <td class="col-id">{s.id}</td>
              <td class="col-name">{s.name}</td>
              <td class="col-num">{fmtNum(s.a)}</td>
              <td class="col-num">{fmtNum(s.iz)}</td>
              <td class="col-num">{fmtNum(s.iy ?? 0)}</td>
              <td class="col-num">{fmtNum(s.j ?? 0)}</td>
              <td><button class="del-btn" onclick={() => removeSec(s.id)}>×</button></td>
            </tr>
          {/each}
          {#if sections.length === 0}
            <tr><td colspan="7" class="no-results">{t('pro.noSections')}</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .pro-sec {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ─── Add Panel (collapsible) ─── */
  .add-panel {
    flex-shrink: 0;
    border-bottom: 2px solid #0f3460;
  }
  .add-panel[open] {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .add-panel-summary {
    padding: 8px 12px;
    font-size: 0.78rem;
    font-weight: 600;
    color: #4ecdc4;
    cursor: pointer;
    user-select: none;
    list-style: none;
  }
  .add-panel-summary::-webkit-details-marker { display: none; }
  .add-panel-summary::before {
    content: '+ ';
  }
  .add-panel[open] > .add-panel-summary::before {
    content: '− ';
  }
  .add-panel-summary:hover { color: #6eede4; }
  .add-panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ─── Main Tabs ─── */
  .main-tabs {
    display: flex;
    border-bottom: 2px solid #0f3460;
    flex-shrink: 0;
  }
  .main-tabs button {
    flex: 1;
    padding: 0.5rem 0.5rem;
    border: none;
    background: transparent;
    color: #888;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.15s;
  }
  .main-tabs button:hover { color: #ccc; background: rgba(15, 52, 96, 0.3); }
  .main-tabs button.active { color: #4ecdc4; border-bottom-color: #4ecdc4; }

  /* ─── Tab Body ─── */
  .tab-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ─── Catalog Tab ─── */
  .catalog-body { overflow: hidden; }

  .family-tabs {
    display: flex;
    gap: 3px;
    padding: 6px 8px 4px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  .fam-btn {
    padding: 3px 8px;
    border: 1px solid #1a3050;
    border-radius: 4px;
    background: transparent;
    color: #aaa;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.12s;
  }
  .fam-btn:hover { background: #0f3460; color: #eee; }
  .fam-btn.active { background: #e94560; border-color: #e94560; color: white; }

  .catalog-top {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 6px;
    flex-shrink: 0;
  }

  .profile-preview { flex-shrink: 0; }
  .preview-svg {
    width: 64px;
    height: 64px;
    background: rgba(15, 52, 96, 0.3);
    border-radius: 5px;
    border: 1px solid rgba(26, 74, 122, 0.4);
  }

  .search-wrap { flex: 1; }
  .search-wrap input {
    width: 100%;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 4px;
    color: #eee;
    padding: 5px 8px;
    font-size: 0.78rem;
  }
  .search-wrap input::placeholder { color: #555; }
  .search-wrap input:focus { outline: none; border-color: #4ecdc4; }

  .profile-table-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
    min-height: 0;
  }
  .profile-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }
  .profile-table thead th {
    position: sticky;
    top: 0;
    background: #0a1a30;
    color: #888;
    font-weight: 500;
    text-align: right;
    padding: 4px 5px;
    border-bottom: 1px solid #0f3460;
    font-size: 0.68rem;
  }
  .profile-table thead th:first-child { text-align: left; }
  .profile-row { cursor: pointer; transition: background 0.1s; }
  .profile-row:hover { background: #0f3460; }
  .profile-row td {
    padding: 4px 5px;
    text-align: right;
    color: #ccc;
    border-bottom: 1px solid rgba(15, 52, 96, 0.4);
  }
  .name-cell { text-align: left !important; font-weight: 500; color: #eee !important; }
  .no-results { text-align: center !important; color: #555 !important; padding: 1.5rem 0 !important; font-size: 0.75rem; }

  /* ─── Builder Tab ─── */
  .builder-body { overflow-y: auto; }

  .cat-toggle {
    display: flex;
    margin: 6px 8px 4px;
    flex-shrink: 0;
  }
  .cat-toggle button {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid #1a3050;
    background: transparent;
    color: #888;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }
  .cat-toggle button:first-child { border-radius: 5px 0 0 5px; border-right: none; }
  .cat-toggle button:last-child { border-radius: 0 5px 5px 0; }
  .cat-toggle button.active { background: #0f3460; color: #4ecdc4; border-color: #4ecdc4; }
  .cat-toggle button:not(.active):hover { background: rgba(15, 52, 96, 0.4); color: #ccc; }

  .shape-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 2px 8px 6px;
    flex-shrink: 0;
  }
  .shape-btn {
    padding: 3px 8px;
    border: 1px solid #1a3050;
    border-radius: 4px;
    background: transparent;
    color: #aaa;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.12s;
  }
  .shape-btn:hover { background: #0f3460; color: #eee; }
  .shape-btn.active { background: #1a4a7a; border-color: #4ecdc4; color: #fff; }

  .builder-content {
    padding: 0 10px 8px;
  }

  .shape-preview {
    display: flex;
    justify-content: center;
    margin: 2px 0 6px;
  }

  .shape-desc {
    font-size: 0.72rem;
    color: #888;
    margin: 0 0 6px;
    font-style: italic;
  }

  .param-grid {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .param-field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.78rem;
    color: #ccc;
  }
  .param-input { display: flex; align-items: center; gap: 4px; }
  .param-input input {
    width: 80px;
    padding: 4px 5px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 4px;
    color: #eee;
    font-size: 0.78rem;
    text-align: right;
    font-family: monospace;
  }
  .param-input input:focus { outline: none; border-color: #4ecdc4; }
  .param-unit { font-size: 0.68rem; color: #666; min-width: 1.5rem; }

  .results-box {
    margin-top: 8px;
    padding: 6px 8px;
    background: #0f2840;
    border: 1px solid #1a3050;
    border-radius: 5px;
  }
  .results-box.error { border-color: #e94560; color: #e94560; text-align: center; font-size: 0.75rem; }
  .result-row { display: flex; justify-content: space-between; font-size: 0.75rem; color: #aaa; padding: 1px 0; }
  .result-val { color: #4ecdc4; font-family: monospace; }

  .confirm-btn {
    width: 100%;
    margin-top: 8px;
    padding: 6px;
    background: #0f4a3a;
    border: 1px solid #1a7a5a;
    border-radius: 5px;
    color: #4ecdc4;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    transition: all 0.15s;
  }
  .confirm-btn:hover { background: #1a7a5a; color: white; }

  /* ─── Sections List (bottom) ─── */
  .sec-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .add-panel[open] ~ .sec-list {
    flex: 0 0 auto;
    max-height: 180px;
  }

  .sec-list-header {
    padding: 5px 10px;
    flex-shrink: 0;
  }
  .sec-count {
    font-size: 0.78rem;
    color: #4ecdc4;
    font-weight: 600;
  }

  .sec-table-wrap {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .sec-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }
  .sec-table thead { position: sticky; top: 0; z-index: 1; }
  .sec-table th {
    padding: 4px 6px;
    text-align: left;
    font-size: 0.65rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    background: #0a1a30;
    border-bottom: 1px solid #1a3050;
  }
  .sec-table td {
    padding: 3px 6px;
    border-bottom: 1px solid #0f2030;
    color: #bbb;
  }
  .col-id { width: 28px; color: #555; font-family: monospace; text-align: center; }
  .col-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.68rem; }
  .del-btn {
    background: none; border: none; color: #444; font-size: 0.9rem; cursor: pointer; padding: 0;
  }
  .del-btn:hover { color: #ff6b6b; }
</style>
