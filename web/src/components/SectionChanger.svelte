<script lang="ts">
  import {
    PROFILE_FAMILIES, searchProfiles, profileToSection,
    type ProfileFamily, type SteelProfile, type SectionShape,
  } from '../lib/data/steel-profiles';
  import {
    SECTION_SHAPES, THIN_SHAPES, SOLID_SHAPES,
    computeSectionProperties, generateSectionName,
    type ShapeType, type SectionProperties, type MaterialCategory,
  } from '../lib/data/section-shapes';
  import { crossSectionPath } from '../lib/utils/section-drawing';
  import { profileOutline } from '../lib/section/outline';
  import {
    DESIGN_CODES, familiesForCode, groupBySeries, classifyFamily,
  } from '../lib/data/section-catalog';
  import { t } from '../lib/i18n';
  import { uiStore } from '../lib/store/ui.svelte';
  import { toQ, unitQ } from '../lib/store/display-units.svelte';
  import UnitInput from './UnitInput.svelte';

  interface Props {
    open: boolean;
    /** Called when a standard steel profile is selected */
    /**
     * A profile was chosen. `region` is the design code's region, or null when
     * the user has not filtered by a code — a family is rolled in different
     * steels in different countries, so the grade that travels with a profile
     * depends on whose practice is meant.
     */
    onprofileselect: (
      profile: SteelProfile,
      section: { a: number; iy: number; iz: number; b: number; h: number },
      region?: string | null,
    ) => void;
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
  /**
   * Which series is expanded. Null means "whichever holds the active family",
   * so opening the dialog shows the group you are already in rather than
   * collapsing everything and making you find it again.
   */
  let openSeries = $state<string | null>(null);

  // Reset tab when opened
  $effect(() => {
    if (open) {
      activeMainTab = initialTab;
    }
  });

  // ─── Profile Selector state ──────────────────
  //
  // The design code is a FILTER over families, not an owner of them: picking
  // CIRSOC 301 narrows the list to the families whose shipped dimensions that
  // code's practice actually uses, and says which ones are still missing. It
  // never relabels a European family as Argentine.
  let activeCode = $state<string | null>(null);
  let activeFamily = $state<ProfileFamily>('IPN');
  let searchQuery = $state('');

  const availableFamilies = $derived(familiesForCode(activeCode));
  const familyGroups = $derived(groupBySeries(availableFamilies));
  const activeCodeDef = $derived(DESIGN_CODES.find((c) => c.id === activeCode) ?? null);
  const activeClass = $derived(classifyFamily(activeFamily));

  // Selecting a code that does not carry the current family must move the
  // selection somewhere valid rather than leave an empty table.
  $effect(() => {
    const fams = availableFamilies;
    if (!fams.includes(activeFamily) && fams.length > 0) activeFamily = fams[0];
  });

  let filteredProfiles = $derived(searchProfiles(searchQuery, activeFamily));

  const profilePreviewPath = $derived.by(() => {
    const profiles = PROFILE_FAMILIES[activeFamily];
    if (!profiles || profiles.length === 0) return null;
    const rep = profiles[Math.floor(profiles.length / 2)];
    return profileOutline(rep).d;
  });

  function handleProfileClick(p: SteelProfile) {
    /*
     * The chosen design code's region travels with the profile.
     *
     * A family is rolled in different steels in different countries — a W is
     * A992 in the United States and F-36 here — so "which grade does this
     * profile come in" has no answer without knowing whose practice is meant.
     * The code filter is where the user already said that; passing it on saves
     * asking them twice. Null when no code is selected, which the receiver
     * reads as "no particular country".
     */
    onprofileselect(p, profileToSection(p), activeCodeDef?.region ?? null);
  }

  // ─── Shape Builder state ─────────────────────
  let activeCategory = $state<MaterialCategory>('thin');
  let activeShape = $state<ShapeType>('rect');
  let paramValues = $state<Record<string, number>>({});

  const categoryShapes = $derived(
    activeCategory === 'thin' ? THIN_SHAPES : SOLID_SHAPES
  );

  let prevCategory = $state<MaterialCategory | null>(null);
  $effect(() => {
    const cat = activeCategory;
    if (cat !== prevCategory) {
      prevCategory = cat;
      const shapes = cat === 'thin' ? THIN_SHAPES : SOLID_SHAPES;
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
  // Kept in m² and m⁴ like the model; typed and shown in the section units of
  // the chosen system, as the sections table shows them.
  let amorphA = $state(50e-4);
  let amorphIy = $state(8000e-8);
  let amorphIz = $state(2000e-8);
  let amorphJ = $state(10e-8);

  /** A section value in the chosen units, four significant figures, with its unit. */
  const secA = (m2: number) => `${toQ(m2, 'sectionArea').toPrecision(4)} ${unitQ('sectionArea')}`;
  const secI = (m4: number) => `${toQ(m4, 'sectionInertia').toPrecision(4)} ${unitQ('sectionInertia')}`;

  /*
   * The catalogue lists h and b in mm, A in cm² and I in cm⁴. The metric
   * systems keep the millimetres, which is how profiles are designated (an
   * IPE 300 is 300 mm deep); Imperial shows inches. Areas and inertias follow
   * the chosen section units.
   */
  const catDimLabel = $derived(uiStore.unitSystem === 'Imperial' ? unitQ('sectionDim') : 'mm');
  const catDim = (mm: number) => uiStore.unitSystem === 'Imperial' ? (+toQ(mm / 1000, 'sectionDim').toFixed(2)).toString() : String(mm);

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

      <!--
        The three routes, named by WHERE the section comes from rather than by
        what it is made of.

        The old labels invited the wrong question. A user working in timber or
        aluminium looked at "standard profile / build a section / amorphous" and
        could not tell which was theirs, because none of them mentions a
        material. The answer is that SHAPE IS INDEPENDENT OF MATERIAL: a
        rectangle is a rectangle whether it is concrete, timber or steel. Only
        the catalogue is material-specific, because rolling is.
      -->
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
          <p class="sc-route-note">{t('dialog.catalogueIsRolledSteel')}</p>
          <div class="code-bar">
            <span class="code-label">{t('cat.code')}</span>
            <button class="code-btn" class:active={activeCode === null}
              onclick={() => { activeCode = null; searchQuery = ''; }}>{t('cat.allCodes')}</button>
            {#each DESIGN_CODES as c}
              <button class="code-btn" class:active={activeCode === c.id}
                onclick={() => { activeCode = c.id; searchQuery = ''; }}>{c.label}</button>
            {/each}
          </div>

          <!--
            Preview on the left, families on the right.

            The families used to be a wrapping strip of every series at once,
            above a table that changed under it. Two problems: the strip was a
            wall of abbreviations with no way to tell an I-beam from a channel
            without knowing the codes already, and the drawing of what you had
            chosen sat below the fold. Now the shape you are looking at is the
            first thing on screen, and the families are grouped by SHAPE — which
            is what a section is — with one series open at a time.
          -->
          <div class="profile-layout">
            <div class="profile-aside">
              {#if profilePreviewPath}
                <div class="profile-preview">
                  <svg viewBox="-90 -90 180 180" class="preview-svg">
                    <path d={profilePreviewPath} fill="var(--st-value)" fill-opacity="0.12"
                          stroke="var(--st-value)" stroke-width="2" fill-rule="evenodd" />
                  </svg>
                </div>
              {/if}
              <div class="profile-meta">
                <div class="meta-family">{activeFamily}</div>
                {#if activeClass}
                  <div class="meta-row"><span class="meta-k">{t('cat.standard')}</span><span class="meta-v">{activeClass.standard}</span></div>
                  <div class="meta-row"><span class="meta-k">{t('cat.geometry')}</span>
                    <span class="meta-v" class:warn={activeClass.fidelity === 'propertiesOnly'}>
                      {activeClass.fidelity === 'exact' ? t('cat.geomExact') : t('cat.geomApprox')}
                    </span>
                  </div>
                {/if}
                {#if activeCodeDef?.missingFamilies?.length}
                  <div class="meta-missing">
                    {t('cat.missing')}: {activeCodeDef.missingFamilies.map((k) => t(k)).join(', ')}
                  </div>
                {/if}
              </div>
            </div>

            <div class="profile-families">
              {#each familyGroups as group}
                {@const isOpen = openSeries === group.series || group.families.includes(activeFamily)}
                <div class="series-block" class:open={isOpen}>
                  <button
                    class="series-head"
                    onclick={() => openSeries = isOpen ? null : group.series}
                    aria-expanded={isOpen}
                  >
                    <span class="series-chevron">{isOpen ? '▾' : '▸'}</span>
                    {t('cat.series.' + group.series)}
                    <span class="series-count">{group.families.length}</span>
                  </button>
                  {#if isOpen}
                    <div class="series-families">
                      {#each group.families as fam}
                        <button
                          class="tab-btn"
                          class:active={activeFamily === fam}
                          class:approx={classifyFamily(fam)?.fidelity === 'propertiesOnly'}
                          title={classifyFamily(fam)?.standard}
                          onclick={() => { activeFamily = fam; searchQuery = ''; }}
                        >{fam}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>

          <div class="profile-search">
            <input type="text" placeholder={t('search.profile')} bind:value={searchQuery} />
          </div>

          <div class="profile-table-wrap">
            <table class="profile-table">
              <thead>
                <tr>
                  <th>{t('table.profile')}</th>
                  <th>h ({catDimLabel})</th>
                  <th>b ({catDimLabel})</th>
                  <th>A ({unitQ('sectionArea')})</th>
                  <th>Iy ({unitQ('sectionInertia')})</th>
                  <th>Iz ({unitQ('sectionInertia')})</th>
                  <th>kg/m</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredProfiles as p}
                  <tr onclick={() => handleProfileClick(p)} class="profile-row">
                    <td class="name-cell">
                      <svg viewBox="-90 -90 180 180" class="row-thumb" aria-hidden="true">
                        <path d={profileOutline(p).d} fill="var(--st-value)" fill-opacity="0.25"
                              stroke="var(--st-value)" stroke-width="4" fill-rule="evenodd" />
                      </svg>
                      {p.name}
                    </td>
                    <td>{catDim(p.h)}</td>
                    <td>{catDim(p.b)}</td>
                    <td>{toQ(p.a * 1e-4, 'sectionArea').toFixed(1)}</td>
                    <td>{toQ(p.iy * 1e-8, 'sectionInertia').toFixed(0)}</td>
                    <td>{toQ(p.iz * 1e-8, 'sectionInertia').toFixed(0)}</td>
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
                <UnitInput value={amorphA} qty="sectionArea" unit={false} live onchange={(v) => (amorphA = v)} />
                <span class="param-unit">{unitQ('sectionArea')}</span>
              </div>
            </label>
            <label class="param-field">
              <span>{t('field.iyHoriz')}</span>
              <div class="param-input">
                <UnitInput value={amorphIy} qty="sectionInertia" unit={false} live onchange={(v) => (amorphIy = v)} />
                <span class="param-unit">{unitQ('sectionInertia')}</span>
              </div>
            </label>
            <label class="param-field">
              <span>{t('field.izVert')}</span>
              <div class="param-input">
                <UnitInput value={amorphIz} qty="sectionInertia" unit={false} live onchange={(v) => (amorphIz = v)} />
                <span class="param-unit">{unitQ('sectionInertia')}</span>
              </div>
            </label>
            {#if is3D}
              <label class="param-field">
                <span>{t('field.jTorsion')}</span>
                <div class="param-input">
                  <UnitInput value={amorphJ} qty="sectionInertia" unit={false} live onchange={(v) => (amorphJ = v)} />
                  <span class="param-unit">{unitQ('sectionInertia')}</span>
                </div>
              </label>
            {/if}
          </div>

          <div class="amorph-warning">{t('warning.amorphousNoStress')}</div>

          {#if amorphValid}
            <div class="results-box">
              <div class="result-row"><span>{t('field.resultName')}</span><span class="result-val">{amorphName}</span></div>
              <div class="result-row"><span>A =</span><span class="result-val">{secA(amorphA)}</span></div>
              <div class="result-row"><span>Iy =</span><span class="result-val">{secI(amorphIy)}</span></div>
              <div class="result-row"><span>Iz =</span><span class="result-val">{secI(amorphIz)}</span></div>
              {#if is3D}
                <div class="result-row"><span>J =</span><span class="result-val">{secI(amorphJ)}</span></div>
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
            <button class:active={activeCategory === 'thin'} onclick={() => { activeCategory = 'thin'; }}>{t('shapeBuilder.thin')}</button>
            <button class:active={activeCategory === 'solid'} onclick={() => { activeCategory = 'solid'; }}>{t('shapeBuilder.solid')}</button>
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
                <path d={shapePreviewPath} fill="none" stroke="var(--st-value)" stroke-width="1.5" fill-rule="evenodd" />
                <circle cx="0" cy="0" r="2" fill="var(--st-accent)" opacity="0.7" />
              </svg>
            </div>
          {/if}

          <p class="shape-desc">{t(shapeDef.description)}</p>

          <div class="param-grid">
            {#each shapeDef.params as p}
              <label class="param-field">
                <span>{t(p.label)}</span>
                <div class="param-input">
                  {#if p.unit === 'm'}
                    <!-- A section dimension, defined in metres: typed in the chosen section unit. -->
                    <UnitInput
                      value={paramValues[p.id] ?? p.defaultValue}
                      qty="sectionDim"
                      unit={false}
                      live
                      step={String(+toQ(p.step, 'sectionDim').toPrecision(3))}
                      onchange={(v) => { paramValues = { ...paramValues, [p.id]: v }; }}
                    />
                    <span class="param-unit">{unitQ('sectionDim')}</span>
                  {:else}
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
                  {/if}
                </div>
              </label>
            {/each}
          </div>

          {#if computed}
            <div class="results-box">
              <div class="result-row"><span>{t('field.resultName')}</span><span class="result-val">{autoName}</span></div>
              <div class="result-row"><span>A =</span><span class="result-val">{secA(computed.a)}</span></div>
              <div class="result-row"><span>Iz =</span><span class="result-val">{secI(computed.iz)}</span></div>
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
  /* ── Profile tab: preview beside the families ──────────────── */
  .profile-layout {
    display: grid;
    grid-template-columns: 190px 1fr;
    gap: 12px;
    align-items: start;
    padding: 10px 0;
  }
  .profile-aside { display: flex; flex-direction: column; gap: 8px; }
  /* The meta block sat flush against the panel edge and ran its rows together,
     so the family name and its two facts read as one paragraph. Padded and
     spaced to match the card above it. */
  /* The card above has an inner padding of its own, so the text below sat
     visually further left than the drawing it describes. Matched to it, and
     given the same background so the two read as one block rather than as a
     panel with a caption escaping from under it. */
  .profile-aside .profile-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border-radius: var(--st-radius, 3px);
    background: var(--st-surface-3);
    border: 1px solid var(--st-border);
  }
  .profile-aside .meta-family {
    padding-bottom: 4px;
    margin-bottom: 2px;
    border-bottom: 1px solid var(--st-border);
  }
  .profile-aside .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 0.7rem;
    line-height: 1.5;
  }
  .profile-aside .meta-k { color: var(--st-text-3); min-width: 0; }
  .profile-aside .meta-v { text-align: right; }
  .profile-preview {
    aspect-ratio: 1;
    border-radius: var(--st-radius, 3px);
    background: var(--st-surface-3);
    border: 1px solid var(--st-border);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }
  .profile-preview .preview-svg { width: 100%; height: 100%; }
  .meta-family {
    font-family: var(--st-display, inherit);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--st-text);
  }

  .profile-families {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
  }
  /* One series open at a time: the strip used to show every family at once,
     which is a wall of abbreviations rather than a choice. */
  .series-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    background: none;
    border: none;
    border-radius: var(--st-radius, 3px);
    color: var(--st-text-2);
    font-family: var(--st-sans, inherit);
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
  }
  .series-head:hover { background: var(--st-surface-2); color: var(--st-text); }
  .series-block.open .series-head { color: var(--st-text); }
  .series-chevron { font-size: 0.62rem; width: 10px; color: var(--st-text-3); }
  .series-count {
    margin-left: auto;
    font-size: 0.68rem;
    color: var(--st-text-3);
    font-family: var(--st-mono, monospace);
  }
  .series-families {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 2px 8px 6px 24px;
  }

  /* Series grouping: a heading and its families on one row of their own. */
  .series-group {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    padding: 3px 0;
  }
  .series-families { display: flex; flex-wrap: wrap; gap: 3px; }
  .sc-route-note {
    margin: 0 0 8px;
    padding: 6px 9px;
    border-radius: var(--st-radius, 3px);
    background: var(--st-surface-2);
    border-left: 2px solid var(--st-value);
    font-size: 0.72rem;
    line-height: 1.5;
    color: var(--st-text-2);
  }

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
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
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
    border-bottom: 1px solid var(--st-hair-strong);
  }

  .sc-header h2 {
    font-size: 1.05rem;
    color: var(--st-value);
    margin: 0;
  }

  .sc-close {
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }
  .sc-close:hover { color: var(--st-text); }

  /* ─── Main Tabs ─── */
  .sc-main-tabs {
    display: flex;
    border-bottom: 2px solid var(--st-hair);
  }

  .sc-main-tabs button {
    flex: 1;
    padding: 0.55rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--st-text-3);
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.15s;
  }

  .sc-main-tabs button:hover {
    color: var(--st-text);
    background: var(--st-surface-3);
  }

  .sc-main-tabs button.active {
    color: var(--st-value);
    border-bottom-color: var(--st-interactive);
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
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: transparent;
    color: var(--st-text-2);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { background: var(--st-surface-2); color: var(--st-text); }
  .tab-btn.active { background: var(--st-accent); border-color: var(--st-accent); color: white; }

  /*
   * The old preview styles lived here and were deleted, not merged.
   *
   * They were a second `.profile-preview` block plus a `.preview-svg` that
   * painted the DRAWING with `rgba(15, 52, 96, 0.3)` — a pale blue, hardcoded
   * rather than a token, and applied to the svg inside a card that already has
   * its own background. The result was a blue rectangle floating inside the
   * card, not aligned with it, which is the untidiness this panel kept being
   * reported for. Being later in the file, this block also overrode the
   * current one's padding, so the shape sat off-centre in its own box.
   *
   * The background belongs to the container, which has it. The svg is
   * transparent.
   */

  .code-bar {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 6px 8px; border-bottom: 1px solid var(--st-border);
  }
  .code-label { font-size: 0.68rem; color: var(--st-text-3); text-transform: uppercase; letter-spacing: 0.04em; }
  .code-btn {
    padding: 3px 9px;
    border-radius: var(--st-radius, 3px);
    background: transparent;
    border: 1px solid var(--st-border);
    color: var(--st-text-3);
    font-family: var(--st-sans, inherit);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .code-btn:hover { border-color: var(--st-value); color: var(--st-text); }
  .code-btn:hover { color: var(--st-text); border-color: var(--st-text-3); }
  /* Selected reads as selected the same way every other control in the app
     does — filled with the accent — rather than with a colour of its own. */
  .code-btn.active {
    background: var(--st-accent);
    border-color: var(--st-accent);
    color: var(--st-text-on-accent);
  }
  .series-label {
    font-size: 0.62rem; color: var(--st-text-3); text-transform: uppercase;
    letter-spacing: 0.05em; margin: 0 2px 0 8px; align-self: center;
  }
  .series-label:first-child { margin-left: 0; }
  /* A family whose outline is approximate is marked in the picker itself, so
     the limitation is visible before the profile is chosen, not after. */
  .tab-btn.approx { border-bottom: 2px dotted var(--st-amber-text); }
  .profile-head { display: flex; align-items: center; gap: 12px; padding: 0 8px; }
  .profile-meta { flex: 1; min-width: 0; font-size: 0.7rem; }
  .meta-row { display: flex; gap: 6px; }
  .meta-k { color: var(--st-text-3); min-width: 74px; }
  .meta-v { color: var(--st-text-2); font-family: monospace; }
  .meta-v.warn { color: var(--st-amber-text); }
  .meta-missing { margin-top: 6px; color: var(--st-amber); font-size: 0.65rem; line-height: 1.35; }
  .row-thumb { width: 18px; height: 18px; vertical-align: -4px; margin-right: 6px; }

  .profile-search {
    padding: 0 1.25rem 0.5rem;
  }
  .profile-search input {
    width: 100%;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }
  .profile-search input::placeholder { color: var(--st-text-3); }
  .profile-search input:focus { outline: none; border-color: var(--st-interactive); }

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
    background: var(--st-surface);
    color: var(--st-text-3);
    font-weight: 500;
    text-align: right;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--st-hair);
    font-size: 0.75rem;
  }
  .profile-table thead th:first-child { text-align: left; }

  .profile-row { cursor: pointer; transition: background 0.1s; }
  .profile-row:hover { background: var(--st-surface-2); }
  .profile-row td {
    padding: 0.35rem 0.5rem;
    text-align: right;
    color: var(--st-text);
    border-bottom: 1px solid var(--st-hair);
  }
  .name-cell { text-align: left !important; font-weight: 500; color: var(--st-text) !important; }
  .no-results { text-align: center !important; color: var(--st-text-3) !important; padding: 2rem 0 !important; }

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
    border: 1px solid var(--st-hair-strong);
    background: transparent;
    color: var(--st-text-3);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .category-tabs button:first-child { border-radius: 6px 0 0 6px; border-right: none; }
  .category-tabs button:last-child { border-radius: 0 6px 6px 0; }
  .category-tabs button.active { background: var(--st-surface-2); color: var(--st-value); border-color: var(--st-interactive); }
  .category-tabs button:not(.active):hover { background: var(--st-surface-3); color: var(--st-text); }

  .shape-tabs {
    display: flex;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--st-hair);
    padding: 0;
  }

  .shape-desc {
    font-size: 0.75rem;
    color: var(--st-text-3);
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
    background: var(--st-surface-3);
    border-radius: 6px;
    border: 1px solid var(--st-border);
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
    color: var(--st-text);
  }
  .param-input { display: flex; align-items: center; gap: 0.3rem; }
  /* :global because most of these fields are inputs inside UnitInput. */
  .param-input :global(input) {
    width: 80px;
    padding: 0.3rem 0.4rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text);
    font-size: 0.8rem;
    text-align: right;
  }
  .param-unit { font-size: 0.7rem; color: var(--st-text-3); min-width: 1.5rem; }

  .results-box {
    margin-top: 0.75rem;
    padding: 0.6rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 6px;
  }
  .results-box.error { border-color: var(--st-accent); color: var(--st-accent); text-align: center; font-size: 0.8rem; }
  .result-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--st-text-2); padding: 0.15rem 0; }
  .result-val { color: var(--st-value); font-family: monospace; }

  .confirm-btn {
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.5rem;
    background: var(--st-accent);
    border: 1px solid var(--st-accent);
    border-radius: 6px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.15s;
  }
  .confirm-btn:hover { background: var(--st-accent); color: white; }

  .amorph-warning {
    margin-top: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: rgba(233, 69, 96, 0.1);
    border: 1px solid rgba(233, 69, 96, 0.3);
    border-radius: 4px;
    color: var(--st-amber-text);
    font-size: 0.75rem;
  }
</style>
