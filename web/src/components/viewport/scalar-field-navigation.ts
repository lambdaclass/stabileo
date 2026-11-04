import * as THREE from 'three';

export const SCALAR_FIELD_SHORTCUTS = 'ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown + - 0 Home';
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const ZOOM_IN = ['+', '='];
const ZOOM_OUT = ['-', '_', '−'];
const ORBIT_STEP = Math.PI / 24;

type Key = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'> & Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>>;

/** Arrows pan, Shift+arrows orbit about the target (only when rotation is enabled, i.e. in 3D),
 *  + and - zoom, 0 or Home asks the caller to fit. Returns what the caller must do next. */
export function navigateScalarField(event: Key, camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3; enableRotate: boolean; update(): void }): 'moved' | 'fit' | null {
  if (!camera || !controls || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === '0' || event.key === 'Home') {
    event.preventDefault();
    return 'fit';
  }
  const arrow = ARROWS[event.key];
  const zoom = ZOOM_IN.includes(event.key) ? 0.9 : ZOOM_OUT.includes(event.key) ? 1 / 0.9 : null;
  if (!arrow && zoom === null) return null;
  event.preventDefault();
  const offset = camera.position.clone().sub(controls.target);
  if (arrow && event.shiftKey) {
    if (!controls.enableRotate) return null;
    const r = offset.length();
    const theta = Math.atan2(offset.y, offset.x) - arrow[0] * ORBIT_STEP;
    const phi = Math.min(Math.PI - 0.01, Math.max(0.01, Math.acos(offset.z / r) - arrow[1] * ORBIT_STEP));
    camera.position.set(controls.target.x + r * Math.sin(phi) * Math.cos(theta), controls.target.y + r * Math.sin(phi) * Math.sin(theta), controls.target.z + r * Math.cos(phi));
  } else if (arrow) {
    camera.updateMatrix();
    const delta = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(arrow[0])
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), arrow[1])
      .multiplyScalar(offset.length() * 0.05);
    camera.position.add(delta);
    controls.target.add(delta);
  } else {
    camera.position.copy(controls.target).add(offset.multiplyScalar(zoom!));
  }
  controls.update();
  return 'moved';
}
