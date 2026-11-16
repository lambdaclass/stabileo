<script lang="ts">
  import { frameSelection } from '../../lib/pro/design-navigation';
  import { modelStore, resultsStore, uiStore } from '../../lib/store';
  import { t, i18n } from '../../lib/i18n';
  import type { SolverDiagnostic } from '../../lib/engine/types';
  import { selectionOf, shellRef } from '../../lib/engine/model-findings';
  import { diagnosticsWarning } from '../../lib/store/diagnostics-warning.svelte';
  import { collectDiagnostics, groupDiagnostics, withoutIssueRef } from '../../lib/pro/diagnostics-list';
  import { postAnalysisLines, partLines, postAnalysisRows, postAnalysisHtml, type PostAnalysisLine } from '../../lib/engine/post-analysis';
  import { staticsRows } from '../../lib/store/statics-rows';
  import { instability } from '../../lib/store/instability.svelte';
  import { verificationStore } from '../../lib/store/verification.svelte';
  import { verdictApproves, verdictReasons } from '../../lib/store/member-verdict';
  import { toCsv } from '../../lib/engine/result-tables';
  import { tp, tpn } from '../../lib/i18n';
  import { containmentDismissal } from '../../lib/store/containment-dismissal.svelte';
  import { noticePrefs } from '../../lib/store/notice-prefs.svelte';

  // Opening Diagnostics is itself an interaction: the user has come to look, so the chip is
  // allowed to speak from here on even if nothing else has happened yet.
  $effect(() => { diagnosticsWarning.arm(); });

  type SeverityFilter = 'all' | 'error' | 'warning' | 'info';

  let severityFilter = $state<SeverityFilter>('all');

  const is3D = $derived(uiStore.is3DWorkspace);

  const allDiagnostics = $derived(collectDiagnostics(is3D));

  /** The report after the analysis: the findings above, then the analysis's own checks and, with the design on, what does not verify. */
  const postInput = $derived.by(() => {
    const statics = is3D ? staticsRows() : null;
    const p = is3D ? resultsStore.pdeltaResult3D : null;
    const design = uiStore.designInPro && verificationStore.contexts.size > 0 ? (() => {
      const members: Array<{ elementId: number; status: string; reasons: string[] }> = [];
      for (const id of verificationStore.contexts.keys()) {
        const v = verificationStore.memberVerdict(id);
        if (!verdictApproves(v)) members.push({ elementId: id, status: v.status, reasons: verdictReasons(v, tp as never) });
      }
      return { total: verificationStore.contexts.size, members };
    })() : null;
    return {
      statics: statics?.cases ?? null,
      pdelta: p ? { converged: p.converged, iterations: p.iterations, isStable: p.isStable, b2Factor: p.b2Factor } : null,
      mechanism: instability.current, design,
    };
  });
  /** What the list below does not already show: the analysis's own checks and the design. */
  const ownLines = $derived(postAnalysisLines({ ...postInput, diagnostics: [] }, tp as never));
  const notice = $derived(resultsStore.knownIssues3D);
  const noticeLines = $derived(notice.messages.map((text): PostAnalysisLine => ({ part: 'analysis', severity: notice.refused ? 'error' : 'warning', text })));
  const extraAnalysis = $derived([...noticeLines, ...partLines(ownLines, 'analysis')]);
  const designLines = $derived(partLines(ownLines, 'design'));
  const postLines = (): PostAnalysisLine[] => {
    const lines = postAnalysisLines({ ...postInput, diagnostics: allDiagnostics }, tp as never);
    const at = lines.findIndex((l) => l.part === 'analysis');
    return at < 0 ? [...lines, ...noticeLines] : [...lines.slice(0, at), ...noticeLines, ...lines.slice(at)];
  };

  function selectLine(l: PostAnalysisLine) {
    if (!l.selection) return;
    uiStore.setSelection(new Set(l.selection.nodes), new Set(l.selection.elements), false, new Set(l.selection.shells));
    frameSelection();
  }

  async function exportReport(format: 'csv' | 'pdf' | 'docx') {
    const name = (modelStore.model.name || 'model').replace(/[^\w.-]+/g, '-');
    const title = t('post.title');
    const subtitle = `${modelStore.model.name || ''} · ${new Date().toLocaleString(i18n.locale)}`;
    if (format === 'csv') {
      const csv = toCsv([t('post.col.part'), t('post.col.severity'), t('post.col.text'), t('post.col.detail'), t('post.col.objects')], postAnalysisRows(postLines(), tp as never));
      const { downloadText } = await import('../../lib/store/file');
      downloadText(csv, `post-analysis-${name}.csv`, 'text/csv');
      return;
    }
    const { downloadReport } = await import('../../lib/export/report-download');
    await downloadReport(format, { title, html: postAnalysisHtml(postLines(), tp as never, title, subtitle), stem: `post-analysis-${name}` });
  }

  const groups = $derived(groupDiagnostics(allDiagnostics));
  const shownGroups = $derived(severityFilter === 'all' ? groups : groups.filter((g) => g.first.severity === severityFilter));

  const errors = $derived(groups.filter((g) => g.first.severity === 'error'));
  const warnings = $derived(groups.filter((g) => g.first.severity === 'warning'));
  const infos = $derived(groups.filter((g) => g.first.severity === 'info'));
  const hasAny = $derived(groups.length > 0);
  const toReview = $derived({ model: errors.length + warnings.length, results: notice.messages.length });

  function severityIcon(s: SolverDiagnostic['severity']): string {
    if (s === 'error') return '\u2717';
    if (s === 'warning') return '\u26A0';
    return '\u2139';
  }

  function severityClass(s: SolverDiagnostic['severity']): string {
    if (s === 'error') return 'sev-error';
    if (s === 'warning') return 'sev-warning';
    return 'sev-info';
  }

  function sourceLabel(s: SolverDiagnostic['source']): string {
    return t(`diag.source.${s}`);
  }

  function codeTooltip(code: string): string {
    const key = `diag.tooltip.${code}`;
    const translated = t(key);
    return translated !== key ? translated : '';
  }

  function handleClick(diag: SolverDiagnostic) {
    // A modelling object: selected whole, in the panel where it is fixed.
    const plates = (diag.objects ?? []).filter((o) => o.kind === 'plate').map((o) => o.id);
    if (plates.length) {
      uiStore.selectMode = 'shells';
      uiStore.selectPlates(plates);
      uiStore.proActiveTab = 'shells';
      frameSelection();
      return;
    }
    // A use zone: its outline's nodes selected, in the loads panel where its use is stated.
    const zones = (diag.objects ?? []).filter((o) => o.kind === 'zone').map((o) => o.id);
    if (zones.length) {
      const nodes = zones.flatMap((id) => modelStore.model.groups.get(id)?.members.nodes ?? []);
      uiStore.setSelection(new Set(nodes), new Set(), false);
      uiStore.proActiveTab = 'loads';
      frameSelection();
      return;
    }
    const sel = selectionOf(diag);
    if (!sel) return;
    // Plate and quad ids are not frame ids: they go to the shell selection.
    uiStore.setSelection(new Set(sel.nodes), new Set(sel.elements), false, new Set(sel.shells));
    // Framed on what the row names, from where the camera looks: fitting the whole model put the
    // finding back among everything else.
    frameSelection();
  }

  /**
   * A diagnostic's details as a reader sees them: named in the app's language where there is a
   * name (a symbol such as E or Iz stays a symbol), ids as integers, small magnitudes in exponent
   * form (not "0"), and other numbers to four figures in the app's number format. `toFixed(3)`
   * printed «caseId: 1.000», which reads as one thousand in Spanish and Portuguese.
   */
  function formatDetails(details: Record<string, unknown>): string {
    const label = (k: string) => { const key = `diag.detail.${k}`; const v = t(key); return v === key ? k : v; };
    const num = (v: number) => Number.isInteger(v) ? String(v)
      : Math.abs(v) < 1e-3 ? v.toExponential(2)
      : Number(v.toPrecision(4)).toLocaleString(i18n.locale);
    return Object.entries(details)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${label(k)}: ${typeof v === 'number' ? num(v) : Array.isArray(v) ? v.join(', ') : v}`)
      .join(' | ');
  }

  function shellLabel(key: string): string {
    const { kind, id } = shellRef(key);
    return t(kind === 'plate' ? 'results.plateLabel' : 'results.quadLabel').replace('{id}', String(id));
  }
</script>

<div class="diag-panel" data-tour="diagnostics-panel">
  <!-- Action bar -->
  <div class="diag-action-bar">
    <span class="diag-auto-label" data-testid="diag-review-count" data-count={toReview.model + toReview.results}>
      {tpn('diag.reviewSummary', toReview.model + toReview.results, { model: toReview.model, results: toReview.results })}
      <small>{t('diag.reviewSummaryHint')}</small>
    </span>
  </div>

  <section class="post" data-testid="post-report">
    <div class="post-head">
      <h4>{t('post.title')}</h4>
      <span class="post-export">
        <button class="pk-btn" onclick={() => exportReport('csv')} data-testid="post-export-csv">CSV</button>
        <button class="pk-btn" onclick={() => exportReport('pdf')} data-testid="post-export-pdf">PDF</button>
        <button class="pk-btn" onclick={() => exportReport('docx')} data-testid="post-export-docx">{t('proReport.format.docx')}</button>
      </span>
    </div>
    {#snippet part(key: string, lines: PostAnalysisLine[])}
      {#if lines.length}
        <h5 class="post-part" data-testid="post-part-{key}">{t(`post.part.${key}`)}</h5>
        <ul class="post-list" data-testid="post-{key}">
          {#each lines as l, i (i)}
            <li>
              <button class="post-line sev-{l.severity}" disabled={!l.selection} onclick={() => selectLine(l)} title={l.text !== withoutIssueRef(l.text) ? l.text : undefined}>
                <span class="post-sev">{t(`post.sev.${l.severity}`)}</span>
                <span>{withoutIssueRef(l.text)}{#if l.detail}<small>{l.detail}</small>{/if}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/snippet}
    {@render part('analysis', extraAnalysis)}
    {#if !notice.refused && containmentDismissal.any}
      <button class="pk-btn" onclick={() => containmentDismissal.restore()} data-testid="containment-restore">{t('containment.restore')}</button>
    {/if}
    {#if noticePrefs.hidden.length}
      <button class="pk-btn" onclick={() => noticePrefs.showAll()} data-testid="notices-restore-hidden">{t('notices.restoreHidden')}</button>
    {/if}
    {@render part('design', designLines)}
  </section>

  <!--
    The switch for the Design bar's warning chip.

    It lives here, and only here, because this is where the user arrives after following the
    chip — so the control to quieten it is beside the thing it is about, and reaching it costs
    a look at the diagnostics first. The scope is stated in full rather than implied: hiding is
    per diagnostic set, for this session, and it changes NOTHING about what the design does.
    The commands call `checkModel` themselves and refuse on their own.
  -->
  <section class="diag-notify" data-testid="diag-notify">
    <h4>{t('pro.diagHideTitle')}</h4>
    <label class="diag-notify-toggle">
      <input
        type="checkbox"
        data-testid="diag-hide-warning"
        checked={diagnosticsWarning.dismissed}
        disabled={diagnosticsWarning.count === 0}
        onchange={(e) => (e.currentTarget.checked
          ? diagnosticsWarning.dismiss()
          : diagnosticsWarning.restore())}
      />
      <span>{t('pro.diagHideLabel')}</span>
    </label>
    <p class="diag-notify-scope">{t('pro.diagHideScope')}</p>
    <!--
      What the diagnostics currently AMOUNT to, in words. The four categories the chip must
      never blur together: no model at all, a model missing inputs, blocking errors — and,
      separately owned elsewhere, provisional proposals and bar conflicts, which are states of
      a design rather than faults in a model.
    -->
    <p class="diag-notify-kind" data-testid="diag-kind" data-kind={diagnosticsWarning.kind}>
      {t(`pro.diagKind${diagnosticsWarning.kind === 'empty' ? 'Empty'
        : diagnosticsWarning.kind === 'clean' ? 'Clean'
        : diagnosticsWarning.kind === 'incomplete' ? 'Incomplete' : 'Blocking'}`)}
    </p>
    {#if diagnosticsWarning.dismissed}
      <p class="diag-notify-state" role="status" data-testid="diag-hidden-note">
        {t('pro.diagHidden')}
      </p>
    {/if}
  </section>

  <h5 class="post-part" data-testid="post-model-heading">{t('post.part.model')}</h5>
  {#if !hasAny}
    <div class="diag-empty">
      <span class="diag-check">&#10003;</span>
      <div>{t('diag.noIssues')}</div>
    </div>
  {:else}
    <!-- Summary bar -->
    <div class="diag-summary">
      {#if errors.length > 0}
        <button
          class="diag-badge sev-error"
          class:active={severityFilter === 'error'}
          onclick={() => severityFilter = severityFilter === 'error' ? 'all' : 'error'}
        >
          {errors.length} {t('diag.errors')}
        </button>
      {/if}
      {#if warnings.length > 0}
        <button
          class="diag-badge sev-warning"
          class:active={severityFilter === 'warning'}
          onclick={() => severityFilter = severityFilter === 'warning' ? 'all' : 'warning'}
        >
          {warnings.length} {t('diag.warnings')}
        </button>
      {/if}
      {#if infos.length > 0}
        <button
          class="diag-badge sev-info"
          class:active={severityFilter === 'info'}
          onclick={() => severityFilter = severityFilter === 'info' ? 'all' : 'info'}
        >
          {infos.length} {t('diag.info')}
        </button>
      {/if}
      {#if severityFilter !== 'all'}
        <button
          class="diag-badge sev-all"
          onclick={() => severityFilter = 'all'}
        >
          {t('diag.showAll')}
        </button>
      {/if}
    </div>

    {#snippet headline(diag: SolverDiagnostic, tooltip: string)}
      <span class="diag-icon {severityClass(diag.severity)}">{severityIcon(diag.severity)}</span>
      <span class="diag-source">{sourceLabel(diag.source)}</span>
      <div class="diag-content">
        <span class="diag-msg">{withoutIssueRef(t(diag.message) !== diag.message ? t(diag.message) : diag.message)}</span>
        {#if tooltip}
          <span class="diag-tooltip-text">{tooltip}</span>
        {/if}
      </div>
    {/snippet}
    {#snippet refs(diag: SolverDiagnostic)}
      {#if diag.elementIds && diag.elementIds.length > 0}
        <span class="diag-refs">{t('diag.elements')}: {diag.elementIds.join(', ')}</span>
      {/if}
      {#if diag.shellKeys && diag.shellKeys.length > 0}
        <span class="diag-refs">{t('diag.shells')}: {diag.shellKeys.map(shellLabel).join(', ')}</span>
      {/if}
      {#if diag.nodeIds && diag.nodeIds.length > 0}
        <span class="diag-refs">{t('diag.nodes')}: {diag.nodeIds.join(', ')}</span>
      {/if}
      {#if diag.details}
        <span class="diag-details">{formatDetails(diag.details)}</span>
      {/if}
    {/snippet}
    <div class="diag-list">
      {#each shownGroups as g (g.key)}
        {@const tooltip = codeTooltip(g.first.code)}
        {#if g.items.length === 1}
          <button class="diag-item {severityClass(g.first.severity)}" onclick={() => handleClick(g.first)} title={tooltip || undefined} data-tour="diagnostic-item" data-testid="diag-item">
            {@render headline(g.first, tooltip)}
            {@render refs(g.first)}
          </button>
        {:else}
          <details class="diag-group" data-testid="diag-group" data-count={g.items.length}>
            <summary class="diag-item {severityClass(g.first.severity)}" title={tooltip || undefined} data-tour="diagnostic-item">
              {@render headline(g.first, tooltip)}
              <span class="diag-count" data-testid="diag-group-count">×{g.items.length}</span>
            </summary>
            <div class="diag-group-items">
              {#each g.items as item, k (k)}
                <button class="diag-sub" onclick={() => handleClick(item)} data-testid="diag-group-item">{@render refs(item)}</button>
              {/each}
            </div>
          </details>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .post { margin: 0 0 0.75rem; }
  .post-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .post-head h4 { margin: 0; font-size: 0.78rem; color: var(--st-text); }
  .post-export { display: inline-flex; gap: 4px; }
  .post-part { margin: 0.6rem 0 0.25rem; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--st-text-3); }
  .post-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .post-line { display: flex; gap: 8px; width: 100%; text-align: left; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 4px 6px; font-size: 0.72rem; cursor: pointer; }
  .post-line:disabled { cursor: default; }
  .post-line small { display: block; color: var(--st-text-3); font-size: 0.64rem; }
  .post-sev { flex: none; font-weight: 600; min-width: 4.5em; }
  .post-line.sev-error .post-sev { color: var(--st-danger); }
  .post-line.sev-warning .post-sev { color: var(--st-warn); }
  .post-line.sev-ok .post-sev { color: var(--st-ok); }
  /* ── Notification control ─────────────────────────────────────── */
  .diag-notify {
    margin: 0 0 0.75rem;
    padding: 0.6rem 0.75rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
  }
  .diag-notify h4 {
    margin: 0 0 0.4rem;
    font-family: var(--st-display);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }
  .diag-notify-toggle {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.78rem; color: var(--st-text); cursor: pointer;
  }
  .diag-notify-toggle input:disabled + span { color: var(--st-text-3); cursor: not-allowed; }
  .diag-notify-toggle input:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }
  .diag-notify-scope {
    margin: 0.35rem 0 0;
    font-size: 0.7rem; line-height: 1.45; color: var(--st-text-2);
  }
  .diag-notify-kind {
    margin: 0.4rem 0 0;
    font-size: 0.72rem; color: var(--st-text-2);
  }
  /* Each category reads differently without depending on the colour to say which. */
  .diag-notify-kind[data-kind='blocking'] { color: var(--st-danger); font-weight: 600; }
  .diag-notify-kind[data-kind='incomplete'] { color: var(--st-warn); }
  .diag-notify-kind[data-kind='clean'] { color: var(--st-text-3); }
  .diag-notify-state {
    margin: 0.35rem 0 0;
    font-size: 0.72rem; font-weight: 600; color: var(--st-warn);
  }

  .diag-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  .diag-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
  }

  .diag-auto-label {
    font-size: 0.68rem;
    color: var(--st-text-3);
  }

  .diag-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px 10px;
    color: var(--st-value);
    font-size: 0.8rem;
  }

  .diag-check {
    font-size: 2rem;
    color: var(--st-text-2);
  }

  .diag-summary {
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .diag-badge {
    padding: 4px 12px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid transparent;
    cursor: pointer;
    transition: border-color 0.15s, opacity 0.15s;
  }

  .diag-badge:hover {
    opacity: 0.85;
  }

  .diag-badge.active {
    border-color: currentColor;
  }

  .diag-badge.sev-error { background: rgba(229, 72, 42, 0.2); color: var(--st-accent); }
  .diag-badge.sev-warning { background: rgba(217, 164, 65, 0.2); color: var(--st-warn); }
  .diag-badge.sev-info { background: rgba(127, 212, 204, 0.2); color: var(--st-value); }
  .diag-badge.sev-all { background: rgba(255, 255, 255, 0.08); color: var(--st-text-3); }

  .diag-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .diag-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: var(--st-text-2);
    font-size: 0.75rem;
    border-bottom: 1px solid var(--st-surface-2);
    width: 100%;
  }

  .diag-item:hover {
    background: rgba(127, 212, 204, 0.05);
  }

  .diag-icon {
    font-size: 0.85rem;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
  }

  .diag-icon.sev-error { color: var(--st-accent); }
  .diag-icon.sev-warning { color: var(--st-warn); }
  .diag-icon.sev-info { color: var(--st-value); }

  .diag-source {
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.05);
    color: var(--st-text-3);
    flex-shrink: 0;
  }

  .diag-content {
    flex: 1;
    min-width: 100px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .diag-msg {
    /* inherits from parent */
  }

  .diag-tooltip-text {
    font-size: 0.65rem;
    color: var(--st-text-3);
    font-style: italic;
  }

  .diag-group > summary { list-style: none; cursor: pointer; }
  .diag-group > summary::-webkit-details-marker { display: none; }
  .diag-count { flex: none; font-size: 0.68rem; font-weight: 600; padding: 1px 6px; border-radius: 9px; background: var(--st-surface-3); color: var(--st-text-2); }
  .diag-group-items { display: flex; flex-direction: column; gap: 1px; padding: 0 0 6px 38px; }
  .diag-sub { display: flex; flex-wrap: wrap; gap: 6px; text-align: left; border: none; background: none; color: inherit; padding: 3px 6px; cursor: pointer; border-radius: 3px; }
  .diag-sub:hover { background: rgba(127, 212, 204, 0.05); }
  .diag-sub .diag-details { width: auto; padding-left: 0; }

  .diag-refs {
    font-family: monospace;
    font-size: 0.68rem;
    color: var(--st-text-3);
  }

  .diag-details {
    width: 100%;
    font-family: monospace;
    font-size: 0.65rem;
    color: var(--st-text-3);
    padding-left: 26px;
  }
</style>
