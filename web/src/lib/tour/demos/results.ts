/**
 * "Leer los resultados" — five pictures of one solve.
 *
 * The panel is explained ONCE, on the deformed shape, and after that each
 * result gets a single card saying what it is and what changed. Explaining the
 * selectors and the table five times would have made this the longest
 * walkthrough in the set and taught nothing on repetitions two through five.
 *
 * The order is the order an engineer reads them: how it moved, then what is
 * carrying the load — axial, shear, moment — and finally what that does to the
 * material.
 */

import type { TourStep } from '../../store/tour.svelte';
import { t } from '../../i18n';
import { ANCHORS, loadExample, solve, hasResults, setDimension, asideCard, openPanel } from '../demo-helpers';
import { resultsStore } from '../../store';
import { showStressMap } from '../../store/result-view';

/** Show a diagram and point at its ribbon command — the shape every step here shares. */
function diagram(id: string, kind: string, key: string): TourStep {
  return {
    id,
    target: ANCHORS.ribbonCommand(id),
    // Out of the way of the picture it is talking about.
    cardPosition: asideCard(),
    title: t(`demo.results.${key}Title`),
    description: t(`demo.results.${key}Desc`),
    position: 'bottom',
    allowInteraction: true,
    /*
     * The result AND the panel that explains it. Without the second half a
     * reader can walk the whole tutorial with the Project panel still open,
     * reading cards about a right-hand panel they are not looking at.
     */
    onEnter: () => { resultsStore.diagramType = kind as never; openPanel('results'); },
  };
}

export function buildResults(): TourStep[] {
  return [
    {
      id: 'welcome',
      target: 'none',
      title: t('demo.results.welcomeTitle'),
      description: t('demo.results.welcomeDesc'),
      position: 'center',
      onEnter: () => {
        setDimension('2d');
        void loadExample('portal-frame');
      },
    },
    {
      id: 'solve',
      target: ANCHORS.ribbonCommand('solve'),
      title: t('demo.results.solveTitle'),
      description: t('demo.results.solveDesc'),
      position: 'bottom',
      allowInteraction: true,
      waitFor: hasResults,
      autoAdvance: true,
      actionButton: { label: t('demo.action.solve'), action: solve },
    },

    diagram('deformed', 'deformed', 'deformed'),

    /*
     * The panel, once. Everything below is a variation on what this card
     * explains, so the later steps can say "same panel, new numbers".
     */
    {
      id: 'panel',
      target: ANCHORS.rightPanel,
      // Opened here too: a card pointing at the results panel needs it open,
      // and the reader may have closed it between steps.
      onEnter: () => openPanel('results'),
      title: t('demo.results.panelTitle'),
      description: t('demo.results.panelDesc'),
      position: 'left',
      allowInteraction: true,
    },

    diagram('axial', 'axial', 'axial'),
    diagram('shearZ', 'shear', 'shear'),
    diagram('momentY', 'moment', 'moment'),

    /*
     * Comparison belongs with the diagrams and not with the deformed shape or
     * the maps: it overlays a second CURVE on the first, and there is nothing
     * to overlay on a picture painted onto the members themselves.
     */
    {
      id: 'compare',
      target: ANCHORS.rightPanel,
      // Opened here too: a card pointing at the results panel needs it open,
      // and the reader may have closed it between steps.
      onEnter: () => openPanel('results'),
      title: t('demo.results.compareTitle'),
      description: t('demo.results.compareDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'stress',
      target: ANCHORS.ribbonCommand('stress'),
      title: t('demo.results.stressTitle'),
      description: t('demo.results.stressDesc'),
      position: 'bottom',
      cardPosition: asideCard(),
      allowInteraction: true,
      /*
       * Switched on, like every other card here. It was the one result step
       * that only POINTED at its command: the card described a utilisation
       * map while a bending diagram stayed on screen, and a reader following
       * along saw the words contradict the picture.
       */
      onEnter: () => { showStressMap('stressRatio'); openPanel('results'); },
    },

    {
      id: 'done',
      target: 'none',
      title: t('demo.results.doneTitle'),
      description: t('demo.results.doneDesc'),
      position: 'center',
    },
  ];
}
