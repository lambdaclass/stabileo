/**
 * "Primeros pasos en 3D" — the same three acts, in three dimensions.
 *
 * Deliberately parallel to `basics-2d`: same shape, same order, so a reader
 * who did one recognises the other and only has to absorb what actually
 * differs. What differs is worth its own walkthrough — the camera orbits
 * instead of panning, and a 3D frame bends about two axes, so "the moment" is
 * a choice rather than a diagram.
 */

import type { TourStep } from '../../store/tour.svelte';
import { t } from '../../i18n';
import { ANCHORS, loadExample, solve, hasResults, setDimension , openPanel , count } from '../demo-helpers';
import { resultsStore } from '../../store';

export function buildBasics3D(): TourStep[] {
  return [
    {
      id: 'welcome',
      target: 'none',
      title: t('demo.basics3d.welcomeTitle'),
      description: t('demo.basics3d.welcomeDesc'),
      position: 'center',
      onEnter: () => {
        setDimension('3d');
      },
    },
    /*
     * Where models come from, before using one. A walkthrough that starts with
     * a structure already on screen leaves the reader with no idea how it got
     * there — and the examples are the fastest way to have something to press
     * Solve on.
     */
    {
      id: 'examples',
      target: '[data-testid="ex-group-3d"]',
      title: t('demo.basics3d.examplesTitle'),
      description: t('demo.basics3d.examplesDesc'),
      position: 'left',
      allowInteraction: true,
      onEnter: () => openPanel('project'),
      /*
       * Loads the portal frame on the way out — unless the reader already
       * picked something, in which case theirs is kept. Overwriting a choice
       * the tutorial just invited them to make is the rudest thing a
       * walkthrough can do.
       */
      onExit: () => { if (count.elements() === 0) void loadExample('3d-portal-frame'); },
    },

    {
      id: 'orbit',
      target: ANCHORS.viewport,
      title: t('demo.basics3d.orbitTitle'),
      description: t('demo.basics3d.orbitDesc'),
      position: 'right',
      highlightPadding: 0,
      overlayOpacity: 0.45,
      allowInteraction: true,
    },
    {
      id: 'solve',
      target: ANCHORS.ribbonCommand('solve'),
      title: t('demo.basics3d.solveTitle'),
      description: t('demo.basics3d.solveDesc'),
      position: 'bottom',
      allowInteraction: true,
      waitFor: hasResults,
      autoAdvance: true,
      actionButton: { label: t('demo.action.solve'), action: solve },
      /*
       * Pressing Solve through the ribbon opens the results panel; pressing it
       * from this card did not, so the reader arrived at the results steps
       * with the Project panel still showing.
       */
      onExit: () => openPanel('results'),
    },
    /*
     * The whole row, named but not explained.
     *
     * This step used to walk two diagrams — deformed shape, then bending —
     * with a paragraph on each. That is the subject of "Leer los resultados",
     * and teaching it twice makes the first walkthrough long and the fifth
     * redundant. Forty seconds should end with the reader knowing the results
     * are THERE and that one press produced all of them.
     */
    {
      id: 'results-row',
      target: ANCHORS.ribbonGroup('results'),
      title: t('demo.basics3d.resultsTitle'),
      description: t('demo.basics3d.resultsDesc'),
      position: 'bottom',
      allowInteraction: true,
      onEnter: () => { resultsStore.diagramType = 'deformed'; },
    },

    {
      id: 'done',
      target: 'none',
      title: t('demo.basics3d.doneTitle'),
      description: t('demo.basics3d.doneDesc'),
      position: 'center',
    },
  ];
}
