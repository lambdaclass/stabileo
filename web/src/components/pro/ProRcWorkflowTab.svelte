<script lang="ts">
  /**
   * RC Design Workflow — single entry point for RC design.
   *
   * Verification now appears inline within each expanded element row in the
   * Design tab. The separate RC Verification subtab has been removed.
   *
   * Verification state lives in verificationStore (single source of truth).
   * This component is a thin layout wrapper — no props needed.
   *
   * The regulation settings sit above the design table, collapsed by default, because
   * they are project facts that decide which rules the table below was produced under.
   * They are one disclosure away rather than in a dialog, so a reviewer can always see
   * which edition and which aggregate size a result belongs to.
   */
  import ProDesignTab from './ProDesignTab.svelte';
  import RcStageTimeline from './design/RcStageTimeline.svelte';
  import DesignOverview from './design/DesignOverview.svelte';
  import StageSection from './design/StageSection.svelte';
  import ProjectRegulationsPanel from './design/ProjectRegulationsPanel.svelte';
  import DetailingWorkflow from './design/DetailingWorkflow.svelte';
  import DocumentsSection from './design/DocumentsSection.svelte';
  import FloorFamiliesPanel from './design/FloorFamiliesPanel.svelte';
  import { detailingStore } from '../../lib/store/detailing.svelte';
  import { verificationStore } from '../../lib/store';
  import { modelStore } from '../../lib/store/model.svelte';
  import { t, tp } from '../../lib/i18n/store.svelte';
  import { regulationsStore } from '../../lib/store/regulations.svelte';
  import {
    RC_STAGES, rcModelReadiness, rcStageSectionState, rcStages,
    type RcFlowReadings, type RcStageId,
  } from '../../lib/flow/rc-stages';
  import { resultsStore } from '../../lib/store/results.svelte';

  const footingCount = $derived(modelStore.model.footings.size);
  /**
   * Footings the last run could not verify, surfaced on the closed summary.
   *
   * A footing that silently failed to be checked is the failure mode this whole entity
   * exists to prevent, so the count is visible without opening the panel.
   */
  const notVerifiedCount = $derived(detailingStore.footingsNotVerified.length);

  /**
   * The header badge reflects anything the reviewer has to see without opening the panel:
   * a pending regulation change, an incomplete configuration, or a stack problem.
   */
  const needsAttention = $derived(
    regulationsStore.pending.length > 0 || regulationsStore.validation.problems.length > 0,
  );

  /**
   * Navigation for the stage timeline.
   *
   * Opening a `<details>` and scrolling it into view is the whole of it. The timeline
   * deliberately does not RUN anything — the commands stay the single place work is started
   * from — so it cannot become a second, competing command surface.
   */
  let regsOpen = $state(false);
  let detailingOpen = $state(false);
  let floorsOpen = $state(false);
  /** Open by default: it answers the question a reviewer arrives with. */
  let overviewOpen = $state(true);
  let documentsOpen = $state(false);

  /**
   * Which stage the reader is inside, derived from the disclosures themselves.
   *
   * Derived and not stored, which is what keeps "the timeline's reading marker" and "the open
   * `<details>`" from becoming two states that can disagree. Opening a section by hand moves
   * the marker for the same reason clicking the marker opens the section: there is only one
   * fact, and it lives in these five booleans.
   *
   * Last-wins when several are open, matching reading order: the one furthest down the pipeline
   * is the one being worked in.
   */
  const openStage = $derived<RcStageId | null>(
    documentsOpen ? 'documents'
      : detailingOpen ? 'detailing'
        : floorsOpen ? 'design'
          : regsOpen ? 'codes'
            : overviewOpen ? 'model' : null,
  );

  /**
   * Open the Project Regulations stage and put the caret in its selector.
   *
   * Lives here rather than in the overview because this component owns `regsOpen`; the overview
   * asks, and does not reach across the tree to force a `<details>` open.
   */
  function openRegulations() {
    goToStage('codes');
  }

  /**
   * Open a stage and take the reader there.
   *
   * Focus goes to the disclosure's own `<summary>`, not to the container. Scrolling alone moves
   * the eye and leaves the keyboard where it was, so the next Tab would continue from wherever
   * the timeline button sat — which on a five-stage strip is usually the wrong section
   * entirely. `RC_STAGES` supplies the testid, so the timeline and the sections cannot drift
   * apart the way the six-versus-five lists did.
   */
  function goToStage(target: RcStageId) {
    overviewOpen = target === 'model';
    regsOpen = target === 'codes';
    floorsOpen = target === 'design';
    detailingOpen = target === 'detailing';
    documentsOpen = target === 'documents';

    const testid = RC_STAGES.find((s) => s.id === target)?.disclosure;
    if (!testid) return;
    queueMicrotask(() => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      el?.scrollIntoView({ block: 'nearest' });
      (el?.querySelector(':scope > summary') as HTMLElement | null)?.focus();
      // Regulations is the one stage whose work starts in a control rather than in a reading:
      // the selector IS the step. Focusing it saves a Tab and matches what the old
      // `openRegulations` did before the timeline owned navigation.
      if (target === 'codes') {
        (document.querySelector('[data-testid="project-regulations"] select') as HTMLElement | null)
          ?.focus();
      }
    });
  }

  /**
   * The pipeline's state, derived ONCE.
   *
   * Both the timeline and the five disclosures below read this array. They used to be two
   * independent derivations — the strip had its own six-stage list, the sections had five
   * ad-hoc `$derived`s — and two derivations of the same thing is how a section comes to show
   * a finished step under a strip that says it is current.
   *
   * Every reading is the fact the command that performs the step gates on, so a stage cannot
   * claim the work is complete while the button that does it is still lit.
   */
  const readings = $derived<RcFlowReadings>({
    hasModel: modelStore.nodes.size > 0,
    solved: resultsStore.results3D !== null || resultsStore.results !== null,
    analysisStale: verificationStore.isBaselineStale,
    codeChosen: regulationsStore.concreteDesignCode() !== null,
    hasDemands: verificationStore.demandRevision > 0,
    designed: verificationStore.providedSummary.total > 0,
    verified: verificationStore.baselineRevision > 0,
    detailed: detailingStore.assemblies.length > 0,
    documented: detailingStore.document !== null,
  });
  const stages = $derived(rcStages(readings));
  const readiness = $derived(rcModelReadiness(readings));

  /** One stage's state, narrowed to what the shared `StageSection` can draw. */
  function sectionState(id: RcStageId) {
    const s = stages.find((x) => x.id === id);
    return s ? rcStageSectionState(s) : 'blocked';
  }

  const detailed = $derived(detailingStore.assemblies.length > 0);
  const overviewTotal = $derived(verificationStore.providedSummary.total);

  /**
   * The floor pass has its own state, and it is not the DISEÑAR stage's.
   *
   * They are different subjects, not two states of one thing: DISEÑAR is a required stage of
   * the pipeline, and the floor run is an OPTIONAL step inside it — a frame-only building never
   * opens this section, which is exactly what its chip has always said. Driving the chip from
   * the stage would make it read "waiting" for a step nobody has to take.
   *
   * The timeline still counts this disclosure as DISEÑAR's, because it is the only `<details>`
   * the stage owns; beams and columns are designed in `ProDesignTab` below. §2 folds the two
   * into one stage, and until it does this is the honest split rather than a tidier lie.
   */
  const floorsState = $derived(
    detailingStore.lastFloorRun ? 'done' as const : 'optional' as const);
</script>

<div class="rc-workflow">
  <!--
    Where you are, before what you can press.

    The tab used to open on three collapsed disclosures and a wrapping row of six commands, in an
    order a reader had to infer from which buttons were grey. The strip states the order once and
    names what each unreached step is waiting for; clicking one opens the disclosure that owns it.
    See `RcStageTimeline.svelte` for why it navigates rather than acts, and why the concrete
    flow has its own strip instead of the shared one.
  -->
  <RcStageTimeline {stages} {readiness} onGoTo={goToStage} {openStage} />

  <!--
    The state of the project, FIRST.

    The regulation in force and the count of every member used to be the last things in the tab —
    inside the command bar, below three collapsible stages. On a 720 px window that meant scrolling
    past regulations, floors and detailing to learn which code the project is checked against and
    that five members do not verify. It opens expanded because it is the answer to the first
    question; it collapses because a reviewer working inside a later stage does not need it.
  -->
  <StageSection
    testid="design-overview-disclosure"
    step={1}
    title={t('design.overview.title')}
    purpose={t('design.overview.purpose')}
    state={sectionState('model')}
    badge={overviewTotal > 0 ? overviewTotal : undefined}
    badgeTestid="design-overview-count"
    bind:open={overviewOpen}
  >
    <DesignOverview onOpenRegulations={openRegulations} />
  </StageSection>

  <StageSection
    testid="code-settings-disclosure"
    step={2}
    title={t('regulations.title')}
    purpose={t('design.stagePurpose.regulations')}
    state={sectionState('codes')}
    attention={needsAttention ? t('codes.provenance.assumed') : undefined}
    attentionTestid="code-settings-attention"
    bind:open={regsOpen}
  >
    <ProjectRegulationsPanel />
  </StageSection>

  <!--
    Slabs, walls and foundations, ABOVE detailing.

    It used to sit below, which put an optional step that must run BEFORE detailing after it in
    reading order. Its own copy says when to run it; its position now says the same thing without
    being read. It stays a section of its own because a frame-only building never opens it.
  -->
  <StageSection
    testid="floor-families-disclosure"
    step={3}
    title={t('detailing.floorRun.title')}
    purpose={t('design.stagePurpose.floors')}
    state={floorsState}
    badge={footingCount > 0 ? footingCount : undefined}
    badgeTestid="floor-footing-count"
    attentionTestid="floor-not-verified-count"
    attention={notVerifiedCount > 0
      ? tp('design.stagePurpose.floorsNotVerified', { n: notVerifiedCount })
      : undefined}
    bind:open={floorsOpen}
  >
    <FloorFamiliesPanel />
  </StageSection>

  <StageSection
    testid="detailing-disclosure"
    step={4}
    title={t('detailing.title')}
    purpose={t('design.stagePurpose.detailing')}
    state={sectionState('detailing')}
    blockedBy={t('design.stage.needDesign')}
    badge={detailed ? detailingStore.assemblies.length : undefined}
    badgeTestid="detailing-count"
    bind:open={detailingOpen}
  >
    <DetailingWorkflow />
  </StageSection>

  <!--
    Documents and professional review, as stage 6.

    They were the tail of the detailing panel: to reach `Issue for construction` you opened
    detailing, selected an assembly and scrolled past the bar list, the conflicts, the sheet and
    the schedule. The workflow strip has always counted Documents as a stage of its own; the panel
    now agrees with it.
  -->
  <StageSection
    testid="documents-disclosure"
    step={5}
    title={t('detailing.doc.title')}
    purpose={t('design.stagePurpose.documents')}
    state={sectionState('documents')}
    blockedBy={t('design.stage.needDetailing')}
    bind:open={documentsOpen}
  >
    <DocumentsSection />
  </StageSection>

  <ProDesignTab />
</div>

<style>
  /*
   * The column SCROLLS. It used to be `overflow: hidden`, and that was a real defect.
   *
   * Each open disclosure may claim up to 55vh or 70vh, so two of them open exceed the
   * viewport — and with the overflow hidden and no scroll path, everything past 100% became
   * unreachable. Not merely ugly: an ENABLED command could sit outside the viewport, where a
   * real pointer event lands on nothing at all. Measured with three disclosures open at a
   * 1280×720 viewport, the Generate detailing button reported a box at y = 874 and
   * `document.elementFromPoint` at its centre returned null, while a programmatic
   * `.click()` — which bypasses hit-testing — still worked. A user in that state clicks and
   * the app does nothing, with no error and no explanation.
   *
   * `min-height: 0` is what lets a flex child actually shrink so its own `overflow: auto`
   * engages instead of the child forcing the column taller.
   */
  .rc-workflow {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .rc-workflow > :global(*:last-child) { flex: 1 1 auto; min-height: 18rem; overflow: hidden; }
  /*
    The per-section height caps that used to live here are gone.

    `.code-settings-disclosure[open] { max-height: 55vh; overflow: auto }` and its two siblings gave
    each open section its own scrollbar inside a column that already scrolls. Two consequences, both
    real: crossing one section took two wheel gestures, and a sticky section title stuck to the
    NESTED box — which is why scrolling inside "Slabs, walls and foundations" left the regulations
    title pinned above it, naming a section the reader had already left.

    (They were also dead selectors: `StageSection` renders `class="stage"`, not these names, so they
    matched nothing. Removed rather than corrected — the caps are the wrong idea, not a typo.)
  */
  /*
    Why this stage carries a tag.

    "Slabs, walls and foundations" sits beside "Coordinated detailing" as a peer, and a reader has
    no way to tell that it is OPTIONAL and that it runs BEFORE detailing when the building has
    shells. It stays a section of its own — a frame-only building never opens it, and folding it
    into detailing would make every project pay for a step most do not need — but it now says
    which step it is.
  */
  .stage-tag {
    font-size: 0.65rem; font-weight: 600; letter-spacing: 0.03em;
    padding: 0.05rem 0.35rem; border-radius: 3px;
    border: 1px solid var(--st-hair-strong); color: var(--st-text-2);
  }
  .count { font-size: 0.72rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 3px; background: rgba(143, 163, 179,0.3); }
  summary {
    cursor: pointer;
    padding: 0.45rem 1rem;
    font-size: 0.85rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  summary:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
  /* Assumed state is never green. */
  .attention {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    background: var(--st-surface-3);
    color: var(--st-text);
  }
</style>
