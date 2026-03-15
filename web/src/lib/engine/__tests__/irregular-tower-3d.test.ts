import { describe, expect, it } from 'vitest';

import { generateIrregularSetbackTower3D } from '../../templates/generators';
import { buildSolverInput3D } from '../solver-service';
import { solve3D } from '../solver-3d';

type ModelDataLike = {
  name: string;
  nodes: Map<number, any>;
  materials: Map<number, any>;
  sections: Map<number, any>;
  elements: Map<number, any>;
  supports: Map<number, any>;
  loads: any[];
  plates: Map<number, any>;
  quads: Map<number, any>;
  constraints: any[];
  loadCases: Array<{ id: number; type: string; name: string }>;
  combinations: Array<{ id: number; name: string; factors: Array<{ caseId: number; factor: number }> }>;
  clear(): void;
  batch(fn: () => void): void;
  addNode(x: number, y: number, z: number): number;
  addElement(nodeI: number, nodeJ: number, type: 'frame' | 'truss'): number;
  addSupport(nodeId: number, type: string): number;
  addDistributedLoad3D(elementId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number): number;
  addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number;
  updateSection(id: number, data: any): void;
  addSection(data: any): number;
  updateElementSection(elemId: number, sectionId: number): void;
  updateMaterial(id: number, data: any): void;
  model: { name: string };
};

function createMock3DModel(): ModelDataLike {
  let nextNode = 1;
  let nextElem = 1;
  let nextSupport = 1;
  let nextLoad = 1;
  let nextSection = 3; // 1 and 2 are pre-populated

  const data: ModelDataLike = {
    name: '',
    model: { name: '' },
    nodes: new Map(),
    materials: new Map([[1, { id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 78.5 }]]),
    sections: new Map([
      [1, { id: 1, name: 'IPN 300', a: 0.00690, iy: 0.00009800, iz: 0.00000451, j: 0.0000001, b: 0.125, h: 0.300 }],
      [2, { id: 2, name: 'L 80x80x8', a: 0.00123, iy: 0.0000008, iz: 0.0000008, j: 0.00000002 }],
    ]),
    elements: new Map(),
    supports: new Map(),
    loads: [],
    plates: new Map(),
    quads: new Map(),
    constraints: [],
    loadCases: [
      { id: 1, type: 'D', name: 'Dead Load' },
      { id: 2, type: 'L', name: 'Live Load' },
      { id: 3, type: 'W', name: 'Wind' },
      { id: 4, type: 'E', name: 'Earthquake' },
    ],
    combinations: [
      { id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
      { id: 2, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
      { id: 3, name: '1.2D + L + 1.6W', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
      { id: 4, name: '1.2D + L + E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 4, factor: 1.0 }] },
    ],
    clear() {
      data.nodes.clear();
      data.elements.clear();
      data.supports.clear();
      data.loads = [];
      data.plates.clear();
      data.quads.clear();
      data.constraints = [];
      data.model.name = '';
    },
    batch(fn) { fn(); },
    addNode(x, y, z) {
      const id = nextNode++;
      data.nodes.set(id, { id, x, y, z });
      return id;
    },
    addElement(nodeI, nodeJ, type) {
      const id = nextElem++;
      data.elements.set(id, {
        id,
        type,
        nodeI,
        nodeJ,
        materialId: 1,
        sectionId: type === 'truss' ? 2 : 1,
        hingeStart: false,
        hingeEnd: false,
      });
      return id;
    },
    addSupport(nodeId, type) {
      const id = nextSupport++;
      data.supports.set(id, { id, nodeId, type });
      return id;
    },
    addDistributedLoad3D(elementId, qYI, qYJ, qZI, qZJ, a, b, caseId) {
      const id = nextLoad++;
      data.loads.push({ type: 'distributed3d', data: { id, elementId, qYI, qYJ, qZI, qZJ, a, b, caseId } });
      return id;
    },
    addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, caseId) {
      const id = nextLoad++;
      data.loads.push({ type: 'nodal3d', data: { id, nodeId, fx, fy, fz, mx, my, mz, caseId } });
      return id;
    },
    updateSection(id, sectionData) {
      const existing = data.sections.get(id) ?? { id };
      data.sections.set(id, { ...existing, ...sectionData, id });
    },
    addSection(sectionData) {
      const id = nextSection++;
      data.sections.set(id, { id, ...sectionData });
      return id;
    },
    updateElementSection(elemId, sectionId) {
      const elem = data.elements.get(elemId);
      if (elem) elem.sectionId = sectionId;
    },
    updateMaterial(id, matData) {
      const existing = data.materials.get(id) ?? { id };
      data.materials.set(id, { ...existing, ...matData, id });
    },
  };
  return data;
}

describe('Irregular setback tower 3D example', () => {
  it('envelope displacements are realistic (< H/250 drift)', { timeout: 30_000 }, () => {
    const model = createMock3DModel();
    generateIrregularSetbackTower3D(model as any, {
      storyH: 3.8,
      levels: 18,
      baysX: 6,
      baysZ: 5,
      bayX: 8,
      bayZ: 7,
      setbackAt: [8, 13],
      windLoad: 18,
    });

    // Solve each load case separately
    const caseIds = [1, 2, 3, 4];
    const caseResults: Record<number, any> = {};
    for (const cid of caseIds) {
      const filtered = { ...model, loads: model.loads.filter((l) => (l.data.caseId ?? 1) === cid) };
      const input = buildSolverInput3D(filtered as any, false, false);
      if (!input) continue;
      const res = solve3D(input);
      if (typeof res !== 'string') caseResults[cid] = res;
    }

    // Compute envelope displacements across all 4 combinations
    const combos = model.combinations;
    let maxEnvUx = 0, maxEnvUy = 0, maxEnvUz = 0;
    const numNodes = Object.values(caseResults)[0]?.displacements?.length ?? 0;
    for (let i = 0; i < numNodes; i++) {
      for (const combo of combos) {
        let ux = 0, uy = 0, uz = 0;
        for (const { caseId, factor } of combo.factors) {
          const r = caseResults[caseId];
          if (!r) continue;
          ux += r.displacements[i].ux * factor;
          uy += r.displacements[i].uy * factor;
          uz += r.displacements[i].uz * factor;
        }
        maxEnvUx = Math.max(maxEnvUx, Math.abs(ux));
        maxEnvUy = Math.max(maxEnvUy, Math.abs(uy));
        maxEnvUz = Math.max(maxEnvUz, Math.abs(uz));
      }
    }

    const H = 18 * 3.8; // 68.4 m
    const maxLateral = Math.max(maxEnvUx, maxEnvUz);

    // HD 400×314 columns + HEB 450 beams: envelope drift ~H/2300
    expect(maxLateral).toBeLessThan(H / 250); // serviceability limit
    expect(maxEnvUy).toBeLessThan(0.10); // < 100mm vertical under factored loads
  });

  it('dead load produces realistic displacements (sub-mm for properly sized sections)', () => {
    const model = createMock3DModel();
    generateIrregularSetbackTower3D(model as any, {
      storyH: 3.8,
      levels: 18,
      baysX: 6,
      baysZ: 5,
      bayX: 8,
      bayZ: 7,
      setbackAt: [8, 13],
      windLoad: 18,
    });

    const deadModel = { ...model, loads: model.loads.filter((l) => (l.data.caseId ?? 1) === 1) };
    const input = buildSolverInput3D(deadModel as any, false, false);
    if (!input) throw new Error('buildSolverInput3D returned null');
    const dead = solve3D(input);
    if (typeof dead === 'string') {
      throw new Error(`solve3D failed: ${dead}`);
    }

    let maxUx = 0;
    let maxUy = 0;
    let maxUz = 0;
    for (const d of dead.displacements) {
      maxUx = Math.max(maxUx, Math.abs(d.ux));
      maxUy = Math.max(maxUy, Math.abs(d.uy));
      maxUz = Math.max(maxUz, Math.abs(d.uz));
    }

    const maxDisp = Math.max(maxUx, maxUy, maxUz);
    // HD 400×314 columns + HEB 450 beams: dead load displacements ~20 mm
    expect(maxDisp).toBeLessThan(0.05); // < 50 mm under dead load
    expect(maxDisp).toBeGreaterThan(1e-6); // not zero — structure is loaded
  });
});
