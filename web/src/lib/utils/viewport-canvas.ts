/**
 * The viewport's own canvas: the model, not the axes gizmo beside it.
 *
 * `.viewport-container canvas` matched the gizmo first in 3D: the gizmo is in the component's
 * markup and the renderer's canvas is appended after it on mount, so a PNG export, the report's
 * picture and a capture for the assistant got an 80 × 80 image of the axes.
 */
export function viewportCanvas(): HTMLCanvasElement | null {
  return document.querySelector('.viewport-container canvas:not(.axis-gizmo)') as HTMLCanvasElement | null;
}
