<script lang="ts">
  /**
   * Coordinated detailing workflow.
   *
   * Assembly list on the left, sheet preview and schedule on the right, review panel
   * below. Three things this UI exists to make impossible to miss:
   *
   *   1. the review state an assembly has EARNED, and what is blocking the next one;
   *   2. that a provisional calculation is provisional, before anyone signs it off;
   *   3. that software approval is not professional sign-off.
   *
   * Nothing here can set REVIEWED or ISSUED on its own — the engine refuses, and the
   * refusal reason is shown verbatim rather than being turned into a disabled button
   * with no explanation.
   */
  import { t, tp } from '../../../lib/i18n';
  import SheetPreview from './SheetPreview.svelte';
  import DetailingProblems from './DetailingProblems.svelte';
  import RcBarList from './RcBarList.svelte';
  import RcTitleBlockFields from './RcTitleBlockFields.svelte';
  import RcBendingSchedule from './RcBendingSchedule.svelte';
  import RcEditNotice from './RcEditNotice.svelte';
  import { uiStore } from '../../../lib/store';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { detailingSheet } from '../../../lib/store/detailing-sheet.svelte';
  import { REVIEW_STATES, reviewRank } from '../../../lib/engine/detailing/assembly';
  import { maturityLabelKey } from '../../../lib/codes/maturity';
  import { rcConflictLabel } from '../../../lib/flow/rc-bar-label';

  /** Bound to the sheet dialog, so a conflict can open the drawing it is on. */
  let sheetOpen = $state(false);

  /**
   * Whether the level list is showing.
   *
   * Open by default the first time — a reviewer arriving at a multi-level building needs to see
   * that there ARE levels. Closing it is what gives the sheet the full panel width, which is the
   * whole point: the list used to hold a third of the panel permanently while the drawing, the
   * thing being reviewed, was cropped in the remainder.
   */
  let listOpen = $state(true);

  /** Conflicts across every assembly, for the one-line result. */
  const totalConflicts = $derived(
    detailingStore.assemblies.reduce(
      (n, a) => n + (a.conflicts ?? []).filter((c) => c.severity !== 'marginal').length, 0));

  const selected = $derived(detailingStore.selected);

  /**
   * Follow a conflict to the member it is in.
   *
   * `BarConflict.elementIds` exists for exactly this and nothing consumed it: the reviewer read
   * `barA / barB`, wrote the number down, and went looking. Selecting the element is what the
   * rest of the app already listens to — the design table scrolls to it, the 3-D scene isolates
   * it — so the conflict list gets that behaviour by routing rather than by reimplementing it.
   */
  function goToMember(elementId: number) {
    uiStore.selectElement(elementId);
  }

  /**
   * Bar id → drawing mark, for the selected assembly.
   *
   * `assignMarks` groups identical fabricated items and records the ids that share each mark,
   * so this is a read of what the coordination already decided rather than a second marking.
   * A bar with no mark is absent from the map on purpose — see `rcBarLabel`.
   */
  const markOf = $derived.by(() => {
    const m = new Map<string, string>();
    for (const mk of selected?.marks ?? []) for (const id of mk.barIds) m.set(id, mk.mark);
    return m;
  });

  /**
   * Members of this assembly whose OWN design is a proposal.
   *
   * The assembly's own field. It is what `scene-model.ts` builds the 3-D view's
   * `provisionalMembers` from and what the workspace banner counts, so the bar list, the viewer
   * and the banner are three readings of one fact rather than three derivations of it. Deriving
   * it here from bar ownership is the specific mistake `provisionalMembersOf` documents.
   */
  const provisionalMembers = $derived(new Set(selected?.provisionalMembers ?? []));

  /** Bar id → the bar, so a conflict can name the two it involves instead of quoting their keys. */
  const barById = $derived.by(() => {
    const m = new Map<string, (typeof detailingStore.assemblies)[number]['bars'][number]>();
    for (const b of selected?.bars ?? []) m.set(b.id, b);
    return m;
  });

  /**
   * The conflicts, named.
   *
   * Resolved here rather than inside `DetailingProblems` because the join needs the assembly's
   * bars and its marks, and that component is deliberately given facts rather than sources — it
   * "ranks and routes, and computes nothing". A conflict whose bar is not in this assembly keeps
   * its key as the label; `rcConflictSide` reports that, and the component renders it as the
   * reference text it is.
   */
  const conflictLabels = $derived(detailingStore.conflicts.map((c) =>
    rcConflictLabel(c, (id) => barById.get(id), (id) => markOf.get(id))));

</script>


<!--
  A summary and a collapsible list, above a preview that gets the width.

  The list of levels was a permanent 9–16rem column in a panel about 34rem wide, so the sheet — the
  thing a reviewer actually reads — lived in the remaining eighteen and came out cropped. Levels are
  navigation, and navigation does not need a third of the screen at all times.

  Collapsed, the list becomes one line naming the level you are on; the preview takes the full
  width. Nothing is removed: the same list, the same `detailingStore.select`, one click away.
-->
<div class="detailing" data-testid="detailing-workflow" data-list={listOpen ? 'open' : 'closed'}>
  <div class="topbar" data-testid="detailing-topbar">
    <p class="result" data-testid="detailing-result">
      {#if detailingStore.assemblies.length === 0}
        {t('detailing.result.none')}
      {:else}
        {tp('detailing.result.summary', {
          n: detailingStore.assemblies.length,
          conflicts: totalConflicts,
        })}
      {/if}
    </p>
    <button
      type="button"
      class="list-toggle"
      data-testid="detailing-list-toggle"
      aria-expanded={listOpen}
      aria-controls="detailing-assembly-list"
      onclick={() => (listOpen = !listOpen)}
    >
      <span aria-hidden="true">{listOpen ? '◧' : '▤'}</span>
      {listOpen ? t('detailing.list.hide') : t('detailing.list.show')}
      {#if !listOpen && selected}
        <span class="current-level" data-testid="detailing-current-level">{selected.label}</span>
      {/if}
    </button>
  </div>

  <!-- What the last reinforcement edit invalidated, and the command that answers it. -->
  <RcEditNotice />

  <aside
    class="assemblies"
    id="detailing-assembly-list"
    aria-label={t('detailing.assemblies')}
    hidden={!listOpen}
  >
    <h4>{t('detailing.assemblies')}</h4>
    {#if detailingStore.assemblies.length === 0}
      <!--
        The empty state used to read "run the detailing pipeline from the design tab",
        which described a control that did not exist. It is now the control itself, plus
        the exact prerequisites when it cannot run.
      -->
      <div class="empty" data-testid="detailing-empty">
        <p>{t('detailing.emptyTitle')}</p>
        <button class="generate" data-testid="detailing-empty-generate"
                onclick={() => detailingStore.generate()}
                disabled={!detailingStore.readiness.ready || detailingStore.generating}>
          {detailingStore.generating
            ? t('detailing.cmd.generating') : t('detailing.cmd.generate')}
        </button>
        {#if !detailingStore.readiness.ready}
          <ul class="prereqs" data-testid="detailing-empty-prereqs">
            {#each detailingStore.readiness.prerequisites as p (p.key)}
              <li>{tp(p.key, { n: p.count, ids: p.elementIds.slice(0, 6).join(', ') })}</li>
            {/each}
          </ul>
        {/if}
        {#if detailingStore.lastError}
          <p class="err" role="alert" data-testid="detailing-error">{detailingStore.lastError}</p>
        {/if}
      </div>
    {:else}
      <ul role="listbox" aria-label={t('detailing.assemblies')}>
        {#each detailingStore.assemblies as a (a.id)}
          <li>
            <button
              role="option"
              aria-selected={a.id === detailingStore.selectedId}
              class:selected={a.id === detailingStore.selectedId}
              data-testid={`assembly-${a.id}`}
              onclick={() => detailingStore.select(a.id)}
            >
              <span class="label">{a.labelKey ? tp(a.labelKey, a.labelParams ?? {}) : a.label}</span>
              <span class="state state-{a.state.toLowerCase()}">{t(`detailing.state.${a.state}`)}</span>
              {#if a.maturity !== 'VALIDATED'}
                <span class="maturity">{t(maturityLabelKey(a.maturity))}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <section class="detail" aria-live="polite">
    {#if !selected}
      <p class="empty">{t('detailing.selectOne')}</p>
    {:else}
      <header>
        <h4>{selected.label}</h4>
        <div class="badges">
          <span class="state state-{selected.state.toLowerCase()}" data-testid="assembly-state">
            {t(`detailing.state.${selected.state}`)}
          </span>
          <span class="rev">{tp('detailing.revision', { n: selected.detailingRevision })}</span>
          {#if selected.maturity !== 'VALIDATED'}
            <span class="maturity" data-testid="assembly-maturity">
              {t(maturityLabelKey(selected.maturity))}
            </span>
          {/if}
          {#if detailingStore.superseded}
            <span class="superseded" data-testid="assembly-superseded">{t('detailing.superseded')}</span>
          {/if}
        </div>
      </header>

      <!-- Progress through the review states, with what is blocking the next one. -->
      <ol class="progress" aria-label={t('detailing.progress')}>
        {#each REVIEW_STATES.slice(1) as s (s)}
          <li
            class:done={reviewRank(selected.state) >= reviewRank(s)}
            aria-current={selected.state === s ? 'step' : undefined}
          >{t(`detailing.state.${s}`)}</li>
        {/each}
      </ol>

      <!--
        Everything wrong with this assembly, ranked, directly under the header.

        These were three separate notices scattered down the column — warnings above the bar list,
        blockers below it, conflicts below those — so the thing that stops a sheet being issued
        was further from the eye than the thing that merely annotates it. See
        `DetailingProblems.svelte` for why the order is the whole point.
      -->
      <DetailingProblems
        conflicts={detailingStore.conflicts}
        conflictLabels={conflictLabels}
        conflictIndex={detailingStore.conflictIndex}
        stateBlockers={selected.stateBlockers ?? []}
        unsupported={selected.unsupported}
        stateLabel={t(`detailing.state.${selected.state}`)}
        onSelectConflict={(i) => detailingStore.goToConflict(i)}
        onPrev={() => detailingStore.prevConflict()}
        onNext={() => detailingStore.nextConflict()}
        onGoToMember={goToMember}
        onShowOnSheet={() => { sheetOpen = true; }}
      />

      <!--
        Longitudinal reinforcement, bar by bar, with the lock control the coordination
        pipeline honours. Without this the "locked bars survive regeneration" guarantee is
        real in the engine and unreachable in the product.

        The list itself is `RcBarList.svelte`, mounted once. It leads with the MARK rather than
        the engine's key, and says which of the three states each bar is in; both decisions live
        in `rc-bar-label.ts` and `rc-bar-status.ts` so they can be asserted without a browser.
        It moved out because this panel is at its 600-line ceiling and objective 5 adds to it.
      -->
      <RcBarList
        bars={selected.bars}
        markOf={markOf}
        provisionalMembers={provisionalMembers}
        onToggleLock={(id) => detailingStore.toggleLock(id)}
      />

      <div class="sheet-controls">
        <fieldset>
          <legend>{t('detailing.sheet')}</legend>
          <label>
            <input
              type="radio" name="sheetKind" value="elevation"
              data-testid="sheet-kind-elevation"
              checked={detailingSheet.kind === 'elevation'}
              onchange={() => detailingSheet.setKind('elevation')}
            />
            {t('detailing.sheet.elevation')}
          </label>
          <label>
            <input
              type="radio" name="sheetKind" value="section"
              data-testid="sheet-kind-section"
              checked={detailingSheet.kind === 'section'}
              onchange={() => detailingSheet.setKind('section')}
            />
            {t('detailing.sheet.section')}
          </label>

          <!--
            Where the section is cut.

            `sectionAt` was initialised to zero and NOTHING set it, so every section sheet in
            the app was a cut at the model's origin — a column line on a framed building, which
            is why the section came out as a tall slice down a column instead of the beam
            section it was opened for. The store now defaults it to mid-span of the longest
            member on the sheet; this is how a reviewer moves it somewhere else.

            A number input and not a slider: a station is a coordinate an engineer reads off
            their own plan, and typing 4,25 is the gesture. The range is stated on the control
            so what it accepts is visible rather than discovered by being refused.
          -->
          {#if detailingSheet.kind === 'section' && detailingSheet.sectionRange}
            {@const r = detailingSheet.sectionRange}
            <label class="station">
              <span>{t('detailing.sheet.station')}</span>
              <input
                type="number"
                data-testid="sheet-station"
                step="0.05"
                min={r.min.toFixed(2)}
                max={r.max.toFixed(2)}
                value={detailingSheet.sectionAt.toFixed(2)}
                onchange={(e) => {
                  const v = Number((e.currentTarget as HTMLInputElement).value);
                  if (Number.isFinite(v)) detailingSheet.setSectionAt(v);
                }}
              />
              <span class="range" data-testid="sheet-station-range">
                {tp('detailing.sheet.stationRange', {
                  min: r.min.toFixed(2), max: r.max.toFixed(2),
                })}
              </span>
            </label>
          {/if}
        </fieldset>
      </div>

      <!--
        The rótulo, under the sheet controls and OUTSIDE them.

        It is not a sheet control: the kind and the station choose which drawing you are
        looking at, and the rótulo is a property of the project that every drawing carries. It
        sat inside `.sheet-controls` for one commit and the cost was immediate —
        `detailing-sheet-fieldset.spec.ts` locates that group as `.sheet-controls fieldset` and
        a second fieldset there made the locator ambiguous. The spec was right about the
        grouping; the markup was wrong.

        Its own component because this panel is at its 600-line ceiling, and because the
        author's half and the app's half of a title block need different controls — see
        `RcTitleBlockFields.svelte`.
      -->
      <RcTitleBlockFields />

      <!--
        The sheet, with a title and a way to see it properly.

        It was a bare `<div>` of SVG in a column a few hundred pixels wide: a 1:50 elevation
        squeezed into a thumbnail, clipped on the right, with nothing saying which assembly,
        which level or which kind of sheet you were looking at. A drawing you cannot read is not
        a preview of a drawing.

        Expanding opens the SAME `detailingSheet.svg` in a full-window dialog — the official
        sheet projection, not a second renderer — so what you enlarge is exactly what the DXF and
        the report carry.
      -->
      <SheetPreview assemblyLabel={selected?.label ?? ''} bind:open={sheetOpen} />

      <!--
        The bending schedule, with a diagram per shape.

        It printed `shapeCode`'s grouping key — `LH90`, `bent3` — in the Shape column, which is
        what `assignMarks` groups on and not something a bender can fabricate from. The table
        and its diagrams are `RcBendingSchedule.svelte`; this panel is at its 600-line ceiling.
      -->
      <RcBendingSchedule />

      <!-- ── Documents ──────────────────────────────────────────────
           All three exports build from ONE DocumentModel, so a report, a drawing set and
           a schedule of the same floor cannot disagree about what they describe. -->
      <!--
        Documents and professional review moved OUT, to `DocumentsSection.svelte`.

        The report, the drawings, the schedule, the 3-D view, the provisional acknowledgements and
        `Issue for construction` used to live at the bottom of this panel: to reach the control
        that issues drawings for construction you opened detailing, selected an assembly, and
        scrolled past the bar list, the conflicts, the sheet and the schedule. They are a stage of
        the workflow, so they are a stage of the panel.
      -->
    {/if}
  </section>
</div>

<style>
  /*
    ── One column, stated once, instead of a grid that was never on ───

    Five declarations stood here and reached nothing: `grid-template-columns` and `gap` on
    `.detailing`, a second `grid-template-columns` under `[data-list='closed']`,
    `grid-column: 1 / -1` on `.topbar`, and a `@container (max-width: 34rem)` that collapsed the
    whole thing to one track.

    `.detailing` never declared `display: grid`. Measured in the browser: `display: block`,
    `grid-template-columns: minmax(128px, 192px) minmax(0px, 1fr)` — computed and inert — and
    `container-type: normal`, so the container query had no container to resolve against and was
    asking about the WINDOW, which is the exact defect the comment that stood here claimed to
    have fixed. The panel has been a single stacked column at every width since the day it was
    written, and `pro-detailing-layout.spec.ts` says so in its own words: "at 1280×720 the right
    panel is about 540 px … so the section is ALREADY one column".

    So the single column is DECLARED rather than arrived at by accident, and `data-list` decides
    only whether the list is IN it — through the `hidden` attribute, which is a question about
    what the reader asked for and not about tracks.

    Nothing moves: this is the layout that has been on screen. What goes is a description of a
    different one — and the grid was the wrong idea for this surface, not a typo. At 540 px an
    8–12 rem list beside the drawing leaves the drawing about 380, which is the crop the list
    toggle exists to undo.
  */
  .topbar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid var(--st-hair);
  }
  .result { margin: 0; font-size: 0.7rem; color: var(--st-text-2); }

  .list-toggle {
    display: inline-flex; align-items: baseline; gap: 0.3rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: none;
    color: var(--st-text-2);
    font-size: 0.68rem;
    cursor: pointer;
  }
  .list-toggle:hover { background: var(--st-surface-3); color: var(--st-text); }
  .list-toggle:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .current-level { font-weight: 600; color: var(--st-text); }

  .detailing {
    /* `block`, which is what it has always computed to. Declared so the next reader does not
       have to prove it, and NOT changed to a flex column: a `gap` there would move every child
       and this edit is a correction to the description, not to the layout. */
    display: block;
    padding: 0.75rem;
    font-size: 0.85rem;
    height: 100%;
    overflow: auto;
  }
  h4 { margin: 0 0 0.4rem; font-size: 0.9rem; }
  .empty { opacity: 0.7; }
  ul { list-style: none; margin: 0; padding: 0; }
  .assemblies button { width: 100%; text-align: left; padding: 0.4rem 0.5rem; display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; background: none; border: 1px solid transparent; border-radius: 4px; color: inherit; cursor: pointer; }
  .assemblies button.selected { border-color: currentColor; background: var(--st-selected-bg); }
  .assemblies button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
  .label { flex: 1; }
  header { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: baseline; }
  .badges { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .state, .maturity, .rev, .superseded { font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 3px; }
  .state { background: var(--st-surface-3); }
  .state-constructible, .state-reviewed, .state-issued { background: var(--st-surface-3); color: var(--st-text); }
  /* Provisional, stale and superseded are never green. */
  .maturity { background: var(--st-surface-3); color: var(--st-text); }
  /* An opaque `--st-accent` fill with `--st-text` on it measures **3.69** — under AA, on a
     0.7rem chip. The tint-plus-rule form is 12.82 at worst and is what the rest of this
     surface already uses for a failure. */
  .superseded {
    background: var(--st-danger-bg); color: var(--st-text);
    border: 1px solid var(--st-danger);
  }
  .progress { list-style: none; display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.5rem 0; padding: 0; }
  .progress li { font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: 3px; background: var(--st-surface-3); opacity: 0.6; }
  /*
     `--st-text` on `--st-green` measures 4.06, and no text colour fixes it: dark ink on that
     fill is 4.18. `tokens.css` says why — the plain hues are "for fills, rules and figures,
     where area carries the meaning", not for a 0.7rem label sitting on top of one.

     So `done` keeps the base well and signals with `--st-ok` at 4.88, full opacity against the
     0.6 of the steps still to come. `[aria-current='step']` already outlines the current one,
     so the three states stay distinguishable without a filled chip.
  */
  .progress li.done { opacity: 1; color: var(--st-ok); }
  .progress li[aria-current='step'] { outline: 1px solid currentColor; }
  .notice { margin: 0.4rem 0; padding: 0.4rem 0.55rem; border-radius: 4px; line-height: 1.35; }
  .notice.warning { background: var(--st-surface-3); color: var(--st-text); }
  .notice.error {
    background: var(--st-danger-bg); color: var(--st-text);
    border-left: 3px solid var(--st-danger);
  }
  .ok { color: var(--st-ok); }
  /*
    The bar list's rules left with the bar list, to `RcBarList.svelte`. Svelte scopes styles per
    component, so a copy kept here would not reach those rows anyway — it would be dead text that
    the next reader has to prove is dead. `.conflict-nav` went the same way when the conflicts
    moved to `DetailingProblems.svelte`, and was still here.
  */
  /*
    The sheet's control group, on the same footing as every other one.

    `ProReportDialog` and `ProAutoLoadsDialog` both style their fieldsets as
    `1px solid var(--st-surface-3)` with the legend in `var(--st-text-2)`. This one had a
    hand-written `rgba(143, 163, 179, 0.35)` — which is `--st-hair-strong` (0.38) rewritten
    by hand — and no legend colour at all, so it inherited. It was the one group in the
    panel that did not match the others, and it is what PR20's handoff named as still open.
  */
  fieldset { border: 1px solid var(--st-surface-3); border-radius: 4px; padding: 0.3rem 0.5rem; }
  legend { font-size: 0.75rem; padding: 0 0.3rem; color: var(--st-text-2); }

  /* The station sits on its own line: it is a value, not a third choice among the two kinds. */
  .station {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
    margin-top: 0.25rem;
    font-size: 0.72rem;
  }
  .station input {
    width: 5.5rem;
    padding: 0.1rem 0.3rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
  .station input:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  /* What the control accepts, stated rather than discovered by being refused. */
  .station .range { color: var(--st-text-3); font-size: 0.66rem; }

  /*
    The schedule's rules left with the schedule, to `RcBendingSchedule.svelte`. Svelte scopes
    styles per component, so a copy kept here would not reach those cells anyway — it would be
    dead text the next reader has to prove is dead, which is what the bar list's rules were.
  */

  /*
    ── Eighteen selectors for markup this panel no longer has ─────────

    `.documents`, `.doc-actions`, `.doc-state`, `.badge`, the four `.badge-*` chips,
    `.superseded-docs`, `.review`, `.disclaimer`, `.field`, `.ack` and `.actions` styled the
    report buttons, the review form and the readiness chips — all of which moved to
    `DocumentsSection.svelte` when Documents became a stage of the panel rather than the tail of
    this one. Svelte scopes styles to the declaring component, so not one of them had reached
    anything since; `DocumentsSection` carries its own.

    Only THREE of the eighteen were REPORTED, and that is the reason to delete the rest rather
    than wait for the build to name them: `h5`, `.field input` and `.field textarea` are all it
    flags, because Svelte's unused-selector pass does not report a bare class selector it cannot
    prove unreachable. So the build kept saying "three" about eighteen, and the fifteen silent
    ones are exactly the decoys `.autosave-banner` taught this tree about — a rule left behind
    after its markup leaves is not a spare, it is something the next person edits expecting an
    effect. Two of them even carry measured contrast ratios, which is what makes them convincing.

    `h5` is the eighteenth: the only `<h5>` in this panel's markup left with the bar list.

    The `@container (max-width: 34rem)` that stood at the end went too — see the note at the top
    of this block for why it never had a container to ask.
  */
</style>
