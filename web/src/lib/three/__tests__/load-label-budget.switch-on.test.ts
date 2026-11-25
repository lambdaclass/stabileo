/**
 * The load values drawn at once are a few hundred at most, spread over the model: a building's
 * generated loads wrote thousands of labels, a draw call each, one over another.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createLoadArrowsBatched, thinLabels, LOAD_LABEL_BUDGET } from '../load-arrows-batched';

const canvas = { width: 0, height: 0, getContext: () => ({ fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle', fillText: () => {}, measureText: () => ({ width: 10 }) }) };
Object.defineProperty(globalThis, 'document', { value: { createElement: () => canvas }, configurable: true });

describe('the load labels', () => {
  it('are all drawn while they are few', () => {
    const few = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0, z: 0 }));
    expect(thinLabels(few, 250)).toEqual(few);
  });

  it('are thinned to the budget, one a part of the model, the first of each kept', () => {
    const many = Array.from({ length: 40 }, (_, i) => Array.from({ length: 100 }, (_, j) => ({ x: i * 0.5, y: j * 0.2, z: 0, i, j }))).flat();
    const kept = thinLabels(many, 250);
    expect(kept.length).toBeLessThanOrEqual(250);
    expect(kept.length).toBeGreaterThan(60);
    const xs = kept.map((l) => l.x), ys = kept.map((l) => l.y);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBeGreaterThan(15);
    expect(Math.max(...ys)).toBeGreaterThan(15);
    expect(kept[0]).toBe(many[0]);
  });

  it('cost a few hundred sprites in a model with thousands of loads', () => {
    const b = createLoadArrowsBatched();
    for (let i = 0; i < 3000; i++) b.addDistributedLoad({ x: (i % 60) * 0.5, y: Math.floor(i / 60) * 0.5, z: 0 }, { x: (i % 60) * 0.5 + 0.5, y: Math.floor(i / 60) * 0.5, z: 0 }, -5, -5, 10, 'Z', undefined, 0xff4444);
    let sprites = 0;
    b.build().traverse((o) => { if (o instanceof THREE.Sprite) sprites++; });
    expect(sprites).toBeLessThanOrEqual(LOAD_LABEL_BUDGET);
    expect(sprites).toBeGreaterThan(50);
  });

  it('are hidden, with the arrows and fills, where the structure stands in front of them', () => {
    const b = createLoadArrowsBatched();
    b.addDistributedLoad({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, -5, -5, 10, 'Z', undefined, 0xff4444);
    b.addSurfaceLoad([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 4, z: 0 }, { x: 0, y: 4, z: 0 }], -3, 3, 0x44ff44);
    b.addNodalLoadArrow({ x: 0, y: 0, z: 0 }, 0, 0, -10, 0, 0, 5, 10, 'curved', 0x4444ff);
    const mats: THREE.Material[] = [];
    b.build().traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) mats.push(m); });
    expect(mats.length).toBeGreaterThan(4);
    expect(mats.filter((m) => !m.depthTest)).toEqual([]);
    expect(mats.some((m) => m instanceof THREE.SpriteMaterial)).toBe(true);
    const fill = mats.find((m) => m.transparent && m.side === THREE.DoubleSide)!;
    expect(fill.polygonOffset && fill.polygonOffsetFactor < 0).toBe(true);
  });
});
