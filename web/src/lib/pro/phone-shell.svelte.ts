/**
 * The PRO phone shell's state, built once.
 *
 * ── Why this is a module and not two components ────────────────────
 *
 * The shell renders in two places that cannot be one element: the pill row sits OUTSIDE
 * `.pro-content` so it stays pinned, and the command grid sits INSIDE it so it scrolls away
 * with the numbers. `ProPanel`'s own comments explain why both positions are load-bearing —
 * the grid used to sit up with the head and held 256 px of the panel permanently.
 *
 * Two positions, one state: the pills toggle what the grid shows. So the state cannot live in
 * either component.
 *
 * ── And why the two components do NOT each build it ────────────────
 *
 * They could each call `buildProStages` from their own imports, and that is exactly the shape
 * that already shipped a crash. `ProPanel` copied the desktop ribbon's context without four of
 * its imports and threw `ReferenceError: canOpenRebar3D is not defined` on mount — the whole
 * PRO phone shell, not one button — because the grid evaluates every command's gate. Nothing
 * caught it: the ribbon builds its own context from its own imports and never touches this one.
 *
 * A second copy of that construction is a second chance at the same fault. It is built HERE,
 * once, from the panel's own callbacks, and both components read the result.
 *
 * ── What the panel still owns ──────────────────────────────────────
 *
 * `onSolve` and `onReport` are the panel's, not this module's. `handleSolve` runs the pre-solve
 * gate — it reads `checkModel` and refuses, routing the user to Diagnostics — and that refusal
 * is the panel's own, deliberately not moved. See the note in `ProPanel.svelte` about a gate
 * living away from the command it gates.
 */

import { modelStore, resultsStore, uiStore, verificationStore, tabManager } from '../store';
import { detailingStore } from '../store/detailing.svelte';
import { detailingAuthor } from '../store/detailing-author.svelte';
import { canOpenRebar3D, openRebar3D } from '../store/rebar-open';
import { t } from '../i18n';
import { buildProStages, PRO_TAB_STAGE, type ProCmd } from './stages';

void tabManager;

/** What the shell needs from the panel that hosts it. */
export interface PhoneShellDeps {
  /** `modelStore.nodes.size > 0 && elements.size > 0` — the panel already derives it. */
  hasModel: () => boolean;
  /** True while the panel's own solve is in flight. */
  solving: () => boolean;
  /** The panel's Solve, WITH its pre-solve gate. Never `runGlobalSolve` directly. */
  onSolve: () => void;
  /** The panel's report dialog. */
  onReport: () => void;
  /** Clears the panel's tab error when a command changes destination. */
  clearTabError: () => void;
}

export type PhoneShell = ReturnType<typeof createPhoneShell>;

export function createPhoneShell(deps: PhoneShellDeps) {
  /*
   * Read from `lib/pro/stages.ts`, the same definition the desktop ribbon uses. The grid grows
   * downward, which a panel can afford and a row cannot: adding a sixteenth command to ANALYSE
   * makes this one cell longer and changes nothing else.
   */
  const stages = $derived(buildProStages({
    solved: resultsStore.results3D != null || resultsStore.results != null,
    canSolve: deps.hasModel() && !deps.solving(),
    canReport: modelStore.nodes.size > 0,
    onSolve: deps.onSolve,
    onReport: deps.onReport,
    /*
     * The 3-D reinforcement workspace is opened from the panel that owns it, so the phone
     * grid's Rebar-3D command lands on the same operation the ribbon's does — three ways in,
     * one thing that happens.
     */
    onRebar3D: () => openRebar3D({
      author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
      at: new Date().toISOString(),
    }),
    canRebar3D: () => canOpenRebar3D(),
    rebar3DMissingSteps: () => {
      const steps: string[] = [];
      if (resultsStore.results3D == null && resultsStore.results == null) steps.push('proRibbon.need.solve');
      if (verificationStore.providedSummary.total === 0) steps.push('proRibbon.need.design');
      if (detailingStore.assemblies.length === 0) steps.push('proRibbon.need.detailing');
      return steps;
    },
  }));

  /*
   * Which stage the grid is showing. Follows the open tab rather than being a separate
   * selection — two sources of truth for "where am I" is how a ribbon comes to show one stage
   * while the panel shows another. Project belongs to no stage, so the grid keeps showing the
   * one you came from.
   */
  let lastStage = $state('model');
  const mappedStage = $derived(PRO_TAB_STAGE[uiStore.proActiveTab] ?? 'model');
  $effect(() => { if (mappedStage) lastStage = mappedStage; });
  const stage = $derived(stages.find((s) => s.id === (mappedStage || lastStage)) ?? stages[0]);

  /*
   * BY GROUP, not flattened. Flat, ANALYSE was fifteen buttons in five rows with nothing
   * saying where one kind of thing ended and the next began. The stages already carry the
   * grouping the desktop ribbon draws as ruled sections; the phone draws it as headings.
   */
  const groups = $derived(stage ? stage.groups : []);
  const cmds = $derived(groups.flatMap((g) => g.cmds));

  /*
   * The grid folds away once it has been used. ANALYSE has fifteen commands, which is five
   * rows — 256 px of a 300 px sheet. Left permanently open it would push the tab's own content
   * below the fold on the stage where that content matters most. The header re-opens it, and
   * it re-opens itself when the stage changes, because that IS the errand starting again.
   */
  let gridOpen = $state(true);
  $effect(() => { stage; gridOpen = true; });

  let stageMenuOpen = $state(false);

  /*
   * Project is an entry in the COMMAND pill, not a stage. It is the document rather than a
   * step of the work — `PRO_TAB_STAGE` maps it to no stage at all — so choosing it greys the
   * right pill out, because there is no stage to be in while you are looking at the document.
   */
  const onProject = $derived(uiStore.proActiveTab === 'project');

  /** Lit when this command is what the panel or the model is showing. */
  function isActive(c: ProCmd): boolean {
    if (c.tab) return uiStore.proActiveTab === c.tab;
    if (c.diagram) {
      const shown = resultsStore.diagramType === 'axialColor' ? 'axial' : resultsStore.diagramType;
      return shown === c.diagram;
    }
    return false;
  }

  /**
   * The command the panel is currently showing, if any.
   *
   * `isActive` already answers this per command — it is what lights a cell — so the head asks
   * it rather than deciding again from `proActiveTab`. Two answers to "where am I" is how a
   * header comes to name one place while the content shows another.
   */
  const here = $derived(cmds.find((c) => isActive(c)));

  /**
   * Project, which is an entry in the grid but not a command.
   *
   * It has no `ProCmd` to pass to `run` — `PRO_TAB_STAGE` maps it to no stage — so it gets its
   * own opener rather than a hand-written copy of `run`'s three lines in the markup. The copy
   * is how the grid came to reference the panel's `tabError` from a component that does not
   * have one.
   */
  function openProject() {
    deps.clearTabError();
    uiStore.proActiveTab = 'project' as never;
    gridOpen = false;
  }

  function run(c: ProCmd) {
    if (c.enabled && !c.enabled()) return;
    if (c.diagram) resultsStore.diagramType = c.diagram as never;
    if (c.tab) { deps.clearTabError(); uiStore.proActiveTab = c.tab as never; }
    if (c.action) c.action();
    gridOpen = false;
  }

  return {
    get stages() { return stages; },
    get stage() { return stage; },
    get groups() { return groups; },
    get cmds() { return cmds; },
    get here() { return here; },
    get onProject() { return onProject; },
    get gridOpen() { return gridOpen; },
    set gridOpen(v: boolean) { gridOpen = v; },
    get stageMenuOpen() { return stageMenuOpen; },
    set stageMenuOpen(v: boolean) { stageMenuOpen = v; },
    isActive,
    run,
    openProject,
  };
}
