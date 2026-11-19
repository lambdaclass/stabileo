/**
 * The sheets' bars in 3D keep clear of the concrete ghost's colour in either theme, and the
 * foundation members (strap beams, beams at the footings' level) take warm tones of their own,
 * their stirrups apart from their main bars and both apart from the footing's layers.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { toneColour } from '../rebar-3d-layer';
import { ghostColour } from '../rebar-ghost-layer';
import { asFoundation, type Rebar3d, type RebarTone } from '../../rc-sheets/rebar-3d';

const TONES: RebarTone[] = ['continuous', 'support', 'span', 'bent', 'stirrup', 'column', 'tie', 'dowel', 'bottomX', 'bottomY', 'topX', 'topY', 'vertical', 'horizontal', 'ubar', 'wallTie', 'footingX', 'footingY', 'footingTop', 'strapMain', 'strapStirrup'];
const dist = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

describe('the 3D bars\' colours', () => {
  it('stand apart from the ghost on a dark and on a light background', () => {
    for (const bg of [new THREE.Color('#0c1620'), new THREE.Color('#f4f7fa')]) {
      const ghost = ghostColour(bg);
      for (const t of TONES) expect(dist(toneColour(t), ghost), `${t} on ${bg.getHexString()}`).toBeGreaterThan(0.2);
    }
  });

  it('give foundation members warm tones, stirrups apart from main bars and both apart from the footing\'s layers', () => {
    const main = toneColour('strapMain'), stir = toneColour('strapStirrup');
    for (const c of [main, stir]) expect(c.r).toBeGreaterThan(c.b);
    expect(dist(main, stir)).toBeGreaterThan(0.1);
    for (const t of ['footingX', 'footingY', 'footingTop', 'dowel'] as const) for (const c of [main, stir]) expect(dist(c, toneColour(t)), t).toBeGreaterThan(0.1);
    const bar = (tone: RebarTone): Rebar3d => ({ element: 'e', rows: [], family: 'footing', kind: 'continuous', tone, dia: 12, mandrel: 0.05, segments: [] });
    expect(asFoundation(bar('stirrup')).tone).toBe('strapStirrup');
    for (const t of ['continuous', 'support', 'span', 'bent'] as const) expect(asFoundation(bar(t)).tone).toBe('strapMain');
  });
});
