/**
 * "Dibujar una viga" — build one specific structure, start to finish.
 *
 * # Why it does not let you draw anything you like
 *
 * A free-form modelling tutorial cannot check its own work. Left to place
 * nodes anywhere, a reader arrives at Solve with a mechanism, gets a red
 * error, and the walkthrough ends in a failure it caused. With one target —
 * a simply supported beam under a distributed load — every step has a
 * condition that either holds or does not, and the last step is guaranteed to
 * produce a result.
 *
 * # Why the drawing steps spotlight the CANVAS
 *
 * They pointed at the ribbon command instead, which is where the tool is
 * armed — and the overlay then darkened everything except a button the reader
 * had no reason to press, while the model they were being asked to draw on
 * sat behind the dark. The step cannot be completed and there is no way
 * forward, because it is waiting for two nodes that cannot be placed.
 *
 * The tool is armed by the step itself, so the command needs no pointing at.
 * What the reader needs to see is where to click.
 *
 * # Why sections and materials come before solving
 *
 * They are model data, not an adjustment: a member has a section and a
 * material from the moment it exists, and the solver reads both. An earlier
 * draft of this walkthrough put them after Solve, to show the deflection
 * changing as the section changed — a real effect, taught in the wrong order.
 * Somebody learning this would come away believing the section is something
 * you revisit afterwards, and the order a tutorial demonstrates is the order
 * it teaches.
 *
 * The effect survives anyway, in the last card: change the section and press
 * Solve again. That is also closer to the truth, because seeing it means
 * running the analysis twice.
 */

import type { TourStep } from '../../store/tour.svelte';
import { t } from '../../i18n';
import { ANCHORS, clearModel, solve, hasResults, setDimension, armTool, count, openPanel } from '../demo-helpers';
import { resultsStore } from '../../store';

export function buildModelling2D(): TourStep[] {
  return [
    {
      id: 'welcome',
      target: 'none',
      title: t('demo.modelling.welcomeTitle'),
      description: t('demo.modelling.welcomeDesc'),
      position: 'center',
      onEnter: () => {
        setDimension('2d');
        clearModel();
      },
    },

    {
      id: 'nodes',
      target: ANCHORS.viewport,
      highlightPadding: 0,
      overlayOpacity: 0.35,
      title: t('demo.modelling.nodesTitle'),
      description: t('demo.modelling.nodesDesc'),
      position: 'bottom',
      allowInteraction: true,
      /*
       * Clears here as well as on the welcome card, and that is not belt and
       * braces — it is a race.
       *
       * The auto-advance is armed only if the step's condition is UNMET when
       * the step opens. If the previous model is still loaded at that moment,
       * "two nodes exist" is already true, the advance is never armed, and the
       * reader places two nodes into a walkthrough that will not move. Clearing
       * inside this step's own `onEnter` puts the emptying before the arming,
       * because `onEnter` runs first and the arming is an effect.
       */
      onEnter: () => { clearModel(); armTool('node'); openPanel('data'); },
      // Two is all a single-span beam needs, and asking for exactly what is
      // needed keeps the check honest.
      waitFor: () => count.nodes() >= 2,
      autoAdvance: true,
    },

    {
      id: 'member',
      target: ANCHORS.viewport,
      highlightPadding: 0,
      overlayOpacity: 0.35,
      title: t('demo.modelling.memberTitle'),
      description: t('demo.modelling.memberDesc'),
      position: 'bottom',
      allowInteraction: true,
      // The tool AND its data tab: a reader who is drawing should see the rows
      // appear as they click, not the Project panel they opened the menu from.
      onEnter: () => { armTool('element'); openPanel('data'); },
      waitFor: () => count.elements() >= 1,
      autoAdvance: true,
    },

    {
      id: 'supports',
      target: ANCHORS.viewport,
      highlightPadding: 0,
      overlayOpacity: 0.35,
      title: t('demo.modelling.supportsTitle'),
      description: t('demo.modelling.supportsDesc'),
      position: 'bottom',
      allowInteraction: true,
      // The tool AND its data tab: a reader who is drawing should see the rows
      // appear as they click, not the Project panel they opened the menu from.
      onEnter: () => { armTool('support'); openPanel('data'); },
      waitFor: () => count.supports() >= 2,
      autoAdvance: true,
    },

    {
      id: 'load',
      target: ANCHORS.viewport,
      highlightPadding: 0,
      overlayOpacity: 0.35,
      title: t('demo.modelling.loadTitle'),
      description: t('demo.modelling.loadDesc'),
      position: 'bottom',
      allowInteraction: true,
      // The tool AND its data tab: a reader who is drawing should see the rows
      // appear as they click, not the Project panel they opened the menu from.
      onEnter: () => { armTool('load'); openPanel('data'); },
      waitFor: () => count.loads() >= 1,
      autoAdvance: true,
    },

    {
      id: 'sections',
      target: ANCHORS.ribbonCommand('sections'),
      title: t('demo.modelling.sectionsTitle'),
      description: t('demo.modelling.sectionsDesc'),
      position: 'bottom',
      allowInteraction: true,
    },

    {
      id: 'materials',
      target: ANCHORS.ribbonCommand('materials'),
      title: t('demo.modelling.materialsTitle'),
      description: t('demo.modelling.materialsDesc'),
      position: 'bottom',
      allowInteraction: true,
    },

    {
      id: 'solve',
      target: ANCHORS.ribbonCommand('solve'),
      title: t('demo.modelling.solveTitle'),
      description: t('demo.modelling.solveDesc'),
      position: 'bottom',
      allowInteraction: true,
      waitFor: hasResults,
      autoAdvance: true,
      actionButton: { label: t('demo.action.solve'), action: solve },
      // Show what solving produced, in the panel solving opens.
      onExit: () => { resultsStore.diagramType = 'deformed'; openPanel('results'); },
    },

    /*
     * Before solving, because that is when they matter: the solver reads the
     * section and the material, so a reader who meets them afterwards has
     * already been shown an analysis of properties they were never told about.
     */
    {
      id: 'done',
      target: 'none',
      title: t('demo.modelling.doneTitle'),
      description: t('demo.modelling.doneDesc'),
      position: 'center',
    },
  ];
}
