/**
 * The shell contour's arithmetic: bands, the range, the field at the nodes or at the centre, and
 * a result read along a line, which on a linear field is exact.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bandValue, bandEdges, contourRange, nodalAverage } from '../contour-scale';
import { shellContourField } from '../shell-contour-field';
import { sampleAlongLine } from '../shell-line';
import { displaceShellFace } from '../../three/stress-heatmap';

const st = (elementId: number, mx: number, vm = 0, nodal?: number[]) => ({ elementId, sigmaXx: 0, sigmaYy: 0, tauXy: 0, mx, my: 0, mxy: 0, vonMises: vm, ...(nodal ? { nodalVonMises: nodal } : {}) });

describe('scale', () => {
  it('bands paint their centres, ends included', () => {
    expect(bandValue(0.1, 0, 1, 5)).toBeCloseTo(0.1, 12);
    expect(bandValue(0.39, 0, 1, 5)).toBeCloseTo(0.3, 12);
    expect(bandValue(1, 0, 1, 5)).toBeCloseTo(0.9, 12);
    expect(bandValue(-3, 0, 1, 5)).toBeCloseTo(0.1, 12);
    expect(bandValue(0.37, 0, 1, 0)).toBe(0.37);
    expect(bandEdges(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  it('a typed range replaces the computed one only when it is a range', () => {
    const c = { min: -1, max: 4 };
    expect(contourRange(c, { auto: true, min: 0, max: 1 })).toBe(c);
    expect(contourRange(c, { auto: false, min: 0, max: 2 })).toEqual({ min: 0, max: 2 });
    expect(contourRange(c, { auto: false, min: 2, max: 2 })).toBe(c);
  });
});

describe('field', () => {
  // Two quads side by side sharing nodes 2 and 5.
  const nodes: Record<string, number[]> = { q1: [1, 2, 5, 4], q2: [2, 3, 6, 5] };
  const stresses = { plates: [], quads: [st(1, 10, 1, [1, 2, 3, 4]), st(2, 30, 5, [5, 6, 7, 8])] };
  const nodesOf = (k: string) => nodes[k];
  it('at the nodes: the shared nodes average the two elements', () => {
    const f = shellContourField(stresses, nodesOf, 'mx', { at: 'nodes', auto: true, min: 0, max: 0 });
    expect(f.corners.get('q1')).toEqual([10, 20, 20, 10]);
    expect(f.corners.get('q2')).toEqual([20, 30, 30, 20]);
    expect(f.computed).toEqual({ min: 10, max: 30 });
    expect(nodalAverage([{ nodes: [1, 2], value: 2 }, { nodes: [2], value: 4 }]).get(2)).toBe(3);
  });
  it('at the centre: each element its own value; von Mises at the nodes is the solver\'s own', () => {
    expect(shellContourField(stresses, nodesOf, 'mx', { at: 'centre', auto: true, min: 0, max: 0 }).corners.get('q2')).toEqual([30, 30, 30, 30]);
    expect(shellContourField(stresses, nodesOf, 'vonMises', { at: 'nodes', auto: true, min: 0, max: 0 }).corners.get('q2')).toEqual([5, 6, 7, 8]);
  });
});

describe('along a line', () => {
  it('reads a linear field exactly, and a gap off the shells', () => {
    // A 2 × 1 plate in XY, value = x at its corners.
    const shells = [{ corners: [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]] as const, values: [0, 2, 2, 0] }];
    const s = sampleAlongLine([0, 0.5, 0], [3, 0.5, 0], shells, 7);
    expect(s.map((x) => x.s)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    for (const x of s.slice(0, 5)) expect(x.value).toBeCloseTo(x.point[0], 12);
    expect(s[6]!.value).toBeNull();
    // Off the plane by more than the tolerance: nothing.
    expect(sampleAlongLine([1, 0.5, 0.2], [1, 0.5, 0.2], shells, 1)[0]!.value).toBeNull();
  });
});

describe('on the deformed shape', () => {
  it('moves a face by its corners, and puts it back', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]), 3));
    const mesh = new THREE.Mesh(geo);
    displaceShellFace(mesh, [[0, 0, 1], [0, 0, 2], [0, 0, 3]], 10, false);
    expect([...geo.getAttribute('position').array].filter((_, i) => i % 3 === 2)).toEqual([10, 20, 30]);
    displaceShellFace(mesh, null, 0, false);
    expect([...geo.getAttribute('position').array]).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0]);
  });
});
