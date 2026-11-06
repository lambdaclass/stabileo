import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The value labels are canvas sprites; the unit environment has no canvas.
vi.mock('../../three/selection-helpers', async (orig) => ({ ...(await orig<object>()), createTextSprite: () => new THREE.Sprite() }));
import { shellComponentValue, shellComponentAngle, principalMoments, faceStresses } from '../shell-stress';
import { shellContourField } from '../shell-contour-field';
import { buildShellOverlay } from '../../viewport3d/shell-overlay';

const s = { sigmaXx: 100, sigmaYy: -40, tauXy: 30, mx: 12, my: -4, mxy: 3, vonMises: 0, t: 0.2, qx: 6, qy: -8 };

describe('what a shell contour can show', () => {
  it('forces per unit width are the stresses times the thickness, and need it', () => {
    expect(shellComponentValue(s, 'nx')).toBeCloseTo(20);
    expect(shellComponentValue(s, 'ny')).toBeCloseTo(-8);
    expect(shellComponentValue(s, 'nxy')).toBeCloseTo(6);
    expect(shellComponentValue({ ...s, t: undefined }, 'nx')).toBeNaN();
  });

  it('transverse shears come from the element, and a triangle has none', () => {
    expect(shellComponentValue(s, 'vx')).toBe(6);
    expect(shellComponentValue(s, 'vmax')).toBeCloseTo(10);
    expect(shellComponentValue({ ...s, qx: undefined, qy: undefined }, 'vy')).toBeNaN();
  });

  it('principal moments and their direction satisfy the transformation', () => {
    const p = principalMoments(s.mx, s.my, s.mxy);
    expect(shellComponentValue(s, 'mmax')).toBeCloseTo(p.m1);
    expect(p.m1 + p.m2).toBeCloseTo(s.mx + s.my);
    const a = (shellComponentAngle(s, 'mmax')! * Math.PI) / 180;
    const mn = s.mx * Math.cos(a) ** 2 + s.my * Math.sin(a) ** 2 + 2 * s.mxy * Math.sin(a) * Math.cos(a);
    expect(mn).toBeCloseTo(p.m1);
    expect(shellComponentAngle(s, 'mmin')).toBeCloseTo(shellComponentAngle(s, 'mmax')! + 90);
    expect(shellComponentAngle(s, 'mx')).toBeNull();
  });

  it('a stress on a face is the membrane plus or minus the bending', () => {
    const f = faceStresses(s, 0.2);
    expect(shellComponentValue(s, 'sigmaXx', 'top')).toBeCloseTo(f.top.sxx);
    expect(shellComponentValue(s, 'sigmaXx', 'bottom')).toBeCloseTo(f.bottom.sxx);
    expect(shellComponentValue(s, 'sigmaXx', 'top')).not.toBeCloseTo(s.sigmaXx);
    expect(shellComponentValue(s, 'mx', 'top')).toBe(s.mx);
  });
});

describe('Von Mises on each face', () => {
  const bending = { sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 1, my: 0, mxy: 0, vonMises: 150, t: 0.2 };

  it('is zero on the mid-surface of a shell in pure bending', () => {
    expect(shellComponentValue(bending, 'vonMises', 'mid')).toBe(0);
    expect(shellComponentValue(bending, 'sigma1', 'mid')).toBe(0);
  });

  it('is the engine\'s value on the more stressed face, and by default', () => {
    expect(shellComponentValue(bending, 'vonMises', 'worst')).toBe(150);
    expect(shellComponentValue(bending, 'vonMises')).toBe(150);
    expect(shellComponentValue(bending, 'vonMises', 'auto')).toBe(150);
    expect(shellComponentValue(bending, 'vonMises', 'top')).toBeCloseTo(150);
  });

  it('reads the other stresses on the mid-surface by default, and on the more stressed face when asked', () => {
    expect(shellComponentValue(s, 'sigmaXx')).toBe(s.sigmaXx);
    const f = faceStresses(s, 0.2);
    const worse = Math.abs(f.top.sxx) > Math.abs(f.bottom.sxx) ? f.top.sxx : f.bottom.sxx;
    expect(shellComponentValue(s, 'sigmaXx', 'worst')).toBeCloseTo(worse);
  });
});

describe('the field averaged within a domain', () => {
  // Two quads sharing the edge 2–3, one per domain.
  const nodes = new Map([['q1', [1, 2, 3, 4]], ['q2', [2, 5, 6, 3]]]);
  const st = (id: number, mx: number) => ({ elementId: id, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx, my: 0, mxy: 0, vonMises: 0 });
  const opts = { at: 'nodes' as const, auto: true, min: 0, max: 0 };

  it('averages across the shared edge over the whole model, and not across domains', () => {
    const all = shellContourField({ plates: [], quads: [st(1, 10), st(2, 30)] }, (k) => nodes.get(k), 'mx', opts);
    expect(all.corners.get('q1')![1]).toBe(20);
    const split = shellContourField({ plates: [], quads: [st(1, 10), st(2, 30)] }, (k) => nodes.get(k), 'mx', { ...opts, domainOf: (k) => k });
    expect(split.corners.get('q1')).toEqual([10, 10, 10, 10]);
    expect(split.corners.get('q2')).toEqual([30, 30, 30, 30]);
  });

  it('averages Von Mises within each domain, not over the whole model', () => {
    const vm = (id: number, v: number) => ({ ...st(id, 0), vonMises: v, nodalVonMises: [50, 50, 50, 50] });
    const split = shellContourField({ plates: [], quads: [vm(1, 10), vm(2, 90)] }, (k) => nodes.get(k), 'vonMises', { ...opts, domainOf: (k) => k });
    expect(split.corners.get('q1')).toEqual([10, 10, 10, 10]);
    expect(split.corners.get('q2')).toEqual([90, 90, 90, 90]);
    const all = shellContourField({ plates: [], quads: [vm(1, 10), vm(2, 90)] }, (k) => nodes.get(k), 'vonMises', opts);
    expect(all.corners.get('q1')).toEqual([50, 50, 50, 50]);
  });

  it('leaves an element that does not give the component unpainted', () => {
    const f = shellContourField({ plates: [st(7, 1)], quads: [{ ...st(1, 1), qx: 4, qy: 3 }] }, (k) => (k === 'p7' ? [1, 2, 3] : nodes.get(k)), 'vmax', opts);
    expect(f.corners.has('p7')).toBe(false);
    expect(f.corners.get('q1')).toEqual([5, 5, 5, 5]);
  });
});

describe('the directions and values written over the shells', () => {
  it('draws one segment per element along the principal direction, and the two extremes', () => {
    const pts = { q1: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }] } as Record<string, Array<{ x: number; y: number; z: number }>>;
    const quad = { elementId: 1, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 10, my: 0, mxy: 0, vonMises: 0 };
    const field = shellContourField({ plates: [], quads: [quad] }, () => [1, 2, 3, 4], 'mmax', { at: 'nodes', auto: true, min: 0, max: 0 });
    const g = buildShellOverlay({ field, stresses: { plates: [], quads: [quad] }, component: 'mmax', face: 'mid', directions: true, values: true, corners: (k) => pts[k] ?? null, format: (v) => String(v) })!;
    const lines = g.children.find((c) => c.userData.shellDirections) as unknown as { geometry: { getAttribute: (n: string) => { array: Float32Array } } };
    const p = lines.geometry.getAttribute('position').array;
    expect(p.length).toBe(6);
    expect(Math.abs(p[4]! - p[1]!)).toBeLessThan(1e-9);
    expect(g.children.filter((c) => c.userData.shellValue !== undefined)).toHaveLength(1);
  });

  it('marks nothing on a hidden shell, and its values govern no extreme', () => {
    const sq = (x: number) => [{ x, y: 0, z: 0 }, { x: x + 1, y: 0, z: 0 }, { x: x + 1, y: 1, z: 0 }, { x, y: 1, z: 0 }];
    const pts = { q1: sq(0), q2: sq(5) } as Record<string, Array<{ x: number; y: number; z: number }>>;
    const a = { elementId: 1, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx: 10, my: 0, mxy: 0, vonMises: 0 };
    const b = { ...a, elementId: 2, mx: 80 };
    const stresses = { plates: [], quads: [a, b] };
    const field = shellContourField(stresses, (k) => (k === 'q1' ? [1, 2, 3, 4] : [5, 6, 7, 8]), 'mmax', { at: 'nodes', auto: true, min: 0, max: 0 });
    const g = buildShellOverlay({ field, stresses, component: 'mmax', face: 'mid', directions: true, values: true, corners: (k) => pts[k] ?? null, format: (v) => String(v), shown: (k) => k !== 'q2' })!;
    const lines = g.children.find((c) => c.userData.shellDirections) as unknown as { geometry: { getAttribute: (n: string) => { array: Float32Array } } };
    expect(lines.geometry.getAttribute('position').array.length).toBe(6);
    expect(g.children.filter((c) => c.userData.shellValue !== undefined).map((c) => c.userData.shellValue)).toEqual([10]);
    expect(buildShellOverlay({ field, stresses, component: 'mmax', face: 'mid', directions: true, values: true, corners: (k) => pts[k] ?? null, format: String, shown: () => false })).toBeNull();
  });
});
