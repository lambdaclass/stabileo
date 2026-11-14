<script lang="ts">
  /**
   * Where the project stands — at the top, where it is read first.
   *
   * ── The problem this exists for ────────────────────────────────────
   *
   * The regulation in force and the state of every member were the LAST things in the tab. They
   * lived inside the command bar, which sits below three collapsible stages, so on a 720 px window
   * a reviewer opened the Design tab, scrolled past regulations, floors and detailing, and only
   * then learned that the project was being checked against CIRSOC 201 (2025) and that five
   * members do not verify. That is the first question, answered last.
   *
   * It is also how it was PRESENTED. A single wrapping monospace line —
   * `203 bars ✓145 verified ⚠48 warning ✗5 fail ◐5 provisional ○0 unverified ⌛0 stale |` — is
   * complete and honest and nearly unreadable: seven counts with no grouping, no ranking, and a
   * trailing pipe left over from a separator whose right-hand side was empty.
   *
   * ── What it is, and what it is not ─────────────────────────────────
   *
   * It is a READ-OUT plus one command. Every number comes from `verificationStore`, unchanged and
   * unrounded; nothing here computes a structural fact and nothing here designs. The single
   * command is `View 3-D model`, which builds a document from work that already exists.
   *
   * The counts are ranked — what failed, then what was flagged, then what is merely absent — and
   * each carries a glyph, a number and a word, so the state survives the colour being removed.
   * They are not chips on a saturated background; the emphasis is weight and order.
   */
  import { t, tp } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store';
  import ActiveConcreteCode from './ActiveConcreteCode.svelte';
  import { projectVerdict, projectVerdictLines } from '../../../lib/store/member-verdict';

  interface Props {
    /** Open the Project Regulations stage and put the caret in its selector. */
    onOpenRegulations: () => void;
  }
  const { onOpenRegulations }: Props = $props();

  const counts = $derived(verificationStore.providedSummary);
  const project = $derived.by(() => { void counts; return projectVerdict(); });
  const projectLines = $derived(projectVerdictLines(project, tp));
  const run = $derived(verificationStore.runSummary);

  /**
   * The counts, ranked and grouped.
   *
   * `tone` drives weight and a single accent, never the meaning: every row carries its glyph and
   * its word regardless. `always` marks the states that must show a zero — "0 provisional" is a
   * fact a reviewer needs, while "0 sections inadequate" is noise from a run that had none.
   */
  /**
   * The run's own outcomes, shown only when the run produced them.
   *
   * These three are a variable set — a run with no inadequate section has nothing to say about
   * one — so they are a list. The six DISPLAY counts below are not: they are a fixed set that
   * must always show, including their zeroes, and they are written out one by one in the markup.
   */
  const runRows = $derived(run ? ([
    { testid: 'summary-count-section-inadequate', glyph: '▣', n: run.sectionInadequate, label: t('design.counts.sectionInadequate') },
    { testid: 'summary-count-exhausted', glyph: '◌', n: run.searchExhausted, label: t('design.counts.exhausted') },
    { testid: 'summary-count-unsupported', glyph: '—', n: run.unsupported, label: t('design.counts.unsupported') },
  ].filter((r) => r.n > 0)) : []);
</script>

<div class="overview" data-testid="design-overview">
  <!-- ── The regulation the numbers below were produced under ────── -->
  <ActiveConcreteCode {onOpenRegulations} />

  <!-- ── What the members are ─────────────────────────────────────── -->
  <div class="counts" data-testid="design-counts" aria-live="polite">
    <p class="total" data-testid="summary-count-total">
      {tp('design.counts.total', { n: counts.total })}
    </p>

    {#if counts.total === 0}
      <p class="empty" data-testid="design-overview-empty">{t('design.overview.empty')}</p>
    {:else}
      <!--
        Six rows, written out rather than looped.

        A loop renders the same DOM and hides every binding from anything that reads the source —
        including `run-summary-reported.test.ts` and `provisional-presentation.test.ts`, which
        exist to prove that each bucket reaches a visible chip and that the proposal count comes
        from the DISPLAY status rather than from the run outcome. Both went quiet the moment
        `data-testid` became a template and `counts.provisional` became a table entry. The set is
        fixed at six and always shows its zeroes, so there is nothing a loop was buying.

        Ranked: what failed, then what was flagged, then what is merely absent, then what passed.
      -->
      <ul class="rows">
        <li class="row tone-bad" data-testid="summary-count-fail">
          <span class="glyph" aria-hidden="true">✗</span>
          <span class="n">{counts.fail}</span>
          <span class="label">{t('design.counts.fail')}</span>
        </li>
        <li class="row tone-warn" data-testid="summary-count-warn">
          <span class="glyph" aria-hidden="true">⚠</span>
          <span class="n">{counts.warn}</span>
          <span class="label">{t('design.counts.warn')}</span>
        </li>
        <!--
          A proposal is its own thing: neither a pass nor a failure, and never folded into one.
          It gets its own tone — the violet every other surface paints a proposal with — rather
          than the amber of a warning, because a retained candidate is not something gone wrong.
        -->
        <li class="row tone-prov" data-testid="summary-count-provisional">
          <span class="glyph" aria-hidden="true">◐</span>
          <span class="n">{counts.provisional}</span>
          <span class="label">{t('design.counts.provisional')}</span>
        </li>
        <li class="row tone-warn" data-testid="summary-count-stale">
          <span class="glyph" aria-hidden="true">⌛</span>
          <span class="n">{counts.stale}</span>
          <span class="label">{t('design.counts.stale')}</span>
        </li>
        <li class="row tone-muted" data-testid="summary-count-unavailable">
          <span class="glyph" aria-hidden="true">○</span>
          <span class="n">{counts.unavailable}</span>
          <span class="label">{t('design.counts.unavailable')}</span>
        </li>
        <li class="row tone-ok" data-testid="summary-count-verified">
          <span class="glyph" aria-hidden="true">✓</span>
          <span class="n">{counts.ok}</span>
          <span class="label">{t('design.counts.verified')}</span>
        </li>
      </ul>
      <!--
        The counts above are the members' VERDICTS (`member-verdict.ts`): a member whose local
        checks pass and that is held (slab-column point joint, a detailing condition open, its
        deflection, a refusal, seismic checks only as a substitute) is counted with what does not
        verify or was not verified, never with «verificadas». How many of those passed their local
        checks is said apart, and the project's verdict under it, with each reason and its count.
      -->
      {#if counts.held > 0}
        <p class="held" data-testid="summary-count-held"><span class="n">{counts.held}</span> {t('verdict.counts.held')}</p>
      {/if}
      <div class="project-verdict" data-testid="project-verdict" data-state={project.state}>
        <strong>{t('verdict.project.title')}:</strong> <span data-testid="project-verdict-state">{projectLines.state}</span>
        {#if projectLines.reasons.length}
          <ul class="pv-reasons" data-testid="project-verdict-reasons">{#each projectLines.reasons as r (r)}<li>{r}</li>{/each}</ul>
        {/if}
      </div>

      {#if runRows.length > 0 || run?.aborted || (run?.notReached ?? 0) > 0}
        <ul class="rows run-rows" data-testid="design-run-outcomes">
          {#each runRows as r (r.testid)}
            <li class="row tone-warn" data-testid={r.testid}>
              <span class="glyph" aria-hidden="true">{r.glyph}</span>
              <span class="n">{r.n}</span>
              <span class="label">{r.label}</span>
            </li>
          {/each}
          {#if run?.aborted}
            <li class="row tone-bad" data-testid="summary-aborted">
              <span class="label">{t('design.cmd.aborted')}</span>
            </li>
          {/if}
          {#if (run?.notReached ?? 0) > 0}
            <li class="row tone-warn" data-testid="summary-not-reached">
              <span class="label">{tp('design.cmd.truncated', { notReached: run?.notReached ?? 0 })}</span>
            </li>
          {/if}
        </ul>
      {/if}
    {/if}
  </div>
</div>

<style>
  .held { margin: 4px 0 0; font-size: 0.72rem; color: var(--st-text-2); }
  .project-verdict { margin-top: 6px; font-size: 0.74rem; }
  .pv-reasons { margin: 2px 0 0 1rem; padding: 0; font-size: 0.7rem; color: var(--st-text-2); }

  .overview { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.1rem 0 0.2rem; }


  .total { margin: 0 0 0.2rem; font-size: 0.75rem; font-weight: 600; color: var(--st-text); }
  .empty { margin: 0; font-size: 0.7rem; color: var(--st-text-2); }

  /*
    A grid, not a wrapping line.

    Fixed columns for the glyph and the number mean the numbers line up under each other and can
    be compared at a glance — which is the entire job of a summary and the thing a run-on
    monospace line makes impossible.
  */
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.05rem 0.6rem;
          grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); }
  .run-rows { margin-top: 0.3rem; padding-top: 0.3rem; border-top: 1px solid var(--st-hair); }
  .row {
    display: grid;
    grid-template-columns: 1rem 2.2rem 1fr;
    align-items: baseline;
    gap: 0.3rem;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }
  .glyph { text-align: center; }
  .n { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: var(--st-text); }
  .label { overflow: hidden; text-overflow: ellipsis; }

  /* Colour is the third channel, after the glyph and the word. Never the only one. */
  .tone-ok .glyph { color: var(--st-ok); }
  .tone-warn .glyph { color: var(--st-warn); }
  .tone-bad .glyph, .tone-bad .n { color: var(--st-danger); }
  .tone-muted { color: var(--st-text-3); }
  /*
     The same violet the 3-D view paints provisional steel with, and `OutcomeBadge`,
     `RebarStatusPanel` and `ProvisionalBanner` name the state with.

     MERGED. This chip arrives from `feat/pro-steel-family` as the literal `#a066d3`, with a
     comment explaining that a `var()` would break the agreement with `three/rebar-scene.ts`,
     which feeds `0xa066d3` to a Three.js material and cannot read a custom property. That was
     true when it was written and is not true here: H1 created `--st-provisional` for exactly
     this, and rule 3 of `shared-status-tokens.test.ts` holds it equal to what Three.js paints,
     compared as a RESOLVED colour. The agreement is kept by a test rather than by two copies of
     a hex, which is the stronger of the two arrangements — and it is the same conclusion H1
     already reached one file over, in `OutcomeBadge`'s `.badge-provisional`.

     So the token, not the literal: `concrete-design-raw-colours.test.ts` gives this file a
     ceiling of zero and it stays at zero, with nothing about the colour left to chance.
  */
  .tone-prov .glyph, .tone-prov .n { color: var(--st-provisional); }

</style>
