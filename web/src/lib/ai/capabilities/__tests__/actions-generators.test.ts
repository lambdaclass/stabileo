import { describe, expect, it } from 'vitest';
import { MAX_SPANS, isEdit, parseAction, parseActionResponse, validateAction, type BuildAction } from '../actions';
import {
  executeAction, generateBeam, generateCantilever, generateContinuousBeam, generateMultiStoryFrame3d,
  generatePortalFrame, generatePortalFrame3d, generateTruss,
} from '../generators';
import { AiActionError } from '../limits';

type Tuple = [number, Record<string, unknown>];
const arr = (snap: Record<string, unknown>, key: string): Tuple[] => snap[key] as Tuple[];

function validateJson(json: string): void {
  const resp = parseActionResponse(JSON.parse(json));
  if (!resp) throw new Error('did not parse');
  validateAction(resp.action);
}

function assertZUp(snap: Record<string, unknown>): void {
  expect(snap.analysisMode).toBe('3d');
  const nodes = arr(snap, 'nodes');
  expect(nodes.every((n) => typeof n[1].z === 'number')).toBe(true);
  const minZ = Math.min(...nodes.map((n) => n[1].z as number));
  for (const s of arr(snap, 'supports')) {
    const node = nodes.find((n) => n[0] === s[1].nodeId)!;
    expect(Math.abs((node[1].z as number) - minZ)).toBeLessThan(1e-6);
  }
}

function assertVerticalColumnsVaryInZOnly(snap: Record<string, unknown>): void {
  const nodes = arr(snap, 'nodes');
  for (const e of arr(snap, 'elements')) {
    const ni = nodes.find((n) => n[0] === e[1].nodeI)![1];
    const nj = nodes.find((n) => n[0] === e[1].nodeJ)![1];
    if (Math.abs((ni.x as number) - (nj.x as number)) < 1e-6 && Math.abs((ni.y as number) - (nj.y as number)) < 1e-6) {
      expect(Math.abs((ni.z as number) - (nj.z as number))).toBeGreaterThan(1e-6);
    }
  }
}

describe('actions', () => {
  it('rejects oversized generators', () => {
    expect(() => validateJson('{"action":"create_multi_story_frame_3d","params":{"n_bays_x":10,"n_bays_z":10,"n_floors":20,"bay_width":6,"floor_height":3},"interpretation":""}')).not.toThrow();
    expect(() => validateJson('{"action":"create_multi_story_frame_3d","params":{"n_bays_x":100,"n_bays_z":100,"n_floors":200,"bay_width":6,"floor_height":3},"interpretation":""}')).toThrow(AiActionError);
    expect(() => validateJson('{"action":"create_multi_story_frame","params":{"n_bays":4000000000,"n_floors":3,"bay_width":6,"floor_height":3},"interpretation":""}')).toThrow('n_bays must be <= 100, got 4000000000');
    expect(() => validateJson('{"action":"create_truss","params":{"span":10,"height":2,"n_panels":4000000000},"interpretation":""}')).toThrow(AiActionError);
    const spans = Array(MAX_SPANS + 1).fill('1').join(',');
    expect(() => validateJson(`{"action":"create_continuous_beam","params":{"spans":[${spans}]},"interpretation":""}`)).toThrow(`at most ${MAX_SPANS} spans`);
  });

  it('rejects non-finite loads', () => {
    expect(() => validateAction({ action: 'set_all_beam_loads', params: { q: NaN } })).toThrow('q must be a finite number');
    expect(() => validateAction({ action: 'add_nodal_load', params: { node_id: 1, fx: Infinity } })).toThrow('fx must be a finite number');
    expect(() => validateAction({ action: 'add_nodal_load', params: { node_id: 1, fx: 1, fz: -2 } })).not.toThrow();
  });

  it('parses actions and classifies edits', () => {
    const beam = parseActionResponse({ action: 'create_beam', params: { span: 6, q: -10 }, interpretation: 'test' });
    expect(beam?.action).toEqual({ action: 'create_beam', params: { span: 6, q: -10 } });
    expect(parseActionResponse({ action: 'create_portal_frame', params: { width: 8, height: 5, q_beam: -15 }, interpretation: 't' })?.action.action).toBe('create_portal_frame');
    expect(parseActionResponse({ action: 'unsupported', params: {}, interpretation: 'I can build beams...' })?.action.action).toBe('unsupported');
    const bay = parseActionResponse({ action: 'add_bay', params: { width: 6 }, interpretation: 'Adding bay' })!;
    expect(bay.action).toEqual({ action: 'add_bay', params: { width: 6 } });
    expect(isEdit(bay.action)).toBe(true);
    expect(isEdit(parseActionResponse({ action: 'add_story', params: { height: 3.5 }, interpretation: 'x' })!.action)).toBe(true);
    expect(parseActionResponse({ action: 'change_section', params: { section: 'HEB 400', element_filter: 'column' }, interpretation: 'x' })?.action.action).toBe('change_section');
    expect(isEdit({ action: 'create_beam', params: { span: 6 } })).toBe(false);
  });

  it('follows serde field rules: wrong types, missing required, null optional, aliases', () => {
    expect(parseAction('create_beam', { span: '6' })).toBeNull();
    expect(parseAction('create_beam', {})).toBeNull();
    expect(parseAction('create_beam', { span: null })).toBeNull();
    expect(parseAction('create_beam', { span: 6, q: null })).toEqual({ action: 'create_beam', params: { span: 6 } });
    expect(parseAction('create_truss', { span: 6, height: 1, n_panels: 2.5 })).toBeNull();
    expect(parseAction('create_truss', { span: 6, height: 1, n_panels: -1 })).toBeNull();
    expect(parseAction('create_truss', { span: 6, height: 1, n_panels: 4294967296 })).toBeNull();
    expect(parseAction('no_such_action', {})).toBeNull();
    expect(parseAction('create_beam', [6])).toBeNull();
    expect(parseAction('add_nodal_load', { node_id: 1, fy: -5, mz: 2 })).toEqual({ action: 'add_nodal_load', params: { node_id: 1, fy: -5, mz: 2 } });
    expect(parseAction('create_model', { analysisMode: '2d', nodes: [], elements: [], materials: [], sections: [], supports: [] })?.params).toMatchObject({ analysis_mode: '2d' });
    expect(parseActionResponse({ action: 'create_beam', params: { span: 6 } })).toBeNull();
  });

  it('validates spans, panels and empty arrays', () => {
    expect(() => validateAction({ action: 'create_beam', params: { span: -5 } })).toThrow('span must be a positive number, got -5');
    expect(() => validateAction({ action: 'create_continuous_beam', params: { spans: [] } })).toThrow('spans must not be empty');
    expect(() => validateAction({ action: 'create_truss', params: { span: 12, height: 2, n_panels: 1 } })).toThrow('n_panels must be >= 2');
    expect(() => validateAction({ action: 'create_model', params: { analysis_mode: '2d', nodes: [{}], elements: [], materials: [{}], sections: [{}], supports: [{}] } })).toThrow('create_model: at least 1 element required');
  });
});

describe('generators', () => {
  it('beam snapshot has required fields', () => {
    const snap = generateBeam({ span: 6, q: -10 });
    for (const k of ['nodes', 'elements', 'supports', 'loads', 'materials', 'sections', 'nextId']) expect(snap).toHaveProperty(k);
    expect(arr(snap, 'nodes')).toHaveLength(2);
    expect(arr(snap, 'elements')).toHaveLength(1);
    expect(arr(snap, 'supports')).toHaveLength(2);
    expect(snap.loads).toHaveLength(1);
  });

  it('beam snapshot matches the Rust shape exactly', () => {
    expect(generateBeam({ span: 6, q: -10, p_tip: -5 })).toEqual({
      analysisMode: '2d',
      nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 6, y: 0 }]],
      materials: [[1, { id: 1, name: 'Steel A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]],
      sections: [[1, { id: 1, name: 'IPE 300', a: 53.8e-4, iz: 8356e-8, iy: 604e-8, j: 2.0e-7, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107, shape: 'I' }]],
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]],
      supports: [[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]],
      loads: [
        { type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } },
        { type: 'nodal', data: { id: 2, nodeId: 2, fx: 0, fz: -5, my: 0 } },
      ],
      nextId: { node: 3, material: 2, section: 2, element: 2, support: 3, load: 3 },
    });
  });

  it('a zero load adds nothing', () => {
    expect(generateBeam({ span: 6, q: 0 }).loads).toEqual([]);
  });

  it('cantilever has one fixed support', () => {
    const snap = generateCantilever({ length: 3, p_tip: -15 });
    expect(arr(snap, 'supports')).toHaveLength(1);
    expect(arr(snap, 'supports')[0][1].type).toBe('fixed');
  });

  it('continuous beam supports', () => {
    const snap = generateContinuousBeam({ spans: [4, 6, 4], q: -10 });
    expect(arr(snap, 'supports')).toHaveLength(4);
    expect(arr(snap, 'elements')).toHaveLength(3);
    expect(arr(snap, 'nodes').map((n) => n[1].x)).toEqual([0, 4, 10, 14]);
  });

  it('portal frame geometry and column section', () => {
    const snap = generatePortalFrame({ width: 8, height: 5, q_beam: -15, h_lateral: 10 });
    expect(arr(snap, 'nodes')).toHaveLength(4);
    expect(arr(snap, 'elements')).toHaveLength(3);
    expect(arr(snap, 'supports')).toHaveLength(2);
    expect(arr(snap, 'sections').map((s) => s[1].name)).toEqual(['IPE 300', 'HEB 300']);
    expect(arr(snap, 'elements').map((e) => e[1].sectionId)).toEqual([2, 1, 2]);
    expect((snap.nextId as Record<string, number>).section).toBe(3);
  });

  it('pratt, warren and howe trusses', () => {
    const pratt = generateTruss({ span: 12, height: 2, n_panels: 4, top_load: -10 });
    expect(arr(pratt, 'nodes')).toHaveLength(10);
    expect(arr(pratt, 'elements')).toHaveLength(4 + 4 + 5 + 4);
    const warren = generateTruss({ span: 12, height: 2, n_panels: 4, pattern: 'warren', top_load: -10 });
    expect(arr(warren, 'nodes')).toHaveLength(9);
    const pDiag = arr(pratt, 'elements').slice(13).map((e) => [e[1].nodeI, e[1].nodeJ]);
    const howe = generateTruss({ span: 12, height: 2, n_panels: 4, pattern: 'howe' });
    const hDiag = arr(howe, 'elements').slice(13).map((e) => [e[1].nodeI, e[1].nodeJ]);
    expect(pDiag).toEqual([[6, 2], [7, 3], [3, 9], [4, 10]]);
    expect(hDiag).toEqual([[1, 7], [2, 8], [8, 4], [9, 5]]);
    expect((howe.loads as unknown[]).length).toBe(5);
  });

  it('takes the truss pattern in any case and refuses one it does not build', () => {
    const howe = generateTruss({ span: 12, height: 2, n_panels: 4, pattern: 'howe' });
    expect(generateTruss({ span: 12, height: 2, n_panels: 4, pattern: ' Howe ' })).toEqual(howe);
    expect(() => generateTruss({ span: 12, height: 2, n_panels: 4, pattern: 'fink' })).toThrow('pattern must be one of pratt, warren, howe');
  });

  it('3D portal frame is Z-up', () => {
    const snap = generatePortalFrame3d({ width: 6, depth: 4, height: 4, q_beam: -10 });
    expect(snap.analysisMode).toBe('3d');
    expect(arr(snap, 'nodes')).toHaveLength(8);
    expect(arr(snap, 'elements')).toHaveLength(8);
    expect(arr(snap, 'supports')).toHaveLength(4);
    assertZUp(snap);
    assertVerticalColumnsVaryInZOnly(snap);
  });

  it('3D multi-story frame uses z for floors', () => {
    const snap = generateMultiStoryFrame3d({ n_bays_x: 2, n_bays_z: 2, n_floors: 3, bay_width: 6, floor_height: 3 });
    assertZUp(snap);
    assertVerticalColumnsVaryInZOnly(snap);
    const zs = [...new Set(arr(snap, 'nodes').map((n) => n[1].z as number))].sort((a, b) => a - b);
    expect(zs).toEqual([0, 3, 6, 9]);
    expect(arr(snap, 'elements')).toHaveLength(27 + 18 + 18 + 48);
  });

  it('3D portal frame loads all four beams; a truss with top_load 0 has no loads', () => {
    const portal = generatePortalFrame3d({ width: 6, depth: 4, height: 3, q_beam: -10 });
    expect((portal.loads as Array<{ type: string }>).filter((l) => l.type === 'distributed3d')).toHaveLength(4);
    expect(generateTruss({ span: 12, height: 2, top_load: 0 }).loads).toEqual([]);
    expect((generateTruss({ span: 12, height: 2 }).loads as unknown[]).length).toBeGreaterThan(0);
  });

  it('refuses a support type that does not exist in the dimension', () => {
    expect(() => generateBeam({ span: 6, support_left: 'pinned3d' })).toThrow("Unknown 2D support type 'pinned3d'");
    expect(() => generatePortalFrame3d({ width: 6, depth: 4, height: 3, base_support: 'pinned' })).toThrow("Unknown 3D support type 'pinned'");
  });

  it('3D multi-story frame shares the floor lateral load among the nodes of the x=0 face', () => {
    const snap = generateMultiStoryFrame3d({ n_bays_x: 2, n_bays_z: 2, n_floors: 3, bay_width: 6, floor_height: 3, h_lateral: 12 });
    const nodal = (snap.loads as Array<{ type: string; data: Record<string, number> }>).filter((l) => l.type === 'nodal3d');
    const z = (id: number) => (arr(snap, 'nodes').find((n) => n[0] === id)![1].z as number);
    for (const level of [3, 6, 9]) {
      const atLevel = nodal.filter((l) => z(l.data.nodeId) === level);
      expect(atLevel).toHaveLength(3);
      expect(atLevel.reduce((s, l) => s + l.data.fx, 0)).toBeCloseTo(12, 12);
    }
  });

  it('uses a custom section', () => {
    expect(arr(generateBeam({ span: 6, section: 'IPE 400' }), 'sections')[0][1].name).toBe('IPE 400');
  });

  it('refuses a section it has no properties for', () => {
    expect(() => generateBeam({ span: 6, section: 'W 14x90' })).toThrow("Unknown section 'W 14x90'");
  });

  it('unsupported and edit actions are errors', () => {
    expect(() => executeAction({ action: 'unsupported', params: {} } as BuildAction)).toThrow(AiActionError);
    expect(() => executeAction({ action: 'add_bay', params: { width: 5 } })).toThrow('Edit actions require an existing model snapshot');
  });
});
