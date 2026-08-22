/**
 * "Análisis cinemático" — is this structure even solvable?
 *
 * The one advanced tool that answers a question you have BEFORE solving, and
 * the reason it is first: a mechanism does not produce a wrong answer, it
 * produces no answer, and the error the solver returns is about matrices
 * rather than about the beam.
 *
 * The walkthrough removes a support on purpose. Reading the panel on a
 * structure that is already fine teaches the layout; watching the verdict flip
 * from isostatic to a mechanism, and reading what it says to add, teaches what
 * the panel is FOR.
 */

import type { TourStep } from '../../store/tour.svelte';
import { t } from '../../i18n';
import { ANCHORS, loadExample, setDimension, openPanel } from '../demo-helpers';
import { modelStore, uiStore } from '../../store';

/** The support this demo removes, remembered so the exit can put it back. */
let removed: { nodeId: number; type: string } | null = null;
/** Whether the last card has already put it back, so stepping back can undo that. */
let restored = false;

export function buildKinematics(): TourStep[] {
  return [
    {
      id: 'welcome',
      target: 'none',
      title: t('demo.kinematics.welcomeTitle'),
      description: t('demo.kinematics.welcomeDesc'),
      position: 'center',
      onEnter: () => {
        setDimension('2d');
        removed = null;
        restored = false;
        void loadExample('simply-supported');
      },
    },

    {
      id: 'open',
      target: ANCHORS.ribbonCommand('advanced'),
      title: t('demo.kinematics.openTitle'),
      description: t('demo.kinematics.openDesc'),
      position: 'bottom',
      allowInteraction: true,
      // Opened here so the next step has a button to point at. Pointing at a
      // control inside a shut panel spotlights nothing at all.
      onEnter: () => openPanel('advanced'),
    },

    {
      id: 'panel',
      /*
       * The PANEL, not the button that opened it. Arming an analysis replaces
       * its button with a "running" row — by design, and the audit caught the
       * consequence: the spotlight was aimed at a selector that stops existing
       * the moment the step's own `onEnter` runs.
       */
      target: ANCHORS.rightPanel,
      title: t('demo.kinematics.panelTitle'),
      description: t('demo.kinematics.panelDesc'),
      position: 'left',
      allowInteraction: true,
      onEnter: () => { uiStore.showKinematicPanel = true; },
    },

    {
      id: 'reading',
      target: ANCHORS.viewport,
      title: t('demo.kinematics.readingTitle'),
      description: t('demo.kinematics.readingDesc'),
      position: 'right',
      highlightPadding: 0,
      overlayOpacity: 0.4,
    },

    /*
     * The demonstration. Removing a support is done through the store rather
     * than by asking the reader to find and delete one: the point is the
     * verdict changing, not the deletion, and a reader hunting for a support
     * to click has stopped watching the panel.
     */
    {
      id: 'break-it',
      /*
       * Framed on the spot the support used to occupy rather than the whole
       * canvas: "a support just disappeared" is impossible to see if the
       * highlight covers everything, and the reader is looking for a change
       * they did not make.
       */
      target: ANCHORS.viewport,
      highlightPadding: 0,
      overlayOpacity: 0.35,
      title: t('demo.kinematics.breakTitle'),
      description: t('demo.kinematics.breakDesc'),
      position: 'right',
      onEnter: () => {
        const sup = [...modelStore.supports.values()][0];
        if (!sup || removed) return;
        removed = { nodeId: sup.nodeId, type: sup.type };
        modelStore.removeSupport(sup.id);
      },
    },

    /*
     * The report does not follow the model on its own: it puts up a "structure
     * changed — recompute" button and waits. A walkthrough that removed a
     * support and then talked about the verdict was describing a report from
     * before the change, with the button to update it sitting unmentioned.
     */
    {
      id: 'recompute',
      target: ANCHORS.kinematicStale,
      title: t('demo.kinematics.recomputeTitle'),
      description: t('demo.kinematics.recomputeDesc'),
      position: 'left',
      allowInteraction: true,
      // Pressing Next does what the button does, so a reader who does not
      // notice it is not left reading a stale verdict either.
      onExit: () => {
        const btn = document.querySelector('[data-testid="kin-stale"]') as HTMLElement | null;
        btn?.click();
      },
    },

    {
      id: 'verdict',
      target: ANCHORS.rightPanel,
      title: t('demo.kinematics.verdictTitle'),
      description: t('demo.kinematics.verdictDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'done',
      target: 'none',
      title: t('demo.kinematics.doneTitle'),
      description: t('demo.kinematics.doneDesc'),
      position: 'center',
      /*
       * The support comes back here, and goes away again if the reader walks
       * back. The previous card is about a mechanism; arriving at it with the
       * beam repaired makes it describe something that is not on screen.
       */
      onEnter: () => {
        if (!removed || restored) return;
        modelStore.addSupport(removed.nodeId, removed.type as never);
        restored = true;
      },
      onExit: () => {
        // Only meaningful going backwards: forward from here the tour ends.
        if (!removed || !restored) return;
        const again = [...modelStore.supports.values()]
          .find((sp) => sp.nodeId === removed!.nodeId);
        if (again) modelStore.removeSupport(again.id);
        restored = false;
      },
    },
  ];
}
