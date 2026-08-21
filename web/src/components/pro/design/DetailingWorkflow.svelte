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
  import { uiStore } from '../../../lib/store';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { REVIEW_STATES, reviewRank } from '../../../lib/engine/detailing/assembly';
  import { maturityLabelKey } from '../../../lib/codes/maturity';

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
      -->

      <details class="bars" data-testid="bar-list">
        <summary>{tp('detailing.barsCount', { n: selected.bars.length })}</summary>
        <ul class="barlist">
          {#each selected.bars as bar (bar.id)}
            <li data-testid={`bar-${bar.id}`} class:locked={bar.locked}>
              <span class="bar-id">{bar.id}</span>
              <span class="bar-dia">Ø{bar.diameterMm}</span>
              <span class="bar-len">{bar.cuttingLength.toFixed(2)} m</span>
              <span class="bar-role">{t(`detailing.barRole.${bar.role}`)}</span>
              <button data-testid="bar-lock" class="lock"
                      aria-pressed={bar.locked === true}
                      onclick={() => detailingStore.toggleLock(bar.id)}>
                {bar.locked ? t('detailing.unlockBar') : t('detailing.lockBar')}
              </button>
            </li>
          {/each}
        </ul>
      </details>

      <div class="sheet-controls">
        <fieldset>
          <legend>{t('detailing.sheet')}</legend>
          <label>
            <input
              type="radio" name="sheetKind" value="elevation"
              data-testid="sheet-kind-elevation"
              checked={detailingStore.sheetKind === 'elevation'}
              onchange={() => detailingStore.setSheetKind('elevation')}
            />
            {t('detailing.sheet.elevation')}
          </label>
          <label>
            <input
              type="radio" name="sheetKind" value="section"
              data-testid="sheet-kind-section"
              checked={detailingStore.sheetKind === 'section'}
              onchange={() => detailingStore.setSheetKind('section')}
            />
            {t('detailing.sheet.section')}
          </label>
        </fieldset>
      </div>

      <!--
        The sheet, with a title and a way to see it properly.

        It was a bare `<div>` of SVG in a column a few hundred pixels wide: a 1:50 elevation
        squeezed into a thumbnail, clipped on the right, with nothing saying which assembly,
        which level or which kind of sheet you were looking at. A drawing you cannot read is not
        a preview of a drawing.

        Expanding opens the SAME `detailingStore.sheetSvg` in a full-window dialog — the official
        sheet projection, not a second renderer — so what you enlarge is exactly what the DXF and
        the report carry.
      -->
      <SheetPreview assemblyLabel={selected?.label ?? ''} bind:open={sheetOpen} />

      {#if detailingStore.schedule}
        {@const s = detailingStore.schedule}
        <!-- A wide schedule scrolls itself rather than widening the panel around it. -->
        <div class="scroll-x">
        <table class="schedule" data-testid="schedule">
          <caption>{t('detailing.schedule')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('detailing.mark')}</th>
              <th scope="col">Ø</th>
              <th scope="col">{t('detailing.shape')}</th>
              <th scope="col">{t('detailing.schedule.purpose')}</th>
              <th scope="col">{t('detailing.qty')}</th>
              <th scope="col">{t('detailing.cutLength')}</th>
              <th scope="col">{t('detailing.mass')}</th>
            </tr>
          </thead>
          <tbody>
            {#each s.rows as r (r.mark)}
              <tr>
                <td>{r.mark}</td><td>{r.diameterMm}</td><td>{r.shape}</td>
                <td data-testid="schedule-purpose">{r.role === 'longitudinal'
                  ? t(`detailing.schedule.purpose.${r.purpose ?? 'resistant'}`) : '—'}</td>
                <td>{r.quantity}</td><td>{r.cuttingLengthM.toFixed(2)}</td>
                <td>{r.massKg.toFixed(1)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="4">{t('detailing.total')}</th>
              <td>{s.totals.quantity}</td>
              <td>{s.totals.totalLengthM.toFixed(1)}</td>
              <td data-testid="schedule-mass">{s.totals.massKg.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      {/if}

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
    Two columns that can actually shrink, sized by the PANEL and not by the window.

    Was `minmax(12rem, 18rem) 1fr` with a `@media (max-width: 800px)` fallback, and both halves
    were wrong in the same place: a `1fr` track refuses to go below its content's min-content
    width, so the bar-schedule table and the sheet pushed the grid wider than the panel and the
    state pills and the preview were clipped on the right; and the media query asks about the
    WINDOW, so on a 1280 px screen it never fired even though the panel itself is about 540 px.

    `minmax(0, …)` lets both tracks shrink, and a container query asks the question that matters.
  */
  /*
    One column when the list is hidden, two when it is not.

    `data-list` drives it rather than a media query: the question is what the READER asked for,
    and the panel's width is answered separately by the container query at the bottom.
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

  .detailing[data-list='closed'] { grid-template-columns: minmax(0, 1fr); }
  .detailing[data-list='closed'] .topbar,
  .detailing[data-list='open'] .topbar { grid-column: 1 / -1; }

  .detailing {
    grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
    gap: 1rem;
    padding: 0.75rem;
    font-size: 0.85rem;
    height: 100%;
    overflow: auto;
  }
  h4 { margin: 0 0 0.4rem; font-size: 0.9rem; }
  h5 { margin: 0 0 0.3rem; font-size: 0.85rem; }
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
  .progress li.done { opacity: 1; background: var(--st-green); }
  .progress li[aria-current='step'] { outline: 1px solid currentColor; }
  .notice { margin: 0.4rem 0; padding: 0.4rem 0.55rem; border-radius: 4px; line-height: 1.35; }
  .notice.warning { background: var(--st-surface-3); color: var(--st-text); }
  .notice.error {
    background: var(--st-danger-bg); color: var(--st-text);
    border-left: 3px solid var(--st-danger);
  }
  .ok { color: var(--st-ok); }
  details.bars { margin: 0.5rem 0; }
  details.bars summary { cursor: pointer; font-size: 0.8rem; }
  ul.barlist { list-style: none; margin: 0.3rem 0 0; padding: 0; max-height: 16rem; overflow: auto; }
  ul.barlist > li { display: flex; gap: 0.5rem; align-items: center; font-size: 0.76rem; padding: 0.15rem 0; border-top: 1px solid var(--st-hair); }
  ul.barlist > li.locked { background: var(--st-blue); }
  .bar-id { font-family: monospace; min-width: 7rem; }
  .bar-dia, .bar-len { min-width: 4rem; }
  .bar-role { flex: 1; opacity: 0.8; }
  .lock { font-size: 0.7rem; padding: 0.05rem 0.35rem; }
  .conflict-nav { display: flex; align-items: center; gap: 0.5rem; }
  .conflict-nav button { min-width: 1.8rem; }
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

  table.schedule { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  /* A wide schedule scrolls itself instead of stretching the panel. */
  .scroll-x { overflow-x: auto; max-width: 100%; }
  caption { text-align: left; font-weight: 600; padding-bottom: 0.25rem; }
  th, td { border: 1px solid var(--st-hair-strong); padding: 0.2rem 0.4rem; text-align: right; }
  th[scope='col'], td:first-child, td:nth-child(3) { text-align: left; }
  .documents { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border, var(--st-text)); }
  .doc-actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
  .doc-state { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12px; }
  .badge { padding: 2px 8px; border-radius: 3px; font-weight: 600; font-size: 11px; }
  /* Inverted chip: a light ground, so the PLAIN hue rather than the `-text` variant — which
     is what `tokens.css` says the two strengths are for. `--st-accent` on `--st-text` was
     3.85; `--st-red` is 6.04. */
  .badge-review_draft, .badge-superseded { background: var(--st-text); color: var(--st-red); }
  .badge-for_review { background: var(--st-text); color: var(--st-hair-strong); }
  .badge-reviewed, .badge-issued { background: var(--st-text); color: var(--st-hair-strong); }
  .superseded-docs { margin-top: 8px; font-size: 12px; }

  .review { margin-top: 0.75rem; border-top: 1px solid var(--st-hair-strong); padding-top: 0.6rem; }
  .disclaimer { font-size: 0.75rem; opacity: 0.8; margin: 0 0 0.4rem; }
  .field { display: block; margin: 0.35rem 0; }
  .field input, .field textarea { display: block; width: 100%; max-width: 28rem; padding: 0.25rem 0.4rem; }
  .ack { display: block; margin: 0.2rem 0; }
  .actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
  /* One column once the PANEL is narrow — the width a reader actually has. */
  @container (max-width: 34rem) { .detailing { grid-template-columns: minmax(0, 1fr); } }
</style>
