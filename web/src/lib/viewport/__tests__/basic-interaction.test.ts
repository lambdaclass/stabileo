/**
 * The pure pieces behind Basic's interaction and view: the grid that thins out
 * zoomed far out, the label size the canvas applies to every font, clicking
 * again to reach the next thing under the pointer, the multi-hit queries both
 * viewports feed it, and the 3D near plane that follows the camera in.
 */
import { describe, it, expect, vi } from 'vitest';
import { gridStepOnScreen } from '../draw-entities';
import { scaleFont } from '../../canvas/text-scale';
import { createPickCycle, mergeTargets, type PickTarget } from '../pick-cycle';
import { findElementsNear, findNodesNear } from '../spatial-queries';
import { nodesNearPointer, membersNearPointer, nodeNearPointer, memberNearPointer } from '../../viewport3d/screen-pick';
import { nearPlaneFor } from '../../viewport3d/camera';
import { clampZoom2D, ZOOM_2D_MIN, ZOOM_2D_MAX } from '../../store/ui.svelte';

describe('grid step on screen', () => {
  it('is the grid itself when its lines are far enough apart', () => {
    expect(gridStepOnScreen(1, 50)).toBe(1);
    expect(gridStepOnScreen(0.001, 50_000)).toBe(0.001);
  });
  it('thins to 5, 10, 50, 100… times the grid zoomed out, never closer than 8 px', () => {
    expect(gridStepOnScreen(1, 1)).toBe(10);
    expect(gridStepOnScreen(1, 0.5)).toBe(50);
    for (const z of [0.5, 0.9, 3, 7.9]) expect(gridStepOnScreen(1, z) * z).toBeGreaterThanOrEqual(8);
  });
});

describe('2D zoom range', () => {
  it('reaches a kilometre on screen and a millimetre a couple of centimetres wide', () => {
    expect(clampZoom2D(0.01)).toBe(ZOOM_2D_MIN);
    expect(clampZoom2D(1e9)).toBe(ZOOM_2D_MAX);
    expect(clampZoom2D(20_000)).toBe(20_000);
    expect(clampZoom2D(NaN)).toBe(50);
  });
});

describe('label size on the canvas', () => {
  it('scales the pixel size a font names, and leaves the rest alone', () => {
    expect(scaleFont('bold 10px sans-serif', 1.5)).toBe('bold 15px sans-serif');
    expect(scaleFont('11px system-ui, -apple-system, sans-serif', 2)).toBe('22px system-ui, -apple-system, sans-serif');
    expect(scaleFont('12px monospace', 1)).toBe('12px monospace');
  });
});

describe('clicking again on the same spot', () => {
  const a: PickTarget[] = [{ kind: 'node', id: 3 }, { kind: 'element', id: 7 }, { kind: 'element', id: 9 }];
  it('steps through what is under the pointer, wraps, and says where it is', () => {
    const cycle = createPickCycle();
    const step = vi.fn();
    expect(cycle.pick(a, 100, 100, step)).toEqual(a[0]);
    expect(step).not.toHaveBeenCalled();
    expect(cycle.pick(a, 102, 101, step)).toEqual(a[1]);
    expect(step).toHaveBeenLastCalledWith(2, 3);
    expect(cycle.pick(a, 101, 100, step)).toEqual(a[2]);
    expect(cycle.pick(a, 100, 100, step)).toEqual(a[0]);
  });
  it('the second click of a double click does not step', () => {
    const cycle = createPickCycle();
    expect(cycle.pick(a, 100, 100, undefined, 1)).toEqual(a[0]);
    expect(cycle.pick(a, 100, 100, undefined, 2)).toEqual(a[0]);
    expect(cycle.pick(a, 100, 100, undefined, 1)).toEqual(a[1]);
  });
  it('starts over somewhere else, or when what is there changed', () => {
    const cycle = createPickCycle();
    cycle.pick(a, 100, 100);
    expect(cycle.pick(a, 120, 100)).toEqual(a[0]);
    cycle.pick(a, 120, 100);
    expect(cycle.pick(a.slice(1), 120, 100)).toEqual(a[1]);
    expect(cycle.pick([], 120, 100)).toBeNull();
  });
  it('merges candidate lists keeping the first place of each', () => {
    expect(mergeTargets([{ kind: 'element', id: 2 }], [{ kind: 'element', id: 2 }, { kind: 'element', id: 5 }]))
      .toEqual([{ kind: 'element', id: 2 }, { kind: 'element', id: 5 }]);
  });
});

describe('everything near a point (2D)', () => {
  const nodes = new Map([
    [1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }], [3, { id: 3, x: 2, y: 0.05 }],
  ]);
  // Member 2 lies over member 1.
  const elements = new Map([
    [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
    [2, { id: 2, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
  ]) as never;
  it('lists every member within the tolerance, nearest first', () => {
    expect(findElementsNear(2, 0.01, 0.1, elements, nodes as never)).toEqual([1, 2]);
    expect(findElementsNear(2, 1, 0.1, elements, nodes as never)).toEqual([]);
  });
  it('lists every node within the tolerance, nearest first', () => {
    expect(findNodesNear(2, 0.04, 0.5, nodes as never)).toEqual([3]);
    expect(findNodesNear(0.1, 0, 5, nodes as never)).toEqual([1, 3, 2]);
  });
});

describe('everything near the pointer (3D, on screen)', () => {
  const project = (x: number, y: number) => ({ x: x * 100, y: y * 100 });
  const nodes = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }, { id: 3, x: 0.05, y: 0 }];
  const members = [{ id: 10, nodeI: 1, nodeJ: 2 }, { id: 11, nodeI: 3, nodeJ: 2 }];
  const at = (id: number) => nodes.find((n) => n.id === id);
  it('lists nodes and members within the pixels, nearest first', () => {
    expect(nodesNearPointer(1, 0, nodes, project, 9)).toEqual([1, 3]);
    expect(membersNearPointer(50, 3, members, at, project, 7)).toEqual([10, 11]);
  });
  it('keeps the nearest-only queries answering as before', () => {
    expect(nodeNearPointer(1, 0, nodes, project, 9)).toBe(1);
    expect(memberNearPointer(50, 3, members, at, project, 7)).toBe(10);
    expect(memberNearPointer(50, 30, members, at, project, 7)).toBeNull();
  });
});

describe('3D near plane', () => {
  it('follows the distance in and out, never under 0.1 mm', () => {
    expect(nearPlaneFor(20)).toBeCloseTo(0.1);
    expect(nearPlaneFor(2000)).toBeCloseTo(10);
    expect(nearPlaneFor(2)).toBeCloseTo(0.01);
    expect(nearPlaneFor(0.001)).toBe(1e-4);
  });
});
