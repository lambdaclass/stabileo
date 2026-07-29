<script lang="ts">
  /**
   * Batch reinforcement editor: preview → validate → apply, or cancel with no effect.
   *
   * Approved behaviour: OVERWRITE the selected fields on every compatible selected
   * member by default; "Protect manual overrides" is opt-in. Blocked members are
   * listed with a reason and excluded from the Apply count — never silently skipped.
   * The whole apply is ONE undo step.
   */
  import { t, tp } from '../../../lib/i18n';
  import { REBAR_DB } from '../../../lib/engine/codes/argentina/cirsoc201';
  import {
    planBatchEdit, utilLabel, BATCH_CONFIRM_THRESHOLD, BATCH_BULK_WARN_THRESHOLD,
    type BatchPatch, type BatchPlan,
  } from '../../../lib/engine/design/rebar-batch';
  import { getDesignCode } from '../../../lib/engine/design/code-adapter';
  import { verificationStore } from '../../../lib/store';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { getReinforcement, commitManualBatch } from '../../../lib/store/rebar-edit';
  import OutcomeBadge from './OutcomeBadge.svelte';

  interface Props {
    selection: number[];
    sourceLabel: string;
    onClose: () => void;
    onApplied: (n: number) => void;
  }
  let { selection, sourceLabel, onClose, onApplied }: Props = $props();

  const LONG_DIAS = REBAR_DB.filter(r => r.diameter >= 10).map(r => r.diameter);
  const STIRRUP_DIAS = REBAR_DB.filter(r => r.diameter <= 12).map(r => r.diameter);

  let protectOverrides = $state(false);
  let confirmText = $state('');
  let dialogEl = $state<HTMLDivElement | null>(null);

  // `undefined` on a field means "leave unchanged" per member.
  let bsCount = $state<number | undefined>(undefined);
  let bsDia = $state<number | undefined>(undefined);
  let tsCount = $state<number | undefined>(undefined);
  let tsDia = $state<number | undefined>(undefined);
  let teCount = $state<number | undefined>(undefined);
  let teDia = $state<number | undefined>(undefined);
  let supDia = $state<number | undefined>(undefined);
  let supLegs = $state<number | undefined>(undefined);
  let supSp = $state<number | undefined>(undefined);
  let spanDia = $state<number | undefined>(undefined);
  let spanLegs = $state<number | undefined>(undefined);
  let spanSp = $state<number | undefined>(undefined);
  let colCorner = $state<number | undefined>(undefined);
  let colFace = $state<number | undefined>(undefined);
  let colPerFace = $state<number | undefined>(undefined);
  let tieDia = $state<number | undefined>(undefined);
  let tieLegs = $state<number | undefined>(undefined);
  let tieSp = $state<number | undefined>(undefined);

  const patch = $derived.by((): BatchPatch => {
    const p: BatchPatch = {};
    if (bsCount !== undefined || bsDia !== undefined) p.bottomSpan = { count: bsCount, diameter: bsDia };
    if (tsCount !== undefined || tsDia !== undefined) p.topStart = { count: tsCount, diameter: tsDia };
    if (teCount !== undefined || teDia !== undefined) p.topEnd = { count: teCount, diameter: teDia };
    if (supDia !== undefined || supLegs !== undefined || supSp !== undefined)
      p.stirrupsSupport = { diameter: supDia, legs: supLegs, spacing: supSp };
    if (spanDia !== undefined || spanLegs !== undefined || spanSp !== undefined)
      p.stirrupsSpan = { diameter: spanDia, legs: spanLegs, spacing: spanSp };
    if (colCorner !== undefined || colFace !== undefined || colPerFace !== undefined)
      p.column = { cornerDia: colCorner, faceDia: colFace, perFace: colPerFace };
    if (tieDia !== undefined || tieLegs !== undefined || tieSp !== undefined)
      p.ties = { diameter: tieDia, legs: tieLegs, spacing: tieSp };
    return p;
  });

  const hasPatch = $derived(Object.keys(patch).length > 0);

  /** The project's concrete design code — the same source the Design commands use. */
  function concreteAdapter() {
    const id = regulationsStore.concreteDesignCode();
    return id ? getDesignCode(id) : undefined;
  }

  const plan = $derived.by((): BatchPlan | null => {
    void verificationStore.providedRevision;
    const adapter = concreteAdapter();
    if (!adapter || !hasPatch) return null;
    return planBatchEdit(
      adapter, selection, verificationStore.contexts, getReinforcement, patch,
      { protectManualOverrides: protectOverrides, manualOverrides: designRunStore.manualOverrides },
    );
  });

  const kinds = $derived.by(() => {
    let beams = 0, columns = 0;
    for (const id of selection) {
      const c = verificationStore.contextFor(id);
      if (c?.elementType === 'column') columns++;
      else if (c?.elementType === 'beam') beams++;
    }
    return { beams, columns };
  });

  const overriddenSelected = $derived(selection.filter(id => designRunStore.manualOverrides.has(id)).length);
  const needsConfirm = $derived((plan?.changeCount ?? 0) > BATCH_CONFIRM_THRESHOLD);
  const canApply = $derived(
    !!plan && plan.changeCount > 0
    && (!needsConfirm || confirmText.trim() === String(plan.changeCount)),
  );

  function apply() {
    if (!plan || !canApply) return;
    // Recompute over the FULL selection so members beyond the preview cap are
    // included: the cap limits display only, never the operation.
    const adapter = concreteAdapter();
    if (!adapter) return;
    const full = planBatchEdit(
      adapter, selection, verificationStore.contexts, getReinforcement, patch,
      { protectManualOverrides: protectOverrides, manualOverrides: designRunStore.manualOverrides,
        previewCap: Number.MAX_SAFE_INTEGER },
    );
    const entries: Array<[number, ReturnType<typeof getReinforcement>]> = [];
    for (const row of full.rows) {
      if (row.willChange && row.candidate) entries.push([row.elementId, row.candidate]);
    }
    if (entries.length === 0) { onClose(); return; }
    const written = commitManualBatch(entries);
    onApplied(written.size);
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }
  $effect(() => { dialogEl?.focus(); });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label={t('design.batch.title')}
     tabindex="-1" bind:this={dialogEl} onkeydown={onKeydown} data-testid="batch-dialog">
  <div class="head">
    <h2>{t('design.batch.title')}</h2>
    <button class="x" onclick={onClose} aria-label={t('design.batch.cancel')} data-testid="batch-close">×</button>
  </div>

  <div class="meta">
    <span data-testid="batch-selected-count">
      {tp('design.batch.selectedCount', { n: selection.length, beams: kinds.beams, columns: kinds.columns })}
    </span>
    {#if sourceLabel}<span class="muted">{t('design.batch.source')}: {sourceLabel}</span>{/if}
    {#if plan?.mixed}<span class="warn-inline">⚠ {t('design.batch.mixed')}</span>{/if}
  </div>

  <div class="fields">
    {#if kinds.beams > 0}
      <fieldset>
        <legend>{t('design.batch.fieldBottomSpan')}</legend>
        <label>{t('design.batch.count')}
          <input type="number" min="2" max="24" data-testid="batch-bs-count"
                 placeholder={t('design.batch.leaveUnchanged')}
                 value={bsCount ?? ''} oninput={(e) => bsCount = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
        <label>{t('design.batch.diameter')}
          <select data-testid="batch-bs-dia" value={bsDia ?? ''}
                  onchange={(e) => bsDia = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">{t('design.batch.leaveUnchanged')}</option>
            {#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select></label>
      </fieldset>
      <fieldset>
        <legend>{t('design.batch.fieldTopStart')}</legend>
        <label>{t('design.batch.count')}
          <input type="number" min="2" max="24" data-testid="batch-ts-count" value={tsCount ?? ''}
                 placeholder={t('design.batch.leaveUnchanged')}
                 oninput={(e) => tsCount = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
        <label>{t('design.batch.diameter')}
          <select data-testid="batch-ts-dia" value={tsDia ?? ''}
                  onchange={(e) => tsDia = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">{t('design.batch.leaveUnchanged')}</option>
            {#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select></label>
      </fieldset>
      <fieldset>
        <legend>{t('design.batch.fieldTopEnd')}</legend>
        <label>{t('design.batch.count')}
          <input type="number" min="2" max="24" data-testid="batch-te-count" value={teCount ?? ''}
                 placeholder={t('design.batch.leaveUnchanged')}
                 oninput={(e) => teCount = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
        <label>{t('design.batch.diameter')}
          <select data-testid="batch-te-dia" value={teDia ?? ''}
                  onchange={(e) => teDia = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">{t('design.batch.leaveUnchanged')}</option>
            {#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select></label>
      </fieldset>
      <fieldset>
        <legend>{t('design.batch.fieldStirrupsSupport')}</legend>
        <label>Ø<select data-testid="batch-sup-dia" value={supDia ?? ''}
                  onchange={(e) => supDia = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">—</option>{#each STIRRUP_DIAS as d (d)}<option value={d}>{d}</option>{/each}
          </select></label>
        <label>{t('design.batch.legs')}<input type="number" min="2" max="6" data-testid="batch-sup-legs"
               value={supLegs ?? ''} oninput={(e) => supLegs = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
        <label>{t('design.batch.spacing')}<input type="number" min="0.05" max="0.5" step="0.025"
               data-testid="batch-sup-spacing" value={supSp ?? ''}
               oninput={(e) => supSp = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
      </fieldset>
      <fieldset>
        <legend>{t('design.batch.fieldStirrupsSpan')}</legend>
        <label>Ø<select data-testid="batch-span-dia" value={spanDia ?? ''}
                  onchange={(e) => spanDia = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">—</option>{#each STIRRUP_DIAS as d (d)}<option value={d}>{d}</option>{/each}
          </select></label>
        <label>{t('design.batch.legs')}<input type="number" min="2" max="6" data-testid="batch-span-legs"
               value={spanLegs ?? ''} oninput={(e) => spanLegs = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
        <label>{t('design.batch.spacing')}<input type="number" min="0.05" max="0.5" step="0.025"
               data-testid="batch-span-spacing" value={spanSp ?? ''}
               oninput={(e) => spanSp = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
      </fieldset>
    {/if}

    {#if kinds.columns > 0}
      <fieldset>
        <legend>{t('design.batch.fieldColumnBars')}</legend>
        <label>corner Ø<select data-testid="batch-col-corner" value={colCorner ?? ''}
                  onchange={(e) => colCorner = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">—</option>{#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select></label>
        <label>face Ø<select data-testid="batch-col-face" value={colFace ?? ''}
                  onchange={(e) => colFace = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">—</option>{#each LONG_DIAS as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select></label>
        <label>{t('design.batch.perFace')}<input type="number" min="0" max="6" data-testid="batch-col-perface"
               value={colPerFace ?? ''} oninput={(e) => colPerFace = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
      </fieldset>
      <fieldset>
        <legend>{t('design.batch.fieldTies')}</legend>
        <label>Ø<select data-testid="batch-tie-dia" value={tieDia ?? ''}
                  onchange={(e) => tieDia = e.currentTarget.value === '' ? undefined : +e.currentTarget.value}>
            <option value="">—</option>{#each STIRRUP_DIAS as d (d)}<option value={d}>{d}</option>{/each}
          </select></label>
        <label>{t('design.batch.legs')}<input type="number" min="2" max="6" data-testid="batch-tie-legs"
               value={tieLegs ?? ''} oninput={(e) => tieLegs = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
        <label>{t('design.batch.spacing')}<input type="number" min="0.05" max="0.5" step="0.025"
               data-testid="batch-tie-spacing" value={tieSp ?? ''}
               oninput={(e) => tieSp = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} /></label>
      </fieldset>
    {/if}
  </div>

  {#if overriddenSelected > 0}
    <label class="protect" data-testid="protect-overrides-row">
      <input type="checkbox" data-testid="protect-overrides" bind:checked={protectOverrides} />
      <span>{t('design.batch.protectOverrides')}</span>
      <span class="muted">{tp('design.batch.protectNote', { n: overriddenSelected })}</span>
    </label>
  {/if}

  <div class="preview" data-testid="batch-preview">
    <div class="preview-head">
      <strong>{t('design.batch.preview')}</strong>
      {#if plan?.previewTruncated}
        <span class="muted" data-testid="batch-preview-truncated">
          {tp('design.batch.previewTruncated', { shown: plan.previewShown, total: plan.previewTotal })}
        </span>
      {/if}
    </div>
    {#if !hasPatch}
      <div class="muted pad">{t('design.batch.leaveUnchanged')}</div>
    {:else if plan}
      <div class="preview-list">
        {#each plan.rows as row (row.elementId)}
          <div class="prow" class:blocked={row.blocks.length > 0} class:nochange={!row.willChange && row.blocks.length === 0}
               data-testid={`batch-preview-row-${row.elementId}`}>
            <span class="pid mono">{row.elementId}</span>
            <span class="pkind">{row.kind}</span>
            {#if row.blocks.length > 0}
              <span class="pblock">✗ {row.blocks.map(b => tp(b.messageKey, b.params)).join(' · ')}</span>
            {:else if !row.willChange}
              <span class="muted">{t('design.batch.unchanged')}</span>
            {:else}
              <span class="pchanges">{row.changes.map(c => `${c.field}: ${c.before}→${c.after}`).join(' · ')}</span>
              <span class="putil mono">u {utilLabel(row.utilizationBefore)} → {utilLabel(row.utilizationAfter)}</span>
            {/if}
            {#if row.hasManualOverride}<OutcomeBadge flag="edited" />{/if}
          </div>
        {/each}
      </div>
      <div class="summary" data-testid="batch-summary">
        {tp('design.batch.summary', { change: plan.changeCount, unchanged: plan.unchangedCount, blocked: plan.blockedCount })}
        {#if plan.protectedCount > 0}· {plan.protectedCount} protected{/if}
      </div>
      {#if plan.changeCount > BATCH_BULK_WARN_THRESHOLD}
        <div class="bulk-warn" data-testid="batch-bulk-warning">⚠ {tp('design.batch.bulkWarning', { n: plan.changeCount })}</div>
      {/if}
    {/if}
  </div>

  <div class="actions">
    {#if needsConfirm}
      <label class="confirm">
        <span>{tp('design.batch.confirmType', { n: plan?.changeCount ?? 0 })}</span>
        <input type="text" data-testid="batch-confirm" bind:value={confirmText} />
      </label>
    {/if}
    <button class="btn" onclick={onClose} data-testid="batch-cancel">{t('design.batch.cancel')}</button>
    <button class="btn btn-primary" onclick={apply} disabled={!canApply} data-testid="batch-apply">
      {tp('design.batch.apply', { n: plan?.changeCount ?? 0 })}
    </button>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 900; }
  .dialog { position: fixed; z-index: 901; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(94vw, 900px); max-height: 88vh; overflow: auto;
    background: #0b1a2c; border: 1px solid #2a5a8a; border-radius: 6px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6); padding: 12px 14px;
    display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 0.92rem; color: #dde; }
  .x { background: none; border: none; color: #9ab; font-size: 1.2rem; cursor: pointer; line-height: 1; }
  .meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.72rem; color: #bcd; }
  .muted { color: #778; }
  .warn-inline { color: #ffcc9a; }
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 6px; }
  fieldset { border: 1px solid #16304f; border-radius: 4px; padding: 4px 7px 6px; margin: 0; }
  legend { font-size: 0.66rem; color: #8ab; padding: 0 4px; }
  label { display: flex; align-items: center; gap: 4px; font-size: 0.68rem; color: #9ab; margin: 2px 0; }
  input[type="number"], input[type="text"], select {
    flex: 1; min-width: 0; padding: 1px 4px; background: #0b1c30;
    border: 1px solid #1d3a5c; border-radius: 3px; color: #dde; font-size: 0.7rem; }
  input:focus-visible, select:focus-visible, button:focus-visible {
    outline: 2px solid #4ecdc4; outline-offset: 1px; }
  .protect { display: flex; gap: 6px; align-items: center; font-size: 0.7rem;
    padding: 4px 7px; background: rgba(255,204,102,0.08); border: 1px solid #6a5a20; border-radius: 4px; }
  .preview { border: 1px solid #16304f; border-radius: 4px; padding: 5px 7px; }
  .preview-head { display: flex; gap: 8px; align-items: baseline; font-size: 0.7rem; color: #8ab; }
  .preview-list { max-height: 240px; overflow: auto; margin-top: 3px; }
  .prow { display: flex; gap: 7px; align-items: center; flex-wrap: wrap;
    padding: 1px 0; font-size: 0.66rem; color: #ccd; border-bottom: 1px solid #10233c; }
  .prow.blocked { color: #ffbcbc; }
  .prow.nochange { color: #778; }
  .pid { min-width: 34px; } .pkind { min-width: 46px; color: #789; }
  .pblock { flex: 1; } .pchanges { flex: 1; } .putil { color: #8a9; }
  .mono { font-family: monospace; }
  .summary { margin-top: 4px; font-size: 0.7rem; color: #bcd; font-weight: 600; }
  .bulk-warn { margin-top: 3px; font-size: 0.68rem; color: #ffcc9a; }
  .pad { padding: 6px; font-size: 0.7rem; }
  .actions { display: flex; gap: 7px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
  .confirm { display: flex; gap: 5px; align-items: center; font-size: 0.68rem; }
  .confirm input { width: 70px; }
  .btn { padding: 4px 11px; background: #14304f; border: 1px solid #2a5a8a;
    border-radius: 4px; color: #dde; font-size: 0.74rem; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #1a4a7a; border-color: #2a6ab0; color: #fff; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  @media (max-width: 720px) {
    .dialog { width: 96vw; max-height: 92vh; padding: 9px; }
    .fields { grid-template-columns: 1fr; }
  }
</style>
