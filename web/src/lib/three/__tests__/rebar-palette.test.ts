/** The sheets' bars in 3D keep clear of the concrete ghost's colour in either theme. */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toneColour } from '../rebar-3d-layer';
import { ghostColour } from '../rebar-ghost-layer';
import type { RebarTone } from '../../rc-sheets/rebar-3d';

const TONES: RebarTone[] = ['continuous', 'support', 'span', 'bent', 'stirrup', 'column', 'tie', 'dowel', 'bottomX', 'bottomY', 'topX', 'topY', 'vertical', 'horizontal', 'ubar', 'wallTie'];
const dist = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

describe('the 3D bars\' colours', () => {
  it('stand apart from the ghost on a dark and on a light background', () => {
    for (const bg of [new THREE.Color('#0c1620'), new THREE.Color('#f4f7fa')]) {
      const ghost = ghostColour(bg);
      for (const t of TONES) expect(dist(toneColour(t), ghost), `${t} on ${bg.getHexString()}`).toBeGreaterThan(0.2);
    }
  });
});
