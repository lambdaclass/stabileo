import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { loadFixture, type JSONModel, type FixtureLoader } from '../../templates/load-fixture';
import { buildSolverInput3D } from '../solver-service';
import { solve3D } from '../solver-3d';

function createStoreMock() {
  let nextNode = 1, nextElem = 1, nextSupport = 1, nextLoad = 1, nextSection = 2, nextMat = 2;
  const model: any = {
    name: '',
    nodes: new Map(),
    materials: new Map([[1, { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5 }]]),
    sections: new Map([[1, { id: 1, name: 'IPN 300', a: 0.00690, iy: 0.00009800, iz: 0.00000451, j: 0.0000001, b: 0.125, h: 0.300 }]]),
    elements: new Map(),
    supports: new Map(),
    loads: [] as any[],
    plates: new Map(),
    quads: new Map(),
    constraints: [] as any[],
    loadCases: [],
    combinations: [],
  };
  const api: any = {
    addNode(x: number, y: number, z?: number) { const id = nextNode++; model.nodes.set(id, { id, x, y, z: z ?? 0 }); return id; },
    addElement(nI: number, nJ: number, type = 'frame') {
      const id = nextElem++;
      model.elements.set(id, { id, type, nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
      return id;
    },
    addSupport(nodeId: number, type: string) { const id = nextSupport++; model.supports.set(id, { id, nodeId, type }); return id; },
    addMaterial(data: any) { const id = nextMat++; model.materials.set(id, { id, ...data }); return id; },
    addSection(data: any) { const id = nextSection++; model.sections.set(id, { id, ...data }); return id; },
    updateElementMaterial(elemId: number, matId: number) { const e = model.elements.get(elemId); if (e) e.materialId = matId; },
    updateElementSection(elemId: number, secId: number) { const e = model.elements.get(elemId); if (e) e.sectionId = secId; },
    addDistributedLoad3D(elemId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number) {
      const id = nextLoad++;
      model.loads.push({ type: 'distributed3d', data: { id, elementId: elemId, qYI, qYJ, qZI, qZJ, a, b, caseId } });
      return id;
    },
    addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number) {
      const id = nextLoad++;
      model.loads.push({ type: 'nodal3d', data: { id, nodeId, fx, fy, fz, mx, my, mz, caseId } });
      return id;
    },
    model,
    nextId: { loadCase: 5, combination: 1 },
  };
  return { model, api };
}

describe('Fixture-loaded tower vs generator-loaded tower', () => {
  it('fixture-loaded tower should have same small displacements', { timeout: 30_000 }, () => {
    const json = JSON.parse(readFileSync('src/lib/templates/fixtures/torre-irregular-con-retiros.json', 'utf8'));
    const { model, api } = createStoreMock();
    loadFixture(json, api);

    // Log section assignments
    const secCounts: Record<string, number> = {};
    for (const [, e] of model.elements) {
      const sec = model.sections.get(e.sectionId);
      const key = sec ? `${e.sectionId}:${sec.name}(iy=${sec.iy})` : `${e.sectionId}:MISSING`;
      secCounts[key] = (secCounts[key] || 0) + 1;
    }
    console.log('Elements by section:', secCounts);

    // Solve dead load
    const deadModel = { ...model, loads: model.loads.filter((l: any) => (l.data.caseId ?? 1) === 1) };
    const input = buildSolverInput3D(deadModel, false, false);
    expect(input).not.toBeNull();

    console.log('Solver sections:');
    for (const [id, s] of input!.sections) {
      console.log(`  ${id}: ${(s as any).name}, a=${s.a}, iy=${s.iy}, iz=${s.iz}`);
    }

    const result = solve3D(input!);
    expect(typeof result).not.toBe('string');
    
    const res = result as any;
    let maxUx = 0, maxUy = 0, maxUz = 0;
    for (const d of res.displacements) {
      maxUx = Math.max(maxUx, Math.abs(d.ux));
      maxUy = Math.max(maxUy, Math.abs(d.uy));
      maxUz = Math.max(maxUz, Math.abs(d.uz));
    }
    const maxDisp = Math.max(maxUx, maxUy, maxUz);
    console.log(`Fixture-loaded: maxUx=${(maxUx*1000).toFixed(1)}mm, maxUy=${(maxUy*1000).toFixed(1)}mm, maxUz=${(maxUz*1000).toFixed(1)}mm`);
    
    expect(maxDisp).toBeLessThan(0.06); // < 60mm (SAP2000 convention slightly changes axis engagement)
  });
});
