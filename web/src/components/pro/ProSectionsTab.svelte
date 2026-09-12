<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import ProSectionModal from './section/ProSectionModal.svelte';
  import { defaultProfileSpec, type ProfileSpec } from '../../lib/section/profile-spec';
  import { toSectionFields, type SectionChoice } from '../../lib/section/section-choice';
  import { resolveDrawingGeometry as drawingGeometry } from '../../lib/section/drawing';
  import { solverProperties } from '../../lib/section/state';

  /** Which section's detail is open. One at a time: it is a lot of numbers. */
  let expandedId = $state<number | null>(null);

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

  const M2_TO_CM2 = 1e4;
  const M4_TO_CM4 = 1e8;
  const M3_TO_CM3 = 1e6;
  const fmt = (v: number, d = 2) =>
    Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: d }) : '—';

  /**
   * Everything PRO knows about a section, in the order it is read.
   *
   * The area and the second moments first, because those are what the
   * analysis uses. Then the SECTION MODULI and the RADII OF GYRATION, which
   * are what a steel check is actually written in — `Mn = Fy·Z`, `λ = L/r` —
   * and which appeared nowhere in this application before. They are derived
   * here rather than stored, from the properties the solver already has, so
   * they cannot disagree with it.
   */
  function detailOf(sec: {
    a: number; iz: number; iy?: number; j?: number;
    canonical?: { kind: string; geometry?: unknown };
  }): Array<{ label: string; value: string; note?: string }> {
    const p = solverProperties(sec as never);
    const a = p.a ?? sec.a;
    const iz = p.iz ?? sec.iz;
    const iy = p.iy ?? sec.iy ?? iz;
    const j = p.j ?? sec.j;
    const derivedNote = sec.canonical?.kind === 'geometry-backed'
      ? t('table.derivedFromGeometry') : undefined;

    const rows: Array<{ label: string; value: string; note?: string }> = [
      { label: 'A', value: `${fmt(a * M2_TO_CM2)} cm²`, note: derivedNote },
      { label: 'Iy', value: `${fmt(iy * M4_TO_CM4)} cm⁴`, note: derivedNote },
      { label: 'Iz', value: `${fmt(iz * M4_TO_CM4)} cm⁴`, note: derivedNote },
      {
        label: 'J',
        value: j == null ? '—' : `${fmt(j * M4_TO_CM4)} cm⁴`,
        note: j == null ? t('table.torsionUnavailable') : derivedNote,
      },
    ];

    /*
     * The moduli and radii need a half-depth to divide by, and that only
     * exists for a section whose geometry is known. Rather than invent one
     * from the area, they are omitted — an elastic modulus quoted from a
     * guessed depth is worse than no modulus.
     */
    const g = sec.canonical?.kind === 'geometry-backed'
      ? drawingGeometry(sec as never) : null;
    if (g?.ok) {
      const [yMin, zMin, yMax, zMax] = g.geometry.bbox;
      const cy = Math.max(Math.abs(yMax), Math.abs(yMin));
      const cz = Math.max(Math.abs(zMax), Math.abs(zMin));
      if (cz > 1e-9) rows.push({ label: 'Wy', value: `${fmt((iy / cz) * M3_TO_CM3)} cm³` });
      if (cy > 1e-9) rows.push({ label: 'Wz', value: `${fmt((iz / cy) * M3_TO_CM3)} cm³` });
      rows.push({ label: 'h', value: `${fmt((zMax - zMin) * 100)} cm` });
      rows.push({ label: 'b', value: `${fmt((yMax - yMin) * 100)} cm` });
    }
    if (a > 1e-12) {
      rows.push({ label: 'iy', value: `${fmt(Math.sqrt(iy / a) * 100)} cm` });
      rows.push({ label: 'iz', value: `${fmt(Math.sqrt(iz / a) * 100)} cm` });
    }
    return rows;
  }

  /**
   * The PRO sections tab: the list of sections, and one way to add to it.
   *
   * ── Why there is only one ──────────────────────────────────────────
   *
   * This tab used to carry a whole second section picker inline — the old Basic strip, fifteen
   * family buttons, a search box and a table whose rows added a section on click — beside the
   * button that opens `ProSectionModal`. Two surfaces for the same catalogue, and they did not
   * agree:
   *
   *   · the inline rows called `modelStore.addSection` directly, so a section added there had
   *     no arrangement, no gap and no rotation. The `ProfileSpec` vocabulary that makes a
   *     back-to-back angle chosen here and one chosen inside a generator the SAME object simply
   *     did not exist on that path;
   *   · the rows were `<tr onclick>`, which no keyboard reaches at all;
   *   · they offered no standards body, no design code and no depth filter, so the catalogue
   *     looked smaller here than it is; and
   *   · the data sheet — the provenance of every number, and the fields the catalogue refuses
   *     to derive — was only on the modal.
   *
   * The inline builder was the same story against the modal's `build` division: both read
   * `SECTION_SHAPES`, both wrote a `built` record, and only one of them was tested.
   *
   * So this is a deletion, not a replacement. Everything the strip could do the modal already
   * did, and the modal does more. What the modal was MISSING first — the wall thicknesses a
   * built section's outline is made of — was fixed and pinned before any of this was removed;
   * see `section-choice.ts` and `built-section-contract.test.ts`.
   */
  let modalOpen = $state(false);
  let modalSpec = $state<ProfileSpec>(defaultProfileSpec('IPE 200'));

  function applyChoice(choice: SectionChoice) {
    /*
     * `0` is the auto-rotation fallback, and it is passed explicitly.
     *
     * A spec may say `'auto'`, meaning "defer to the member's own roll". A section created in
     * this tab belongs to no member yet, so there is nothing to defer to — and
     * `resolveRotationDeg` requires the caller to say so rather than defaulting, precisely so
     * that a caller which DOES have a member cannot forget to pass it.
     */
    const fields = toSectionFields(choice, 0);
    // Null when the catalogue does not know the name. Nothing is added rather than a section
    // with no area, which the canonical resolver would report as having no known geometry.
    if (!fields) return;
    modelStore.addSection(fields as never);
  }

  // ─── Sections list ──────────────────────
  const sections = $derived([...modelStore.sections.values()]);

  function removeSec(id: number) {
    const ok = modelStore.removeSection(id);
    if (!ok) uiStore.toast(t('table.cannotDeleteSection'), 'error');
  }

  function fmtNum(n: number): string {
    if (n === 0) return '0';
    if (Math.abs(n) < 0.001) return n.toExponential(2);
    return n.toPrecision(4);
  }
</script>

<div class="pro-sec">
  <!--
    One control, and no disclosure around it.

    It was a collapsed `<details>` because it hid a picker the height of the panel. With the
    picker gone, a disclosure would be a click that reveals a button — so the button is the
    panel. The test id stays on the region so the surface keeps its name.
  -->
  <div class="add-panel" data-testid="pro-add-section-panel">
    <button
      type="button" class="open-modal" data-testid="pro-open-section-modal"
      onclick={() => { modalSpec = defaultProfileSpec('IPE 200'); modalOpen = true; }}
    >{t('pro.addSectionPanel')}</button>
  </div>

  <!-- Sections table -->
  <div class="sec-list">
    <div class="sec-list-header">
      <span class="sec-count">{t('pro.nSections').replace('{n}', String(sections.length))}</span>
    </div>
    <div class="sec-table-wrap">
      <!--
        ── The same shape as Basic's list ───────────────────────────
        This was a wide table of raw numbers — A, Iz, Iy, J across every row —
        with a delete button and nothing else. Six columns of scientific
        notation is not how anybody recognises a section; the NAME is, and
        the numbers are what you go and look at when you doubt one.

        So: name, and two actions. `⛉` opens PRO's own dialog, which is the
        one thing that must NOT become Basic's — it builds composite and
        parametric sections Basic cannot express. `ⓘ` opens the detail, and
        in PRO that detail carries more than Basic's: the moduli and radii a
        steel check is read against, which were nowhere at all before.
      -->
      <table class="sec-table">
        <thead>
          <tr><th>ID</th><th>{t('pro.thName')}</th><th class="col-actions"></th></tr>
        </thead>
        <tbody>
          {#each sections as s (s.id)}
            {@const open = expandedId === s.id}
            <tr class:expanded={open}>
              <td class="col-id">{s.id}</td>
              <td class="col-name">{s.name}</td>
              <td class="col-actions">
                <button
                  class="row-act"
                  title={t('table.showProperties')}
                  aria-expanded={open}
                  onclick={() => (expandedId = open ? null : s.id)}
                  data-testid="pro-sec-info-{s.id}"
                >&#9432;</button>
                <button class="del-btn" onclick={() => removeSec(s.id)}>×</button>
              </td>
            </tr>
            {#if open}
              <tr class="detail-row">
                <td colspan="3">
                  <div class="sec-detail" data-testid="pro-sec-detail-{s.id}">
                    {#if outlineOf(s)}
                      <!-- A section is a SHAPE. Reading A and I without
                           seeing it is reading half of it. -->
                      <div class="sec-thumb">
                        <svg viewBox="-90 -90 180 180" aria-hidden="true">
                          <path d={outlineOf(s)} fill="var(--st-value)" fill-opacity="0.12"
                                stroke="var(--st-value)" stroke-width="3" fill-rule="evenodd" />
                        </svg>
                      </div>
                    {/if}
                    <div class="sec-props">
                      {#each detailOf(s) as row (row.label)}
                        <div class="prop">
                          <span>{row.label}</span>
                          <span title={row.note ?? ''}>{row.value}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
          {#if sections.length === 0}
            <tr><td colspan="3" class="no-results">{t('pro.noSections')}</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<ProSectionModal
  open={modalOpen}
  spec={modalSpec}
  onApply={applyChoice}
  onClose={() => (modalOpen = false)}
/>

<style>
  /* ── The detail, in Basic's visual language ────────────────────── */
  .col-actions { text-align: right; white-space: nowrap; }

  .row-act {
    width: 20px;
    height: 20px;
    padding: 0;
    margin-right: 2px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
  }

  .row-act:hover { color: var(--st-accent); border-color: var(--st-hair-strong); }
  tr.expanded .row-act { color: var(--st-accent); }

  .detail-row > td { padding: 0; background: var(--st-surface-2); }

  .sec-detail {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.5rem 0.6rem;
  }

  .sec-thumb { flex: none; width: 84px; height: 84px; }
  .sec-thumb svg { width: 100%; height: 100%; }

  .sec-props {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: 0.15rem 0.6rem;
    flex: 1;
    min-width: 0;
  }

  .prop {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    font-size: 0.68rem;
  }

  .prop > span:first-child { color: var(--st-text-3); }
  .prop > span:last-child { color: var(--st-text); font-variant-numeric: tabular-nums; }

  .pro-sec {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ─── Add panel: the one way in ─── */
  .add-panel {
    flex-shrink: 0;
    padding: 8px 12px;
    border-bottom: 2px solid var(--st-surface-3);
  }
  .open-modal {
    padding: 5px 12px; font-size: 0.74rem; cursor: pointer;
    background: var(--st-interactive); color: var(--st-bg);
    border: 1px solid var(--st-interactive); border-radius: 4px;
  }
  .open-modal:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  /* ─── Sections list ─── */
  .sec-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sec-list-header {
    padding: 5px 10px;
    flex-shrink: 0;
  }
  .sec-count {
    font-size: 0.78rem;
    color: var(--st-value);
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
    color: var(--st-text-3);
    text-transform: uppercase;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
  }
  .sec-table td {
    padding: 3px 6px;
    border-bottom: 1px solid var(--st-surface-2);
    color: var(--st-text-2);
  }
  .no-results { text-align: center !important; color: var(--st-text-3) !important; padding: 1.5rem 0 !important; font-size: 0.75rem; }
  .col-id { width: 28px; color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.68rem; }
  .del-btn {
    background: none; border:  none; color: var(--st-hair-strong); font-size: 0.9rem; cursor: pointer; padding: 0;
  }
  .del-btn:hover { color: var(--st-danger); }
</style>
