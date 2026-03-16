
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { loadFixture } from '../../templates/load-fixture';
import { buildSolverInput3D } from '../solver-service';
import { serializeInput3D } from '../wasm-solver';

function createStoreMock() {
  let nextNode = 1, nextElem = 1, nextSupport = 1, nextLoad = 1, nextSection = 2, nextMat = 2;
  const model = {
    name: '',
    nodes: new Map(),
    materials: new Map([[1, { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5 }]]),
    sections: new Map([[1, { id: 1, name: 'IPN 300', a: 0.00690, iy: 0.00009800, iz: 0.00000451, j: 0.0000001, b: 0.125, h: 0.300 }]]),
    elements: new Map(),
    supports: new Map(),
    loads: [],
    plates: new Map(),
    quads: new Map(),
    constraints: [],
    loadCases: [],
    combinations: [],
  };
  const api = {
    addNode(x, y, z) { const id = nextNode++; model.nodes.set(id, { id, x, y, z: z || 0 }); return id; },
    addElement(nI, nJ, type = 'frame') {
      const id = nextElem++;
      model.elements.set(id, { id, type, nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
      return id;
    },
    addSupport(nodeId, type) { const id = nextSupport++; model.supports.set(id, { id, nodeId, type }); return id; },
    addMaterial(data) { const id = nextMat++; model.materials.set(id, { id, ...data }); return id; },
    addSection(data) { const id = nextSection++; model.sections.set(id, { id, ...data }); return id; },
    updateElementMaterial(elemId, matId) { const e = model.elements.get(elemId); if (e) e.materialId = matId; },
    updateElementSection(elemId, secId) { const e = model.elements.get(elemId); if (e) e.sectionId = secId; },
    addDistributedLoad3D(elemId, qYI, qYJ, qZI, qZJ, a, b, caseId) {
      const id = nextLoad++;
      model.loads.push({ type: 'distributed3d', data: { id, elementId: elemId, qYI, qYJ, qZI, qZJ, a, b, caseId } });
      return id;
    },
    addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, caseId) {
      const id = nextLoad++;
      model.loads.push({ type: 'nodal3d', data: { id, nodeId, fx, fy, fz, mx, my, mz, caseId } });
      return id;
    },
    model,
    nextId: { loadCase: 5, combination: 1 },
  };
  return { model, api };
}

describe('dump solver JSON', () => {
  it('generates JSON for Rust test', () => {
    const json = JSON.parse(readFileSync('src/lib/templates/fixtures/torre-irregular-con-retiros.json', 'utf8'));
    const { model, api } = createStoreMock();
    loadFixture(json, api);

    const deadModel = { ...model, loads: model.loads.filter(l => (l.data.caseId || 1) === 1) };
    const input = buildSolverInput3D(deadModel, false, false);
    const serialized = serializeInput3D(input);
    writeFileSync('/tmp/tower-wasm-input.json', serialized);
    console.log('Wrote /tmp/tower-wasm-input.json (' + serialized.length + ' bytes)');
  });
});
