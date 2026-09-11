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
  import { te } from '../../../lib/i18n/engine-text';
  import { verificationStore } from '../../../lib/store';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { bindingLabel } from '../../../lib/codes/roles';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { detailingAuthor } from '../../../lib/store/detailing-author.svelte';
  import { canOpenRebar3D, openRebar3D, rebar3DAssemblyCount } from '../../../lib/store/rebar-open';

  interface Props {
    /** Open the Project Regulations stage and put the caret in its selector. */
    onOpenRegulations: () => void;
  }
  const { onOpenRegulations }: Props = $props();

  const counts = $derived(verificationStore.providedSummary);
  const run = $derived(verificationStore.runSummary);

  const concreteBinding = $derived(regulationsStore.binding('concrete'));
  const concreteProblem = $derived(regulationsStore.concreteDesignProblem());
  const concreteReady = $derived(regulationsStore.concreteDesignCode() !== null);
  // The same labeller Project Regulations uses, so the read-out and the selector can never print
  // the regulation differently.
  const concreteLabel = $derived(te(bindingLabel(concreteBinding)));

  // ─── View 3-D model ─────────────────────────────────────────────
  //
  // The SAME operation as the command that stays in the command row and the one inside the
  // detailing section. All three call `openRebar3D`, so the cage on screen is a projection of the
  // one document instance the report, the schedule and the drawings render. Three places to reach
  // it, one thing that happens — which is the opposite of a duplicated button.
  let opening3d = $state(false);
  let open3dError = $state<string | null>(null);
  const canOpen3d = $derived(canOpenRebar3D());
  const assemblyCount = $derived(rebar3DAssemblyCount());

  /**
   * Why it cannot be opened yet, in words, on the page.
   *
   * A `title` is not an explanation: it is invisible to a keyboard user, invisible on a touch
   * screen, and gone the moment the pointer moves. The requirement is rendered next to the
   * disabled button as well, which is why this returns a list and not a tooltip string.
   */
  const blockers = $derived.by(() => {
    if (canOpen3d) return [];
    const out: string[] = [];
    if (verificationStore.providedSummary.total === 0) out.push(t('design.overview.need.design'));
    else if (detailingStore.assemblies.length === 0) out.push(t('design.overview.need.detailing'));
    else out.push(t('design.overview.need.coordinated'));
    return out;
  });

  /**
   * Build the document and open the workspace.
   *
   * ── Why the pending state does not DISABLE this button ─────────────
   *
   * It did, and that is what made Escape drop the user at the top of the document.
   *
   * Chromium blurs a focused control the moment it becomes disabled. `opening3d` is set before
   * this handler yields a frame, so the sequence was: click → the button disables → the browser
   * blurs it → `document.activeElement` is `<body>` → the overlay mounts and `captureFocus`
   * records `<body>` as the opener. `<body>` is connected, so the `isConnected` guard passes and
   * the restore focuses it — which `dialog-focus.ts` names as "the outcome this whole module
   * exists to prevent". Measured: `out← cmd-open-3d`, then `focus(BODY)`, with no
   * `focus(cmd-open-3d)` anywhere in the trace.
   *
   * So the control stays focusable and reports its pending state with `aria-busy` instead, and
   * re-entry is refused here rather than by taking the button away. The same defect one
   * component over is what `SelectionDetails` already documents about a button that unmounts
   * under the user's focus; this is the disabled form of it.
   */
  async function open3d() {
    if (opening3d) return;
    open3dError = null;
    opening3d = true;
    // Held across a frame so the pending state actually paints: the build is synchronous and can
    // take a noticeable moment on a large model.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const res = openRebar3D({
        author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
        at: new Date().toISOString(),
      });
      if (!res.ok) open3dError = t('detailing.doc.noCoordinated');
    } finally {
      opening3d = false;
    }
  }

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
  <div class="code-line">
    <span class="code-indicator" data-testid="active-concrete-code" class:unbound={!concreteReady}>
      <span class="code-role">{t('design.code.role')}</span>
      <span class="code-name">{concreteLabel}</span>
    </span>
    {#if !concreteReady && concreteProblem}
      <span class="code-gate" role="alert" data-testid="concrete-code-gate">
        {te(concreteProblem)}
        <button type="button" class="code-gate-link" data-testid="goto-project-regulations"
                onclick={onOpenRegulations}>{t('design.code.openRegulations')}</button>
      </span>
    {/if}
  </div>

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

  <!-- ── The one command: the result of everything else ───────────── -->
  <div class="open3d">
    <button
      type="button"
      class="open3d-btn"
      data-testid="overview-open-3d"
      onclick={open3d}
      disabled={!canOpen3d}
      aria-busy={opening3d ? 'true' : undefined}
    >
      <span aria-hidden="true">◫</span>
      {opening3d ? t('detailing.scene.opening') : t('detailing.scene.openMain')}
      {#if canOpen3d}
        <span class="n3d" data-testid="overview-open-3d-count">{assemblyCount}</span>
      {/if}
    </button>
    <!--
      The requirement is TEXT, beside the button, not only a tooltip. A disabled control that
      explains itself only on hover explains itself to nobody using a keyboard.
    -->
    {#if blockers.length > 0}
      <p class="need" data-testid="overview-open-3d-need">{blockers.join(' ')}</p>
    {/if}
    {#if open3dError}
      <p class="err" role="alert" data-testid="overview-open-3d-error">{open3dError}</p>
    {/if}
  </div>
</div>

<style>
  .overview { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.1rem 0 0.2rem; }

  .code-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.4rem; }
  .code-indicator { display: inline-flex; align-items: baseline; gap: 0.35rem; font-size: 0.72rem; }
  .code-role { color: var(--st-text-2); }
  .code-name { font-weight: 600; color: var(--st-text); }
  .code-indicator.unbound .code-name { color: var(--st-warn); }
  .code-gate { font-size: 0.68rem; color: var(--st-warn); display: inline-flex; gap: 0.35rem; flex-wrap: wrap; }
  .code-gate-link {
    background: none; border: 0; padding: 0;
    color: var(--st-interactive); text-decoration: underline; cursor: pointer;
    font-size: inherit;
  }
  .code-gate-link:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

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

  .open3d { display: flex; flex-direction: column; gap: 0.2rem; }
  .open3d-btn {
    align-self: flex-start;
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.25rem 0.7rem;
    border: 1px solid var(--st-interactive);
    border-radius: 4px;
    background: var(--st-surface-3);
    color: var(--st-text);
    font-size: 0.75rem; font-weight: 600;
    cursor: pointer;
  }
  .open3d-btn:hover:not(:disabled) { background: var(--st-hair-strong); }
  .open3d-btn:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  /* Disabled is dimmer and still legible — it has to be readable to be an instruction. */
  .open3d-btn:disabled { opacity: 0.6; cursor: not-allowed; border-color: var(--st-hair-strong); }
  .n3d {
    font-size: 0.66rem; font-weight: 700;
    padding: 0 0.3rem; border-radius: 3px;
    background: var(--st-surface); color: var(--st-text-2);
  }
  .need { margin: 0; font-size: 0.66rem; color: var(--st-text-2); }
  .err { margin: 0; font-size: 0.66rem; color: var(--st-danger); }
</style>
