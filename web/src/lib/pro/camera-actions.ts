import { uiStore } from '../store/ui.svelte';

/**
 * The 3-D view controls, as data — so the same set can be drawn as a stack on
 * the model or as a menu in a toolbar.
 *
 * ## Why they moved out of `Viewport3D.svelte`
 *
 * They were nine buttons down the right edge of the model. On a phone the last
 * of them sat behind the bottom sheet, and the stack cost a 44 px column of the
 * only thing the reader came to look at. PRO's phone bar shows them as one
 * split button instead: the face is whichever control you used last, the caret
 * opens the rest.
 *
 * Two surfaces, one list. A tenth control is one entry here.
 *
 * ## Events, not method calls
 *
 * Four of these are store flags and this module sets them directly. The other
 * four — the fit and the three preset views — need the live camera, which lives
 * inside `Viewport3D`. Reaching into a component from a toolbar is not
 * available and would not be wanted, so those dispatch and the viewport
 * listens, exactly as `stabileo-zoom-to-fit` already worked.
 */

export type CameraAction = {
  id: string;
  /** Translation key for the menu row and the tooltip. */
  labelKey: string;
  /** An `Icon` name when one exists; otherwise `glyph` carries it. */
  icon?: string;
  /** The typographic mark these buttons have always used — ⊤, ⊡, P, ✂. */
  glyph?: string;
  run: () => void;
  /** For the ones that are switches, so the menu can show them lit. */
  active?: () => boolean;
};

/** Ask the 3-D viewport for a preset view. */
function view(which: 'top' | 'front' | 'side') {
  window.dispatchEvent(new CustomEvent('stabileo-camera-view', { detail: which }));
}

/**
 * Built fresh on read rather than frozen at module load: `active` closes over
 * store state, and the labels of the two switches change with it — "enable
 * clipping" and "disable clipping" are the same control saying what pressing it
 * will do.
 */
export function cameraActions(): CameraAction[] {
  return [
    {
      id: 'fit',
      labelKey: 'viewport3d.zoomToFit',
      icon: 'fit',
      run: () => window.dispatchEvent(new Event('stabileo-zoom-to-fit')),
    },
    { id: 'top', labelKey: 'viewport3d.topView', glyph: '⊤', run: () => view('top') },
    { id: 'front', labelKey: 'viewport3d.frontView', glyph: '⊡', run: () => view('front') },
    { id: 'side', labelKey: 'viewport3d.sideView', glyph: '⊟', run: () => view('side') },
    {
      id: 'projection',
      labelKey: uiStore.cameraMode3D === 'perspective'
        ? 'viewport3d.switchToOrtho'
        : 'viewport3d.switchToPersp',
      glyph: uiStore.cameraMode3D === 'perspective' ? 'P' : 'O',
      run: () => {
        uiStore.cameraMode3D = uiStore.cameraMode3D === 'perspective' ? 'orthographic' : 'perspective';
      },
    },
    {
      id: 'clipping',
      labelKey: uiStore.clippingEnabled
        ? 'viewport3d.disableClipping'
        : 'viewport3d.enableClipping',
      glyph: '✂',
      run: () => { uiStore.clippingEnabled = !uiStore.clippingEnabled; },
      active: () => uiStore.clippingEnabled,
    },
    {
      id: 'measure',
      labelKey: uiStore.measureMode
        ? 'viewport3d.disableMeasure'
        : 'viewport3d.enableMeasure',
      glyph: '📏',
      run: () => { uiStore.measureMode = !uiStore.measureMode; },
      active: () => uiStore.measureMode,
    },
    {
      id: 'sections',
      labelKey: uiStore.renderMode3D === 'sections' ? 'config.wireframe' : 'config.sections',
      glyph: uiStore.renderMode3D === 'sections' ? '◫' : '⬡',
      run: () => {
        /*
         * Back to WIREFRAME, not to "whatever was on before".
         *
         * The stack on the model remembered the previous mode in a local, which
         * a toolbar cannot see — and a control whose result depends on state
         * held by a component that may not be mounted is a control that behaves
         * differently depending on where you press it. Wireframe is the mode
         * sections is an alternative to, so it is the honest return.
         */
        uiStore.renderMode3D = uiStore.renderMode3D === 'sections' ? 'wireframe' : 'sections';
      },
      active: () => uiStore.renderMode3D === 'sections',
    },
  ];
}
