/**
 * "Ajustes" — what the panel nobody opens actually controls.
 *
 * Settings sits behind a gear in the corner and holds twenty-five switches,
 * which is exactly the shape of a panel people open once and close. Most of
 * them are cosmetic and explain themselves; this walkthrough is for the four
 * that change how the app behaves, and it ends on the one that is genuinely
 * hidden.
 *
 * Live calculation is last on purpose. It is the single setting that changes
 * the rhythm of using Stabileo — edit and the results follow, with no press
 * — and it is a full-width button below a list of checkboxes, which is where
 * a reader has already stopped looking.
 */

import type { TourStep } from '../../store/tour.svelte';
import { t } from '../../i18n';
import { ANCHORS, loadExample, setDimension, openPanel } from '../demo-helpers';

export function buildSettings(): TourStep[] {
  return [
    {
      id: 'welcome',
      target: 'none',
      title: t('demo.settings.welcomeTitle'),
      description: t('demo.settings.welcomeDesc'),
      position: 'center',
      onEnter: () => {
        setDimension('2d');
        void loadExample('portal-frame');
      },
    },

    {
      id: 'open',
      target: ANCHORS.settings,
      title: t('demo.settings.openTitle'),
      description: t('demo.settings.openDesc'),
      position: 'left',
      allowInteraction: true,
      onEnter: () => openPanel('settings'),
    },

    /*
     * Hovering is the instruction, because every switch below carries its own
     * explanation now and the walkthrough would otherwise be reading them out
     * one at a time.
     */
    {
      id: 'hover',
      target: ANCHORS.rightPanel,
      title: t('demo.settings.hoverTitle'),
      description: t('demo.settings.hoverDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'grid',
      /*
       * From here each card frames its OWN section instead of the whole panel.
       * A highlight around all twenty-five switches while the text discusses
       * three of them points at nothing in particular.
       */
      target: '[data-tour="cfg-grid"]',
      title: t('demo.settings.gridTitle'),
      description: t('demo.settings.gridDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'results',
      target: '[data-tour="cfg-results"]',
      title: t('demo.settings.resultsTitle'),
      description: t('demo.settings.resultsDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'live',
      target: '.live-calc-btn',
      title: t('demo.settings.liveTitle'),
      description: t('demo.settings.liveDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'done',
      target: 'none',
      title: t('demo.settings.doneTitle'),
      description: t('demo.settings.doneDesc'),
      position: 'center',
    },
  ];
}
