// Local-axis triad for a 3D element — visual only.
//
// Consumes computeLocalAxes3D output (the single source of truth for the
// element local coordinate system). Does NOT change any axis convention.
// Colors follow the standard: x = red, y = green, z = blue.

import * as THREE from 'three';
import { createTextSprite } from './selection-helpers';
import type { LocalAxes3D } from '../engine/local-axes-3d';

import { AXIS_COLORS } from './selection-helpers';

const AXIS_X = AXIS_COLORS.x; // local x — element axis (I→J)
const AXIS_Y = AXIS_COLORS.y; // local y
const AXIS_Z = AXIS_COLORS.z; // local z

/**
 * Build a small x/y/z arrow triad at `origin` oriented by the given local axes.
 * Arrow length scales with element length, clamped so short/long members stay
 * legible. Triad geometry is excluded from raycasting (visual only).
 */
export function createLocalAxesTriad(
  origin: THREE.Vector3,
  axes: LocalAxes3D,
  opts: { withLabels?: boolean } = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'localAxesTriad';

  const len = Math.min(Math.max(axes.L * 0.22, 0.25), 1.5);
  const headLen = len * 0.28;
  const headWidth = headLen * 0.55;

  const arrow = (dir: [number, number, number], color: number) => {
    const a = new THREE.ArrowHelper(
      new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(),
      origin, len, color, headLen, headWidth,
    );
    a.traverse((o) => { o.raycast = () => {}; o.renderOrder = 3; });
    return a;
  };

  group.add(arrow(axes.ex, AXIS_X), arrow(axes.ey, AXIS_Y), arrow(axes.ez, AXIS_Z));

  if (opts.withLabels) {
    const label = (dir: [number, number, number], txt: string, hex: string) => {
      const p = origin.clone().add(
        new THREE.Vector3(dir[0], dir[1], dir[2]).normalize().multiplyScalar(len * 1.15),
      );
      const s = createTextSprite(txt, hex, 22);
      s.position.copy(p);
      s.raycast = () => {};
      s.renderOrder = 3;
      return s;
    };
    group.add(
      label(axes.ex, 'x', '#ff7070'),
      label(axes.ey, 'y', '#6fe06f'),
      label(axes.ez, 'z', '#7ab8ff'),
    );
  }

  return group;
}
