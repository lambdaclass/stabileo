/**
 * The stretch handles on a member with rigid end offsets (`load-handles.ts`): they sit on the
 * segment the engine loads, a = 0 at the end of the offset at I and b = L at the one at J, and a
 * drag past the end stops there instead of asking for a length the stretch rule refuses.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { modelStore, uiStore } from '../../store';
import { addLoads } from '../../store/load-ops';
import { loadedLength, loadedSegment } from '../../model/loads/load-stretch';
import { activeStretchHandles, handlePoint, stationOnRay, moveStretchEnd } from '../load-handles';
import { loadStationInScene } from '../scene-sync';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); uiStore.analysisMode = 'pro'; uiStore.clearSelectedLoads(); });
afterEach(() => { uiStore.clearSelectedLoads(); });

/** A 6 m beam along X with rigid offsets of 0.3 m at I and 0.5 m at J: 5.2 m of it is loaded. */
function offsetBeam() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.setElementOffset(e, { frame: 'global', i: { x: 0.3, y: 0, z: 0 }, j: { x: -0.5, y: 0, z: 0 } });
  const [id] = addLoads([{ type: 'distributed3d', data: { id: 0, elementId: e, qYI: 0, qYJ: 0, qZI: -10, qZJ: -10, caseId: 1 } }]);
  uiStore.selectLoad(id!);
  const data = () => modelStore.loads.find((l) => l.data.id === id)!.data as { a?: number; b?: number };
  return { e, id: id!, data };
}

describe('stretch handles on a member with rigid end offsets', () => {
  it('a = 0 and b = L sit at the ends of the offsets, L the flexible length', () => {
    const { e } = offsetBeam();
    expect(loadedLength(modelStore.model as never, e)).toBeCloseTo(5.2, 12);
    expect(loadedSegment(modelStore.model as never, e)!.I).toEqual([0.3, 0, 0]);
    const h = activeStretchHandles()!;
    expect(h.L).toBeCloseTo(5.2, 12);
    expect(handlePoint(h, 'a').toArray()).toEqual([0.3, 0, 0].map((v) => expect.closeTo(v, 12)));
    expect(handlePoint(h, 'b').toArray()).toEqual([5.5, 0, 0].map((v) => expect.closeTo(v, 12)));
  });

  it('a drag past either end stops at it: b is the flexible length, a its start', () => {
    const { e, data } = offsetBeam();
    modelStore.updateLoad(activeStretchHandles()!.loadId, { a: 1, b: 3 });
    // The pointer over x = 8, past node J: the station clamps to L_flex, and the stored b is L_flex.
    let h = activeStretchHandles()!;
    const past = new THREE.Ray(new THREE.Vector3(8, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(stationOnRay(h, past)).toBeCloseTo(5.2, 12);
    moveStretchEnd(h, 'b', stationOnRay(h, past));
    expect(data().b ?? loadedLength(modelStore.model as never, e)).toBeCloseTo(5.2, 12);
    expect(activeStretchHandles()!.b).toBeCloseTo(5.2, 12);
    // A station beyond the length handed straight in is clamped too, never refused.
    h = activeStretchHandles()!;
    moveStretchEnd(h, 'b', 5.9);
    expect(activeStretchHandles()!.b).toBeCloseTo(5.2, 12);
    // And a before the start.
    h = activeStretchHandles()!;
    moveStretchEnd(h, 'a', -0.4);
    expect(data().a).toBeUndefined();
    expect(activeStretchHandles()!.a).toBe(0);
  });
});

describe('the drawing on a member with rigid end offsets', () => {
  it('distributed and point loads are placed on the same segment: a = 0 and b = L at the ends of the offsets', () => {
    const { e } = offsetBeam();
    expect(loadStationInScene(e, 0, false)).toEqual({ x: expect.closeTo(0.3, 12), y: 0, z: 0 });
    expect(loadStationInScene(e, undefined, false)).toEqual({ x: expect.closeTo(5.5, 12), y: 0, z: 0 });
    expect(loadStationInScene(e, 2, false)).toEqual({ x: expect.closeTo(2.3, 12), y: 0, z: 0 });
    // Past the end, on the end; and where the handle is.
    expect(loadStationInScene(e, 9, false)!.x).toBeCloseTo(5.5, 12);
    expect(handlePoint(activeStretchHandles()!, 'b').x).toBeCloseTo(loadStationInScene(e, undefined, false)!.x, 12);
  });
});
