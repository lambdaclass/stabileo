<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import SectionChanger from '../SectionChanger.svelte';
  import { resolveDrawingGeometry as drawingGeometry } from '../../lib/section/drawing';
  import type { SteelProfile } from '../../lib/data/steel-profiles';
  import { commercialDefaultFor, materialFromGrade, findMaterialWithGrade } from '../../lib/data/commercial-default';
  import type { GradeRegion } from '../../lib/data/structural-grades';
  import { profileToSectionFull } from '../../lib/data/steel-profiles';
  import type { SectionProperties } from '../../lib/data/section-shapes';
  import { solverProperties } from '../../lib/section/state';

  const sectionsArr = $derived([...modelStore.sections.values()]);
  const is3D = $derived(uiStore.is3DWorkspace);

  // Unit conversion factors: model stores m² and m⁴, display in cm² and cm⁴
  const M2_TO_CM2 = 1e4;   // m² → cm²
  const M4_TO_CM4 = 1e8;   // m⁴ → cm⁴
  /** Format area in cm² */
  function fmtA(v: number) { return (v * M2_TO_CM2).toPrecision(4); }
  /** Format inertia in cm⁴ */
  function fmtI(v: number) { return (v * M4_TO_CM4).toPrecision(4); }

  let sectionChangerTargetSecId = $state<number | null>(null);
  /** Which section has its properties open. One at a time: this is a list. */
  let expandedId = $state<number | null>(null);

  /**
   * The section's outline for the thumbnail, or null when it has none.
   *
   * Uses the CANONICAL polygons where they exist — the same ones the analysis
   * runs on — so the picture cannot show one section while the numbers beside
   * it describe another. An amorphous section has no shape and gets no
   * thumbnail rather than a made-up one.
   */
  function outlineOf(sec: { canonical?: { kind: string; geometry?: unknown } }): string | null {
    const st = sec.canonical;
    if (!st || st.kind !== 'geometry-backed') return null;
    const g = drawingGeometry(sec as never);
    if (!g.ok) return null;
    const [yMin, zMin, yMax, zMax] = g.geometry.bbox;
    const sc = 80 / Math.max(yMax - yMin, zMax - zMin, 1e-12);
    const ring = (poly: Array<[number, number]>) =>
      poly.map(([y, z], i) => `${i === 0 ? 'M' : 'L'}${(y * sc).toFixed(2)} ${(-z * sc).toFixed(2)}`).join(' ') + ' Z';
    return [...g.geometry.solids, ...g.geometry.holes].map(ring).join(' ');
  }

  let showSectionChanger = $state(false);

  function addSection() {
    modelStore.addSection({ name: t('table.newSection'), a: 0.005, iz: 0.00002, iy: 0.00008 });
  }

  function updateSectionField(id: number, field: string, val: string) {
    if (field === 'name') {
      modelStore.updateSection(id, { name: val });
    } else {
      const num = parseFloat(val);
      if (isNaN(num)) return;
      // Convert from display units (cm², cm⁴) back to model units (m², m⁴)
      let modelVal = num;
      if (field === 'a') modelVal = num / M2_TO_CM2;
      else if (field === 'iy' || field === 'iz' || field === 'j') modelVal = num / M4_TO_CM4;
      modelStore.updateSection(id, { [field]: modelVal });
      resultsStore.clear();
    }
  }

  function deleteSection(id: number) {
    const ok = modelStore.removeSection(id);
    if (!ok) alert(t('table.cannotDeleteSection'));
  }

  // Apply a standard profile to an EXISTING section (update in place) -- via SectionChanger
  function handleSCProfileSelect(profile: SteelProfile, region?: string | null) {
    if (sectionChangerTargetSecId === null) return;
    const secId = sectionChangerTargetSecId;
    const full = profileToSectionFull(profile);
    /*
     * One undo step for one action.
     *
     * The section change and the material reassignments are separate store
     * mutations, and each pushes its own undo entry — so choosing a profile for
     * a section used by four members cost FIVE presses of undo to reverse, four
     * of them landing on states the user never asked for and cannot recognise.
     */
    modelStore.batch(() => {
      modelStore.updateSection(secId, {
        name: profile.name,
        /*
         * The family was NOT being stored on this path, and it is the key
         * everything downstream reads: the pairing note asks a section which
         * family it is, and a section that has forgotten answers nothing.
         * Since this is how Basic actually chooses a profile — from the
         * section table, not from an element — the note could never fire
         * there at all.
         */
        profileFamily: profile.family,
        a: full.a,
        iz: full.iz,
        iy: full.iy,
        j: full.j,
        b: full.b,
        h: full.h,
        shape: full.shape,
        tw: full.tw,
        tf: full.tf,
        t: full.t,
      });
      applyCommercialGrade(secId, profile.family, region as GradeRegion | null);
    });
    resultsStore.clear();
    showSectionChanger = false;
    sectionChangerTargetSecId = null;
  }

  /**
   * Give the members using this section the steel its profile is rolled in.
   *
   * Only those whose material did not come from the catalogue — nobody has
   * chosen a steel for them on purpose. See `commercial-default.ts`.
   *
   * Scoped to the members that use THIS section rather than applied globally:
   * a model can hold several sections in several families, and choosing an IPN
   * for one of them says nothing about the others.
   */
  function applyCommercialGrade(secId: number, family: string | undefined, region: GradeRegion | null) {
    let matId: number | null = null;
    for (const el of modelStore.elements.values()) {
      if (el.sectionId !== secId) continue;
      const current = modelStore.materials.get(el.materialId);
      const grade = commercialDefaultFor(family, current, region);
      if (!grade) continue;

      if (matId === null) {
        // Reused across the members of this section, and across the model:
        // twenty IPN beams end up sharing one F-24, not carrying twenty.
        const existing = findMaterialWithGrade(modelStore.materials.values(), grade.id);
        matId = existing ? existing.id : modelStore.addMaterial(materialFromGrade(grade));
      }
      modelStore.updateElementMaterial(el.id, matId);
    }
  }

  // Apply a custom shape to an EXISTING section -- via SectionChanger
  function handleSCShapeSelect(name: string, props: SectionProperties) {
    if (sectionChangerTargetSecId === null) return;
    modelStore.updateSection(sectionChangerTargetSecId, {
      name,
      a: props.a,
      iz: props.iz,
      iy: props.iy,
      j: props.j,
      b: props.b,
      h: props.h,
      shape: props.shape as any,
      tw: props.tw,
      tf: props.tf,
      t: props.t,
    });
    resultsStore.clear();
    showSectionChanger = false;
    sectionChangerTargetSecId = null;
  }

  // Apply an amorphous section (no shape) to an EXISTING section -- via SectionChanger
  function handleSCAmorphousSelect(data: { name: string; a: number; iy: number; iz: number; j?: number }) {
    if (sectionChangerTargetSecId === null) return;
    modelStore.updateSection(sectionChangerTargetSecId, {
      name: data.name,
      a: data.a,
      iy: data.iy,
      iz: data.iz,
      j: data.j,
      shape: undefined,
      b: undefined,
      h: undefined,
      tw: undefined,
      tf: undefined,
      t: undefined,
      // No longer a catalogue profile either: leaving the family behind would
      // keep the pairing note warning about a section this one is not.
      profileFamily: undefined,
    });
    resultsStore.clear();
    showSectionChanger = false;
    sectionChangerTargetSecId = null;
  }
</script>

<!--
  One row per section: number, name, and the two things you do with it.

  It used to spread A, Iy, Iz, J and rotation across the row, which made a list
  of three sections a wall of numbers and pushed the button that CHANGES the
  section to the far right. The list answers "which sections are there"; the
  numbers answer "what is this one", and that is a different question asked
  about one section at a time.
-->
<table class="sec-list">
  <thead>
    <tr><th>ID</th><th>{t('table.name')}</th><th class="col-actions"></th></tr>
  </thead>
  <tbody>
    {#each sectionsArr as sec}
      {@const derived = sec.canonical?.kind === 'geometry-backed'}
      {@const props = solverProperties(sec)}
      {@const open = expandedId === sec.id}
      <tr class:expanded={open}>
        <td class="id-cell">{sec.id}</td>
        <td class="name-cell">
          <input type="text" value={sec.name} onchange={(e) => updateSectionField(sec.id, 'name', e.currentTarget.value)} />
        </td>
        <td class="action-cell">
          <button
            class="row-action-btn primary"
            title={t('table.changeSection')}
            onclick={() => { sectionChangerTargetSecId = sec.id; showSectionChanger = true; }}
          >&#9783;</button>
          <button
            class="row-action-btn"
            class:on={open}
            title={t('table.showProperties')}
            aria-expanded={open}
            onclick={() => expandedId = open ? null : sec.id}
          >&#9432;</button>
          <button class="del" onclick={() => deleteSection(sec.id)}>&#10005;</button>
        </td>
      </tr>
      {#if open}
        <!-- The detail, with the shape beside its numbers: a section is a
             SHAPE, and reading A and I without seeing it is reading half. -->
        <tr class="detail-row">
          <td colspan="3">
            <div class="sec-detail">
              {#if outlineOf(sec)}
                <div class="sec-thumb">
                  <svg viewBox="-90 -90 180 180" aria-hidden="true">
                    <path d={outlineOf(sec)} fill="var(--st-value)" fill-opacity="0.12"
                          stroke="var(--st-value)" stroke-width="3" fill-rule="evenodd" />
                  </svg>
                </div>
              {/if}
              <div class="sec-props">
                {#if derived}
                  <!-- Derived from the polygons, so the table, the drawing and
                       the analysis cannot quote three different areas. -->
                  <div class="prop"><span>A</span><span title={t('table.derivedFromGeometry')}>{fmtA(props.a)} cm²</span></div>
                  <div class="prop"><span>Iy</span><span title={t('table.derivedFromGeometry')}>{fmtI(props.iy ?? props.iz)} cm⁴</span></div>
                  <div class="prop"><span>Iz</span><span title={t('table.derivedFromGeometry')}>{fmtI(props.iz)} cm⁴</span></div>
                  {#if is3D}
                    <div class="prop"><span>J</span><span title={props.j == null ? t('table.torsionUnavailable') : t('table.derivedFromGeometry')}>{props.j == null ? '—' : fmtI(props.j) + ' cm⁴'}</span></div>
                  {/if}
                {:else}
                  <label class="prop"><span>A (cm²)</span><input type="number" step="0.01" value={sec.a * M2_TO_CM2} onchange={(e) => updateSectionField(sec.id, 'a', e.currentTarget.value)} /></label>
                  <label class="prop"><span>Iy (cm⁴)</span><input type="number" step="0.01" value={(sec.iy ?? sec.iz) * M4_TO_CM4} onchange={(e) => updateSectionField(sec.id, 'iy', e.currentTarget.value)} /></label>
                  <label class="prop"><span>Iz (cm⁴)</span><input type="number" step="0.01" value={sec.iz * M4_TO_CM4} onchange={(e) => updateSectionField(sec.id, 'iz', e.currentTarget.value)} /></label>
                  {#if is3D}
                    <label class="prop"><span>J (cm⁴)</span><input type="number" step="0.01" value={(sec.j ?? (sec.iy ?? sec.iz) * 0.001) * M4_TO_CM4} onchange={(e) => updateSectionField(sec.id, 'j', e.currentTarget.value)} /></label>
                  {/if}
                {/if}
                <label class="prop"><span>{t('table.rotation')}</span><input type="number" step="1" min="0" max="359" value={sec.rotation ?? 0} onchange={(e) => updateSectionField(sec.id, 'rotation', e.currentTarget.value)} /></label>
              </div>
            </div>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>
<div class="table-footer">
  <button class="add-btn" onclick={addSection}>{t('table.addSectionManual')}</button>
</div>
<SectionChanger
  open={showSectionChanger}
  onprofileselect={(p: SteelProfile, _s: { a: number; iy: number; iz: number; b: number; h: number }, region?: string | null) => handleSCProfileSelect(p, region)}
  onshapeselect={(name: string, props: SectionProperties) => handleSCShapeSelect(name, props)}
  onamorphousselect={(data) => handleSCAmorphousSelect(data)}
  onclose={() => { showSectionChanger = false; sectionChangerTargetSecId = null; }}
  is3D={uiStore.is3DWorkspace}
/>

<style>
  /* ── Collapsed list ────────────────────────────────────────── */
  .sec-list .col-actions { width: 1%; }
  .sec-list .name-cell input { width: 100%; }
  .sec-list .action-cell { display: flex; gap: 4px; justify-content: flex-end; }
  /* The button that CHANGES the section is the one people came for, so it
     reads as the primary action rather than as one of three equal glyphs. */
  .row-action-btn.primary {
    color: var(--st-value);
    border-color: var(--st-value);
  }
  .row-action-btn.on {
    background: var(--st-surface-3);
    color: var(--st-text);
  }
  tr.expanded > td { border-bottom-color: transparent; }

  .detail-row > td { padding: 0 0 8px; }
  .sec-detail {
    display: flex;
    gap: 12px;
    padding: 8px 10px;
    border-radius: var(--st-radius, 3px);
    background: var(--st-surface-2);
  }
  .sec-thumb {
    width: 92px;
    height: 92px;
    flex: none;
    border-radius: var(--st-radius, 3px);
    background: var(--st-surface-3);
    padding: 6px;
  }
  .sec-thumb svg { width: 100%; height: 100%; }
  .sec-props {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 3px 14px;
    align-content: start;
    flex: 1;
  }
  .prop {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.74rem;
    color: var(--st-text-2);
  }
  .prop > span:first-child { color: var(--st-text-3); }
  .prop > span:last-child { font-family: var(--st-mono, monospace); }
  .prop input { width: 86px; text-align: right; }

  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 0.25rem 0.35rem;
    color: var(--st-text-3);
    font-weight: 500;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--st-surface-3);
    position: sticky;
    top: 0;
    background: var(--st-surface-2);
    white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem;
    border-bottom: 1px solid var(--st-bg);
    color: var(--st-text-2);
    white-space: nowrap;
  }

  .id-cell {
    color: var(--st-value);
    font-weight: 600;
  }

  .rot-input {
    width: 38px !important;
    text-align: center;
  }

  td input[type="number"],
  td input[type="text"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  td input[type="text"] {
    width: 80px;
  }

  .action-cell {
    display: flex;
    gap: 0.2rem;
    align-items: center;
  }

  .name-with-action {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .name-with-action input {
    flex: 1;
    min-width: 0;
  }

  .row-action-btn {
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
    line-height: 1;
    transition: all 0.15s;
  }

  .row-action-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }

  .del {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
  }
  .del:hover {
    color: var(--st-accent);
  }

  tr:hover {
    background: rgba(127, 212, 204, 0.05);
  }

  .table-footer {
    padding: 0.5rem;
    border-top: 1px solid var(--st-bg);
  }

  .add-btn {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    color: var(--st-value);
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .add-btn:hover {
    background: var(--st-surface-3);
    color: white;
  }

  .ro-val {
    font-size: 0.7rem;
    color: var(--st-text-3);
    font-family: monospace;
    user-select: text;
  }
</style>
