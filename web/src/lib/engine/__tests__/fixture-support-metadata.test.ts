/**
 * Regression test: fixture loading must pass through all support metadata
 * (settlements, prescribed displacements, angles, 3D DOF) to addSupport().
 *
 * Bug: load-fixture.ts was passing all non-id/nodeId/type fields as the
 * springK argument, never populating the opts argument that carries
 * settlements (dz, dry, etc.), angles, and 3D DOF metadata.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { loadFixture, type JSONModel, type FixtureLoader } from '../../templates/load-fixture';

/** Minimal store mock that records exactly what addSupport receives. */
function createRecordingMock() {
  let nextNode = 1, nextElem = 1, nextSupport = 1, nextMat = 2, nextSection = 2;
  const supportCalls: Array<{ nodeId: number; type: string; springs?: Record<string, number>; opts?: Record<string, unknown> }> = [];
  const model: any = {
    name: '',
    nodes: new Map(),
    materials: new Map([[1, { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]]),
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
  const api: FixtureLoader = {
    addNode(x: number, y: number, z?: number) { const id = nextNode++; model.nodes.set(id, { id, x, y, z: z ?? 0 }); return id; },
    addElement(nI: number, nJ: number, type = 'frame' as const) {
      const id = nextElem++;
      model.elements.set(id, { id, type, nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
      return id;
    },
    addSupport(nodeId: number, type: string, springs?: Record<string, number>, opts?: Record<string, unknown>) {
      supportCalls.push({ nodeId, type, springs, opts });
      const id = nextSupport++;
      model.supports.set(id, { id, nodeId, type, ...springs, ...opts });
      return id;
    },
    addMaterial(data: any) { const id = nextMat++; model.materials.set(id, { id, ...data }); return id; },
    addSection(data: any) { const id = nextSection++; model.sections.set(id, { id, ...data }); return id; },
    updateElementMaterial(elemId: number, matId: number) { const e = model.elements.get(elemId); if (e) e.materialId = matId; },
    updateElementSection(elemId: number, secId: number) { const e = model.elements.get(elemId); if (e) e.sectionId = secId; },
    toggleHinge(elemId: number, end: 'start' | 'end') {
      const e = model.elements.get(elemId);
      if (e) { if (end === 'start') e.hingeStart = !e.hingeStart; else e.hingeEnd = !e.hingeEnd; }
    },
    model,
    nextId: { loadCase: 5, combination: 1 },
  };
  return { model, api, supportCalls };
}

describe('fixture loading preserves support metadata', () => {
  it('settlement fixture: dz=-0.01 reaches addSupport opts', () => {
    const json: JSONModel = JSON.parse(
      readFileSync('src/lib/templates/fixtures/settlement.json', 'utf8'),
    );
    const { model, api, supportCalls } = createRecordingMock();
    loadFixture(json, api);

    // Support id=2 in the fixture has nodeId=2, type=rollerX, dz=-0.01
    // After ID remapping node 2 becomes 2 (sequential 1-based)
    const rollerCall = supportCalls.find(c => c.type === 'rollerX' && c.opts?.dz === -0.01);
    expect(rollerCall).toBeDefined();
    expect(rollerCall!.opts!.dz).toBe(-0.01);
  });

  it('settlement fixture: angle=90 reaches addSupport opts', () => {
    const json: JSONModel = JSON.parse(
      readFileSync('src/lib/templates/fixtures/settlement.json', 'utf8'),
    );
    const { api, supportCalls } = createRecordingMock();
    loadFixture(json, api);

    const fixedCall = supportCalls.find(c => c.type === 'fixed');
    expect(fixedCall).toBeDefined();
    expect(fixedCall!.opts!.angle).toBe(90);
  });

  it('spring-support fixture: spring constants reach addSupport springs arg, not opts', () => {
    const json: JSONModel = JSON.parse(
      readFileSync('src/lib/templates/fixtures/spring-support.json', 'utf8'),
    );
    const { api, supportCalls } = createRecordingMock();
    loadFixture(json, api);

    const springCall = supportCalls.find(c => c.type === 'spring');
    expect(springCall).toBeDefined();
    expect(springCall!.springs).toBeDefined();
    expect(springCall!.springs!.ky).toBe(5000);
    // Spring keys should NOT leak into opts
    expect(springCall!.opts?.ky).toBeUndefined();
  });

  it('inline fixture: all opts fields pass through', () => {
    const json: JSONModel = {
      name: 'opts-test',
      materials: [{ id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }],
      sections: [{ id: 1, name: 'IPN 300', a: 0.0069, iy: 9.8e-5, iz: 4.51e-6, j: 1e-7, b: 0.125, h: 0.3 }],
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 4, y: 0, z: 0 }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      supports: [
        {
          id: 1, nodeId: 1, type: 'fixed',
          angle: 45, isGlobal: true,
          dx: 0.001, dz: -0.02, drx: 0.003, dry: 0.004,
          kx: 500, ky: 1000,
          dofRestraints: { tx: true, ty: true, tz: false, rx: false, ry: false, rz: true },
          dofFrame: 'local',
          dofLocalElementId: 1,
        } as any,
      ],
      loads: [],
      plates: [],
      quads: [],
      constraints: [],
      loadCases: [{ id: 1, type: 'D', name: 'Dead Load' }],
      combinations: [],
    };
    const { api, supportCalls } = createRecordingMock();
    loadFixture(json, api);

    expect(supportCalls).toHaveLength(1);
    const call = supportCalls[0];

    // Springs should be in the springs arg
    expect(call.springs).toEqual({ kx: 500, ky: 1000 });

    // Everything else should be in opts
    expect(call.opts).toBeDefined();
    expect(call.opts!.angle).toBe(45);
    expect(call.opts!.isGlobal).toBe(true);
    expect(call.opts!.dx).toBe(0.001);
    expect(call.opts!.dz).toBe(-0.02);
    expect(call.opts!.drx).toBe(0.003);
    expect(call.opts!.dry).toBe(0.004);
    expect(call.opts!.dofRestraints).toEqual({ tx: true, ty: true, tz: false, rx: false, ry: false, rz: true });
    expect(call.opts!.dofFrame).toBe('local');
    expect(call.opts!.dofLocalElementId).toBe(1);
  });
});
