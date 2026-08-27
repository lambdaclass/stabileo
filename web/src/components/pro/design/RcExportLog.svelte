<script lang="ts">
  /**
   * What left this project, out of which revision, and whether it still corresponds.
   *
   * ── The question it answers ────────────────────────────────────────
   *
   * `rc-export-record.ts` names it in its first paragraph: "a user who exported the drawings,
   * edited a footing and came back to Documentos has no way to know the file in their folder no
   * longer corresponds." The model knew — `revision`, `supersededDocuments` — and nothing
   * connected that to the files that had left, because `exportRecordStore.record()` had no
   * caller. It has one now, and this is where the record is read.
   *
   * ── Stale is information, not a fault ──────────────────────────────
   *
   * Exporting and then continuing to edit is a normal working pattern, and marking it as an
   * error would train people to ignore the mark. It is stated as what it is: the file came out
   * of revision 4 and the project is on 6.
   *
   * ── The retouch line, and the four states ──────────────────────────
   *
   * `known` with no members and `unknown` render identically unless something forces them apart,
   * and only one of them is a claim about the project. `rcRetouchIsCountable` is the guard, and
   * the two are worded so that no reader could mistake one for the other.
   *
   * ── Why there is no "clear" button ─────────────────────────────────
   *
   * A record is a historical fact: a file left the app and is in somebody's folder. Undoing a
   * model change cannot un-happen that, which is the rule `project-provenance.ts` spends its
   * header on, and a control that erased the list would let a project forget what it issued.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { exportRecordStore } from '../../../lib/store/export-record.svelte';
  import { rcRetouchIsCountable } from '../../../lib/flow/rc-selection';
  import { retouchSplitIn } from '../../../lib/store/export-log';
  import type { ExportRecord } from '../../../lib/flow/rc-export-record';

  const records = $derived(exportRecordStore.exports);
  /**
   * The revision a record is compared against.
   *
   * The CURRENT document's when there is one, and the last one built otherwise. Zero means
   * nothing has been built this session, and nothing is then marked stale — a record cannot
   * have gone out of date against a revision the app cannot name.
   */
  const current = $derived(detailingStore.document?.revision.number ?? 0);

  function stale(r: ExportRecord): boolean {
    return current > 0 && exportRecordStore.isStale(r, current);
  }

  /** Newest first: the last thing that left is the one being asked about. */
  const rows = $derived([...records].reverse());

  function when(iso: string): string {
    // `Intl` and not a hand-rolled format: the record's own timestamp is ISO and what a reader
    // wants is their own locale's rendering of it.
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(i18n.locale);
  }

  /**
   * The members an emission contained — §4's "elementos incluidos", finally rendered.
   *
   * The field has been on `ExportRecord` since F0 and `logExport` has always filled it from
   * `documentMembers(doc)`. Nothing read it, in either language, so the one thing a reader needs
   * in order to check a file against a project — what is in it — was recorded and invisible. It is
   * the pattern §9.6.1 names: a contract written, with no consumer.
   *
   * Count AND ids, capped at eight with the cap stated. The count is what a set is checked
   * against; the ids are what a sheet is checked against; and a list that silently stopped at
   * eight would be wrong in exactly the projects where it matters.
   */
  function elementsText(r: ExportRecord): string {
    if (r.elements.length === 0) {
      // Empty is legitimate and means the whole document — `ExportRecord.elements` says so. It
      // must not read as "no members", which is why it gets its own sentence.
      return t('detailing.exports.elementsWhole');
    }
    const shown = r.elements.slice(0, 8);
    return tp('detailing.exports.elements', {
      n: r.elements.length,
      ids: r.elements.length > 8 ? `${shown.join(', ')}…` : shown.join(', '),
    });
  }

  function retouchText(r: ExportRecord): string {
    if (r.retouched.status === 'notApplicable') return '';
    if (!rcRetouchIsCountable(r.retouched)) return t('detailing.exports.retouchUnknown');
    return r.retouched.members.length === 0
      ? t('detailing.exports.retouchNone')
      : tp('detailing.exports.retouchSome', {
        n: r.retouched.members.length, ids: r.retouched.members.slice(0, 8).join(', '),
      });
  }

  /**
   * What the CURRENT document says about its hand edits, split by lock.
   *
   * A record describes a file that left; this describes the document on screen, and it splits
   * the two claims a reader deciding whether to issue actually needs: which members carry an
   * arrangement an engineer chose and locked, and which carry one the next regeneration will
   * replace. Both are on the drawing; only one of them is going to stay there.
   */
  const doc = $derived(detailingStore.document);
  const split = $derived(doc ? retouchSplitIn(doc) : null);
</script>

<!--
  `h4` and not `h5`.

  This section sits under `DocumentsSection`'s `h3`, and its sibling — `Engineer review` — is an
  `h4`. An `h5` here skips a level, which is the exact jump `h1b-panel-navigation.spec.ts` was
  written for: its own comment records finding `h3 → h5` at "Engineer review" in all three
  languages, in this same file. The reader navigating by heading has to be able to tell whether
  this list is a sibling of the documents or a part of them.
-->
<section class="exports" data-testid="export-log" aria-label={t('detailing.exports.title')}>
  <h4>{t('detailing.exports.title')}</h4>

  <!--
    The hand edits in the document on screen, and which of them survive a regeneration.
    Above the emission list, because it is about what would go out NEXT rather than what already
    did.
  -->
  {#if split && !split.unknown && (split.kept.length > 0 || split.replaced.length > 0)}
    <p class="split" data-testid="doc-retouch-split">
      {#if split.kept.length > 0}
        <span data-testid="doc-retouch-kept">
          {tp('detailing.exports.retouchLocked', {
            n: split.kept.length, ids: split.kept.slice(0, 8).join(', '),
          })}
        </span>
      {/if}
      {#if split.replaced.length > 0}
        <span class="replaced" data-testid="doc-retouch-replaced">
          {tp('detailing.exports.retouchUnlocked', {
            n: split.replaced.length, ids: split.replaced.slice(0, 8).join(', '),
          })}
        </span>
      {/if}
    </p>
  {/if}

  {#if rows.length === 0}
    <!--
      An empty list means "we have no record", never "nothing was exported".
      `export-record.svelte.ts` is explicit that nothing in the UI may present it as a negative
      claim — a project opened from a file written before the field existed has an empty list
      and may well have had drawings issued from it.
    -->
    <p class="note" data-testid="export-log-empty">{t('detailing.exports.empty')}</p>
  {:else}
    <ul>
      {#each rows as r, i (`${r.at}-${r.kind}-${i}`)}
        <li data-testid={`export-record-${i}`} data-kind={r.kind}
            data-state={r.error ? 'failed' : stale(r) ? 'stale' : 'current'}>
          <p class="line">
            <span class="kind">{t(`detailing.exports.kind.${r.kind}`)}</span>
            <code class="file">{r.filename}</code>
            <span class="rev">{tp('detailing.exports.fromRevision', { n: r.revision })}</span>
            <span class="at">{when(r.at)}</span>
          </p>

          {#if r.error}
            <p class="failed" data-testid={`export-record-error-${i}`}>
              {tp('detailing.exports.failed', { error: r.error })}
            </p>
          {:else if stale(r)}
            <!-- The whole reason the record is kept. Stated, never coloured as a fault. -->
            <p class="stale" data-testid={`export-record-stale-${i}`}>
              {tp('detailing.exports.stale', { was: r.revision, now: current })}
            </p>
          {/if}

          <!-- What was in it, above what was retouched in it: the set before its qualifier. -->
          <p class="elements" data-testid={`export-record-elements-${i}`}>{elementsText(r)}</p>

          {#if retouchText(r)}
            <p class="retouch" data-testid={`export-record-retouch-${i}`}
               data-retouch={r.retouched.status}>{retouchText(r)}</p>
          {/if}
        </li>
      {/each}
    </ul>

    <!--
      What a browser export cannot assert, once, under the list.

      `EXPORT_CANNOT_ASSERT` rides on every record so the UI never has to remember the entries,
      and it is printed once rather than per row because it is true of all of them equally — a
      list that repeated four caveats beside four files is four caveats nobody reads.
    -->
    <ul class="cannot" data-testid="export-log-cannot">
      {#each rows[0].limitations as key (key)}
        <li>{t(key)}</li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .exports { margin-top: 0.75rem; border-top: 1px solid var(--st-hair); padding-top: 0.5rem; }
  h4 { margin: 0 0 0.3rem; font-size: 0.78rem; }
  /*
    `--st-text-2` and not `--st-text-3` for every SENTENCE here.

    `tokens.css` states what `--st-text-3` is for — glyphs and rules, under WCAG 2.1 §1.4.11's
    3:1 — and that "the 489 sites that used it as copy are the defect". At 0.7 rem on this
    surface it measures 3.74 against the 4.5 that copy needs, which is exactly what
    `h1c-documents-flow.spec.ts`'s contrast audit reported when this list first appeared.
  */
  .note { margin: 0; font-size: 0.7rem; color: var(--st-text-2); line-height: 1.4; }

  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  li { font-size: 0.72rem; }

  .line { display: flex; flex-wrap: wrap; gap: 0.3rem 0.5rem; margin: 0; align-items: baseline; }
  .kind { font-weight: 600; color: var(--st-text); }
  .file { font-family: var(--st-mono); font-size: 0.68rem; color: var(--st-text-2); }
  .rev, .at { font-size: 0.66rem; color: var(--st-text-2); }

  /* Stale is information: amber, and worded as a comparison rather than as a failure. */
  .stale { margin: 0.05rem 0 0; font-size: 0.68rem; color: var(--st-warn); }
  .failed { margin: 0.05rem 0 0; font-size: 0.68rem; color: var(--st-danger); }
  .elements, .retouch {
    margin: 0.05rem 0 0; font-size: 0.68rem; color: var(--st-text-2); line-height: 1.35;
  }
  /* "We have no record" is the one that must not read like "none": amber, like every other
     absence of a fact on this surface. */
  .retouch[data-retouch='unknown'] { color: var(--st-warn); }

  .split { margin: 0 0 0.35rem; font-size: 0.7rem; line-height: 1.4; color: var(--st-text-2); }
  .split > span { display: block; }
  /* What will NOT survive the next run is the half a reader has to act on. */
  .replaced { color: var(--st-warn); }

  ul.cannot {
    margin-top: 0.4rem;
    padding-left: 0.9rem;
    list-style: disc;
    font-size: 0.64rem;
    color: var(--st-text-2);
    line-height: 1.35;
  }
</style>
