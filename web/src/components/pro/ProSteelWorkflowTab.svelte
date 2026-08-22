<script lang="ts">
  /**
   * Flujo de diseño metálico — the whole workflow, including the part that cannot happen.
   *
   * ── What this screen is for ────────────────────────────────────────
   *
   * `ProRcWorkflowTab` gives concrete a single place that answers «where am I, and what is left».
   * Steel had no equivalent: the pieces existed — a regulation you could declare, a grade picker, a
   * profile catalogue, three generators, an inventory — and nothing put them in an order or said
   * which one was blocking the next. A user could complete every step and still not know that the
   * last one was never going to run.
   *
   * ── The rule that governs every state on this screen ───────────────
   *
   * `StageSection` renders `state: 'done'` as a ✓ in `--st-ok` — a green tick. So:
   *
   *   **`done` may only mean that the user completed a CHOICE. It may never mean that a result was
   *   checked.**
   *
   * Declaring the regulation, choosing a grade, choosing a section: those are real completions and
   * a tick is honest. The verification stage is `blocked` and stays `blocked`, with its four
   * blockers named, for as long as `steelCountsAsVerified()` returns the literal `false` — which is
   * to say, until a human signs the checker. A green tick beside a metallic result is the one claim
   * this whole branch exists to refuse.
   *
   * ── What it must not invent ────────────────────────────────────────
   *
   * No progress bar, no percentage, no "cancel", no result. Every state below is derived from a
   * fact the stores already hold; nothing is estimated, and a stage with nothing to say says
   * `optional` rather than pretending to be current.
   *
   * ── `StageSection` is consumed, not extended ───────────────────────
   *
   * Its whole API is `step`, `title`, `purpose`, `state`, `blockedBy`, `badge`, `attention`,
   * `testid`, `open`. Nothing in it is concrete-specific, which is why a metallic workflow can use
   * it without a single edit to a shared file.
   */
  import StageSection from './design/StageSection.svelte';
  import SteelPanel from './steel/SteelPanel.svelte';
  import { t, tp } from '../../lib/i18n';
  import { steelStore } from '../../lib/store/steel.svelte';
  import { modelStore } from '../../lib/store/model.svelte';
  import { resultsStore } from '../../lib/store';
  import { regulationsStore } from '../../lib/store/regulations.svelte';
  import { bindingLabel } from '../../lib/codes/roles';
  import { te } from '../../lib/i18n/engine-text';
  import { steelInputCompleteness, steelInputGapKey } from '../../lib/engine/verification-service';
  import { gradeRows, sectionRows, rowStateKey } from '../../lib/engine/steel/workflow-rows';
  import { structuralGradeSource } from '../../lib/grades/catalogue';
  import { steelProfileSource } from '../../lib/profiles/catalogue';
  import { CIRSOC301_JS_ASSUMPTIONS } from '../../lib/engine/design/adapters/cirsoc301-capabilities';

  type State = 'done' | 'current' | 'blocked' | 'optional';

  const inv = $derived(steelStore.inventory);
  const members = $derived(inv.members);
  const hasSteel = $derived(members.length > 0);

  // ── 1. Regulation ────────────────────────────────────────────────
  const binding = $derived(regulationsStore.binding('steel'));
  const codeLabel = $derived(binding.adapterId ? te(bindingLabel(binding)) : null);
  const regState = $derived<State>(codeLabel ? 'done' : 'current');

  // ── 2. Material and grade ────────────────────────────────────────
  /**
   * Members whose grade was INFERRED rather than declared.
   *
   * `SteelMemberEntry.gradeId` is absent when the material does not name a catalogue grade, and
   * the inventory already flags the inference. A stage that called itself done while half the
   * members had a guessed strength would be the first lie on the screen.
   */
  const withoutGrade = $derived(members.filter((m) => !m.gradeId).length);

  /**
   * Which section belongs to which element.
   *
   * The inventory is pure and carries the section NAME, not its id, so the row builders are handed
   * this lookup rather than the store.
   */
  const sectionOf = $derived((elementId: number) =>
    modelStore.model.elements.get(elementId)?.sectionId);

  /** Per-member detail for stages 2 and 3 — the rows, not the counts. */
  const gRows = $derived(gradeRows(
    inv, modelStore.model.sections as never, sectionOf, structuralGradeSource,
  ));
  const sRows = $derived(sectionRows(
    inv, modelStore.model.sections as never, sectionOf, steelProfileSource,
  ));
  const gradeState = $derived<State>(
    !hasSteel ? 'optional' : withoutGrade === 0 ? 'done' : 'current',
  );

  // ── 3. Section / profile ─────────────────────────────────────────
  /**
   * Members whose section is missing an input the checker needs.
   *
   * Asked of the same function the verification path asks, so the screen and the engine cannot
   * disagree about which members are ready.
   */
  const inputGaps = $derived(steelInputCompleteness({
    elements: modelStore.model.elements as never,
    nodes: modelStore.model.nodes as never,
    sections: modelStore.model.sections as never,
    materials: modelStore.model.materials as never,
    supports: modelStore.model.supports as never,
  }));
  const sectionState = $derived<State>(
    !hasSteel ? 'optional' : inputGaps.length === 0 ? 'done' : 'current',
  );
  /** The distinct gaps across the model, so the stage names them instead of counting them. */
  const gapKinds = $derived([...new Set(inputGaps.flatMap((g) => g.gaps))]);

  // ── 4. Geometry and bracing ──────────────────────────────────────
  /**
   * Permanently blocked, and this is the honest one.
   *
   * The model has nowhere to record a brace, so `verification-service.ts` passes `Lb = L` — the
   * member unbraced over its whole length. That is conservative for flexure taken alone, which is
   * why it is tolerable, and it is still an assumption the user never made. Replacing it with a
   * fraction of `L` would be an invention; the stage says so instead.
   */
  const geometryState = $derived<State>(hasSteel ? 'blocked' : 'optional');

  // ── 5. Assumptions ───────────────────────────────────────────────
  const assumptionState = $derived<State>(hasSteel ? 'current' : 'optional');

  // ── 6. Analysis ──────────────────────────────────────────────────
  const hasDemands = $derived(resultsStore.results3D !== null && resultsStore.hasCombinations3D);
  const analysisState = $derived<State>(
    !hasSteel ? 'optional' : hasDemands ? 'done' : 'current',
  );

  // ── 7. Verification ─────────────────────────────────────────────
  /**
   * `blocked`, always, and not as a placeholder.
   *
   * The four blockers are the ones `cirsoc301-capabilities.ts` states, with the first now removed
   * by `cirsoc301-benchmarks.test.ts`. It is still listed, marked as addressed, because a reader
   * deserves to see the whole set and which of it moved — and because the stage does not unblock
   * on one of four.
   */
  const BLOCKERS = [
    { key: 'steel.workflow.blocker.tests', addressed: true },
    { key: 'steel.workflow.blocker.clauseRefs', addressed: false },
    { key: 'steel.workflow.blocker.unbracedLength', addressed: false },
    { key: 'steel.workflow.blocker.inferredProperties', addressed: true },
    { key: 'steel.workflow.blocker.signature', addressed: false },
  ] as const;
  const verificationState = $derived<State>('blocked');

  // ── 8. Limitations and authority ─────────────────────────────────
  const gaps = $derived(steelStore.capabilityGaps);
  const limitsState = $derived<State>('optional');

  /*
   * ── Which stages open by default, and why those two ──────────────
   *
   * The six stages that record a CHOICE open collapsed: each is a one-line confirmation, and six
   * of them expanded would bury the two that carry content.
   *
   * The two that stay open are the two a reader came for:
   *
   *   · **verification**, because its blockers are the answer to «why is there no result», and a
   *     blocked stage whose reasons are one click away is a blocked stage nobody reads;
   *   · **limits**, because `SteelPanel` lives there and `SteelPanel` used to BE this tab. Putting
   *     the inventory behind a disclosure would take away, from every existing user, the thing the
   *     tab was for — which the M1 E2E caught the moment the mount landed, and rightly.
   */
  let regOpen = $state(false);
  let gradeOpen = $state(false);
  let sectionOpen = $state(false);
  let geometryOpen = $state(false);
  let assumptionOpen = $state(false);
  let analysisOpen = $state(false);
  let verificationOpen = $state(true);
  let limitsOpen = $state(true);
</script>

<div class="steel-workflow" data-testid="pro-steel-workflow">
  <StageSection
    testid="steel-stage-regulation" step={1}
    title={t('steel.workflow.regulation.title')}
    purpose={t('steel.workflow.regulation.purpose')}
    state={regState}
    badge={codeLabel ?? undefined}
    bind:open={regOpen}
  >
    <p class="line" data-testid="steel-stage-regulation-body">
      {codeLabel
        ? tp('steel.workflow.regulation.declared', { name: codeLabel })
        : t('steel.workflow.regulation.notDeclared')}
    </p>
  </StageSection>

  <StageSection
    testid="steel-stage-grade" step={2}
    title={t('steel.workflow.grade.title')}
    purpose={t('steel.workflow.grade.purpose')}
    state={gradeState}
    badge={withoutGrade > 0 ? withoutGrade : undefined}
    bind:open={gradeOpen}
  >
    <p class="line" data-testid="steel-stage-grade-body">
      {withoutGrade === 0
        ? t('steel.workflow.grade.allDeclared')
        : tp('steel.workflow.grade.someInferred', { n: withoutGrade })}
    </p>

    {#if gRows.length === 0}
      <p class="line muted" data-testid="steel-grade-empty">{t('steel.rows.noMembers')}</p>
    {:else}
      <!--
        One row per member. A count told a user how many were unresolved; this tells them WHICH,
        and what is missing from each — which is the part a number cannot carry.
      -->
      <table class="rows" data-testid="steel-grade-rows">
        <thead>
          <tr>
            <th>{t('steel.rows.header.member')}</th>
            <th>{t('steel.rows.header.grade')}</th>
            <th>{t('steel.rows.header.standard')}</th>
            <th>{t('steel.rows.header.thickness')}</th>
            <th>{t('steel.rows.header.state')}</th>
          </tr>
        </thead>
        <tbody>
          {#each gRows as row (row.elementId)}
            <tr data-testid={`steel-grade-row-${row.elementId}`} data-state={row.state}>
              <td>
                <span class="id">#{row.elementId}</span>
                <span class="name">{row.memberName}</span>
                <span class="fam">{row.family}</span>
                {#if row.familyCaveatKey}
                  <!-- Inferred, and said so: a family shown without its caveat is a guess made fact. -->
                  <span class="caveat" data-testid={`steel-grade-inferred-${row.elementId}`}
                    >{t('steel.rows.inferredFamily')}</span>
                {/if}
              </td>
              <!--
                The grade as DECLARED. Never derived from `fy` — an absent grade prints an em dash,
                not a plausible designation.
              -->
              <td data-testid={`steel-grade-designation-${row.elementId}`}>
                {row.designation ?? '—'}
                {#if row.gradeId}<span class="gid">{row.gradeId}</span>{/if}
              </td>
              <td>{row.productStandard ?? '—'}</td>
              <td>
                {row.thicknessMm != null ? `${row.thicknessMm.toFixed(1)} mm` : '—'}
                {#if row.hasThicknessBands && row.bandStandard}
                  <!-- The band standard is NOT the product standard, and is labelled separately. -->
                  <span class="band">{tp('steel.rows.bandStandard', { std: row.bandStandard })}</span>
                {/if}
              </td>
              <td class="state">{t(rowStateKey(row.state))}</td>
            </tr>
            {#if row.missing.length > 0}
              <tr class="why" data-testid={`steel-grade-missing-${row.elementId}`}>
                <td colspan="5">
                  <ul>
                    {#each row.missing as d (d.key)}
                      <li>
                        <strong>{t(d.key)}</strong>
                        <span class="sev">{t(`steel.rows.severity.${d.severity}`)}</span>
                        <span>{t(d.whyKey)}</span>
                      </li>
                    {/each}
                  </ul>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </StageSection>

  <StageSection
    testid="steel-stage-section" step={3}
    title={t('steel.workflow.section.title')}
    purpose={t('steel.workflow.section.purpose')}
    state={sectionState}
    badge={inputGaps.length > 0 ? inputGaps.length : undefined}
    bind:open={sectionOpen}
  >
    {#if gapKinds.length === 0}
      <p class="line" data-testid="steel-stage-section-body">{t('steel.workflow.section.complete')}</p>
    {:else}
      <!-- Which input is missing, not how many members are affected: the fix is per input. -->
      <ul class="list" data-testid="steel-stage-section-gaps">
        {#each gapKinds as gap (gap)}<li>{t(steelInputGapKey(gap))}</li>{/each}
      </ul>
    {/if}

    {#if sRows.length === 0}
      <p class="line muted" data-testid="steel-section-empty">{t('steel.rows.noMembers')}</p>
    {:else}
      <table class="rows" data-testid="steel-section-rows">
        <thead>
          <tr>
            <th>{t('steel.rows.header.member')}</th>
            <th>{t('steel.rows.header.section')}</th>
            <th>{t('steel.rows.header.origin')}</th>
            <th>{t('steel.rows.header.missing')}</th>
            <th>{t('steel.rows.header.state')}</th>
          </tr>
        </thead>
        <tbody>
          {#each sRows as row (row.elementId)}
            <tr data-testid={`steel-section-row-${row.elementId}`} data-state={row.state}>
              <td><span class="id">#{row.elementId}</span></td>
              <td>
                <span class="name">{row.sectionName}</span>
                {#if row.family}<span class="fam">{row.family}</span>{/if}
                {#if row.catalogueId}<span class="gid">{row.catalogueId}</span>{/if}
              </td>
              <td data-testid={`steel-section-origin-${row.elementId}`}
                >{t(`steel.rows.origin.${row.origin}`)}</td>
              <td data-testid={`steel-section-absent-${row.elementId}`}>
                {#if row.absent.length === 0}
                  —
                {:else}
                  <!-- Named, not counted: each absent property has its own remedy. -->
                  {row.absent.map((k) => t(k)).join(' · ')}
                {/if}
              </td>
              <td class="state">{t(rowStateKey(row.state))}</td>
            </tr>
            {#if row.blockedBy}
              <!--
                The distinction that decides what a user should do: a geometric gap they can close,
                an authority gap no input will move.
              -->
              <tr class="why" data-testid={`steel-section-blocked-${row.elementId}`}>
                <td colspan="5">{t(`steel.rows.blockedBy.${row.blockedBy}`)}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </StageSection>

  <StageSection
    testid="steel-stage-geometry" step={4}
    title={t('steel.workflow.geometry.title')}
    purpose={t('steel.workflow.geometry.purpose')}
    state={geometryState}
    blockedBy={t('steel.workflow.geometry.blocked')}
    bind:open={geometryOpen}
  >
    <p class="line" data-testid="steel-stage-geometry-body">{t('steel.workflow.geometry.lbDetail')}</p>
  </StageSection>

  <StageSection
    testid="steel-stage-assumptions" step={5}
    title={t('steel.workflow.assumptions.title')}
    purpose={t('steel.workflow.assumptions.purpose')}
    state={assumptionState}
    badge={CIRSOC301_JS_ASSUMPTIONS.length}
    bind:open={assumptionOpen}
  >
    <!-- The assumptions the existing checker makes, from the adapter that declares them. -->
    <ul class="list" data-testid="steel-stage-assumptions-list">
      {#each CIRSOC301_JS_ASSUMPTIONS as key (key)}<li>{t(key)}</li>{/each}
    </ul>
  </StageSection>

  <StageSection
    testid="steel-stage-analysis" step={6}
    title={t('steel.workflow.analysis.title')}
    purpose={t('steel.workflow.analysis.purpose')}
    state={analysisState}
    bind:open={analysisOpen}
  >
    <p class="line" data-testid="steel-stage-analysis-body">
      {hasDemands ? t('steel.workflow.analysis.ready') : t('steel.workflow.analysis.missing')}
    </p>
  </StageSection>

  <StageSection
    testid="steel-stage-verification" step={7}
    title={t('steel.workflow.verification.title')}
    purpose={t('steel.workflow.verification.purpose')}
    state={verificationState}
    blockedBy={t('steel.workflow.verification.blocked')}
    bind:open={verificationOpen}
  >
    <!--
      The five blockers, with the two that moved marked as such. Rendered as a list rather than a
      sentence so that «which of these is left» is answerable at a glance, and so removing one is a
      visible event rather than a rewording.
    -->
    <ul class="blockers" data-testid="steel-stage-verification-blockers">
      {#each BLOCKERS as b (b.key)}
        <li class:addressed={b.addressed} data-testid={`steel-blocker-${b.key.split('.').pop()}`}>
          <span class="mark" aria-hidden="true">{b.addressed ? '✓' : '·'}</span>
          <span>{t(b.key)}</span>
          <span class="sr">{b.addressed
            ? t('steel.workflow.blocker.addressed')
            : t('steel.workflow.blocker.outstanding')}</span>
        </li>
      {/each}
    </ul>
    <p class="line" data-testid="steel-stage-verification-note">{t('steel.workflow.verification.note')}</p>
  </StageSection>

  <StageSection
    testid="steel-stage-limits" step={8}
    title={t('steel.workflow.limits.title')}
    purpose={t('steel.workflow.limits.purpose')}
    state={limitsState}
    badge={gaps.length > 0 ? gaps.length : undefined}
    bind:open={limitsOpen}
  >
    <SteelPanel />
  </StageSection>
</div>

<style>
  .steel-workflow { display: flex; flex-direction: column; gap: 0.4rem; }
  .line { font-size: 0.75rem; margin: 0; color: var(--st-text); }
  .list, .blockers { list-style: none; margin: 0; padding: 0; font-size: 0.72rem; }
  .list li { padding: 0.12rem 0; color: var(--st-text); }
  .blockers li { display: flex; gap: 0.4rem; align-items: baseline; padding: 0.12rem 0; }
  /*
    An addressed blocker is dimmed, never green: it is one of five, and the stage is still blocked.
    Colour would read as progress toward a pass.
  */
  .blockers li.addressed { opacity: 0.6; }
  .mark { flex: none; width: 0.7rem; }

  /* Per-member tables. Dense, because the point is to scan them. */
  .rows { width: 100%; border-collapse: collapse; font-size: 0.68rem; margin-top: 0.4rem; }
  .rows th {
    text-align: left; font-weight: 400; opacity: 0.7; padding: 0.15rem 0.4rem 0.15rem 0;
    border-bottom: 1px solid var(--st-hair);
  }
  .rows td { padding: 0.18rem 0.4rem 0.18rem 0; vertical-align: top; }
  .rows tr.why td { padding-top: 0; padding-bottom: 0.3rem; opacity: 0.85; }
  .rows tr.why ul { list-style: none; margin: 0; padding: 0; }
  .rows tr.why li { padding: 0.08rem 0; }
  .id { font-family: var(--st-mono, monospace); opacity: 0.7; margin-right: 0.3rem; }
  .name { color: var(--st-value); }
  .fam, .gid, .band {
    display: inline-block; margin-left: 0.3rem; font-size: 0.6rem; opacity: 0.7;
  }
  .caveat { display: block; font-size: 0.6rem; color: var(--st-warn); }
  .sev { margin: 0 0.3rem; font-size: 0.6rem; color: var(--st-warn); }
  .state { white-space: nowrap; }
  /*
    Every state is a WORD, so none of them needs colour to be read. Only the two that need a user
    to act carry a tint, and neither is `--st-ok`: nothing here is a pass.
  */
  .rows tr[data-state='incomplete'] .state { color: var(--st-warn); }
  .rows tr[data-state='authorityBlocked'] .state { color: var(--st-warn); }
  .muted { opacity: 0.7; }
  /* The state word, for a reader who cannot see the glyph. */
  .sr {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }
</style>
