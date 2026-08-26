<script lang="ts">
  /**
   * Documents and professional review — stage 6, not a footnote of stage 5.
   *
   * ── Why this is its own section ────────────────────────────────────
   *
   * The report, the drawings, the bar schedule, the 3-D view, the provisional acknowledgements,
   * the engineer's name, the notes, `Record review` and `Issue for construction` all lived at the
   * BOTTOM of the coordinated-detailing panel. To reach the control that issues a set of drawings
   * for construction you had to open detailing, select an assembly, and scroll past the bar list,
   * the conflicts, the sheet and the schedule.
   *
   * These are not details of the detailing. They are what the whole pipeline is FOR, and the last
   * of them carries a professional declaration. A stage of the workflow gets a stage of the panel.
   *
   * ── The hierarchy, in the order a reviewer needs it ────────────────
   *
   *   1. what document exists (revision, readiness, maturity, open conflicts)
   *   2. what you can take away (report, drawings, schedule, 3-D)
   *   3. the professional review, and what it does and does not mean
   *   4. the provisional calculations that must be accepted first
   *   5. issuing for construction, and what is still missing before it can happen
   *
   * ── What it does not do ────────────────────────────────────────────
   *
   * It builds nothing new. Every export goes through `currentDoc()`, so all four projections come
   * from ONE document instance — building one per button would let a report and a drawing disagree
   * about what they describe, which is the failure `DocumentModel` exists to prevent. Nothing here
   * can set REVIEWED or ISSUED on its own: the engine refuses and the refusal is shown verbatim.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { detailingSheet } from '../../../lib/store/detailing-sheet.svelte';
  import { reviewRank } from '../../../lib/engine/detailing/assembly';
  import type { DesignFamily } from '../../../lib/engine/design/design-families';
  import { maturityLabelKey } from '../../../lib/codes/maturity';
  import {
    renderReportHtml, renderDrawings, renderSchedule,
  } from '../../../lib/engine/detailing/document-render';
  import { exportToExcel } from '../../../lib/export/excel';
  import RebarScenePanel from './RebarScenePanel.svelte';
  import { openRebar3D } from '../../../lib/store/rebar-open';
  import { detailingAuthor } from '../../../lib/store/detailing-author.svelte';
  import { retouchedIn, withExportLog } from '../../../lib/store/export-log';
  import RcExportLog from './RcExportLog.svelte';

  let docError = $state<string | null>(null);
  let show3d = $state(false);
  let notes = $state('');
  let acknowledged = $state<string[]>([]);

  const selected = $derived(detailingStore.selected);
  const provisional = $derived(detailingStore.provisional);
  const allAcknowledged = $derived(provisional.every((k) => acknowledged.includes(k)));

  /**
   * Build the document, or say why not.
   *
   * Every export goes through this, so all of them consume the SAME model instance and the same
   * revision.
   */
  function currentDoc() {
    docError = null;
    const doc = detailingStore.buildDocument({
      author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
      at: new Date().toISOString(),
    });
    if (!doc) docError = t('detailing.doc.noCoordinated');
    return doc;
  }

  function downloadBlob(name: string, type: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * What heads every export.
   *
   * The project's rótulo when it has one, and the generic word only when it does not. All three
   * exports used `t('detailing.doc.project')` unconditionally — a translated word meaning
   * "Project" — so a drawing set, a report and a schedule of a real works were all headed with
   * a noun. The rótulo is the same one the sheets carry, so the four cannot disagree.
   */
  function projectName(): string {
    return detailingSheet.titleBlockConfig.project || t('detailing.doc.project');
  }

  /**
   * Every export, recorded — objective 11.
   *
   * `exportRecordStore.record()` had no caller at all: the three handlers wrote a blob and told
   * nobody, so the emission list was empty in every project that has ever existed, and a user
   * who exported the drawings and then edited a footing had no way to know the file in their
   * folder no longer corresponded. `withExportLog` records the failure path too, because the
   * afternoon somebody pressed the button four times and got nothing is precisely the afternoon
   * the list is for.
   */
  function exportReport() {
    const doc = currentDoc();
    if (!doc) return;
    const filename = `detailing-rev${doc.revision.number}.html`;
    withExportLog({ kind: 'report', doc, filename, at: new Date().toISOString() }, () => {
      const html = renderReportHtml(
        doc,
        { locale: i18n.locale, projectName: projectName(), retouched: retouchedIn(doc) },
        (k, params) => tp(k, params ?? {}),
      );
      // Printed through the browser rather than a bundled PDF writer: better typography, no
      // dependency, and the user picks the paper size.
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
      else downloadBlob(filename, 'text/html', html);
    });
  }

  function exportDxf() {
    const doc = currentDoc();
    if (!doc) return;
    const filename = `detailing-rev${doc.revision.number}.dxf`;
    withExportLog({ kind: 'dxf', doc, filename, at: new Date().toISOString() }, () => {
      const set = renderDrawings(doc, {
        locale: i18n.locale, projectName: projectName(), retouched: retouchedIn(doc),
      });
      downloadBlob(filename, 'application/dxf', set.dxf);
    });
  }

  function exportXlsx() {
    const doc = currentDoc();
    if (!doc) return;
    const sheets = renderSchedule(doc, {
      locale: i18n.locale, projectName: projectName(), retouched: retouchedIn(doc),
    });
    const filename = `detailing-rev${doc.revision.number}.xlsx`;
    withExportLog({ kind: 'xlsx', doc, filename, at: new Date().toISOString() }, () =>
      exportToExcel({
        filename,
        onlyExtras: true,
        extraSheets: sheets.map((s) => ({ name: s.name, rows: s.aoa })),
      }));
  }

  /**
   * Open the 3-D view on a FRESHLY built document.
   *
   * Not on `detailingStore.document`, which may be a revision built before the last edit. Going
   * through `openRebar3D` is what makes the picture and the three exports projections of the same
   * instance rather than of two documents that happen to agree.
   */
  function open3d() {
    docError = null;
    const r = openRebar3D({
      author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
      at: new Date().toISOString(),
    });
    if (!r.ok) { docError = t('detailing.doc.noCoordinated'); return; }
    show3d = true;
  }

  function toggleAck(key: string) {
    acknowledged = acknowledged.includes(key)
      ? acknowledged.filter((k) => k !== key)
      : [...acknowledged, key];
  }

  function submitReview(state: 'REVIEWED' | 'ISSUED') {
    detailingStore.review({
      engineer: detailingAuthor.name,
      // The store never reads the clock itself; the timestamp comes from the action.
      at: new Date().toISOString(),
      state,
      notes: notes.trim() || undefined,
      provisionalAcknowledged: provisional.length === 0 || allAcknowledged,
      acknowledgedProvisional: acknowledged,
    });
  }

  /**
   * What still stands between this set and `Issue for construction`, in words.
   *
   * The button was simply disabled. A control that governs a construction issue and explains
   * itself with nothing but grey is the one place in this panel where silence is least excusable.
   */
  /**
   * What stands between this set and `Record review`, in the store's own words.
   *
   * `Record review` had no `disabled` and no explanation. Clicking it with an unaccepted
   * provisional calculation called `detailingStore.review`, which refuses — and refused AFTER
   * `retireDocument()` had already run, so the document the user had just built was superseded by
   * a click that accomplished nothing. That ordering is fixed in the store as well; this gate is
   * the half that stops the user reaching a refusal at all.
   *
   * These are the SAME three refusals `assembly.ts` raises and the store translates
   * (`notConstructible` at line 481, `engineerRequired`, `provisionalOutstanding`), reusing the
   * same locale keys. Not a new set of rules: the same sentences, said before the click instead
   * of after it. Which is the principle the note under `issue-submit` already states.
   */
  /**
   * Families as words, in the reader's language.
   *
   * The same keys `RcConvergenceNotice` uses, so the strip and the document cannot come to name
   * the same scope two different ways.
   */
  const familyWords = (fs: readonly DesignFamily[]) =>
    (fs.length === 0
      ? [t('detailing.doc.scopeNone')]
      : fs.map((f) => t(`detailing.convergence.family.${f}`))).join(', ');

  const reviewBlockers = $derived.by(() => {
    const out: string[] = [];
    if (!selected) { out.push(t('detailing.doc.need.assembly')); return out; }
    if (reviewRank(selected.state) < reviewRank('CONSTRUCTIBLE')) {
      out.push(tp('detailing.review.notConstructible', { state: selected.state }));
    }
    if (!detailingAuthor.name.trim()) out.push(t('detailing.review.engineerRequired'));
    if (provisional.length > 0 && !allAcknowledged) {
      out.push(tp('detailing.review.provisionalOutstanding', { keys: provisional.join(', ') }));
    }
    return out;
  });

  const issueBlockers = $derived.by(() => {
    const out: string[] = [];
    if (!selected) { out.push(t('detailing.doc.need.assembly')); return out; }
    if (detailingStore.assemblies.length === 0) out.push(t('detailing.doc.need.detailing'));
    if (reviewRank(selected.state) < reviewRank('REVIEWED')) out.push(t('detailing.doc.need.review'));
    if (provisional.length > 0 && !allAcknowledged) out.push(t('detailing.doc.need.provisional'));
    return out;
  });
</script>

{#if !selected}
  <!-- Not a blank stage: the reason there is nothing to export, and where to get one. -->
  <p class="empty" data-testid="documents-empty">{t('detailing.doc.emptyStage')}</p>
{:else}
<div class="documents-stage" data-testid="documents-stage">
  <section class="documents" data-testid="documents" aria-labelledby="documents-title">
    <h3 id="documents-title">{t('detailing.doc.title')}</h3>

    {#if detailingStore.document}
      {@const d = detailingStore.document}
      <p class="doc-state" data-testid="doc-readiness">
        <span class="badge badge-{d.readiness.toLowerCase()}">{t(`detailing.doc.readiness.${d.readiness}`)}</span>
        <span data-testid="doc-revision">{tp('detailing.doc.revision', { n: d.revision.number })}</span>
        <span data-testid="doc-maturity">{t(maturityLabelKey(d.maturity))}</span>
      </p>
      <!--
        The scope this document answers for, beside the readiness badge that qualifies it.

        `readiness` is a statement about the assemblies in the set; a reader takes a badge to be
        a statement about the building. Those coincide only when the set covers every family the
        model has, and a run scoped to beams and columns does not. The exports carry the same
        sentence through `scopeStatement` — this is the on-screen half, next to the buttons that
        produce them rather than only inside the files they produce.
      -->
      <p class="doc-scope" data-testid="doc-scope">
        {tp('detailing.doc.scope', { families: familyWords(d.scope) })}
        {#if d.outOfScope.length > 0}
          <span class="out" data-testid="doc-scope-out">
            {tp('detailing.convergence.outOfScope', { families: familyWords(d.outOfScope) })}
          </span>
        {/if}
      </p>
      {#if d.openConflicts.length > 0}
        <p class="warn" data-testid="doc-conflicts">
          {tp('detailing.doc.conflicts', { n: d.openConflicts.length })}
        </p>
      {/if}
      <!--
        WHAT this document is, and not only how ready it is.

        The stage used to show readiness, revision and maturity — three states and no content.
        A reader could not tell whether "Revision 1" covered one assembly or forty, which codes
        it was verified against, or whether it carried assumptions. Every figure here is already
        in `DocumentModel`; none of it is new state, and nothing is computed that the document
        does not already say.

        No fabricated zeros: this block only renders once `detailingStore.document` exists, so
        every count below is a count that has been taken.
      -->
      <dl class="doc-contents" data-testid="doc-contents">
        <dt>{t('detailing.doc.contents.assemblies')}</dt>
        <dd data-testid="doc-count-assemblies">{d.assemblies.length}</dd>
        <dt>{t('detailing.doc.contents.certificates')}</dt>
        <dd data-testid="doc-count-certificates">{d.certificates.length}</dd>
        <dt>{t('detailing.doc.contents.clauses')}</dt>
        <dd data-testid="doc-count-clauses">{d.refs.length}</dd>
        {#if d.assumptions.length > 0}
          <dt>{t('detailing.doc.contents.assumptions')}</dt>
          <dd data-testid="doc-count-assumptions">{d.assumptions.length}</dd>
        {/if}
      </dl>
      {#if d.regulations.length > 0}
        <!-- The editions the verification actually used, not the ones currently selected. -->
        <p class="doc-regs" data-testid="doc-regulations">
          {d.regulations.map((r) => `${r.id} ${r.edition}`).join(' · ')}
        </p>
      {/if}
    {:else}
      <p class="muted" data-testid="doc-none">{t('detailing.doc.notBuilt')}</p>
    {/if}

    <div class="doc-actions">
      <button data-testid="doc-report" onclick={exportReport}>{t('detailing.doc.report')}</button>
      <button data-testid="doc-dxf" onclick={exportDxf}>{t('detailing.doc.dxf')}</button>
      <button data-testid="doc-xlsx" onclick={exportXlsx}>{t('detailing.doc.xlsx')}</button>
      <button data-testid="doc-3d" onclick={open3d}>{t('detailing.scene.open')}</button>
    </div>

    {#if docError}
      <p class="err" role="alert" data-testid="doc-error">{docError}</p>
    {/if}

    <!--
      What has left this project, and whether it still corresponds.

      Under the export buttons, because it is the answer to a question those buttons raise:
      the file in somebody's folder came out of a revision, and the project has moved on since.
      See `RcExportLog.svelte`.
    -->
    <RcExportLog />

    <!-- ── The fourth projection ────────────────────────────────
         Same document instance as the three exports above, so what is orbited, what is
         dimensioned and what is ordered cannot come apart. -->
    {#if show3d}
      <RebarScenePanel doc={detailingStore.document} ondownload={downloadBlob} />
    {/if}

    {#if detailingStore.supersededDocuments.length > 0}
      <details class="superseded-docs" data-testid="superseded-docs">
        <summary>{tp('detailing.doc.supersededCount',
          { n: detailingStore.supersededDocuments.length })}</summary>
        <ul>
          {#each detailingStore.supersededDocuments as sd (sd.revision.number)}
            <li data-testid={`superseded-${sd.revision.number}`}>
              {tp('detailing.doc.supersededItem',
                { n: sd.revision.number, by: sd.supersededBy ?? 0 })}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </section>

  <section class="review" aria-labelledby="review-title">
    <!-- `h4`, not `h5`. The section's own title above is an `h3`, so this skipped a level and a
         reader navigating by heading could not tell whether the review was a sibling of the
         documents or a part of them. -->
    <h4 id="review-title">{t('detailing.review')}</h4>
    <p class="disclaimer" data-testid="review-disclaimer">{t('detailing.notLegalSignoff')}</p>

    {#if selected.review}
      <p class="reviewed" data-testid="review-record">
        {tp('detailing.reviewedBy', {
          engineer: selected.review.engineer,
          at: selected.review.at,
          revision: selected.review.revision,
        })}
      </p>
    {/if}

    {#if provisional.length > 0}
      <div class="notice warning" data-testid="provisional-ack">
        <strong>{t('detailing.provisionalPresent')}</strong>
        {#each provisional as key (key)}
          <label class="ack">
            <input
              type="checkbox"
              data-testid={`ack-${key}`}
              checked={acknowledged.includes(key)}
              onchange={() => toggleAck(key)}
            />
            {tp('detailing.acknowledge', { key })}
          </label>
        {/each}
      </div>
    {/if}

    <label class="field">
      {t('detailing.engineer')}
      <input type="text" data-testid="review-engineer"
             value={detailingAuthor.name}
             oninput={(e) => detailingAuthor.set(e.currentTarget.value)} />
    </label>
    <label class="field">
      {t('detailing.notes')}
      <textarea data-testid="review-notes" bind:value={notes} rows="2"></textarea>
    </label>

    <div class="actions">
      <button
        data-testid="review-submit"
        disabled={reviewBlockers.length > 0}
        onclick={() => submitReview('REVIEWED')}
      >
        {t('detailing.recordReview')}
      </button>
      <button
        data-testid="issue-submit"
        disabled={reviewRank(selected.state) < reviewRank('REVIEWED')}
        onclick={() => submitReview('ISSUED')}
      >
        {t('detailing.issue')}
      </button>
    </div>
    <!--
      The requirement in TEXT, next to the control it governs.

      `Issue for construction` was simply disabled. A control that governs a construction issue
      and explains itself with nothing but grey is the one place in this panel where silence is
      least excusable.
    -->
    {#if reviewBlockers.length > 0}
      <p class="need" data-testid="review-blockers">{reviewBlockers.join(' ')}</p>
    {/if}
    {#if issueBlockers.length > 0}
      <p class="need" data-testid="issue-blockers">{issueBlockers.join(' ')}</p>
    {/if}

    {#if detailingStore.lastError}
      <p class="notice error" role="alert" data-testid="review-error">{detailingStore.lastError}</p>
    {/if}
  </section>
</div>
{/if}

<style>
  .documents-stage { display: flex; flex-direction: column; gap: 0.5rem; }
  .empty {
    margin: 0.3rem 0;
    padding: 0.5rem 0.6rem;
    border: 1px dashed var(--st-hair-strong);
    border-radius: 4px;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }

  /* One heading level per rank, so the two groups do not compete. */
  .documents-stage :global(h3),
  .documents-stage :global(h4) {
    margin: 0 0 0.2rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--st-text);
  }

  /* The scope, in the same register as the readiness line it qualifies. */
  .doc-scope {
    margin: 0.15rem 0 0;
    font-size: 0.72rem;
    line-height: 1.35;
    color: var(--st-text-2);
  }
  .doc-scope .out { display: block; margin-top: 0.1rem; }

  .doc-state { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0; font-size: 0.7rem; color: var(--st-text-2); }
  .badge { font-size: 0.66rem; font-weight: 600; padding: 0.02rem 0.35rem; border-radius: 3px; background: var(--st-surface-3); color: var(--st-text); }
  .muted { margin: 0; font-size: 0.7rem; color: var(--st-text-2); }
  .warn { margin: 0; font-size: 0.68rem; color: var(--st-warn); }
  .err { margin: 0; font-size: 0.68rem; color: var(--st-danger); }

  /*
    The exports, as one group on the tokens.

    They were four native buttons in a row, white on white, indistinguishable from each other and
    from the review controls below — four take-aways and two declarations, presented identically.
  */
  .doc-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .doc-actions button, .actions button {
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-3);
    color: var(--st-text);
    font-size: 0.7rem;
    cursor: pointer;
  }
  .doc-actions button:hover, .actions button:hover:not(:disabled) { background: var(--st-hair-strong); }
  .doc-actions button:focus-visible, .actions button:focus-visible,
  .field input:focus-visible, .field textarea:focus-visible,
  .ack input:focus-visible {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
  .actions button:disabled { opacity: 0.6; cursor: not-allowed; }
  /* Issuing for construction is the consequential one, and reads as it. */
  .actions button[data-testid='issue-submit']:not(:disabled) { border-color: var(--st-interactive); font-weight: 600; }

  .review { border-top: 1px solid var(--st-hair); padding-top: 0.5rem; }
  .doc-contents {
    display: grid; grid-template-columns: auto auto; gap: 0.05rem 0.5rem;
    margin: 0.3rem 0 0; font-size: 0.7rem; justify-content: start;
  }
  .doc-contents dt { color: var(--st-text-2); }
  .doc-contents dd {
    margin: 0; font-family: var(--st-mono); font-variant-numeric: tabular-nums;
  }
  .doc-regs {
    margin: 0.2rem 0 0; font-size: 0.66rem; color: var(--st-text-2);
    font-family: var(--st-mono);
  }
  .disclaimer { margin: 0 0 0.3rem; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); }
  .reviewed { margin: 0 0 0.3rem; font-size: 0.68rem; color: var(--st-ok); }

  .notice { padding: 0.35rem 0.5rem; border-radius: 4px; background: var(--st-surface-3); font-size: 0.68rem; }
  .notice.warning { border-left: 2px solid var(--st-warn); }
  .notice.error { border-left: 2px solid var(--st-danger); color: var(--st-danger); }
  .ack { display: flex; align-items: baseline; gap: 0.35rem; margin-top: 0.2rem; cursor: pointer; }

  /* Label above control, one spacing, nothing touching an edge. */
  .field { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.68rem; color: var(--st-text-2); }
  .field input, .field textarea {
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-bg);
    color: var(--st-text);
    font: inherit;
    font-size: 0.7rem;
  }

  .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.2rem; }
  .need { margin: 0.15rem 0 0; font-size: 0.66rem; color: var(--st-text-2); }

  .superseded-docs { font-size: 0.68rem; color: var(--st-text-2); }
  .superseded-docs ul { margin: 0.2rem 0 0; padding-left: 1rem; }
</style>
