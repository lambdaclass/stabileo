/**
 * "Moverse y seleccionar" — the two gestures everything else is built on.
 *
 * One walkthrough for both viewports rather than two, because the ideas are
 * identical and only the hand movement differs: in 2D a drag pans, in 3D the
 * same drag orbits and panning needs Shift. Splitting them would teach the
 * same three concepts twice and hide the one comparison worth making, so the
 * demo switches dimension in the middle and points at the difference.
 *
 * It ends on Delete. That is not padding — deleting is the destructive
 * gesture, its meaning depends on which kinds are armed, and a user who has
 * just learned to sweep a rectangle is one keypress away from finding out the
 * hard way.
 */

import type { TourStep } from '../../store/tour.svelte';
import { t } from '../../i18n';
import { ANCHORS, loadExample, setDimension, openPanel } from '../demo-helpers';
import { uiStore } from '../../store';

export function buildNavigation(): TourStep[] {
  return [
    {
      id: 'welcome',
      target: 'none',
      title: t('demo.navigation.welcomeTitle'),
      description: t('demo.navigation.welcomeDesc'),
      position: 'center',
      onEnter: () => {
        setDimension('2d');
        void loadExample('portal-frame');
        uiStore.currentTool = 'pan';
      },
    },

    {
      id: 'pan-2d',
      target: ANCHORS.pointerMode,
      /*
       * The model stays lit. Every one of these cards asks the reader to drag
       * on the drawing, and a dark canvas is one they cannot see the effect
       * on — the step describes a gesture whose result is hidden.
       */
      overlayOpacity: 0.25,
      title: t('demo.navigation.pan2dTitle'),
      description: t('demo.navigation.pan2dDesc'),
      position: 'left',
      allowInteraction: true,
      onEnter: () => { uiStore.currentTool = 'pan'; },
    },

    /*
     * The same button, in 3D, is the comparison this demo exists for. The
     * dimension switches under the reader while the spotlight stays on the
     * control, so the change is in the behaviour and not in where to look.
     */
    {
      id: 'pan-3d',
      target: ANCHORS.pointerMode,
      /*
       * The model stays lit. Every one of these cards asks the reader to drag
       * on the drawing, and a dark canvas is one they cannot see the effect
       * on — the step describes a gesture whose result is hidden.
       */
      overlayOpacity: 0.25,
      title: t('demo.navigation.pan3dTitle'),
      description: t('demo.navigation.pan3dDesc'),
      position: 'left',
      allowInteraction: true,
      onEnter: () => {
        setDimension('3d');
        void loadExample('3d-portal-frame');
        uiStore.currentTool = 'pan';
      },
    },

    /*
     * The camera stack, while the 3D viewport is still up. It is the answer to
     * "I have rotated this thing and now I cannot find it" — which is the next
     * thing that happens to someone who has just been taught to orbit.
     */
    {
      id: 'views-3d',
      target: ANCHORS.cameraControls,
      overlayOpacity: 0.25,
      title: t('demo.navigation.viewsTitle'),
      description: t('demo.navigation.viewsDesc'),
      position: 'left',
      allowInteraction: true,
      // Back to 2D for the selection half: window-versus-crossing is easier to
      // see on a flat drawing, and it behaves identically in both.
      onExit: () => {
        setDimension('2d');
        void loadExample('portal-frame');
      },
    },

    {
      id: 'select-mode',
      target: ANCHORS.pointerMode,
      /*
       * The model stays lit. Every one of these cards asks the reader to drag
       * on the drawing, and a dark canvas is one they cannot see the effect
       * on — the step describes a gesture whose result is hidden.
       */
      overlayOpacity: 0.25,
      title: t('demo.navigation.selectTitle'),
      description: t('demo.navigation.selectDesc'),
      position: 'left',
      allowInteraction: true,
      onEnter: () => { uiStore.currentTool = 'select'; },
    },

    /*
     * Window versus crossing. Every CAD package agrees on the convention and
     * almost nobody is told about it; being told is the difference between a
     * drag that does what you meant and one you undo.
     */
    {
      id: 'window-crossing',
      target: ANCHORS.viewport,
      title: t('demo.navigation.dragTitle'),
      description: t('demo.navigation.dragDesc'),
      position: 'right',
      highlightPadding: 0,
      overlayOpacity: 0.4,
      allowInteraction: true,
    },

    {
      id: 'kinds',
      target: ANCHORS.ribbonCommand('select'),
      /*
       * Opens the Selection panel rather than only pointing at the command.
       * The next card is about what Delete removes and reads the panel; left
       * unopened, it described a panel the reader was not looking at.
       */
      onEnter: () => openPanel('selection'),
      title: t('demo.navigation.kindsTitle'),
      description: t('demo.navigation.kindsDesc'),
      position: 'bottom',
      allowInteraction: true,
    },

    {
      id: 'delete',
      target: ANCHORS.rightPanel,
      onEnter: () => openPanel('selection'),
      title: t('demo.navigation.deleteTitle'),
      description: t('demo.navigation.deleteDesc'),
      position: 'left',
      allowInteraction: true,
    },

    {
      id: 'done',
      target: 'none',
      title: t('demo.navigation.doneTitle'),
      description: t('demo.navigation.doneDesc'),
      position: 'center',
    },
  ];
}
