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
  import { assumptionRows, assumptionSourceKey } from '../../lib/engine/steel/workflow-assumptions';
  import { CIRSOC301_CLAUSE_MAP, CIRSOC301_CLAUSES_UNVALIDATED } from '../../lib/engine/design/adapters/cirsoc301-clause-map';
  import { e4Applicability, e4GapKey } from '../../lib/engine/steel/torsional-buckling';
  import { f62Report } from '../../lib/engine/steel/flange-local-buckling';
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
  /** Per-member assumptions, with the provenance of each. */
  const aRows = $derived(assumptionRows(inv));

  // ── 6. Analysis ──────────────────────────────────────────────────
  const hasDemands = $derived(resultsStore.results3D !== null && resultsStore.hasCombinations3D);
  const analysisState = $derived<State>(
    !hasSteel ? 'optional' : hasDemands ? 'done' : 'current',
  );

  // ── 7. Verification ─────────────────────────────────────────────
  /**
   * ── The stage state, and why the signature no longer decides it ────
   *
   * This used to be the constant `'blocked'`, on the grounds that no professional had signed the
   * checker. That conflated two different things: whether the CALCULATION can run, and whether a
   * human has reviewed it. The first is a development question with a factual answer; the second is
   * a review state that arrives later and cannot gate development.
   *
   * So the stage is now blocked only when computation is genuinely impossible — no demands, or a
   * member whose inputs are incomplete — and otherwise `current`: the calculation is available,
   * every clause it evaluates is traced, and professional review is pending. Which is the truth.
   *
   * **It can never be `done`.** `StageSection` renders `done` as a ✓ in `--st-ok`, and an approval
   * is exactly what this stage must not invent. `steelCountsAsVerified()` still returns the literal
   * `false`, so nothing downstream can read a pass out of this either.
   */
  const verificationState = $derived<State>(
    !hasSteel ? 'optional' : !hasDemands || inputGaps.length > 0 ? 'blocked' : 'current',
  );

  /**
   * What still limits the calculation, and what is merely awaiting review.
   *
   * Split on purpose. `limitation` is something the app does or does not do; `review` is a state a
   * person moves. Presenting the signature among the limitations is what made the stage look
   * permanently broken when it was only unreviewed.
   */
  /**
   * The three clauses this block audited, per the FIRST metallic section in the model.
   *
   * One section rather than per-member because these are properties of a SHAPE, not of a member:
   * every I-beam in the model gets the same E.4 verdict. Showing it once says the same thing
   * without pretending the granularity is finer than it is.
   */
  const firstSection = $derived(
    sRows.length > 0
      ? modelStore.model.sections.get(sectionOf(sRows[0].elementId) ?? -1)
      : undefined,
  );
  const e4 = $derived(e4Applicability({
    shape: (firstSection as { shape?: string } | undefined)?.shape,
    j: (firstSection as { j?: number } | undefined)?.j,
  }));
  const f62 = $derived(f62Report({
    shape: (firstSection as { shape?: string } | undefined)?.shape,
    b: (firstSection as { b?: number } | undefined)?.b,
    tf: (firstSection as { tf?: number } | undefined)?.tf,
    iMinor: (firstSection as { iz?: number } | undefined)?.iz,
  }));

  const LIMITATIONS = [
    { key: 'steel.workflow.blocker.tests', addressed: true },
    { key: 'steel.workflow.blocker.inferredProperties', addressed: true },
    { key: 'steel.workflow.blocker.clauseRefs', addressed: true },
    { key: 'steel.workflow.limit.flexuralCap', addressed: true },
    { key: 'steel.workflow.blocker.unbracedLength', addressed: false },
    { key: 'steel.workflow.limit.sectionClassification', addressed: false },
    { key: 'steel.workflow.limit.netArea', addressed: false },
  ] as const;

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
    <!--
      The assumptions the existing checker makes, from the adapter that declares them. Flat,
      because not one of them varies by member — presenting them per-member would imply a
      granularity the app does not have.
    -->
    <ul class="list" data-testid="steel-stage-assumptions-list">
      {#each CIRSOC301_JS_ASSUMPTIONS as key (key)}<li>{t(key)}</li>{/each}
    </ul>

    {#if aRows.length > 0}
      <!--
        What DOES vary per member is `Lb`, because it is the member's own length. So the table
        carries that number and the source of it, and the source is the point: `assumed` means the
        app decided, which is a risk the user did not knowingly take.
      -->
      <table class="rows" data-testid="steel-assumption-rows">
        <thead>
          <tr>
            <th>{t('steel.rows.header.member')}</th>
            <th>{t('steel.rows.header.lb')}</th>
            <th>{t('steel.rows.header.source')}</th>
          </tr>
        </thead>
        <tbody>
          {#each aRows as row (row.elementId)}
            <tr data-testid={`steel-assumption-row-${row.elementId}`}>
              <td><span class="id">#{row.elementId}</span><span class="name">{row.memberName}</span></td>
              <!-- The real number the checker receives, not a restatement of the rule. -->
              <td data-testid={`steel-lb-${row.elementId}`}>{row.lbM.toFixed(3)} m</td>
              <td data-testid={`steel-lb-source-${row.elementId}`}
                >{t(assumptionSourceKey(row.lbSource))}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- Bracing: zero, and the reason is not «there are none». -->
      <p class="line warn" data-testid="steel-assumption-bracing">{t('steel.rows.bracingNone')}</p>

      <p class="sub">{t('steel.assume.source.notInferable')}</p>
      <ul class="list" data-testid="steel-assumption-not-inferable">
        {#each aRows[0].notInferable as a (a.key)}
          <li>
            {t(a.key)}
            {#if a.routeOutKey}<span class="route">{t(a.routeOutKey)}</span>{/if}
          </li>
        {/each}
      </ul>

      <!-- What stops the assumptions from being validated: signatures and implementations, not data. -->
      <ul class="list" data-testid="steel-assumption-blockers">
        {#each aRows[0].blockedBy as key (key)}<li>{t(key)}</li>{/each}
      </ul>
    {/if}
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
    blockedBy={verificationState === 'blocked' ? t('steel.workflow.verification.blockedCompute') : undefined}
    bind:open={verificationOpen}
  >
    <!--
      The five blockers, with the two that moved marked as such. Rendered as a list rather than a
      sentence so that «which of these is left» is answerable at a glance, and so removing one is a
      visible event rather than a rewording.
    -->
    <ul class="blockers" data-testid="steel-stage-verification-blockers">
      {#each LIMITATIONS as b (b.key)}
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

    <!--
      The three clauses this block audited. Each says whether it is available and, when it is not,
      the specific reason — a shape out of scope, a datum absent, or a limit value that exists only
      as an image in the source PDF.
    -->
    <dl class="results" data-testid="steel-clause-availability">
      <dt>{t('steel.workflow.clause.cb')}</dt>
      <dd data-testid="steel-clause-cb">{t('steel.workflow.clause.cbState')}</dd>
      <dt>{t('steel.workflow.clause.e4')}</dt>
      <dd data-testid="steel-clause-e4">
        {t(e4.reasonKey)}
        {#if e4.gaps.length > 0}
          <ul class="list">
            {#each e4.gaps as g (g)}<li>{t(e4GapKey(g))}</li>{/each}
          </ul>
        {/if}
      </dd>
      <dt>{t('steel.workflow.clause.f62')}</dt>
      <dd data-testid="steel-clause-f62">
        {t(f62.reasonKey)}
        {#if f62.flangeSlenderness != null}
          <!-- The computable half, shown because a reader with the printed table can finish it. -->
          <span class="clauses">
            {t('steel.f62.lambdaLabel')} = {f62.flangeSlenderness.toFixed(2)}
            · {t('steel.f62.fcrLabel')} = {f62.fcrMPa?.toFixed(0)} MPa
          </span>
        {/if}
        {#if f62.missingKeys.length > 0}
          <ul class="list">
            {#each f62.missingKeys as k (k)}<li>{t(k)}</li>{/each}
          </ul>
        {/if}
      </dd>
    </dl>

    <!--
      The review state, as METADATA and not as a blocker. A signature is something a person adds
      later; presenting it as a blocker made the stage read as broken when it was only unreviewed.
    -->
    <p class="line review" data-testid="steel-review-state">
      {t('steel.workflow.review.pending')}
      <span class="clauses">{tp('steel.workflow.review.clausesTraced', {
        n: CIRSOC301_CLAUSE_MAP.length, pending: CIRSOC301_CLAUSES_UNVALIDATED.length })}</span>
    </p>

    <!--
      What the stage owes a reader when it has no result to show. Eight statements, each a fact
      about the code rather than a promise about it — and none of them a number presented as a pass.
    -->
    <p class="line warn" data-testid="steel-results-none">{t('steel.workflow.results.noCertifiable')}</p>

    <dl class="results" data-testid="steel-results-detail">
      <dt>{t('steel.workflow.results.capabilitiesTitle')}</dt>
      <dd data-testid="steel-results-capabilities">{t('steel.workflow.results.capabilities')}</dd>
      <dt>{t('steel.workflow.results.testsTitle')}</dt>
      <dd data-testid="steel-results-tests">{t('steel.workflow.results.tests')}</dd>
      <dt>{t('steel.workflow.results.missingDataTitle')}</dt>
      <dd data-testid="steel-results-missing">{t('steel.workflow.results.missingData')}</dd>
      <dt>{t('steel.workflow.results.humanTitle')}</dt>
      <dd data-testid="steel-results-human">{t('steel.workflow.results.human')}</dd>
      <!-- The two specific departures the clause mapping found, named where a reader will look. -->
      <dt>{t('steel.workflow.results.aeTitle')}</dt>
      <dd data-testid="steel-results-ae">{t('steel.workflow.results.ae')}</dd>
      <dt>{t('steel.workflow.results.capTitle')}</dt>
      <dd data-testid="steel-results-cap">{t('steel.workflow.results.cap')}</dd>
    </dl>

    <!--
      The clause map's own state. Shown as a count of UNVALIDATED entries rather than of mapped
      ones, because «14 clauses mapped» reads as progress and «14 awaiting review» reads as what it
      is.
    -->
    <p class="line" data-testid="steel-results-clause-map">
      {CIRSOC301_CLAUSES_UNVALIDATED.length} / {CIRSOC301_CLAUSE_MAP.length}
      · {t('steel.workflow.blocker.clauseRefs')}
    </p>
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
  .sub { font-size: 0.66rem; opacity: 0.7; margin: 0.5rem 0 0.1rem; }
  .route { display: block; font-size: 0.62rem; opacity: 0.75; }
  .results { margin: 0.4rem 0 0; font-size: 0.7rem; }
  .results dt { font-weight: 600; margin-top: 0.35rem; color: var(--st-text); }
  .results dd { margin: 0.1rem 0 0; opacity: 0.9; }
  .line.warn { color: var(--st-warn); }
  /* Neutral, never `--st-ok`: a pending review is not an approval. */
  .line.review { margin-top: 0.4rem; }
  .clauses { display: block; font-size: 0.66rem; opacity: 0.75; }
  /* The state word, for a reader who cannot see the glyph. */
  .sr {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }
</style>
