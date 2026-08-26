<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import ProSectionModal from './section/ProSectionModal.svelte';
  import { defaultProfileSpec, type ProfileSpec } from '../../lib/section/profile-spec';
  import { toSectionFields, type SectionChoice } from '../../lib/section/section-choice';

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

<ProSectionModal
  open={modalOpen}
  spec={modalSpec}
  onApply={applyChoice}
  onClose={() => (modalOpen = false)}
/>

<style>
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
