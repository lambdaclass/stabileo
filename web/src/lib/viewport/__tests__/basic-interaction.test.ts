/**
 * The pure pieces behind Basic's interaction and view: the grid that thins out
 * zoomed far out, the label size the canvas applies to every font, clicking
 * again to reach the next thing under the pointer, the multi-hit queries both
 * viewports feed it, the 3D near and far planes that follow the camera, the
 * node tool's reach measured on the screen, and what the 2D pointer can reach
 * when things are hidden or turned off.
 */
import { describe, it, expect, vi } from 'vitest';
import { gridStepOnScreen } from '../draw-entities';
import { scaleFont } from '../../canvas/text-scale';
import { createPickCycle, mergeTargets, type PickTarget } from '../pick-cycle';
import { findElementsNear, findNodesNear, snapWithMidpoint, findNearestElement, findNearestNode, findAllLoadsNear } from '../spatial-queries';
import { pickable2D, loadsDrawn2D, type PickView2D } from '../pick-visibility';
import { boxSelect } from '../box-select';
import { nodeToolTolerances, pickTolAt, PICK_PX } from '../pick-tolerance';
import { nodesNearPointer, membersNearPointer, nodeNearPointer, memberNearPointer } from '../../viewport3d/screen-pick';
import { nearPlaneFor, farPlaneFor } from '../../viewport3d/camera';
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

describe('a double click after a click on the same spot', () => {
  const a: PickTarget[] = [{ kind: 'node', id: 3 }, { kind: 'element', id: 7 }];
  /** A cycle over a selection the test holds, and a clock it moves. */
  function setup() {
    let clock = 0;
    let selected: PickTarget | null = null;
    const cycle = createPickCycle({
      isSelected: (t) => selected !== null && selected.kind === t.kind && selected.id === t.id,
      now: () => clock,
    });
    const click = (detail = 1) => { const p = cycle.pick(a, 100, 100, undefined, detail); selected = p; return p; };
    return { cycle, click, tick: (ms: number) => { clock += ms; }, clear: () => { selected = null; } };
  }
  it('opens and keeps what was selected there: the double click does not step', () => {
    const { cycle, click, tick } = setup();
    expect(click()).toEqual(a[0]);
    tick(800);
    click(1);                         // the double click's first click…
    tick(150);
    expect(click(2)).toEqual(a[0]);   // …and its second: back to node 3,
    // the first thing there, which the editor opens as it always did.
    expect(cycle.steppedTo(101, 100)).toBeNull();
  });
  it('stepped to the member first, a double click opens the member', () => {
    const { cycle, click, tick } = setup();
    click();
    tick(400);
    expect(click()).toEqual(a[1]);
    tick(400);
    click(1);
    tick(150);
    expect(click(2)).toEqual(a[1]);
    expect(cycle.steppedTo(100, 100)).toEqual(a[1]);
    expect(cycle.steppedTo(160, 100)).toBeNull();
  });
  it('after Esc, a click on the same spot takes the first thing there again', () => {
    const { click, tick, clear } = setup();
    click();
    clear();
    tick(300);
    expect(click(1)).toEqual(a[0]);
    tick(150);
    expect(click(2)).toEqual(a[0]);
  });
  it('a click long after the last one starts over', () => {
    const { click, tick } = setup();
    click();
    tick(10_000);
    expect(click()).toEqual(a[0]);
    tick(300);
    expect(click()).toEqual(a[1]);
  });
});

describe('the 2D node tool measures its reach on the screen', () => {
  const nodes = new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]]) as never;
  const elements = new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]) as never;
  const grid = (x: number, y: number) => ({ x, y });
  it('zoomed in on a millimetre part, a click 10 mm from a node places a node there', () => {
    const tol = nodeToolTolerances(50_000);   // 10 mm is 500 px
    expect(snapWithMidpoint(0.01, 0.003, grid, nodes, elements, tol.node, tol.midpoint)).toEqual({ x: 0.01, y: 0.003 });
    // …and the node still catches the pointer within its pixels.
    expect(snapWithMidpoint(0.0003, 0, grid, nodes, elements, tol.node, tol.midpoint)).toEqual({ x: 0, y: 0 });
    // Splitting takes only a member under the pointer, not one 5 mm off.
    expect(findNearestElement(2, 0.005, tol.split, elements, nodes)).toBeNull();
  });
  it('zoomed out on a long structure, a click a few pixels off still catches the node and the member', () => {
    const tol = nodeToolTolerances(0.5);      // 20 m is 10 px
    // 14 m (7 px) from node 2.
    expect(snapWithMidpoint(14, 10, grid, nodes, elements, tol.node, tol.midpoint)).toEqual({ x: 4, y: 0 });
    // Pointer 20 m (10 px) beside the member: the auto-split still finds it.
    expect(findNearestElement(2, 20, tol.split, elements, nodes)?.id).toBe(1);
  });
  it('at the old 50 px/m they are the old metres', () => {
    expect(nodeToolTolerances(50)).toEqual({ node: 0.5, midpoint: 0.4, split: 0.3 });
    expect(pickTolAt(50, PICK_PX.loose)).toBeCloseTo(0.5);
  });
});

describe('what the 2D pointer can reach is what the view draws', () => {
  // Two members; member 2 and its far node 3 hidden, a support on each end node, a load on each member.
  const nodes = new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }], [3, { id: 3, x: 8, y: 0 }]]);
  const elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2 }], [2, { id: 2, nodeI: 2, nodeJ: 3 }]]);
  const supports = new Map([[1, { id: 1, nodeId: 1 }], [2, { id: 2, nodeId: 3 }]]);
  const loads = [
    { type: 'distributed', data: { id: 1, elementId: 1, qI: -1, qJ: -1 } },
    { type: 'distributed', data: { id: 2, elementId: 2, qI: -1, qJ: -1 } },
    { type: 'nodal', data: { id: 3, nodeId: 3, fx: 0, fz: -1, my: 0 } },
  ];
  const model = { nodes, elements, supports, loads };
  const view = (over: Partial<PickView2D> = {}): PickView2D => ({
    anyHidden: true,
    isNodeHidden: (id) => id === 3,
    isElementHidden: (id) => id === 2,
    isLoadHidden: (d) => d.elementId === 2 || d.nodeId === 3,
    showSupports: true,
    loadsDrawn: true,
    ...over,
  });
  const marquee = (m: { nodes: Map<number, { id: number; x: number; y: number }>; elements: Map<number, { id: number; nodeI: number; nodeJ: number }>; supports: Map<number, { id: number; nodeId: number }>; loads: readonly typeof loads[number][] }) => boxSelect({
    rect: { x1: -100, y1: -100, x2: 1000, y2: 100 }, isWindow: true,
    kinds: ['nodes', 'elements', 'supports', 'loads'],
    toScreen: (p) => ({ x: p.x * 10, y: -p.y * 10 }),
    model: {
      nodes: m.nodes.values(), elements: m.elements.values(), supports: m.supports.values(), loads: m.loads as never,
      getNode: (id) => nodes.get(id), getElement: (id) => elements.get(id),
    },
  });
  it('a marquee over everything takes none of what is hidden', () => {
    // The whole model, as the 2D marquee was handed it, takes the hidden ones too.
    const before = marquee(model);
    expect(before.elements.has(2) && before.supports.has(2) && before.loads.has(2)).toBe(true);
    const after = marquee(pickable2D(model, view()));
    expect([...after.nodes].sort()).toEqual([1, 2]);
    expect([...after.elements]).toEqual([1]);
    expect([...after.supports]).toEqual([1]);
    expect([...after.loads]).toEqual([1]);
  });
  it('with supports or loads turned off, a marquee takes none of them', () => {
    const p = pickable2D(model, view({ anyHidden: false, showSupports: false, loadsDrawn: false }));
    const got = marquee(p);
    expect(got.supports.size).toBe(0);
    expect(got.loads.size).toBe(0);
    expect(got.elements.size).toBe(2);
  });
  it('the nearest node, member and load skip what is hidden', () => {
    const p = pickable2D(model, view());
    expect(findNearestNode(8, 0, 1, p.nodes as never)).toBeNull();
    expect(findNearestElement(6, 0, 1, p.elements as never, nodes as never)).toBeNull();
    expect(findAllLoadsNear(6, 0, 1, p.loads as never, elements as never, nodes as never)).toEqual([]);
    // The full model, as the wrappers searched it, finds them.
    expect(findNearestNode(8, 0, 1, nodes as never)?.id).toBe(3);
    expect(findAllLoadsNear(6, 0, 1, loads as never, elements as never, nodes as never)).toContain(2);
  });
  it('nothing hidden and both layers on: the model itself, nothing copied', () => {
    const p = pickable2D(model, view({ anyHidden: false }));
    expect(p.nodes).toBe(nodes);
    expect(p.elements).toBe(elements);
    expect(p.supports).toBe(supports);
    expect(p.loads).toBe(loads);
  });
  it('loads are drawn with the layer on and no diagram hiding them', () => {
    expect(loadsDrawn2D(true, true, false)).toBe(true);
    expect(loadsDrawn2D(true, true, true)).toBe(false);
    expect(loadsDrawn2D(true, false, true)).toBe(true);
    expect(loadsDrawn2D(false, false, false)).toBe(false);
  });
});

describe('3D far plane', () => {
  it('follows the distance, and still reaches the far corner of the grid', () => {
    // A 20 m frame framed whole in Basic's 50 m grid: far 200 m, near 0.1 m.
    expect(farPlaneFor(20, 50)).toBe(200);
    // Zoomed in on a part a couple of centimetres away: the range is what the grid needs,
    // not 2000 m over a near plane of 0.1 mm (2·10⁷ to 1, it was).
    const d = 0.02;
    expect(farPlaneFor(d, 50) / nearPlaneFor(d)).toBeLessThan(1e6);
    expect(farPlaneFor(d, 50)).toBeGreaterThanOrEqual(d + 50 * Math.SQRT2);
    // PRO's kilometre grid from 50 m away.
    expect(farPlaneFor(50, 1000)).toBeGreaterThanOrEqual(50 + 1000 * Math.SQRT2);
  });
});
