/**
 * The 3D free-body drawing's labels say their values in the project's units, as the inspector
 * beside it does: 10 kN read «N 10.0» in a kip project while the inspector read 2.25 kip.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// despiece-3d draws its labels on a canvas: a stub, as despiece-3d.test.ts does.
const canvasStub = { width: 0, height: 0, getContext: () => ({ fillText: () => {} }) };
Object.defineProperty(globalThis, 'document', { value: { createElement: () => canvasStub }, configurable: true });

import { endLabel, reactionLabel } from '../../three/despiece-3d';
import { forceMomentFormat } from '../load-tag-text';

const zero = new THREE.Vector3();

describe('despiece labels', () => {
  it('a member end in kip and kip·ft, with the units', () => {
    const fmt = forceMomentFormat('Imperial');
    expect(endLabel(zero, 10, 0, 0, 0, 0, 10, 'local', fmt)).toBe('N 2.25 kip  M 7.38 kip·ft');
  });
  it('global components in tonnes-force, with the decimals the reader set', () => {
    const fmt = forceMomentFormat('MKS', { force: 1 });
    expect(endLabel(new THREE.Vector3(9.80665, 0, -19.6133), 0, 0, 0, 0, 0, 0, 'global', fmt)).toBe('Fx 1.0 tf  Fz -2.0 tf');
  });
  it('a support reaction too', () => {
    const fmt = forceMomentFormat('SI');
    expect(reactionLabel(new THREE.Vector3(3, 4, 0), new THREE.Vector3(0, 0, 2), fmt)).toBe('R 5.00 kN  M 2.00 kN·m');
  });
  it('without a format, the model numbers to one decimal, as before', () => {
    expect(endLabel(zero, 10, 3, 4, 0, 0, 0, 'local')).toBe('N 10.0  V 5.0');
  });
});
