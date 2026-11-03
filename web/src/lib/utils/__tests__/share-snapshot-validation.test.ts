import { afterEach, describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { decompressSnapshot } from '../url-sharing';
import { prepareSharedSnapshot } from '../share-snapshot';
import { modelStore } from '../../store/model.svelte';

type Payload = Record<string, any>;

function compact(): Payload {
  return {
    sv: 5, nm: 'shared', m: '2d',
    n: [[1, 0, 0], [2, 4, 0]], mt: [[1, 'steel', 210000, 0.3, 78.5]],
    sc: [[1, 'section', 0.01, 0.001]], e: [[1, 0, 1, 2, 1, 1]],
    s: [[1, 1, 'fixed']],
    l: [
      { type: 'nodal', data: { id: 1, caseId: 1, nodeId: 2, fx: 0, fz: -10, my: 0 } },
      { type: 'distributed', data: { id: 2, caseId: 1, elementId: 1, qI: -5, qJ: -5 } },
    ],
    ni: [3, 2, 2, 2, 2, 3],
  };
}

function legacy(): Payload {
  return {
    name: 'shared', analysisMode: '2d',
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3 }]],
    sections: [[1, { id: 1, name: 'section', a: 0.01, iz: 0.001 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
    loads: [{ type: 'distributed', data: { id: 1, caseId: 1, elementId: 1, qI: -5, qJ: -5 } }],
    nextId: { node: 3, material: 2, section: 2, element: 2, support: 2, load: 2 },
  };
}

const encodeText = (payload: string) => `2.${Buffer.from(deflateSync(new TextEncoder().encode(payload))).toString('base64url')}`;
const encode = (payload: Payload) => encodeText(JSON.stringify(payload));

afterEach(() => modelStore.clear());

describe('shared-link importer', () => {
  it('opens a valid model with its nodes, members, supports and loads', () => {
    const snapshot = decompressSnapshot(encode(compact()));
    expect(snapshot).not.toBeNull();
    modelStore.restore(snapshot!);
    expect([...modelStore.nodes.values()].map(n => [n.id, n.x, n.y])).toEqual([[1, 0, 0], [2, 4, 0]]);
    expect([...modelStore.elements.values()].map(e => [e.nodeI, e.nodeJ])).toEqual([[1, 2]]);
    expect([...modelStore.supports.values()].map(s => [s.nodeId, s.type])).toEqual([[1, 'fixed']]);
    expect(modelStore.loads.map(l => l.type)).toEqual(['nodal', 'distributed']);
  });

  it('rejects malformed, oversized, non-finite and dangling links', () => {
    const base = compact();
    const valid = encode(base);
    const rejected: Record<string, string> = {
      version: `9.${valid.slice(2)}`,
      base64: '2.%%%***',
      deflate: `2.${Buffer.from('not a deflate stream').toString('base64url')}`,
      json: encodeText('{"n":[[1,0,'),
      oversized: encode({ ...base, pad: ' '.repeat(60_000_000) }),
      nonfinite: encodeText(JSON.stringify(base).replace('[2,4,0]', '[2,1e999,0]')),
      nonfiniteLoad: encodeText(JSON.stringify(base).replace('"fz":-10', '"fz":-1e999')),
      nonnumeric: encode({ ...base, n: [[1, 'x', 0], base.n[1]] }),
      danglingMember: encode({ ...base, e: [...base.e, [2, 0, 1, 99, 1, 1]] }),
      danglingSupport: encode({ ...base, s: [...base.s, [2, 77, 'pinned']] }),
      danglingMaterial: encode({ ...base, e: [...base.e, [2, 0, 1, 2, 99, 1]] }),
      danglingSection: encode({ ...base, e: [...base.e, [2, 0, 1, 2, 1, 99]] }),
      danglingNodalLoad: encode({ ...base, l: [...base.l, { type: 'nodal', data: { id: 3, caseId: 1, nodeId: 55, fx: 0, fz: -1, my: 0 } }] }),
      danglingMemberLoad: encode({ ...base, l: [...base.l, { type: 'distributed', data: { id: 3, caseId: 1, elementId: 42, qI: -1, qJ: -1 } }] }),
      unknownLoadType: encode({ ...base, l: [...base.l, { type: 'Distributed', data: { id: 3, caseId: 1, elementId: 1, qI: -1, qJ: -1 } }] }),
      missingLoadComponent: encode({ ...base, l: [...base.l, { type: 'distributed', data: { id: 3, caseId: 1, elementId: 1, qI: -1 } }] }),
      zeroLengthMember: encode({ ...base, e: [...base.e, [2, 0, 2, 2, 1, 1]] }),
      danglingShellLoad: encode({ ...base, l: [...base.l, { type: 'surface3d', data: { id: 3, caseId: 1, quadId: 7, q: 1 } }] }),
      nullLoadComponent: encode({ ...base, l: [...base.l, { type: 'nodal', data: { id: 3, caseId: 1, nodeId: 2, fx: null, fz: -1, my: 0 } }] }),
    };
    for (const [name, data] of Object.entries(rejected)) expect(decompressSnapshot(data), name).toBeNull();
  });

  it('rejects the same faults in a full snapshot', () => {
    expect(prepareSharedSnapshot(legacy())).not.toBeNull();
    const faults: Record<string, (p: Payload) => void> = {
      nonfinite: p => { p.nodes[1][1].x = Infinity; },
      nanMaterial: p => { p.materials[0][1].e = NaN; },
      nonnumeric: p => { p.nodes[0][1].y = '0'; },
      nonnumericZ: p => { p.nodes[0][1].z = null; },
      danglingMember: p => { p.elements[0][1].nodeJ = 9; },
      danglingSupport: p => { p.supports[0][1].nodeId = 9; },
      danglingMaterial: p => { p.elements[0][1].materialId = 9; },
      danglingSection: p => { p.elements[0][1].sectionId = 9; },
      danglingVariableSection: p => { p.elements[0][1].variableSection = { sectionJ: 9 }; },
      nullMaterialE: p => { p.materials[0][1].e = null; },
      stringSectionA: p => { p.sections[0][1].a = '0.01'; },
      nullLoadComponent: p => { p.loads[0].data.qI = null; },
      stringLoadComponent: p => { p.loads[0].data.qJ = '-5'; },
      unknownLoadType: p => { p.loads[0].type = 'distributed '; },
      miscasedShellTarget: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.quads = [[1, { id: 1, nodes: [1, 2, 4, 3], materialId: 1, thickness: 0.1 }]]; p.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, on: 'Plate', q: 1 } }); },
      nullShellTarget: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.quads = [[1, { id: 1, nodes: [1, 2, 4, 3], materialId: 1, thickness: 0.1 }]]; p.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, on: null, q: 1 } }); },
      coincidentMemberEnds: p => { p.nodes.push([3, { id: 3, x: 0, y: 0, z: 0 }]); p.elements[0][1].nodeJ = 3; },
      emptyCornerPressures: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.quads = [[1, { id: 1, nodes: [1, 2, 4, 3], materialId: 1, thickness: 0.1 }]]; p.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, qNodes: [] } }); },
      shortCornerPressures: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.quads = [[1, { id: 1, nodes: [1, 2, 4, 3], materialId: 1, thickness: 0.1 }]]; p.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, qNodes: [1, 1, 1] } }); },
      longCornerPressures: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.quads = [[1, { id: 1, nodes: [1, 2, 4, 3], materialId: 1, thickness: 0.1 }]]; p.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, qNodes: [1, 1, 1, 1, 1] } }); },
      quadCornerPressuresOnPlate: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }]); p.plates = [[1, { id: 1, nodes: [1, 2, 3], materialId: 1, thickness: 0.1 }]]; p.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, on: 'plate', qNodes: [1, 1, 1, 1] } }); },
      danglingPlateLoad: p => { p.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, on: 'plate', q: 1 } }); },
      danglingPlateMaterial: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.plates = [[1, { id: 1, nodes: [1, 2, 3], materialId: 9, thickness: 0.1 }]]; },
      danglingPlateNode: p => { p.plates = [[1, { id: 1, nodes: [1, 2, 9], materialId: 1, thickness: 0.1 }]]; },
      shortQuad: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.quads = [[1, { id: 1, nodes: [1, 2, 3], materialId: 1, thickness: 0.1 }]]; },
      stringThickness: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]); p.quads = [[1, { id: 1, nodes: [1, 2, 4, 3], materialId: 1, thickness: '0.1' }]]; },
      stringSectionIz: p => { p.sections[0][1].iz = 'garbage'; },
      nullMaterialFy: p => { p.materials[0][1].fy = null; },
      danglingMemberLoad: p => { p.loads[0].data.elementId = 9; },
      missingLoadComponent: p => { delete p.loads[0].data.qJ; },
      zeroLengthMember: p => { p.elements[0][1].nodeJ = 1; },
      repeatedPlateCorner: p => { p.nodes.push([3, { id: 3, x: 0, y: 4 }]); p.plates = [[1, { id: 1, nodes: [1, 2, 1], materialId: 1, thickness: 0.1 }]]; },
      danglingConnector: p => { p.connectors = [[1, { id: 1, nodeI: 1, nodeJ: 9 }]]; },
      stringConnectorStiffness: p => { p.connectors = [[1, { id: 1, nodeI: 1, nodeJ: 2, kAxial: '1' }]]; },
      danglingRigidLink: p => { p.constraints = [{ type: 'rigidLink', masterNode: 1, slaveNode: 9 }]; },
      danglingDiaphragm: p => { p.constraints = [{ type: 'diaphragm', masterNode: 1, slaveNodes: [2, 9] }]; },
      danglingMpcTerm: p => { p.constraints = [{ type: 'linearMPC', terms: [{ nodeId: 9, dof: 0, coefficient: 1 }] }]; },
      danglingCombinationCase: p => { p.loadCases = [{ id: 1, name: 'Dead' }]; p.combinations = [{ id: 1, name: 'ULS', factors: [{ caseId: 7, factor: 1.4 }] }]; },
      danglingLoadCase: p => { p.loadCases = [{ id: 1, name: 'Dead' }]; p.loads[0].data.caseId = 4; },
      rigidLinkWithoutSlave: p => { p.constraints = [{ type: 'rigidLink', masterNode: 1 }]; },
      selfLink: p => { p.constraints = [{ type: 'equalDOF', masterNode: 1, slaveNode: 1, dofs: [0] }]; },
      emptyDiaphragm: p => { p.constraints = [{ type: 'diaphragm', masterNode: 1 }]; },
      emptyMpc: p => { p.constraints = [{ type: 'linearMPC' }]; },
      mpcDofOutOfRange: p => { p.constraints = [{ type: 'linearMPC', terms: [{ nodeId: 1, dof: 6, coefficient: 1 }] }]; },
      unknownConstraint: p => { p.constraints = [{ type: 'weld', masterNode: 1, slaveNode: 2 }]; },
      nullMpcTerm: p => { p.constraints = [{ type: 'linearMPC', terms: [null] }]; },
      danglingFooting: p => { p.footings = [[1, { id: 1, nodeId: 9 }]]; },
      stringFootingNode: p => { p.footings = [[1, { id: 1, nodeId: '1' }]]; },
      nullFootingNode: p => { p.footings = [[1, { id: 1, nodeId: null }]]; },
      emptyDisplacement: p => { p.loads.push({ type: 'displacement3d', data: { id: 2, nodeId: 1 } }); },
      loadCaseBeyondDefaults: p => { p.loads[0].data.caseId = 99; },
      combinationBeyondDefaults: p => { p.combinations = [{ id: 1, name: 'ULS', factors: [{ caseId: 99, factor: 1.4 }] }]; },
      loadCaseWithNoCases: p => { p.loadCases = []; p.loads[0].data.caseId = 1; },
      combinationWithoutCase: p => { p.loadCases = [{ id: 1, name: 'Dead' }]; p.combinations = [{ id: 1, name: 'ULS', factors: [{ factor: 1.4 }] }]; },
      stringCombinationFactor: p => { p.combinations = [{ id: 1, name: 'ULS', factors: [{ caseId: 1, factor: '1.4' }] }]; },
      implicitCaseWithNoCases: p => { p.loadCases = []; delete p.loads[0].data.caseId; },
      implicitCaseNotListed: p => { p.loadCases = [{ id: 2, name: 'Live' }]; delete p.loads[0].data.caseId; },
      combinationWithoutFactors: p => { p.combinations = [{ id: 1, name: 'ULS' }]; },
      nullCombinationFactor: p => { p.combinations = [{ id: 1, name: 'ULS', factors: [null] }]; },
      loadWithoutData: p => { delete p.loads[0].data; },
      nullLoadData: p => { p.loads[0].data = null; },
    };
    for (const [name, fault] of Object.entries(faults)) {
      const payload = legacy();
      fault(payload);
      expect(prepareSharedSnapshot(payload), name).toBeNull();
    }
  });

  it('reads a load without a case as case 1, with the restored cases or the listed ones', () => {
    const restored = legacy();
    delete restored.loads[0].data.caseId;
    expect(prepareSharedSnapshot(restored)).not.toBeNull();
    const listed = legacy();
    listed.loadCases = [{ id: 1, name: 'Dead' }];
    delete listed.loads[0].data.caseId;
    expect(prepareSharedSnapshot(listed)?.loads).toHaveLength(1);
  });

  it('accepts connectors, constraints and combinations that resolve', () => {
    const payload = legacy();
    payload.nodes.push([3, { id: 3, x: 0, y: 4 }]);
    payload.connectors = [[1, { id: 1, nodeI: 1, nodeJ: 3, kAxial: 1000 }]];
    payload.constraints = [
      { type: 'rigidLink', masterNode: 1, slaveNode: 3 },
      { type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3] },
      { type: 'linearMPC', terms: [{ nodeId: 2, dof: 0, coefficient: 1 }, { nodeId: 3, dof: 0, coefficient: -1 }] },
    ];
    payload.loadCases = [{ id: 1, name: 'Dead' }];
    payload.combinations = [{ id: 1, name: 'ULS', factors: [{ caseId: 1, factor: 1.4 }] }];
    payload.elements[0][1].variableSection = { sectionJ: 1 };
    const snapshot = prepareSharedSnapshot(payload);
    expect(snapshot?.constraints?.map(c => (c as { type: string }).type)).toEqual(['rigidLink', 'diaphragm', 'linearMPC']);
    expect(snapshot?.connectors).toEqual([[1, { id: 1, nodeI: 1, nodeJ: 3, kAxial: 1000 }]]);
    expect(snapshot?.combinations?.[0].factors).toEqual([{ caseId: 1, factor: 1.4 }]);
  });

  it('resolves case ids against the cases restore creates when the link has none', () => {
    const payload = legacy();
    modelStore.restore(prepareSharedSnapshot(payload)!);
    const restored = modelStore.loadCases.map(c => c.id);
    for (const caseId of [...restored, Math.max(...restored) + 1]) {
      const p = legacy();
      p.loads[0].data.caseId = caseId;
      expect(prepareSharedSnapshot(p) !== null, `case ${caseId}`).toBe(restored.includes(caseId));
    }
  });

  it('accepts an imposed displacement with one component', () => {
    const payload = legacy();
    payload.loads.push({ type: 'displacement3d', data: { id: 2, nodeId: 2, dz: -0.01 } });
    expect(prepareSharedSnapshot(payload)?.loads.map(l => l.type)).toEqual(['distributed', 'displacement3d']);
  });

  it('accepts loads on shells that exist', () => {
    const payload = legacy();
    payload.nodes.push([3, { id: 3, x: 0, y: 4 }]);
    payload.plates = [[1, { id: 1, nodes: [1, 2, 3], materialId: 1, thickness: 0.1 }]];
    payload.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, on: 'plate', q: 1 } });
    expect(prepareSharedSnapshot(payload)?.loads.map(l => l.type)).toEqual(['distributed', 'surface3d']);
  });

  it('accepts a load on a quad that exists when the target is omitted', () => {
    const payload = legacy();
    payload.nodes.push([3, { id: 3, x: 0, y: 4 }], [4, { id: 4, x: 4, y: 4 }]);
    payload.quads = [[1, { id: 1, nodes: [1, 2, 4, 3], materialId: 1, thickness: 0.1 }]]; 
    payload.loads.push({ type: 'surface3d', data: { id: 2, caseId: 1, quadId: 1, q: 1 } });
    payload.loads.push({ type: 'surface3d', data: { id: 3, caseId: 1, quadId: 1, q: 0, qNodes: [1, 2, 3, 4] } });
    expect(prepareSharedSnapshot(payload)?.loads.map(l => l.type)).toEqual(['distributed', 'surface3d', 'surface3d']);
  });

  it('keeps a hostile model name as a plain string in the store', () => {
    const name = '<img src=x onerror="alert(1)">';
    const snapshot = decompressSnapshot(encode({ ...compact(), nm: name }));
    expect(snapshot!.name).toBe(name);
    modelStore.restore(snapshot!);
    expect(modelStore.model.name).toBe(name);
  });
});
