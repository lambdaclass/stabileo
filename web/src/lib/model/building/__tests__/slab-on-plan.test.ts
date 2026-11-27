import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import { physicalGroups } from '../../../store/physical';
import { beamFromRect, beamSnapPoints, footprintAt, placeBeamOnPlan, placeColumnOnPlan, rectCorners } from '../draw-on-plan';
import { placeSlabOnPlan, slabFraming } from '../slab-on-plan';
import type { Level } from '../../grid';

const levels: Level[] = [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }];
const column = (x: number, y: number) =>
  placeColumnOnPlan({ footprint: footprintAt({ x, y }, 0.3, 0.3, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1 });
const beam = (a: { x: number; y: number }, b: { x: number; y: number }) => placeBeamOnPlan({ a, b, width: 0.2, height: 0.5, level: levels[1]!, materialId: 1 });

/** Four columns at the corners of 6 × 5 m and beams on three sides: the fourth, y = 5, has none. */
function bay() {
  for (const [x, y] of [[0, 0], [6, 0], [6, 5], [0, 5]] as const) column(x, y);
  beam({ x: 0, y: 0 }, { x: 6, y: 0 });
  beam({ x: 6, y: 0 }, { x: 6, y: 5 });
  beam({ x: 0, y: 5 }, { x: 0, y: 0 });
}

describe('a beam drawn as a rectangle', () => {
  it('runs along its longer side, as wide as its shorter one, either way it is drawn', () => {
    expect(beamFromRect({ x: 6, y: 0.1 }, { x: 0, y: -0.1 })).toEqual({ a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, width: 0.2 });
    expect(beamFromRect({ x: 0.1, y: 0 }, { x: -0.1, y: 5 })).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 5 }, width: 0.2 });
    expect(beamFromRect({ x: 0, y: 0 }, { x: 3, y: 0 }), 'no width').toBeNull();
  });
});

describe('a slab drawn on the plan', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('knows which of its sides a beam carries and which is free', () => {
    bay();
    const edges = slabFraming(rectCorners({ x: 0.1, y: 0.1 }, { x: 5.9, y: 4.9 }), 3);
    expect(edges.map((e) => e.support)).toEqual(['beam', 'beam', 'free', 'beam']);
    expect(slabFraming(rectCorners({ x: 0.1, y: 0.1 }, { x: 5.9, y: 4.9 }), 0).every((e) => e.support === 'free'), 'on another level').toBe(true);
  });

  it('a beam that covers only part of a side leaves it free', () => {
    for (const [x, y] of [[0, 0], [6, 0]] as const) column(x, y);
    beam({ x: 0, y: 0 }, { x: 3, y: 0 });
    expect(slabFraming(rectCorners({ x: 0, y: 0 }, { x: 6, y: 5 }), 3)[0]!.support).toBe('free');
  });

  it('moves its framed sides onto the beams, so its mesh shares their nodes, keeps the free one where drawn, and undoes in one step', () => {
    bay();
    const before = modelStore.nodes.size;
    const r = placeSlabOnPlan({ corners: rectCorners({ x: 0.1, y: 0.1 }, { x: 5.9, y: 4.9 }), level: levels[1]!, thickness: 0.15, materialId: 1, typology: 'solid' });
    expect(r.created).toBe(1);
    const g = physicalGroups().find((x) => x.physical.kind === 'slab')!;
    expect(g.physical).toMatchObject({ kind: 'slab', levelFrom: 'N1', levelTo: 'N1', typology: 'solid', edges: ['beam', 'beam', 'free', 'beam'] });
    const outline = (modelStore.model.groups.get(r.groupId!)!.members.nodes ?? []).map((id) => modelStore.nodes.get(id)!);
    expect(outline.map((n) => [n.x, n.y, n.z])).toEqual([[0, 0, 3], [6, 0, 3], [6, 4.9, 3], [0, 4.9, 3]]);
    expect(modelStore.nodes.size - before, 'the two corners on the beams are the beams’ nodes').toBe(2);
    historyStore.undo();
    expect(physicalGroups().some((x) => x.physical.kind === 'slab')).toBe(false);
  });

  it('offers the beams’ axis ends and corners to snap to', () => {
    bay();
    const pts = beamSnapPoints(3);
    expect(pts.some((p) => p.kind === 'center' && Math.hypot(p.x - 6, p.y) < 1e-9)).toBe(true);
    expect(pts.some((p) => p.kind === 'corner' && Math.hypot(p.x - 3, p.y - 0.1) < 1e-9)).toBe(false);
    expect(pts.filter((p) => p.kind === 'corner').length).toBeGreaterThan(0);
  });
});

describe('a slab between beams that stop at wide columns', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('reads the stretch the column takes as carried, so the side is on beams', () => {
    for (const [x, y] of [[0, 0], [6, 0]] as const) placeColumnOnPlan({ footprint: footprintAt({ x, y }, 0.4, 0.4, 0, [0, 0]), fixedPoint: [0, 0], levels, levelFrom: 'N0', levelTo: 'N1', materialId: 1 });
    placeBeamOnPlan({ a: { x: 0.2, y: 0 }, b: { x: 5.8, y: 0 }, width: 0.2, height: 0.5, level: levels[1]!, materialId: 1 });
    expect(slabFraming(rectCorners({ x: 0.1, y: 0.1 }, { x: 5.9, y: 4.9 }), 3)[0]!.support).toBe('beam');
  });
});
