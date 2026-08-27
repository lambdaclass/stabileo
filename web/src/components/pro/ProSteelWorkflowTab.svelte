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
  import { detectJoints } from '../../lib/engine/connection-design';
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

  // ─── The five stages ─────────────────────────────────────────────
  //
  // Derived from the same facts the sub-blocks above use; nothing new is computed. What changed
  // is the QUESTION each stage asks.
  //
  // The eight stages this replaces were the pieces in the order they were built. That is a list
  // of what exists, not a route through it — and four of the eight are one question, «are the
  // sections I chose adequate», asked about four different inputs. The five below are the route:
  // model it, say which code, check the sections, detail the joints, write it down.

  /**
   * 1 · Modelling.
   *
   * `blocked` only when there is nothing metallic to design. A model that exists but has not been
   * solved is `current`: solving is the user's next act, not an obstacle in front of them.
   */
  const modelState = $derived<State>(
    !hasSteel ? 'blocked' : hasDemands ? 'done' : 'current',
  );
  const modelSummary = $derived(
    !hasSteel
      ? t('steel.workflow.model.noMembers')
      : hasDemands
        ? tp('steel.workflow.model.solved', { n: members.length })
        : tp('steel.workflow.model.notSolved', { n: members.length }),
  );

  /**
   * 3 · Sections chosen, and what can be checked about them.
   *
   * Never `done`: `steelCountsAsVerified()` returns the literal `false`, and a green tick beside
   * a metallic result is the one claim this branch exists to refuse.
   */
  const sectionsState = $derived<State>(
    !hasSteel ? 'optional'
      // A member with no section at all: nothing further can be said about it.
      : sRows.some((r) => r.state === 'unavailable') ? 'blocked'
        // And whatever blocks the check blocks the stage. Restating that rule here would put two
        // places in charge of deciding when a check can run.
        : verificationState === 'blocked' ? 'blocked'
          : 'current',
  );

  /**
   * 4 · Joints.
   *
   * Counted with the same detection and the same metallic predicate the connections panel uses,
   * so the two surfaces cannot disagree about how many joints a model has.
   */
  const jointCount = $derived.by(() => {
    void modelStore.modelVersion;
    const metallic = new Set(members.map((m) => m.elementId));
    return detectJoints(
      modelStore.nodes as never, modelStore.elements as never, modelStore.supports as never,
      { isMetallic: (id) => metallic.has(id) },
    ).length;
  });
  const allJointCount = $derived.by(() => {
    void modelStore.modelVersion;
    return detectJoints(
      modelStore.nodes as never, modelStore.elements as never, modelStore.supports as never,
    ).length;
  });
  const jointsState = $derived<State>(
    !hasSteel ? 'optional' : jointCount > 0 ? 'current' : 'blocked',
  );
  /**
   * The two absences, kept apart — the distinction the shipped shed made necessary.
   *
   * That model has 226 joints and had no material the app could classify, so every one of them
   * was filtered away. «No joints» would have been false about it.
   */
  const jointsBlockedReason = $derived(
    allJointCount > 0
      ? tp('conn.jointsNotShown', { n: allJointCount })
      : t('steel.workflow.joints.noneAtAll'),
  );
  const jointsSummary = $derived(
    jointCount > 0 ? tp('steel.workflow.joints.detected', { n: jointCount }) : jointsBlockedReason,
  );

  /**
   * What the joints stage can and cannot supply, named rather than implied.
   *
   * Bolt LAYOUT geometry is real and clause-backed — §J.3.3, Tables J.3.3 and J.3.4, §J.3.5 — and
   * `connection/bolt-geometry.ts` computes it. Plate sizes, weld sizes and batten dimensions are
   * not: §E.6 gives no batten dimension anywhere, and a plate is sized from a demand this stage
   * does not have. The list says which is which instead of leaving a reader to infer it from an
   * empty field.
   */
  const JOINT_SCOPE = [
    'steel.workflow.joints.scope.boltLayout',
    'steel.workflow.joints.scope.holeSize',
    'steel.workflow.joints.scope.plateUnavailable',
    'steel.workflow.joints.scope.weldUnavailable',
    'steel.workflow.joints.scope.battenUnavailable',
  ] as const;

  /**
   * 5 · Documents.
   *
   * Blocked until there is something to document. It states what a document would carry rather
   * than offering an export that would come out empty.
   */
  const documentsState = $derived<State>(
    !hasSteel ? 'optional' : hasDemands ? 'current' : 'blocked',
  );

  /*
   * ── Which stages open by default ─────────────────────────────────
   *
   * Four of the five, and the exception is documents: it is the only one whose content is a
   * statement of intent rather than a fact about this model.
   *
   * The regulation stage opens collapsed for the opposite reason — it is a one-line confirmation
   * and expanding it buries the three that carry tables.
   *
   * And `limits` stays open, because `SteelPanel` lives there and `SteelPanel` used to BE this
   * tab. Putting the inventory behind a closed disclosure would take away, from every existing
   * user, the thing the tab was for — which the M1 E2E caught the moment the mount landed.
   */
  let modelOpen = $state(true);
  let sectionsOpen = $state(true);
  let jointsOpen = $state(true);
  let documentsOpen = $state(false);
  let regOpen = $state(false);
  let limitsOpen = $state(true);
</script>

<div class="steel-workflow" data-testid="pro-steel-workflow">
  <!-- ── 1 · Modelling ──────────────────────────────────────────── -->
  <StageSection
    testid="steel-stage-model" step={1}
    title={t('steel.workflow.model.title')}
    purpose={t('steel.workflow.model.purpose')}
    state={modelState}
    badge={members.length > 0 ? members.length : undefined}
    blockedBy={modelState === 'blocked' ? t('steel.workflow.model.blocked') : undefined}
    bind:open={modelOpen}
  >
    <p class="line" data-testid="steel-stage-model-body">{modelSummary}</p>
    <p class="line" data-testid="steel-stage-analysis-body">
      {hasDemands ? t('steel.workflow.analysis.ready') : t('steel.workflow.analysis.missing')}
    </p>
  </StageSection>

  <!-- ── 2 · Regulation ─────────────────────────────────────────── -->
  <StageSection
    testid="steel-stage-code" step={2}
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
    <!--
      Declaring is not certifying, and the stage says which one it is doing.

      `roleUsable` returns false whenever a code's maturity is UNSUPPORTED, and CIRSOC 301 is
      declared UNSUPPORTED — accurately, no adapter implements it. So `usable('steel')` is false
      by construction, and gating progress on it meant choosing a code could never unblock
      anything at all. Progress asks whether a code is DECLARED; only a certified result asks
      whether it is usable.
    -->
    <p class="line" data-testid="steel-stage-code-scope">
      {codeLabel
        ? t('steel.workflow.regulation.declaredNotCertified')
        : t('steel.workflow.regulation.pickToAdvance')}
    </p>
  </StageSection>

  <!-- ── 3 · The sections chosen, and what can be checked about them ── -->
  <StageSection
    testid="steel-stage-sections" step={3}
    title={t('steel.workflow.sections.title')}
    purpose={t('steel.workflow.sections.purpose')}
    state={sectionsState}
    badge={members.length > 0 ? members.length : undefined}
    blockedBy={sectionsState === 'blocked' ? t('steel.workflow.sections.blocked') : undefined}
    bind:open={sectionsOpen}
  >
    <!--
      Four former stages, unchanged inside.

      They were never four steps; they were four inputs to one question. Every table, every
      blocker and every per-member row is the same — what changed is that they no longer look
      like four things a user completes in turn.

      C/Z are NOT among them. They are a family in the section selector, reachable from the
      sections tab and from every generator row, which is where a shape belongs.
    -->
    <section class="sub" data-testid="steel-sub-grade" data-state={gradeState}>
      <h4>
        <!-- The sub-section keeps its own state: merging four stages into one must not
             merge four answers into one. -->
        <span class="chip" data-testid="steel-sub-grade-state">{t(`steel.state.${gradeState}`)}</span>
        {t('steel.workflow.grade.title')}</h4>
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
    </section>
    <section class="sub" data-testid="steel-sub-section" data-state={sectionState}>
      <h4>
        <!-- The sub-section keeps its own state: merging four stages into one must not
             merge four answers into one. -->
        <span class="chip" data-testid="steel-sub-section-state">{t(`steel.state.${sectionState}`)}</span>
        {t('steel.workflow.section.title')}</h4>
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
    </section>
    <section class="sub" data-testid="steel-sub-geometry" data-state={geometryState}>
      <h4>
        <!-- The sub-section keeps its own state: merging four stages into one must not
             merge four answers into one. -->
        <span class="chip" data-testid="steel-sub-geometry-state">{t(`steel.state.${geometryState}`)}</span>
        {t('steel.workflow.geometry.title')}</h4>
      <!--
        The blocker moved with the content.

        It used to live on the stage's `blockedBy`; folding the stage into a sub-section dropped
        it, and the Lb assumption is the one thing this block exists to say. Rendered here so it
        travels with the text it qualifies.
      -->
      <p class="line warn" data-testid="steel-sub-geometry-blocked">{t('steel.workflow.geometry.blocked')}</p>
      <p class="line" data-testid="steel-stage-geometry-body">{t('steel.workflow.geometry.lbDetail')}</p>
    </section>
    <section class="sub" data-testid="steel-sub-assumptions" data-state={assumptionState}>
      <h4>
        <!-- The sub-section keeps its own state: merging four stages into one must not
             merge four answers into one. -->
        <span class="chip" data-testid="steel-sub-assumptions-state">{t(`steel.state.${assumptionState}`)}</span>
        {t('steel.workflow.assumptions.title')}</h4>
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
    </section>
    <section class="sub" data-testid="steel-sub-verification" data-state={verificationState}>
      <h4>
        <!-- The sub-section keeps its own state: merging four stages into one must not
             merge four answers into one. -->
        <span class="chip" data-testid="steel-sub-verification-state">{t(`steel.state.${verificationState}`)}</span>
        {t('steel.workflow.verification.title')}</h4>
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
    </section>
  </StageSection>

  <!-- ── 4 · Joints ─────────────────────────────────────────────── -->
  <StageSection
    testid="steel-stage-joints" step={4}
    title={t('steel.workflow.joints.title')}
    purpose={t('steel.workflow.joints.purpose')}
    state={jointsState}
    badge={jointCount > 0 ? jointCount : undefined}
    blockedBy={jointsState === 'blocked' ? jointsBlockedReason : undefined}
    bind:open={jointsOpen}
  >
    <p class="line" data-testid="steel-stage-joints-body">{jointsSummary}</p>
    <!-- What this stage can supply and what it cannot, each named. -->
    <ul class="list" data-testid="steel-joints-scope">
      {#each JOINT_SCOPE as key (key)}<li>{t(key)}</li>{/each}
    </ul>
  </StageSection>

  <!-- ── 5 · Documents ──────────────────────────────────────────── -->
  <StageSection
    testid="steel-stage-documents" step={5}
    title={t('steel.workflow.documents.title')}
    purpose={t('steel.workflow.documents.purpose')}
    state={documentsState}
    blockedBy={documentsState === 'blocked' ? t('steel.workflow.documents.blocked') : undefined}
    bind:open={documentsOpen}
  >
    <p class="line" data-testid="steel-stage-documents-body">{t('steel.workflow.documents.body')}</p>
  </StageSection>

  <!--
    Limits, as a footer rather than a ninth stage.

    They apply to every stage above, so numbering them after the last one implied they were
    something that arrives at the end. `SteelPanel` stays open by default: it used to BE this
    tab, and putting the inventory behind a closed disclosure would take from every existing
    user the thing the tab was for — which the M1 E2E caught the moment the mount landed.
  -->
  <details class="limits" bind:open={limitsOpen} data-testid="steel-limits">
    <summary>{t('steel.workflow.limits.title')}{#if gaps.length > 0} ({gaps.length}){/if}</summary>
    <SteelPanel />
  </details>
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
