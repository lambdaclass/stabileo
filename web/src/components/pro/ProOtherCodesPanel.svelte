<script lang="ts">
  /**
   * Member checks under a code other than CIRSOC, through the engine's own checkers.
   *
   * One code at a time, chosen here; one notice under the choice saying what that code covers in
   * this app, and nothing repeated across the interface. The rows carry the rest: a member the
   * code cannot describe is listed with why, and a reading the checker left incomplete says what
   * it left out and never reads as a pass.
   *
   * It reads the ACTIVE combinations, like CIRSOC design (`store/active-results.ts`), and a run
   * belongs to the results it was made from: when those change the table says so rather than
   * showing numbers for a model that has moved on.
   */
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { activeCombinations, activePerCombo3D } from '../../lib/store/active-results';
  import {
    OTHER_CODES, otherCode, memberContexts, runOtherCode,
    type OtherCodeId, type OtherCodeRun, type OtherCodeRow,
  } from '../../lib/engine/design/other-codes';

  const FAMILIES = ['steel', 'coldFormed', 'concrete'] as const;
  const CAP = 200;

  let codeId = $state<OtherCodeId>('aisc360');
  let run = $state<OtherCodeRun | null>(null);
  let runOf = $state<unknown>(null);
  let failed = $state(false);

  const code = $derived(otherCode(codeId)!);
  const solved = $derived(resultsStore.perCombo3D.size > 0);
  const stale = $derived(run !== null && runOf !== resultsStore.perCombo3D);

  function verify() {
    failed = false;
    try {
      const ctxs = memberContexts(modelStore.model as never, activePerCombo3D(), activeCombinations());
      run = runOtherCode(code, ctxs);
      runOf = resultsStore.perCombo3D;
    } catch {
      run = null;
      failed = true;
    }
  }

  function choose(id: OtherCodeId) {
    if (id === codeId) return;
    codeId = id;
    run = null;
  }

  type Checked = Extract<OtherCodeRow, { status: 'checked' }>;
  const checked = $derived((run?.rows.filter((r) => r.status === 'checked') ?? []) as Checked[]);
  const skipped = $derived(run?.rows.filter((r) => r.status === 'skipped') ?? []);
  const verdict = (r: Checked) => (r.reading.unevaluated.length > 0 ? 'incomplete' : r.reading.pass ? 'pass' : 'fail');
  const counts = $derived({
    checked: checked.length,
    pass: checked.filter((r) => verdict(r) === 'pass').length,
    fail: checked.filter((r) => verdict(r) === 'fail').length,
    incomplete: checked.filter((r) => verdict(r) === 'incomplete').length,
  });
  /** Worst first: a failing member is the one to read. */
  const sorted = $derived([...checked].sort((a, b) => b.reading.ratio - a.reading.ratio));
  const reasons = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of skipped) if (r.status === 'skipped') m.set(r.reasonKey, (m.get(r.reasonKey) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  /** Our keys are translated; a name the engine gave is shown as the engine wrote it. */
  const label = (k: string) => (k.startsWith('otherCodes.') ? t(k) : k);
  const ratioText = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '∞');

  function select(id: number) {
    uiStore.selectMode = 'elements';
    uiStore.setSelection(new Set(), new Set([id]), false);
  }
</script>

<div class="oc" data-testid="other-codes-panel">
  <section class="pk-card">
    <h4 class="pk-heading">{t('otherCodes.pick')}</h4>
    {#each FAMILIES as fam (fam)}
      <div class="oc-family">
        <span class="pk-label">{t(`otherCodes.family.${fam}`)}</span>
        <div class="oc-codes">
          {#each OTHER_CODES.filter((c) => c.family === fam) as c (c.id)}
            <button
              class="pk-btn oc-code"
              class:on={c.id === codeId}
              aria-pressed={c.id === codeId}
              data-testid="other-code-{c.id}"
              onclick={() => choose(c.id)}
            >{t(c.labelKey)}</button>
          {/each}
        </div>
      </div>
    {/each}
    <p class="oc-coverage" data-testid="other-codes-coverage">{t(code.coverageKey)}</p>
    <div class="pk-row">
      <button
        class="pk-btn pk-btn-primary"
        disabled={!solved}
        onclick={verify}
        data-testid="other-codes-run"
      >{t('otherCodes.run')}</button>
      {#if !solved}<span class="pk-hint">{t('otherCodes.blocked.noCombos')}</span>{/if}
    </div>
  </section>

  {#if failed}
    <p class="pk-warn" data-testid="other-codes-error">{t('otherCodes.error.engine')}</p>
  {:else if run}
    <section class="pk-card" data-testid="other-codes-results">
      {#if run.errorKey}
        <p class="pk-warn">{t(run.errorKey)}</p>
      {/if}
      {#if stale}
        <p class="pk-warn" data-testid="other-codes-stale">{t('otherCodes.stale')}</p>
      {/if}
      {#if checked.length === 0}
        <p class="pk-hint" data-testid="other-codes-none">{t('otherCodes.none')}</p>
      {:else}
        <p class="oc-summary" data-testid="other-codes-summary">
          {tp('otherCodes.summary', counts)}
        </p>
        <table class="oc-table">
          <thead>
            <tr>
              <th>{t('otherCodes.col.element')}</th>
              <th class="num">{t('otherCodes.col.ratio')}</th>
              <th>{t('otherCodes.col.status')}</th>
              <th>{t('otherCodes.col.governs')}</th>
              <th>{t('otherCodes.col.where')}</th>
            </tr>
          </thead>
          <tbody>
            {#each sorted.slice(0, CAP) as r (r.elementId)}
              {@const v = verdict(r)}
              <tr class="oc-row {v}" onclick={() => select(r.elementId)} data-testid="other-codes-row-{r.elementId}">
                <td class="num">{r.elementId}</td>
                <td class="num">{ratioText(r.reading.ratio)}</td>
                <td><span class="oc-state {v}">{v === 'pass' ? '✓' : v === 'fail' ? '✗' : '◐'} {t(`otherCodes.status.${v}`)}</span></td>
                <td>{t(r.reading.governing)}{r.reading.clause ? ` · ${r.reading.clause}` : ''}</td>
                <td>{r.comboName} · x = {r.stationX.toFixed(2)} m</td>
              </tr>
              {#if v === 'incomplete'}
                <tr class="oc-missing"><td></td><td colspan="4">{t('otherCodes.missing')} {r.reading.unevaluated.map(label).join(' · ')}</td></tr>
              {/if}
            {/each}
          </tbody>
        </table>
        {#if sorted.length > CAP}<p class="pk-hint">{tp('otherCodes.more', { n: sorted.length - CAP })}</p>{/if}
      {/if}
      {#if skipped.length > 0}
        <details class="oc-skipped" data-testid="other-codes-skipped">
          <summary>{tp('otherCodes.skippedTitle', { n: skipped.length })}</summary>
          <ul>
            {#each reasons as [key, n] (key)}
              <li>{t(key)}: {n}</li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>
  {/if}
</div>

<style>
  .oc { display: flex; flex-direction: column; gap: 8px; }
  .oc-family { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
  .oc-codes { display: flex; flex-wrap: wrap; gap: 4px; }
  .oc-code.on { border-color: var(--st-accent); color: var(--st-accent); }
  .oc-coverage {
    margin: 4px 0 8px; padding: 6px 8px; font-size: 0.64rem; line-height: 1.45;
    color: var(--st-text-2); background: var(--st-surface-2); border-radius: 4px;
  }
  .oc-summary { margin: 0 0 6px; font-size: 0.68rem; color: var(--st-text-2); }
  .oc-table { width: 100%; border-collapse: collapse; font-size: 0.62rem; }
  .oc-table th, .oc-table td { padding: 3px 4px; border-bottom: 1px solid var(--st-hair); text-align: left; }
  .oc-table .num { text-align: right; font-family: monospace; }
  .oc-row { cursor: pointer; }
  .oc-row:hover { background: var(--st-surface-2); }
  .oc-state.pass { color: var(--st-ok); }
  .oc-state.fail { color: var(--st-danger); }
  .oc-state.incomplete { color: var(--st-warn); }
  .oc-missing td { font-size: 0.6rem; color: var(--st-text-3); border-bottom: 1px solid var(--st-hair); }
  .oc-skipped { margin-top: 8px; font-size: 0.64rem; color: var(--st-text-2); }
  .oc-skipped ul { margin: 4px 0 0 16px; padding: 0; }
</style>
