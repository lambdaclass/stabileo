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
  import ProDesignCompleteness from './design/ProDesignCompleteness.svelte';
  import { t, tp } from '../../lib/i18n';
  import { activeCombinations, activePerCombo3D } from '../../lib/store/active-results';
  import { directAnalysis } from '../../lib/store/direct-analysis.svelte';
  import ProDirectAnalysis from './ProDirectAnalysis.svelte';
  import {
    OTHER_CODES, otherCode, memberContexts, runOtherCode, certifyOtherCode,
    type OtherCodeId, type OtherCodeRun, type OtherCodeRow, type MemberCertificate,
  } from '../../lib/engine/design/other-codes';
  import type { MemberContext } from '../../lib/engine/design/other-codes/types';
  import { certificateStore } from '../../lib/store/certificate.svelte';
  import { runCertify, hasCertify } from '../../lib/engine/certify-jobs';
  import { formatEnclosure } from '../../lib/utils/certificate-format';
  import { untrack } from 'svelte';

  const FAMILIES = ['steel', 'coldFormed', 'concrete'] as const;
  const CAP = 200;

  let codeId = $state<OtherCodeId>('aisc360');
  let run = $state<OtherCodeRun | null>(null);
  let runOf = $state<unknown>(null);
  let failed = $state(false);
  /**
   * Where the forces come from. The direct analysis is AISC 360's own method (Chapter C), so it
   * is offered with that code only; with it every member is checked at K = 1.
   */
  let source = $state<'linear' | 'direct'>('linear');
  const direct = $derived(codeId === 'aisc360' && source === 'direct');
  let ranDirect = $state(false);
  /** Active combinations the last check had no forces for. */
  let missing = $state<number[]>([]);

  const code = $derived(otherCode(codeId)!);
  const solved = $derived(resultsStore.perCombo3D.size > 0);
  const stale = $derived(run !== null && (ranDirect ? runOf !== directAnalysis.result || !directAnalysis.fresh : runOf !== resultsStore.perCombo3D));

  function verify() {
    failed = false;
    try {
      const forces = direct ? directAnalysis.forces() : activePerCombo3D();
      if (!forces) { run = null; failed = true; return; }
      // Direct forces are available only when every active combination is fit for design. Linear
      // ones only for the combinations that solved: an unstable one publishes none, and is named.
      const active = activeCombinations();
      const combos = direct ? active : active.filter((c) => forces.has(c.id));
      missing = direct ? [] : active.filter((c) => !forces.has(c.id)).map((c) => c.id);
      const ctxs = memberContexts(modelStore.model as never, forces, combos, undefined, { unitK: direct });
      run = runOtherCode(code, ctxs);
      runContexts = ctxs;
      runOf = direct ? directAnalysis.result : resultsStore.perCombo3D;
      ranDirect = direct;
    } catch {
      run = null;
      failed = true;
    }
  }

  /*
   * ── Certified utilizations (docs/verification/CERTIFY.md, "Certified design checks") ──
   *
   * Once the check is shown and the combinations it read are certified (`certificate.svelte.ts`),
   * the same members and demands go to the code's certified checker, each force with its certified
   * bound, in the background: the enclosure of each member's utilization, and whether it is
   * certified to pass or to fail. Only the linear forces the results on screen hold; the direct
   * analysis is not certified.
   */
  let runContexts: MemberContext[] = [];
  let certRows = $state<Map<number, MemberCertificate> | null>(null);
  let certPending = $state(false);
  let certGeneration = 0;
  $effect(() => {
    const r = run, live = !stale && !ranDirect, m = certificateStore.multiState, c = code;
    untrack(() => {
      const gen = ++certGeneration;
      certRows = null;
      certPending = false;
      if (!r || !live || m.status === 'idle' || !c.certify || !hasCertify(c.certify.name)) return;
      certPending = true;
      if (m.status === 'pending') return; // the combinations are being certified; this effect runs again
      const ctxs = runContexts;
      setTimeout(async () => {
        if (gen !== certGeneration) return;
        let rows: Map<number, MemberCertificate>;
        try {
          rows = await certifyOtherCode(c, ctxs, (comboId, id) => certificateStore.comboStationBound3D(comboId, id), runCertify);
        } catch {
          rows = new Map();
        }
        if (gen !== certGeneration) return;
        certRows = rows;
        certPending = false;
      }, 250);
    });
  });

  const certCounts = $derived.by(() => {
    const n = { ok: 0, fail: 0, open: 0 };
    for (const c of certRows?.values() ?? []) {
      if (c.status === 'ok') n.ok++; else if (c.status === 'fail') n.fail++; else n.open++;
    }
    return n;
  });
  function certReason(c: Extract<MemberCertificate, { status: 'uncertified' }>): string {
    return c.reason.startsWith('otherCodes.') ? t(c.reason).replace('{combo}', c.combo ?? '') : c.reason;
  }
  function certText(c: MemberCertificate | undefined): string {
    if (!c) return '—';
    if (c.status === 'uncertified') return t('otherCodes.cert.not');
    return `${formatEnclosure(c.lower, c.upper, 4)} ${t(`otherCodes.cert.${c.status}`)}`;
  }
  function certTitle(c: MemberCertificate | undefined): string {
    if (!c) return t('otherCodes.cert.tooltip');
    if (c.status === 'uncertified') return `${t('otherCodes.cert.not')}: ${certReason(c)}`;
    return t('otherCodes.cert.tooltip');
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
    {#if codeId === 'aisc360'}
      <div class="pk-row oc-source" role="radiogroup" aria-label={t('direct.source')}>
        <span class="pk-label">{t('direct.source')}</span>
        <button class="pk-btn" class:on={source === 'linear'} role="radio" aria-checked={source === 'linear'} onclick={() => (source = 'linear')} data-testid="other-codes-source-linear">{t('direct.source.linear')}</button>
        <button class="pk-btn" class:on={source === 'direct'} role="radio" aria-checked={source === 'direct'} onclick={() => (source = 'direct')} data-testid="other-codes-source-direct">{t('direct.source.direct')}</button>
      </div>
      {#if source === 'direct'}<ProDirectAnalysis />{/if}
    {/if}
    <div class="pk-row">
      <button
        class="pk-btn pk-btn-primary"
        disabled={direct ? !directAnalysis.designReady : !solved}
        onclick={verify}
        data-testid="other-codes-run"
      >{t('otherCodes.run')}</button>
      {#if direct && !directAnalysis.fresh}<span class="pk-hint">{t('direct.blocked')}</span>
      {:else if direct && !directAnalysis.designReady}<span class="pk-warn" data-testid="direct-design-blocked">{t('direct.blockedIncomplete')}</span>
      {:else if !direct && !solved}<span class="pk-hint">{t('otherCodes.blocked.noCombos')}</span>{/if}
    </div>
  </section>

  {#if failed}
    <p class="pk-warn" data-testid="other-codes-error">{t('otherCodes.error.engine')}</p>
  {:else if run}
    <section class="pk-card" data-testid="other-codes-results">
      <ProDesignCompleteness {missing} />
      {#if run.errorKey}
        <p class="pk-warn">{t(run.errorKey)}</p>
      {/if}
      {#if stale}
        <p class="pk-warn" data-testid="other-codes-stale">{t('otherCodes.stale')}</p>
      {/if}
      {#if ranDirect}<p class="pk-hint" data-testid="other-codes-direct-note">{t('direct.designNote')}</p>{/if}
      {#if checked.length === 0}
        <p class="pk-hint" data-testid="other-codes-none">{t('otherCodes.none')}</p>
      {:else}
        <p class="oc-summary" data-testid="other-codes-summary">
          {tp('otherCodes.summary', counts)}
        </p>
        {#if certPending}
          <p class="oc-cert pending" data-testid="other-codes-certificate">{t('certificate.pending')}</p>
        {:else if certRows && certRows.size > 0}
          <p class="oc-cert" class:ok={certCounts.open === 0} title={t('otherCodes.cert.tooltip')} data-testid="other-codes-certificate">
            {t('otherCodes.cert.summary').replace('{ok}', String(certCounts.ok)).replace('{fail}', String(certCounts.fail)).replace('{open}', String(certCounts.open))}
          </p>
        {/if}
        <table class="oc-table">
          <thead>
            <tr>
              <th>{t('otherCodes.col.element')}</th>
              <th class="num">{t('otherCodes.col.ratio')}</th>
              <th>{t('otherCodes.col.status')}</th>
              <th>{t('otherCodes.col.governs')}</th>
              <th>{t('otherCodes.col.where')}</th>
              {#if certRows}<th>{t('otherCodes.col.certified')}</th>{/if}
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
                {#if certRows}
                  {@const cr = certRows.get(r.elementId)}
                  <td class="oc-cert-cell {cr?.status ?? 'none'}" title={certTitle(cr)} data-testid="other-codes-cert-{r.elementId}">{certText(cr)}</td>
                {/if}
              </tr>
              {#if v === 'incomplete'}
                <tr class="oc-missing"><td></td><td colspan={certRows ? 5 : 4}>{t('otherCodes.missing')} {r.reading.unevaluated.map(label).join(' · ')}</td></tr>
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
  .oc-cert { margin: 0 0 6px; padding: 2px 6px; border: 1px solid var(--st-warn); border-radius: 4px; font-size: 0.64rem; color: var(--st-text-2); cursor: help; }
  .oc-cert.ok { border-color: var(--st-ok); }
  .oc-cert.pending { border-color: var(--st-hair); opacity: 0.7; cursor: default; }
  .oc-cert-cell { font-family: monospace; white-space: nowrap; cursor: help; }
  .oc-cert-cell.ok { color: var(--st-ok); }
  .oc-cert-cell.fail { color: var(--st-danger); }
  .oc-cert-cell.inconclusive, .oc-cert-cell.uncertified { color: var(--st-warn); }
  .oc-skipped ul { margin: 4px 0 0 16px; padding: 0; }
</style>
