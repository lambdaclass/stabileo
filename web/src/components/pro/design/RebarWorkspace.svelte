<script lang="ts">
  /**
   * The 3-D reinforcement workspace: the whole window, not a corner of it.
   *
   * ── Why this is an overlay at App level ────────────────────────────
   *
   * The viewer was small for a structural reason, not a styling one. It lived at
   * `App → aside.pro-sidebar → ProPanel → ProRcWorkflowTab → DetailingWorkflow →
   * RebarScenePanel → canvas`, and that `aside` takes a fixed pixel width from
   * `uiStore.proPanelWidth`. No amount of width inside it can exceed the sidebar, so
   * inspecting a cage of thousands of bars was being done through a slot a few hundred pixels
   * wide. Widening the sidebar would have traded one cramped surface for another and broken
   * the model view beside it.
   *
   * So the workspace mounts at App level and covers the window. The sidebar keeps the summary
   * and the export; the inspection happens here.
   *
   * ── Why closing does not destroy anything ─────────────────────────
   *
   * All of its state — layers, section, selection, history — lives in `rebarWorkspace`, so
   * the overlay can unmount and come back exactly as it was. And nothing in this file writes
   * to `modelStore`: opening and closing is a view operation, and the project is byte-identical
   * either side of it.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store/model.svelte';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { detailingAuthor } from '../../../lib/store/detailing-author.svelte';
  import { openRebar3D } from '../../../lib/store/rebar-open';
  import { rebarWorkspace, SOLID_KINDS } from '../../../lib/store/rebar-workspace.svelte';
  import {
    filterScene, summariseScene, type SceneFilter,
  } from '../../../lib/engine/detailing/scene-model';
  import { membersFromModel } from '../../../lib/engine/detailing/member-geometry';
  import { cachedSceneModel } from '../../../lib/engine/detailing/scene-cache';
  import {
    reportElementStatus, summariseStatusReasons, type DesignOutcomeSummary,
  } from '../../../lib/engine/detailing/element-status';
  import RebarViewport3D from './RebarViewport3D.svelte';
  import RebarStatusPanel from './RebarStatusPanel.svelte';
  import RebarWorkspaceHeader from './RebarWorkspaceHeader.svelte';
  import ProvisionalBanner from './ProvisionalBanner.svelte';
  import TorsionBanner from './TorsionBanner.svelte';
  import SelectionDetails from './SelectionDetails.svelte';
  import { buildOutcomeSummaries } from '../../../lib/store/element-status-join';
  import RebarLayersPanel from './RebarLayersPanel.svelte';
  import { markOpenPhase } from '../../../lib/utils/open-timeline';
  import { captureFocus, cycleTabWithin } from '../../../lib/utils/dialog-focus';

  let viewport = $state<RebarViewport3D | null>(null);
  /** True while the viewport's first geometry build is still pending. */
  let building = $state(false);
  /**
   * The rail starts closed on a small screen.
   *
   * There it is a sheet OVER the canvas rather than a column beside it, so opening by default
   * would cover the viewport with a control panel the moment the workspace appears — hiding
   * the thing the user came to look at behind the settings for looking at it.
   */
  let railOpen = $state(
    typeof window === 'undefined' ? true : window.innerWidth > 860);

  const doc = $derived(detailingStore.document);

  /**
   * Rebuild the document under the open workspace.
   *
   * The SAME operation the four entry points perform — `openRebar3D` builds and opens, and
   * opening an already-open workspace is a no-op. Calling `buildDocument` directly here would
   * be a fifth way to produce the picture, which is the thing `rebar-open.ts` exists to stop:
   * "buttons with the same name must not be different operations".
   */
  function rebuildDocument(): void {
    openRebar3D({
      author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
      at: new Date().toISOString(),
    });
  }

  /** The full scene, with concrete for every member the model states. */
  const built = $derived.by(() => {
    if (!doc) return null;
    const elementIds = [...modelStore.model.elements.keys()].sort((a, b) => a - b);
    const { members, refused } = membersFromModel({
      elementIds,
      nodes: [...modelStore.model.nodes.values()],
      elements: [...modelStore.model.elements.values()],
      sections: [...modelStore.model.sections.values()],
    });
    /**
       * Cached against the document and the member geometry.
       *
       * Sampling 20 917 bars is the expensive step, and it was repeated on every reactive
       * touch because `membersFromModel` returns a fresh array each call. The cache answers
       * the only question that matters — same document, same members — so a checkbox, a
       * slider or a selection no longer rebuilds the projection.
       */
      const scene = cachedSceneModel(doc, members);
      markOpenPhase('scene');
      return { scene, refused };
  });

  /**
   * The design outcomes, reduced to what the status join needs.
   *
   * Read here rather than inside the scene, because the scene is a projection of the document
   * and a design outcome is not in it. This is the one place the two halves meet.
   */
  const outcomes = $derived(buildOutcomeSummaries());

  const report = $derived(built ? reportElementStatus(built.scene, outcomes) : null);

  /**
   * The shared causes behind the states, commonest first.
   *
   * On the 7-storey example 117 of 119 beams land in UNSUPPORTED for ONE reason. Without this
   * the panel reports "UNSUPPORTED 117" and the user has to open members one at a time to
   * discover that — or, worse, concludes the viewer lost their steel. See
   * `summariseStatusReasons` for why the grouping is on the reason KEY.
   */
  const reasonGroups = $derived(report ? summariseStatusReasons(report.entries) : []);

  /**
   * The design's own sentence for each member, translated once.
   *
   * The reason already exists — `design.reason.secondaryAxisUnchecked` carries the axis and
   * the ratio — and was reaching nothing the user could read. A state name is a label; this is
   * the explanation.
   */
  const reasons = $derived.by(() => {
    const m = new Map<number, string>();
    for (const id of modelStore.model.elements.keys()) {
      const r = verificationStore.outcomeFor(id)?.reasons?.[0];
      if (r) m.set(id, tp(r.key, (r.params ?? {}) as Record<string, string | number>));
    }
    return m;
  });

  /** Families with a switch but no members in this model. */
  const emptyKinds = $derived.by(() => {
    if (!built) return [];
    const present = new Set(built.scene.solids.map((x) => x.kind));
    return SOLID_KINDS.filter((k) => !present.has(k));
  });

  /** Transverse pieces by kind, so a hoop is distinguishable from a single-leg crosstie. */
  const pieces = $derived.by(() => {
    if (!visible) return [];
    const m = new Map<string, number>();
    for (const b of visible.bars) {
      if (b.piece === 'longitudinal') continue;
      m.set(b.piece, (m.get(b.piece) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  /**
   * The members a status filter admits.
   *
   * Null when no filter is active, which is NOT the same as an empty list: an empty list means
   * "no member matches" and must show nothing, and that distinction is the one a filter UI
   * gets wrong by default.
   */
  const statusElementIds = $derived.by(() => {
    if (!report || rebarWorkspace.statusFilter.length === 0) return null;
    return report.entries
      .filter((e) => rebarWorkspace.statusFilter.includes(e.status))
      .map((e) => e.elementId);
  });

  /**
   * The eight switches, as one filter.
   *
   * The translation itself lives in the store, as a pure function of the switch positions.
   * It was inline here, and that is exactly where the unit suite could not reach it: this
   * component cannot be mounted in the test environment, so every toggle test had to restate
   * the translation instead of exercising it.
   */
  const filter = $derived<SceneFilter>(rebarWorkspace.filterFor(statusElementIds));

  const visible = $derived(built ? filterScene(built.scene, filter) : null);
  const summary = $derived(visible ? summariseScene(visible) : null);

  const selectedBar = $derived.by(() => {
    const id = rebarWorkspace.selection?.barId;
    return id && visible ? visible.bars.find((b) => b.barId === id) ?? null : null;
  });

  /**
   * The concrete for the current selection, however it was made.
   *
   * A click in the viewport names a solid directly. A click in the MEMBER LIST names only an
   * element id — and resolving that back to its solid here is what stops the inspector saying
   * "nothing selected" about the member the user just chose from a list of members. Without
   * it, the list selects and focuses correctly and then reports nothing, which reads as the
   * list being broken.
   */
  const selectedSolid = $derived.by(() => {
    if (!visible) return null;
    const sel = rebarWorkspace.selection;
    if (!sel) return null;
    if (sel.solidId) return visible.solids.find((s) => s.id === sel.solidId) ?? null;
    if (sel.barId) return null;
    const id = sel.elementIds[0];
    return id === undefined
      ? null
      : visible.solids.find((s) => s.elementIds.includes(id)) ?? null;
  });

  /** What the inspector reports as the member, even when no solid could be resolved. */
  const selectedElementIds = $derived(
    selectedBar?.elementIds ?? selectedSolid?.elementIds
    ?? rebarWorkspace.selection?.elementIds ?? []);

  const selectedStatus = $derived.by(() => {
    const ids = rebarWorkspace.selection?.elementIds ?? [];
    if (!report || ids.length === 0) return null;
    return report.entries.find((e) => e.elementId === ids[0]) ?? null;
  });

  function fmt(n: number, digits = 2): string {
    return n.toLocaleString(i18n.locale, {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
  }

  // The camera follows the store's focus requests. A nonce drives it, so asking for the same
  // member twice works — which is what "I orbited away, take me back" is.
  let lastNonce = -1;
  /**
   * The member the camera is actually on.
   *
   * Set from the RETURN of `focusElement`, not from the request. A request for a member that
   * has been filtered out cannot be served — the viewport leaves the camera where it is
   * rather than flying to the origin — and recording the request would then claim a move that
   * never happened. It is also the only thing a test can observe about the camera without
   * reaching into Three.js.
   */
  let focusedElement = $state<number | null>(null);
  $effect(() => {
    const req = rebarWorkspace.focusRequest;
    if (!req || req.nonce === lastNonce) return;
    lastNonce = req.nonce;
    if (viewport?.focusElement(req.elementId)) focusedElement = req.elementId;
  });

  /**
   * Focus management for a dialog that claims to be modal.
   *
   * `docs/handoffs/pr20-ui-and-workflow-plan.md` §5.2 lists this first among the overlay's
   * accessibility defects, as the one that makes the feature unusable rather than degraded:
   * the overlay declares `aria-modal="true"` and then let Tab walk straight into the page it
   * had just told a screen reader was not there. The mechanism lives in
   * `lib/utils/dialog-focus.ts`; what belongs here is only when it runs.
   *
   * The opener is the detailing panel's button, which this overlay covers — so without the
   * restore, Escape returned the user to `<body>` rather than to the control they left.
   */
  let dialogEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!rebarWorkspace.open) return;
    return captureFocus(dialogEl);
  });

  function onKeydown(e: KeyboardEvent) {
    if (!rebarWorkspace.open) return;
    if (e.key === 'Escape') { rebarWorkspace.close(); return; }
    if (cycleTabWithin(dialogEl, e)) e.preventDefault();
  }

  /**
   * Fold the rail away when the window becomes narrow, and only then.
   *
   * Below the breakpoint the rail stops being a column beside the canvas and becomes a sheet
   * over it, so a window that was wide and is now narrow ends up with the controls covering
   * the model. Reacting to the CROSSING rather than to every resize is what keeps this from
   * fighting a user who deliberately opened the rail on a narrow window.
   */
  let wasWide = typeof window === 'undefined' ? true : window.innerWidth > 860;
  function onResize() {
    const wide = window.innerWidth > 860;
    if (wide !== wasWide) {
      wasWide = wide;
      railOpen = wide;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} onresize={onResize} />

{#if rebarWorkspace.open}
  <div
    class="workspace"
    data-testid="rebar-workspace"
    role="dialog"
    aria-modal="true"
    aria-label={t('detailing.scene.workspace.title')}
    bind:this={dialogEl}
    tabindex="-1"
  >
    <RebarWorkspaceHeader
      readiness={built?.scene.readiness ?? null}
      revision={built?.scene.revision ?? null}
      {summary}
      {fmt}
      bind:railOpen
      canGoBack={rebarWorkspace.canGoBack}
      onBack={() => rebarWorkspace.goBack()}
      onFitView={() => viewport?.fitView()}
      onClose={() => rebarWorkspace.close()}
    />

    <ProvisionalBanner count={built?.scene.provisionalMembers.length ?? 0} />
    <TorsionBanner count={built?.scene.torsionUnevaluatedMembers.length ?? 0} />

    <div class="body" class:rail-open={railOpen}>
      <aside class="rail" data-testid="rebar-rail" aria-hidden={!railOpen}>
        <RebarLayersPanel {summary} {emptyKinds} {pieces} bounds={built?.scene.bounds ?? null} />

        {#if report}
          <RebarStatusPanel {report} {reasons} {reasonGroups} />
        {/if}
      </aside>

      <main class="stage">
        {#if built}
          <!--
            The WHOLE scene, plus the filter as a separate input.

            The viewport used to be handed `visible` — the filtered scene — and that is what made
            every layer switch cost seconds: a smaller scene has a different signature, and a
            different signature meant re-tubing all 20 917 bars to answer a checkbox. It builds
            once from everything the document contains and switches batches instead.

            `visible` is still computed, because the tally, the inspector and the piece counts are
            all statements about what is ON SCREEN. Filtering arrays of bars is milliseconds;
            rebuilding their geometry was seconds.
          -->
          <RebarViewport3D
            bind:this={viewport}
            scene={built.scene}
            {filter}
            diameterScale={rebarWorkspace.diameterScale}
            showConcrete={rebarWorkspace.showConcrete}
            showConflicts={rebarWorkspace.showConflicts}
            concreteOpacity={rebarWorkspace.concreteOpacity}
            selectedBarId={rebarWorkspace.selection?.barId ?? null}
            section={rebarWorkspace.section}
            height="100%"
            onselect={(pick) => rebarWorkspace.select(pick)}
            onbuildstate={(b) => { building = b; }}
          />
          {#if building}
            <!--
              What the user sees INSTEAD of a frozen window.

              The cage is 20 917 tubes and 39 240 conflict markers once the floors are designed,
              and materialising that on the GPU takes seconds no matter how it is scheduled. What
              is not acceptable is spending those seconds with nothing on screen, which is what
              "the button does not respond" was: the build ran inside `onMount`, before the
              browser's first paint, so the click produced no visible change at all.

              The viewport now paints first and reports that it is still building, so this says
              so. It is a STATEMENT, not a decoration: while it is up, what is behind it is not
              the finished scene and is not presented as one.
            -->
            <div class="building" data-testid="rebar-workspace-building" role="status">
              <span class="spinner" aria-hidden="true"></span>
              <span>{tp('detailing.scene.building', { bars: built.scene.bars.length })}</span>
            </div>
          {/if}
        {:else}
          <!--
            Two reasons for an empty viewport, and they are different statements.

            `detailing.scene.empty` reads as "nothing has been coordinated", and until objective
            10 that was the only way to get here. It no longer is: an edit to a member's
            reinforcement now retires the current document — which is correct, the cage on
            screen stopped matching the model — and the viewer went blank claiming there was
            nothing to draw. There is; it is out of date, which is a different thing and has a
            different answer.

            The assemblies themselves are what tell the two apart: they exist and are stale, or
            they do not exist at all.
          -->
          {#if detailingStore.assemblies.length > 0}
            <div class="empty" data-testid="rebar-workspace-stale" role="status">
              <p>{t('detailing.scene.retired')}</p>
              <button type="button" data-testid="rebar-workspace-rebuild"
                      onclick={rebuildDocument}>{t('detailing.scene.rebuild')}</button>
            </div>
          {:else}
            <p class="empty" data-testid="rebar-workspace-empty">
              {t('detailing.scene.empty')}
            </p>
          {/if}
        {/if}

        <div
          class="inspector"
          data-testid="rebar-inspector"
          data-focused={focusedElement ?? ''}
        >
          <SelectionDetails
            bar={selectedBar}
            solid={selectedSolid}
            conflict={rebarWorkspace.selection?.conflict ?? null}
            elementIds={selectedElementIds}
            status={selectedStatus}
            reason={selectedStatus ? reasons.get(selectedStatus.elementId) ?? null : null}
            torsionUnevaluated={selectedElementIds.some(
              (id) => built?.scene.torsionUnevaluatedMembers.includes(id) ?? false)}
          />
        </div>
      </main>
    </div>
  </div>
{/if}

<style>
  .workspace {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: flex;
    flex-direction: column;
    background: var(--st-bg);
    color: var(--st-text);

    /* Mounted OUTSIDE `.app-container`, the one element declaring the app font, so it
       inherited `-apple-system`. The mount point is deliberate and stays; see
       `docs/handoffs/h1a-concrete-flow-audit.md` §4. */
    font-family: var(--st-sans);

    /*
       ── Why the workspace looked like a different application ───────

       The viewer and its four child panels make thirty `var()` calls against
       `--text`, `--text-muted`, `--st-border` and `--panel`. None of those four custom
       properties is defined ANYWHERE in the application. Every call therefore fell through
       to its hard-coded fallback, and the whole 3-D surface ended up painted from a private
       literal palette that no token could reach — not by having chosen its own colours, but
       by pointing at a palette that was never written.

       Defining them here fixes all thirty at once. Custom properties inherit through the
       DOM rather than through component boundaries, and every child renders inside this
       element, so `RebarLayersPanel`, `RebarStatusPanel`, `SelectionDetails` and
       `RebarViewport3D` pick them up without a line changing in any of them.

       The fallbacks stay where they are. If this element is ever bypassed, the viewer
       renders in its old literals rather than unstyled — a worse look, not a broken one.

       What is deliberately NOT aliased: the state colours. Provisional violet, conflict red,
       unreinforced orange and selection yellow are owned by `three/rebar-scene.ts`, which
       feeds numeric hexes to Three.js materials and cannot read a custom property. Aliasing
       the panel's copies would let the picture and the words beside it drift apart.
    */
    --text: var(--st-text);
    --text-muted: var(--st-text-2);
    --st-border: var(--st-hair-strong);
    --panel: var(--st-surface);
  }

  /* Controls do not inherit a font: 12 buttons and 13 inputs in here were Arial. Scoped to
     `.workspace` — the rest of the application has the same defect at a far larger scale and is
     not H1's file to fix. `font-family`, not `font`, which would reset deliberate sizes. */
  .workspace :global(button), .workspace :global(input),
  .workspace :global(select), .workspace :global(textarea) { font-family: inherit; }

  /* The container is `tabindex="-1"` purely as a landing pad for focus on open, so it can
     never be tabbed TO and a ring around the whole window would only say "something is
     broken". Every control inside it keeps its own. */
  .workspace:focus { outline: none; }
  /*
    The workspace chrome speaks the application's palette.

    It used to carry its own hexes — #141a23 for the bar, #232a35 for the hairlines, #1e2733 for
    the buttons — which is why the viewer read as a separate program docked inside Stabileo. The
    tokens are the same ones the PRO panel and the ribbon use, so the overlay is a VIEW of this
    app rather than another one. Nothing about the scene, the batching or the states changed.
  */
  .body { display: flex; flex: 1 1 auto; min-height: 0; }
  .rail {
    width: 17rem; flex: 0 0 auto; overflow-y: auto;
    border-right: 1px solid var(--st-hair); padding: 0.6rem;
    background: var(--st-surface);
    display: flex; flex-direction: column; gap: 0.7rem;
  }
  /**
   * The rail's sections keep their own height. The RAIL scrolls.
   *
   * ── The section that vanished ──────────────────────────────────
   *
   * A flex column shrinks its items when they do not fit, and `.status` carries
   * `min-height: 0` — a leftover from when the member list had a scroller of its own. That
   * removes its automatic minimum size, so it is the one item in this column that can be
   * crushed to nothing, and it is the LAST one, so it absorbs every pixel the others do not
   * give up.
   *
   * Adding a second banner above the body took about 40 px off the rail, and on a 1280 × 720
   * window that was enough: the whole status panel — the state counts, the causes, the member
   * list — collapsed to zero height. Not scrolled out of view, which the rail's own scrollbar
   * would have answered: gone, with the scrollbar reporting nothing to scroll.
   *
   * Stated on the CHILDREN rather than by deleting one `min-height`, because the property that
   * has to hold is about the rail and not about that panel: this is a scrolling sidebar, and a
   * scrolling sidebar's sections are their own height by definition. Any section added later
   * inherits it.
   */
  .rail > :global(*) { flex: 0 0 auto; }
  .body:not(.rail-open) .rail { display: none; }
  .stage { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; position: relative; }
  /* Over the canvas, not in the layout: appearing must not resize the viewport, because a
     resize reallocates the drawing buffer and that is the cost this is announcing. */
  .building {
    position: absolute; inset: auto 0 1rem 0; margin: 0 auto; width: max-content;
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0.8rem; border-radius: 999px;
    background: var(--st-surface-2, #1b2130); border: 1px solid var(--st-border, #2c3444);
    color: var(--text, #d7dce6); font-size: 0.76rem; pointer-events: none; z-index: 2;
  }
  .spinner {
    width: 0.8rem; height: 0.8rem; border-radius: 50%;
    border: 2px solid var(--st-border, #2c3444); border-top-color: #6fa8ff;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  .stage :global(.rebar-viewport) { flex: 1 1 auto; border: none; border-radius: 0; }

  /*
     Twenty-six rules stood here and reached nothing.

     They styled the rail's headings, labels, sliders, section-cut button, tally table and
     inspector list — markup that was extracted into `RebarLayersPanel`, `RebarStatusPanel`
     and `SelectionDetails`. Svelte scopes styles to the component that declares them, so the
     moment the markup moved the rules stopped matching, and every one of them was reported as
     an unused selector on every build. The children carry their own copies; nothing here was
     the only definition of anything, which is why deleting them changes no pixel.

     They are gone rather than kept "just in case" for the reason `.autosave-banner` taught:
     a rule left behind after its markup leaves is not a spare, it is a decoy that the next
     person edits expecting an effect.
  */

  .empty { padding: 2rem; text-align: center; color: var(--st-text-2); }

  /**
   * Mobile: the rail becomes a sheet over the canvas rather than a column beside it.
   *
   * A 17 rem column on a 390 px screen leaves the viewport unusable, and the viewport is the
   * reason the workspace exists. The rail is one tap away and starts closed.
   */
  @media (max-width: 860px) {
    .body { position: relative; }
    .rail {
      position: absolute; inset: 0 auto 0 0; z-index: 2;
      width: min(20rem, 88vw);
      background: var(--st-surface);
      box-shadow: 0 0 24px rgba(0, 0, 0, 0.5);
    }
    /* `.inspector dl` went with the rest: the list is `SelectionDetails`' markup now, and it
       already collapses to two columns at every width. The container is still ours. */
    .inspector { max-height: 9rem; }
  }
</style>
