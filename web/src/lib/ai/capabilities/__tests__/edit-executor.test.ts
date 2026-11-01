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
    expect(heb[1]).toEqual({ id: 3, name: 'HEB 400', a: 198e-4, iz: 57680e-8, iy: 10820e-8, j: 3.68e-6, h: 0.4, b: 0.3, tw: 0.0135, tf: 0.024, shape: 'H' });
    expect(arr(r, 'elements').every((e) => e[1].sectionId === 3)).toBe(true);
  });

  it('refuses an unknown section, filter or element instead of guessing', () => {
    const snap = makeFrame();
    expect(() => applyEdit({ action: 'change_section', params: { section: 'W 14x90' } }, snap)).toThrow("Unknown section 'W 14x90'");
    expect(() => applyEdit({ action: 'change_section', params: { section: 'HEB 400', element_filter: 'brace' } }, snap)).toThrow("Unknown element_filter 'brace'");
    expect(() => applyEdit({ action: 'change_section', params: { section: 'HEB 400', element_ids: [1, 42] } }, snap)).toThrow('Element 42 not found');
    expect(arr(snap, 'sections').map((x) => x[1].name)).toEqual(['IPE 300', 'HEB 300']);
  });

  it('gives new loads ids after the largest one in use when the counters are missing', () => {
    const snap = makeFrame();
    delete snap.nextId;
    const before = loadsOf(snap).map((l) => l.data.id as number);
    const r = applyEdit({ action: 'add_nodal_load', params: { node_id: 2, fx: 5 } }, snap);
    const ids = loadsOf(r).map((l) => l.data.id as number);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe(Math.max(...before) + 1);
  });

  it('changes only columns with the column filter', () => {
    const r = applyEdit({ action: 'change_section', params: { section: 'HEB 400', element_filter: 'column' } }, makeFrame());
    expect(arr(r, 'elements').map((e) => e[1].sectionId)).toEqual([3, 1, 3]);
  });

  it('sets all supports to pinned', () => {
    const r = applyEdit({ action: 'set_all_supports', params: { support_type: 'pinned' } }, makeFrame());
    expect(arr(r, 'supports').every((s) => s[1].type === 'pinned')).toBe(true);
  });

  it('replaces the distributed loads of the beams only, keeping the loads on columns', () => {
    const snap = makeFrame();
    (snap.loads as unknown[]).push({ type: 'distributed', data: { id: 9, elementId: 1, qI: 3, qJ: 3 } });
    const r = applyEdit({ action: 'set_all_beam_loads', params: { q: -20 } }, snap);
    const dist = loadsOf(r).filter((l) => l.type === 'distributed').map((l) => [l.data.elementId, l.data.qI, l.data.qJ]);
    expect(dist).toEqual([[1, 3, 3], [2, -20, -20]]);
  });

  it('refuses beam loads on a model without beams', () => {
    const snap: Snap = { nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: 3 }]], elements: [[1, { id: 1, nodeI: 1, nodeJ: 2 }]], loads: [] };
    expect(() => applyEdit({ action: 'set_all_beam_loads', params: { q: -5 } }, snap)).toThrow('No beams in model');
  });

  it('a new 2D bay or story takes the section and material of the members next to it', () => {
    const sec = (r: Snap, id: number) => arr(r, 'sections').find((s) => s[0] === id)![1].name;
    const bay = applyEdit({ action: 'add_bay', params: { width: 5 } }, makeFrame());
    expect(arr(bay, 'elements').slice(3).map((e) => [sec(bay, e[1].sectionId as number), e[1].materialId])).toEqual([['HEB 300', 1], ['IPE 300', 1]]);
    const story = applyEdit({ action: 'add_story', params: { height: 3 } }, makeFrame());
    expect(arr(story, 'elements').slice(3).map((e) => sec(story, e[1].sectionId as number))).toEqual(['HEB 300', 'HEB 300', 'IPE 300']);
    const given = applyEdit({ action: 'add_bay', params: { width: 5, column_section: 'HEB 400' } }, makeFrame());
    expect(sec(given, arr(given, 'elements')[3][1].sectionId as number)).toBe('HEB 400');
  });

  it('new members copy the type, releases and orientation of the member they continue', () => {
    const snap = makeFrame();
    const col = arr(snap, 'elements')[0][1];
    Object.assign(col, { hingeStart: true, type: 'frame' });
    const beam = arr(snap, 'elements')[1][1];
    Object.assign(beam, { hingeEnd: true });
    const story = applyEdit({ action: 'add_story', params: { height: 3 } }, snap);
    const added = arr(story, 'elements').slice(3).map((e) => e[1]);
    const y = (id: unknown) => arr(story, 'nodes').find((n) => n[0] === id)![1].y as number;
    expect(added[0]).toMatchObject({ hingeStart: true, hingeEnd: false });
    expect(y(added[0].nodeI)).toBeLessThan(y(added[0].nodeJ));
    expect(added[2]).toMatchObject({ hingeEnd: true });
    const truss = makeFrame();
    for (const [, e] of arr(truss, 'elements')) e.type = 'truss';
    const bay = applyEdit({ action: 'add_bay', params: { width: 5 } }, truss);
    expect(arr(bay, 'elements').slice(3).map((e) => e[1].type)).toEqual(['truss', 'truss']);
  });

  it('a new 3D bay keeps the direction and releases of each member it repeats', () => {
    const snap = frame(true);
    const xyz = (r: Snap, id: unknown) => arr(r, 'nodes').find((n) => n[0] === id)![1] as { x: number; y: number; z: number };
    const beam = arr(snap, 'elements').find(([, e]) => xyz(snap, e.nodeI).z === 3 && xyz(snap, e.nodeJ).z === 3 && xyz(snap, e.nodeI).y === xyz(snap, e.nodeJ).y)![1];
    const [i, j] = [beam.nodeI, beam.nodeJ];
    if (xyz(snap, i).x < xyz(snap, j).x) Object.assign(beam, { nodeI: j, nodeJ: i });
    beam.hingeStart = true;
    const y = xyz(snap, beam.nodeI).y;
    const r = applyEdit({ action: 'add_bay', params: { width: 5 } }, snap);
    const copy = arr(r, 'elements').slice(arr(snap, 'elements').length).map((e) => e[1])
      .find((e) => xyz(r, e.nodeI).z === 3 && xyz(r, e.nodeJ).z === 3 && xyz(r, e.nodeI).y === y && xyz(r, e.nodeJ).y === y && e.hingeStart === true)!;
    expect(copy).toBeDefined();
    expect(xyz(r, copy.nodeI).x).toBeGreaterThan(xyz(r, copy.nodeJ).x);
  });

  it('a new bay keeps the base support of the frame it extends', () => {
    const r = applyEdit({ action: 'add_bay', params: { width: 5 } }, generatePortalFrame({ width: 6, height: 4, base_support: 'pinned' }));
    expect(arr(r, 'supports').map((s) => s[1].type)).toEqual(['pinned', 'pinned', 'pinned']);
    const r3 = applyEdit({ action: 'add_bay', params: { width: 5 } }, generateMultiStoryFrame3d({ n_bays_x: 1, n_bays_z: 1, n_floors: 1, bay_width: 5, floor_height: 3, base_support: 'pinned3d' }));
    expect(new Set(arr(r3, 'supports').map((s) => s[1].type))).toEqual(new Set(['pinned3d']));
  });

  it('a new bay copies a spring base with its stiffness', () => {
    const snap = makeFrame();
    for (const sup of arr(snap, 'supports')) Object.assign(sup[1], { type: 'spring', kx: 1000, ky: 2000, kz: 30 });
    const r = applyEdit({ action: 'add_bay', params: { width: 5 } }, snap);
    const added = arr(r, 'supports').at(-1)![1];
    expect(added).toMatchObject({ type: 'spring', kx: 1000, ky: 2000, kz: 30, nodeId: arr(r, 'nodes').at(-2)![0] });
    expect(added.id).toBe(3);
  });

  it('a new 3D story repeats the bracing of the story below', () => {
    const r = applyEdit({ action: 'add_story', params: { height: 3 } }, makeMultiStory3d());
    const z = (id: unknown) => arr(r, 'nodes').find((n) => n[0] === id)![1] as { x: number; y: number; z: number };
    const bracesBetween = (lo: number, hi: number) => arr(r, 'elements').filter(([, e]) => {
      const [a, b] = [z(e.nodeI), z(e.nodeJ)];
      return Math.min(a.z, b.z) === lo && Math.max(a.z, b.z) === hi && !(a.x === b.x && a.y === b.y);
    }).length;
    expect(bracesBetween(3, 6)).toBeGreaterThan(0);
    expect(bracesBetween(6, 9)).toBe(bracesBetween(3, 6));
  });

  it('refuses a support type that does not exist in the model dimension', () => {
    expect(() => applyEdit({ action: 'set_all_supports', params: { support_type: 'pinned3d' } }, makeFrame())).toThrow("Unknown 2D support type 'pinned3d'");
    expect(() => applyEdit({ action: 'set_all_supports', params: { support_type: 'pinned' } }, makeMultiStory3d())).toThrow("Unknown 3D support type 'pinned'");
  });

  it('the column filter changes vertical members only, not braces', () => {
    const snap = makeMultiStory3d();
    const r = applyEdit({ action: 'change_section', params: { section: 'HEB 400', element_filter: 'column' } }, snap);
    const heb = arr(r, 'sections').find((s) => s[1].name === 'HEB 400')![0];
    const xyz = (id: unknown) => arr(r, 'nodes').find((n) => n[0] === id)![1] as { x: number; y: number };
    for (const [, e] of arr(r, 'elements')) {
      const [a, b] = [xyz(e.nodeI), xyz(e.nodeJ)];
      expect(e.sectionId === heb, `element ${e.id}`).toBe(a.x === b.x && a.y === b.y);
    }
  });

  it('a nodal load keeps the plan-depth force in 3D and reads fy as fz in 2D', () => {
    const r3 = applyEdit({ action: 'add_nodal_load', params: { node_id: 1, fy: 4, mz: 2 } }, makeMultiStory3d());
    expect(loadsOf(r3).at(-1)!.data).toMatchObject({ fx: 0, fy: 4, fz: 0, mx: 0, my: 0, mz: 2 });
    const r2 = applyEdit({ action: 'add_nodal_load', params: { node_id: 1, fy: -5, mz: 2 } }, makeFrame());
    expect(loadsOf(r2).at(-1)!.data).toMatchObject({ fx: 0, fz: -5, my: 2 });
    expect(() => applyEdit({ action: 'add_nodal_load', params: { node_id: 1, fz: -5, fy: -5 } }, makeFrame())).toThrow('give fz or fy, not both');
    expect(() => applyEdit({ action: 'add_nodal_load', params: { node_id: 1, mx: 1 } }, makeFrame())).toThrow('mx does not exist in a 2D model');
  });

  it('asks for a section when a new 2D member has no neighbour to take it from', () => {
    const beam: Snap = {
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 6, y: 0 }]],
      elements: [[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
      sections: [[1, { id: 1, name: 'IPE 300', a: 53.8e-4, iz: 8356e-8 }]], materials: [[1, { id: 1, e: 200000 }]], loads: [],
    };
    expect(() => applyEdit({ action: 'add_story', params: { height: 3 } }, beam)).toThrow('give column_section');
    const r = applyEdit({ action: 'add_story', params: { height: 3, column_section: 'HEB 300' } }, beam);
    expect(arr(r, 'elements')).toHaveLength(4);
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
      [{ action: 'delete_load', params: { load_id: 1 } }, { ...oneElement, loads: {} }],
      [{ action: 'add_story', params: { height: 3 } }, { nodes: [[1, { id: 1, x: 0, y: 0 }]], elements: [[1, { id: 1, nodeI: 1, nodeJ: 99 }]], loads: [] }],
      [{ action: 'add_story', params: { height: 3 } }, { nodes: [[1, { id: 1, x: 0, y: 0 }]], elements: [[1, { id: 1, nodeI: 'one', nodeJ: 1 }]], loads: [] }],
      [{ action: 'add_story', params: { height: 3 } }, { analysisMode: '3d', nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }]], elements: [[1, { id: 1, nodeI: 1, nodeJ: 'x' }], 7], loads: [] }],
      [{ action: 'add_bay', params: { width: 3 } }, { analysisMode: '3d', nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]], elements: [[1, { id: 1, nodeI: 1, nodeJ: 42 }]] }],
      [{ action: 'set_all_supports', params: { support_type: 'pinned' } }, { supports: [[1]] }],
    ];
    for (const [action, snap] of cases) {
      expect(() => applyEdit(action, snap), `${action.action}`).toThrow(AiActionError);
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
    expect(arr(r, 'elements').length).toBe(arr(snap, 'elements').length + 9 + 12 + 16);
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
