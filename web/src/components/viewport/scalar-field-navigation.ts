import * as THREE from 'three';

export function navigateScalarField(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'preventDefault'>, camera: THREE.PerspectiveCamera, controls: {target: THREE.Vector3; enableRotate: boolean; update(): void}) {
  if (!camera || !controls) return;
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const direction = directions[event.key];
  if (!direction && !['+', '=', '-', '_'].includes(event.key)) return;
  event.preventDefault();

  const offset = camera.position.clone().sub(controls.target);
  if (direction && event.shiftKey) {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const delta = right.multiplyScalar(direction[0]).addScaledVector(up, direction[1]).multiplyScalar(offset.length() * 0.05);
    camera.position.add(delta);
    controls.target.add(delta);
  } else if (direction && controls.enableRotate) {
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += direction[0] * 0.1;
    spherical.phi -= direction[1] * 0.1;
    spherical.makeSafe();
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
  } else if (!direction) {
    camera.position.copy(controls.target).add(offset.multiplyScalar(['+', '='].includes(event.key) ? 0.9 : 1 / 0.9));
  }
  controls.update();

  }
