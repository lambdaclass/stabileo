import { describe, expect, it } from 'vitest';
import type { BuildAction } from '../actions';
import { applyEdit } from '../edit-executor';
import { generateMultiStoryFrame, generateMultiStoryFrame3d, generatePortalFrame } from '../generators';
import { AiActionError } from '../limits';
import { floorLevels } from '../snapshot-json';

type Snap = Record<string, unknown>;
type Tuple = [number, Record<string, unknown>];
const arr = (snap: Snap, key: string): Tuple[] => snap[key] as Tuple[];
const loadsOf = (snap: Snap): Array<{ type: string; data: Record<string, unknown> }> => snap.loads as never;

const makeFrame = (): Snap => generatePortalFrame({ width: 6, height: 4, q_beam: -10 });
const makeMultiStory = (): Snap => generateMultiStoryFrame({ n_bays: 2, n_floors: 2, bay_width: 6, floor_height: 3, q_beam: -10 });
const makeMultiStory3d = (): Snap => generateMultiStoryFrame3d({ n_bays_x: 2, n_bays_z: 2, n_floors: 2, bay_width: 5, floor_height: 3 });
const frame = (threeD: boolean): Snap => threeD
  ? generateMultiStoryFrame3d({ n_bays_x: 1, n_bays_z: 1, n_floors: 1, bay_width: 5, floor_height: 3, q_beam: -10 })
  : makeFrame();

function loadActions(snap: Snap): BuildAction[] {
  return [
    { action: 'add_nodal_load', params: { node_id: arr(snap, 'nodes')[0][0], fx: 1 } },
    { action: 'add_lateral_loads', params: { h: 1 } },
    { action: 'add_distributed_load', params: { element_id: arr(snap, 'elements')[0][0], q: -1 } },
  ];
}

describe('edit executor', () => {
  it('adds a bay to a portal frame', () => {
    const r = applyEdit({ action: 'add_bay', params: { width: 5 } }, makeFrame());
    expect(arr(r, 'nodes')).toHaveLength(6);
    expect(arr(r, 'elements')).toHaveLength(5);
    expect(arr(r, 'supports')).toHaveLength(3);
    expect(arr(r, 'nodes').slice(4).map((n) => [n[1].x, n[1].y])).toEqual([[11, 0], [11, 4]]);
    expect(arr(r, 'elements').slice(3).map((e) => [e[1].nodeI, e[1].nodeJ])).toEqual([[5, 6], [3, 6]]);
  });

  it('adds a story to a portal frame', () => {
    const r = applyEdit({ action: 'add_story', params: { height: 3.5 } }, makeFrame());
    expect(arr(r, 'nodes')).toHaveLength(6);
    expect(arr(r, 'elements')).toHaveLength(6);
    expect(arr(r, 'nodes').slice(4).map((n) => n[1].y)).toEqual([7.5, 7.5]);
  });

  it('adds a bay on the left', () => {
    const r = applyEdit({ action: 'add_bay', params: { width: 4, side: 'left' } }, makeFrame());
    expect(arr(r, 'nodes').map((n) => n[1].x)).toContain(-4);
  });

  it('changes every section', () => {
    const r = applyEdit({ action: 'change_section', params: { section: 'HEB 400' } }, makeFrame());
    const heb = arr(r, 'sections').find((s) => s[1].name === 'HEB 400')!;
    expect(heb[1]).toEqual({ id: 3, name: 'HEB 400', a: 198e-4, iz: 57680e-8 });
    expect(arr(r, 'elements').every((e) => e[1].sectionId === 3)).toBe(true);
  });

  it('changes only columns with the column filter', () => {
    const r = applyEdit({ action: 'change_section', params: { section: 'HEB 400', element_filter: 'column' } }, makeFrame());
    expect(arr(r, 'elements').map((e) => e[1].sectionId)).toEqual([3, 1, 3]);
  });

  it('sets all supports to pinned', () => {
    const r = applyEdit({ action: 'set_all_supports', params: { support_type: 'pinned' } }, makeFrame());
    expect(arr(r, 'supports').every((s) => s[1].type === 'pinned')).toBe(true);
  });

  it('sets one distributed load per element', () => {
    const r = applyEdit({ action: 'set_all_beam_loads', params: { q: -20 } }, makeFrame());
    expect(loadsOf(r).filter((l) => l.type === 'distributed')).toHaveLength(arr(r, 'elements').length);
  });

  it('adds lateral loads per floor above base', () => {
    const snap = makeMultiStory();
    const floors = floorLevels(snap);
    const r = applyEdit({ action: 'add_lateral_loads', params: { h: 15 } }, snap);
    expect(loadsOf(r).filter((l) => l.type === 'nodal')).toHaveLength(floors.length - 1);
  });

  it('refuses malformed snapshots with AiActionError, never a TypeError', () => {
    const oneElement: Snap = {
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 5, y: 0 }]],
      elements: [[1, { id: 1, nodeI: 1, nodeJ: 2 }]],
    };
    const cases: Array<[BuildAction, Snap]> = [
      [{ action: 'add_distributed_load', params: { element_id: 1, q: -10 } }, { ...oneElement, loads: 5 }],
      [{ action: 'add_distributed_load', params: { element_id: 1, q: -10 } }, oneElement],
      [{ action: 'delete_load', params: { load_id: 1 } }, { ...oneElement, loads: {} }],
      [{ action: 'add_story', params: { height: 3 } }, { nodes: [[1, { id: 1, x: 0, y: 0 }]], elements: [[1, { id: 1, nodeI: 1, nodeJ: 99 }]], loads: [] }],
      [{ action: 'add_story', params: { height: 3 } }, { nodes: [[1, { id: 1, x: 0, y: 0 }]], elements: [[1, { id: 1, nodeI: 'one', nodeJ: 1 }]], loads: [] }],
      [{ action: 'add_story', params: { height: 3 } }, { analysisMode: '3d', nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }]], elements: [[1, { id: 1, nodeI: 1, nodeJ: 'x' }], 7], loads: [] }],
      [{ action: 'add_bay', params: { width: 3 } }, { analysisMode: '3d', nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]], elements: [[1, { id: 1, nodeI: 1, nodeJ: 42 }]] }],
      [{ action: 'set_all_supports', params: { support_type: 'pinned' } }, { supports: [[1]] }],
    ];
    for (const [action, snap] of cases) {
      try {
        applyEdit(action, snap);
      } catch (e) {
        expect(e, `${action.action}`).toBeInstanceOf(AiActionError);
      }
    }
  });

  it('deletes an element and its loads', () => {
    const snap = makeFrame();
    const r = applyEdit({ action: 'delete_element', params: { element_id: 2 } }, snap);
    expect(arr(r, 'elements')).toHaveLength(2);
    expect(r.loads).toEqual([]);
  });

  it('adds a story to a multi-story frame', () => {
    const snap = makeMultiStory();
    const r = applyEdit({ action: 'add_story', params: { height: 3 } }, snap);
    expect(arr(r, 'nodes')).toHaveLength(arr(snap, 'nodes').length + 3);
    expect(arr(r, 'elements')).toHaveLength(arr(snap, 'elements').length + 5);
  });

  it('adds a story to a 3D multi-story frame', () => {
    const snap = makeMultiStory3d();
    const r = applyEdit({ action: 'add_story', params: { height: 3 } }, snap);
    expect(arr(r, 'nodes')).toHaveLength(arr(snap, 'nodes').length + 9);
    expect(arr(r, 'nodes').some((n) => Math.abs((n[1].z as number) - 9) < 1e-6)).toBe(true);
    expect(arr(r, 'elements').length).toBe(arr(snap, 'elements').length + 9 + 12);
  });

  it('adds a bay to a 3D multi-story frame', () => {
    const snap = makeMultiStory3d();
    const r = applyEdit({ action: 'add_bay', params: { width: 5 } }, snap);
    expect(arr(r, 'nodes')).toHaveLength(arr(snap, 'nodes').length + 9);
    expect(arr(r, 'nodes').some((n) => Math.abs((n[1].x as number) - 15) < 1e-6)).toBe(true);
    expect(arr(r, 'supports')).toHaveLength(arr(snap, 'supports').length + 3);
  });

  it('uses 3D payloads for beam loads on a 3D model', () => {
    const r = applyEdit({ action: 'set_all_beam_loads', params: { q: -12 } }, makeMultiStory3d());
    expect(loadsOf(r).every((l) => l.type === 'distributed3d')).toBe(true);
  });

  it('does not mutate its input', () => {
    const snap = makeFrame();
    const before = JSON.stringify(snap);
    applyEdit({ action: 'add_bay', params: { width: 5 } }, snap);
    expect(JSON.stringify(snap)).toBe(before);
  });
});

describe('edit snapshot lists', () => {
  it('load additions create missing lists in both dimensions', () => {
    for (const threeD of [false, true]) {
      const snapshot = frame(threeD);
      delete snapshot.loads;
      for (const action of loadActions(snapshot)) {
        const result = applyEdit(action, snapshot);
        const loads = loadsOf(result);
        expect(loads).toHaveLength(1);
        const expected = action.action === 'add_distributed_load'
          ? (threeD ? 'distributed3d' : 'distributed')
          : (threeD ? 'nodal3d' : 'nodal');
        expect(loads[0].type).toBe(expected);
        for (const key of ['nodes', 'elements', 'supports', 'materials', 'sections']) expect(result[key]).toEqual(snapshot[key]);
        expect(snapshot.loads).toBeUndefined();
      }
    }
  });

  it('load additions preserve existing loads in both dimensions', () => {
    for (const threeD of [false, true]) {
      const snapshot = frame(threeD);
      const original = loadsOf(snapshot);
      expect(original.length).toBeGreaterThan(0);
      for (const action of loadActions(snapshot)) {
        const loads = loadsOf(applyEdit(action, snapshot));
        expect(loads).toHaveLength(original.length + 1);
        expect(loads.slice(0, original.length)).toEqual(original);
        const newId = loads[loads.length - 1].data.id;
        expect(original.every((l) => l.data.id !== newId)).toBe(true);
      }
    }
  });

  it('malformed lists are refused without discarding data', () => {
    for (const key of ['nodes', 'elements', 'supports', 'sections', 'materials', 'loads']) {
      for (const invalid of [null, 5, 'list', false, { existing: [1, 2] }]) {
        const snapshot = frame(false);
        const action = loadActions(snapshot)[2];
        snapshot[key] = invalid;
        const original = JSON.stringify(snapshot);
        expect(() => applyEdit(action, snapshot)).toThrow(new RegExp(key));
        expect(JSON.stringify(snapshot)).toBe(original);
      }
    }
  });

  it('changing one section rejects a malformed section collection', () => {
    const snapshot = frame(false);
    snapshot.sections = Object.fromEntries(arr(snapshot, 'sections').map((s) => [String(s[0]), s[1]]));
    const action: BuildAction = { action: 'change_section', params: { section: 'IPE 300', element_ids: [arr(snapshot, 'elements')[0][0]] } };
    expect(() => applyEdit(action, snapshot)).toThrow(/sections/);
  });

  it('deleting from a missing load list is refused', () => {
    const snapshot = frame(false);
    delete snapshot.loads;
    expect(() => applyEdit({ action: 'delete_load', params: { load_id: 1 } }, snapshot)).toThrow(AiActionError);
  });

  it('non-object snapshots are refused', () => {
    for (const snapshot of [null, 5, 'snapshot', false, []]) {
      expect(() => applyEdit({ action: 'set_all_beam_loads', params: { q: -1 } }, snapshot)).toThrow(AiActionError);
    }
  });
});
