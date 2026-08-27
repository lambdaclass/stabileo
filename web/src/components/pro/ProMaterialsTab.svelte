<script lang="ts">
  /**
   * The PRO materials tab: the list of materials, and one way to add to it.
   *
   * ── Why there is only one ──────────────────────────────────────────
   *
   * This tab used to carry a whole second material picker inline — six category tabs, a search
   * box, a strip of preset buttons that added a material on click, and a `<details>` form for a
   * hand-entered one — beside the button that opens `ProMaterialModal`. THREE controls on one
   * panel that all added a material, which is the finding that was closed for sections and left
   * open here.
   *
   * The two catalogue paths were not the old defect: both went through `toMaterialFields`, so
   * `gradeId`, `standard`, `region` and `fu` travelled by either. What the inline strip did not
   * have was the origin filter, the data sheet with the per-field authority, the thickness bands
   * with the standard that publishes them, the deep grade panel, and the dialog's keyboard. A
   * user who took the short route saw a poorer catalogue and had no way to know a richer one
   * existed — and the short route was the one nearer to hand.
   *
   * The custom form WAS exclusive, so it moved into the dialog as its second division
   * (`CustomMaterialPanel`) before any of this was deleted. Removing the only surface that
   * offers a capability is a different decision from relocating it, and only one of the two was
   * asked for.
   *
   * What stays here is what this tab is for: the materials already in the model, and the two
   * per-material project settings — maximum aggregate size and bar-spacing margin — which edit
   * a material rather than create one.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { regulationsStore } from '../../lib/store/regulations.svelte';
  import { DAGG_MAX_MM, DAGG_MIN_MM } from '../../lib/codes/project-code-settings';
  import ProMaterialModal from './material/ProMaterialModal.svelte';
  import { toMaterialFields, type MaterialChoice } from '../../lib/material/material-choice';

  let aggError = $state<string | null>(null);
  let marginError = $state<string | null>(null);
  /** A margin larger than this is a data-entry error, not a conservative project. */
  const MARGIN_MAX_MM = 50;

  /** The PRO material modal: the shipped catalogue, plus the axes Basic's picker cannot show. */
  let modalOpen = $state(false);

  /**
   * The one place this tab writes a material.
   *
   * The conversion lives in `material-choice.ts` because more than one surface writes materials,
   * and a field dropped in one of them stays invisible until something downstream misclassifies
   * a member. `materialFamilyOf` prefers a declared grade and otherwise falls back to `fy > 80`,
   * so a dropped `gradeId` is not cosmetic: aluminium 5052-H32, at fy = 195, came back
   * classified as **steel** and joined the metallic inventory. Measured in
   * `material/__tests__/material-choice.test.ts`.
   */
  function applyChoice(choice: MaterialChoice) {
    modelStore.addMaterial(toMaterialFields(choice) as never);
  }

  const materials = $derived([...modelStore.materials.values()]);

  /**
   * Set (or clear) the maximum nominal coarse-aggregate size.
   *
   * Changing it does NOT invalidate the analysis or the member design: it changes whether
   * the bars fit, not what the section can carry. The revision graph records that as a
   * `detailingSpec` change, so the solve and the verification survive.
   */
  function setAggregate(id: number, raw: string) {
    aggError = null;
    const trimmed = raw.trim();
    if (trimmed === '') {
      modelStore.updateMaterial(id, { maxAggregateSizeMm: null });
      regulationsStore.noteChange('detailingSpec');
      return;
    }
    const v = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(v) || v < DAGG_MIN_MM || v > DAGG_MAX_MM) {
      aggError = tp('materials.aggregateInvalid', { min: DAGG_MIN_MM, max: DAGG_MAX_MM });
      return;
    }
    modelStore.updateMaterial(id, { maxAggregateSizeMm: v });
    regulationsStore.noteChange('detailingSpec');
  }

  /**
   * Additional bar-spacing margin. A PROJECT decision, above the regulatory minimum.
   *
   * Blank and zero both mean no margin. Negative is refused outright: this setting exists
   * to make detailing more conservative and can never be used to erode the code minimum.
   * Changing it invalidates coordination, constructibility and documents — but NOT the
   * loads or the structural analysis, which is why it notes `detailingSpec` and nothing
   * further.
   */
  function setSpacingMargin(id: number, raw: string) {
    marginError = null;
    const trimmed = raw.trim();
    if (trimmed === '') {
      modelStore.updateMaterial(id, { spacingMarginMm: null });
      regulationsStore.noteChange('detailingSpec');
      return;
    }
    const v = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > MARGIN_MAX_MM) {
      marginError = tp('materials.spacingMarginInvalid', { max: MARGIN_MAX_MM });
      return;
    }
    modelStore.updateMaterial(id, { spacingMarginMm: v });
    regulationsStore.noteChange('detailingSpec');
  }

  function removeMat(id: number) {
    const ok = modelStore.removeMaterial(id);
    if (!ok) uiStore.toast(t('table.cannotDeleteMaterial'), 'error');
  }
</script>

<div class="pro-mat">
  <!--
    One control, and no disclosure around it.

    It was a collapsed `<details>` because it hid a picker the height of the panel. With the
    picker gone, a disclosure would be a click that reveals a button — so the button is the
    panel. The test id stays on the region so the surface keeps its name, exactly as the
    sections tab did.
  -->
  <div class="add-panel" data-testid="pro-add-material-panel">
    <button
      type="button" class="open-modal" data-testid="pro-open-material-modal"
      onclick={() => (modalOpen = true)}
    >{t('pro.addMaterialPanel')}</button>
  </div>

  <!-- Materials table -->
  <div class="mat-list">
    <div class="mat-list-header">
      <span class="mat-count">{t('pro.nMaterials').replace('{n}', String(materials.length))}</span>
    </div>
    <div class="mat-table-wrap">
      <table class="mat-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>{t('pro.thName')}</th>
            <th>E (MPa)</th>
            <th>{t('field.poisson')}</th>
            <th>{t('field.density')}</th>
            <th>fy</th>
            <th title={t('materials.aggregateHelp')}>{t('materials.aggregateShort')}</th>
            <th title={t('material.spacingMarginHelp')}>{t('material.spacingMarginShort')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each materials as m}
            <tr>
              <td class="col-id">{m.id}</td>
              <td class="col-name">{m.name}</td>
              <td class="col-num">{m.e.toLocaleString()}</td>
              <td class="col-num">{m.nu}</td>
              <td class="col-num">{m.rho}</td>
              <td class="col-num">{m.fy ?? '—'}</td>
              <td class="col-num">
                <!-- Maximum nominal coarse-aggregate size: a MIX property, so it lives on
                     the material. Blank means "not stated", which the design surface then
                     reports as an explicit assumption rather than a silent default. -->
                <input
                  class="agg-input" type="text" inputmode="decimal"
                  data-testid={`mat-aggregate-${m.id}`}
                  aria-label={t('materials.aggregate')}
                  value={m.maxAggregateSizeMm ?? ''}
                  placeholder={t('materials.aggregateNotStated')}
                  onchange={(e) => setAggregate(m.id, e.currentTarget.value)}
                />
              </td>
              <td class="col-num">
                <!-- Additional bar-spacing margin above the regulatory minimum. A project
                     decision: CIRSOC does not prescribe it, and the default is 0 mm. -->
                <input
                  class="agg-input" type="text" inputmode="decimal"
                  data-testid={`mat-spacing-margin-${m.id}`}
                  aria-label={t('material.spacingMargin')}
                  title={t('material.spacingMarginHelp')}
                  value={m.spacingMarginMm ?? ''}
                  placeholder="0"
                  onchange={(e) => setSpacingMargin(m.id, e.currentTarget.value)}
                />
              </td>
              <td><button class="del-btn" onclick={() => removeMat(m.id)}>×</button></td>
            </tr>
          {/each}
          {#if materials.length === 0}
            <tr><td colspan="9" class="no-results">{t('pro.noMaterials')}</td></tr>
          {/if}
        </tbody>
      </table>
      {#if marginError}
        <p class="agg-error" data-testid="margin-error">{marginError}</p>
      {/if}
      {#if aggError}
        <p class="agg-error" role="alert" data-testid="mat-aggregate-error">{aggError}</p>
      {/if}
      <p class="agg-note">{t('materials.aggregateNote')}</p>
    </div>
  </div>
</div>

<!--
  `allowCustom`, because this tab is now the only surface that can state a material the
  catalogue does not carry. The generators leave it off: they keep `choiceGradeId(choice)`, and
  a custom material has no grade id to keep.
-->
<ProMaterialModal
  open={modalOpen}
  allowCustom
  onApply={applyChoice}
  onClose={() => (modalOpen = false)}
/>

<style>
  .agg-input { width: 4.5rem; padding: 0.1rem 0.25rem; text-align: right; }
  .agg-error { margin: 0.35rem 0 0; padding: 0.3rem 0.5rem; border-radius: 4px; background: var(--st-accent); color: var(--st-text); font-size: 0.8rem; }
  .agg-note { margin: 0.35rem 0 0; font-size: 0.76rem; opacity: 0.75; line-height: 1.35; }
  .pro-mat {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ─── Add panel ─── */
  .add-panel {
    flex-shrink: 0;
    padding: 8px 10px;
    border-bottom: 2px solid var(--st-surface-3);
  }
  /* The trigger. Same shape as the sections tab's, because it is the same decision. */
  .open-modal {
    padding: 5px 12px; font-size: 0.74rem; cursor: pointer;
    background: var(--st-interactive); color: var(--st-bg);
    border: 1px solid var(--st-interactive); border-radius: 4px;
  }
  .open-modal:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  /* ─── Add panel ─── */
  /* The `.no-results` rule stays: the materials TABLE uses it for its empty row. */
  .no-results {
    text-align: center;
    color: var(--st-text-3);
    font-size: 0.75rem;
    padding: 1rem;
  }

  /* ─── Materials Table ─── */
  .mat-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .mat-list-header {
    padding: 5px 10px;
    flex-shrink: 0;
  }
  .mat-count {
    font-size: 0.78rem;
    color: var(--st-value);
    font-weight: 600;
  }
  .mat-table-wrap {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .mat-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }
  .mat-table thead { position: sticky; top: 0; z-index: 1; }
  .mat-table th {
    padding: 4px 5px;
    text-align: left;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--st-text-3);
    text-transform: uppercase;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
  }
  .mat-table td {
    padding: 3px 5px;
    border-bottom: 1px solid var(--st-surface-2);
    color: var(--st-text-2);
  }
  .col-id { width: 28px; color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-name { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.68rem; }
  .del-btn {
    background: none; border:  none; color: var(--st-hair-strong); font-size: 0.9rem; cursor: pointer; padding: 0;
  }
  .del-btn:hover { color: var(--st-danger); }
</style>
