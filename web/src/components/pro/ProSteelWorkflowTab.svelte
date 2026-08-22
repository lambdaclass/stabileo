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

  let regOpen = $state(false);
  let gradeOpen = $state(false);
  let sectionOpen = $state(false);
  let geometryOpen = $state(false);
  let assumptionOpen = $state(false);
  let analysisOpen = $state(false);
  let verificationOpen = $state(true);
  let limitsOpen = $state(false);
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
  /* The state word, for a reader who cannot see the glyph. */
  .sr {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }
</style>
