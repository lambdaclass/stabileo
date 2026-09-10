/**
 * "Análisis de sección" — what the internal forces do to the material.
 *
 * The densest tool in Basic, so the explanation is split rather than piled
 * into one card: what the sliders move, then what surrounds the section, then
 * the stress state below it. Three cards of one idea each beat one card of
 * eight that a reader skims.
 *
 * It needs a solved model to have anything to show, so the walkthrough solves
 * first rather than arming the tool and letting the reader hit "calculate the
 * model first".
 */

import type { TourStep } from '../../store/tour.svelte';
import { t } from '../../i18n';
import { ANCHORS, loadExample, solve, hasResults, setDimension, openPanel } from '../demo-helpers';
import { uiStore, resultsStore } from '../../store';

export function buildSectionAnalysis(): TourStep[] {
  return [
    {
      id: 'welcome',
      target: 'none',
      title: t('demo.section.welcomeTitle'),
      description: t('demo.section.welcomeDesc'),
      position: 'center',
      onEnter: () => {
        setDimension('2d');
        void loadExample('simply-supported');
        /*
         * Close whatever analysis was left running. Doing this walkthrough
         * after the kinematic one left its report in the right-hand panel
         * while these cards described a section — the panel keeps the last
         * analysis opened, and a walkthrough cannot assume it is the first
         * thing the reader has done today.
         */
        uiStore.showKinematicPanel = false;
        resultsStore.stressQuery = null;
      },
    },

    {
      id: 'solve',
      target: ANCHORS.ribbonCommand('solve'),
      title: t('demo.section.solveTitle'),
      description: t('demo.section.solveDesc'),
      position: 'bottom',
      allowInteraction: true,
      waitFor: hasResults,
      autoAdvance: true,
      actionButton: { label: t('demo.action.solve'), action: solve },
      // The next step points inside the Advanced panel, so it has to be open.
      onExit: () => openPanel('advanced'),
    },

    {
      id: 'arm',
      // Same as the kinematic walkthrough: arming the analysis takes its own
      // button off the screen, so the step points at the panel instead.
      target: ANCHORS.rightPanel,
      title: t('demo.section.armTitle'),
      description: t('demo.section.armDesc'),
      position: 'left',
      allowInteraction: true,
      onEnter: () => {
        uiStore.currentTool = 'select';
        uiStore.selectMode = 'stress';
      },
    },

    /*
     * The click on the member is the reader's, not the demo's: where along the
     * span you ask is the whole point of the tool, and a demo that picks the
     * point for you has answered the only question it was meant to pose.
     */
    {
      id: 'pick',
      target: ANCHORS.viewport,
      title: t('demo.section.pickTitle'),
      description: t('demo.section.pickDesc'),
      position: 'right',
      highlightPadding: 0,
      overlayOpacity: 0.35,
      allowInteraction: true,
      /*
       * The STORE, not the DOM.
       *
       * This asked `document.querySelector('.ssp-panel')`, which is a fact
       * about the page and not a reactive read: the panel opened on the
       * reader's click and nothing ever re-evaluated the condition, so the
       * walkthrough sat on "click the beam" with the section already drawn
       * beside it. A step's condition has to be something the app can wake it
       * for.
       */
      waitFor: () => resultsStore.stressQuery !== null,
      autoAdvance: true,
    },

    {
      id: 'sliders',
      /*
       * The panel, lit rather than spotlit.
       *
       * Framing one slider was worse than framing none: the card says "two
       * sliders" and the highlight picked out one, and the dark backdrop hid
       * the model where the effect of moving them is visible. The two live in
       * different components — one is the station along the member, the other
       * belongs to the section drawing — so there is no single element that
       * contains both. Dimming barely and framing the panel shows both, and
       * the member they act on.
       */
      target: '.ssp-panel',
      overlayOpacity: 0.2,
      title: t('demo.section.slidersTitle'),
      description: t('demo.section.slidersDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'around',
      target: '.ssp-panel',
      title: t('demo.section.aroundTitle'),
      description: t('demo.section.aroundDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'state',
      target: '.ssp-panel',
      title: t('demo.section.stateTitle'),
      description: t('demo.section.stateDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'done',
      target: 'none',
      title: t('demo.section.doneTitle'),
      description: t('demo.section.doneDesc'),
      position: 'center',
      /*
       * The analysis stays armed. Turning it off here meant the reader who
       * pressed Back landed on cards describing a panel that had just been
       * dismissed — and somebody who finished this walkthrough is the person
       * most likely to want to keep querying sections.
       */
    },
  ];
}
