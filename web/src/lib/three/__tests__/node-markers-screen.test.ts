/**
 * Basic's node markers are a fixed size on screen. The sphere sized in metres needed a pixel
 * floor measured at the orbit target, and a node far nearer the camera than that target grew
 * into a ball over the members. A point sprite of a few pixels cannot grow; the sphere mesh
 * stays as the click target, not drawn.
 */
import { describe, it, expect } from 'vitest';
import { NodesInstanced, resolveNodeStyle } from '../nodes-instanced';
import { COLORS } from '../selection-helpers';

const sizes = (n: NodesInstanced) => Array.from(n.points.geometry.getAttribute('aSize').array).slice(0, n.count);

describe('screen-sized node markers', () => {
  it('draws dots in place of the spheres, a marked node larger, and keeps the mesh pickable', () => {
    const n = new NodesInstanced();
    for (let i = 1; i <= 3; i++) n.upsert(i, i, 0, 0);
    n.setStyle('points');
    expect(n.points.visible).toBe(true);
    expect((n.mesh.material as { visible: boolean }).visible).toBe(false);
    expect(n.drawn).toBe(true);
    expect(sizes(n)).toEqual([3, 3, 3]);
    n.setColor(2, COLORS.nodeSelected);
    expect(sizes(n)).toEqual([3, 7, 3]);
    n.setStyle('spheres');
    expect(sizes(n)).toEqual([8, 11, 8]);
    // Hidden markers (the section view) hide the dots too.
    n.setDrawn(false);
    expect(n.points.visible).toBe(false);
    n.setDrawn(true);
    // Removing a node moves the last one into its slot, sizes and positions with it.
    n.remove(1);
    expect(n.count).toBe(2);
    expect(Array.from(n.points.geometry.getAttribute('position').array).slice(0, 6)).toEqual([3, 0, 0, 2, 0, 0]);
    // Growing past the capacity keeps every marker.
    for (let i = 10; i < 200; i++) n.upsert(i, i, 0, 0);
    expect(n.points.geometry.getAttribute('position').array[0]).toBe(3);
    expect(n.points.geometry.drawRange.count).toBe(n.count);
  });

  it('PRO keeps the sphere mesh', () => {
    const n = new NodesInstanced();
    n.upsert(1, 0, 0, 0);
    expect(n.markerStyle).toBe('mesh');
    expect(n.points.visible).toBe(false);
    expect((n.mesh.material as { visible: boolean }).visible).toBe(true);
  });

  it('the default draws balls only while a tool that clicks on nodes is armed', () => {
    for (const tool of ['node', 'element', 'support', 'load', 'moveNodes']) expect(resolveNodeStyle('auto', tool)).toBe('spheres');
    for (const tool of ['select', 'pan']) expect(resolveNodeStyle('auto', tool)).toBe('points');
    expect(resolveNodeStyle('points', 'node')).toBe('points');
    expect(resolveNodeStyle('spheres', 'select')).toBe('spheres');
  });
});
