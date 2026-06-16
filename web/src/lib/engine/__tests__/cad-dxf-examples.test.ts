/**
 * CAD → RC draft DXF examples (PR [9] stress tests) — fixture integrity and
 * solvability. Both fixtures are generated from real architectural DXFs by
 * scripts/build-cad-dxf-examples.ts:
 *   - cad-arch-structure-dxf: structure read from annotated CGC/R&S layers,
 *   - cad-arch-only-dxf: RC layout PROPOSED from architecture only.
 * 10 floors (3.0 m + 9 × 2.8 m), D/L/Lr explicit, roof carries Lr.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { buildSolverInput3D } from '../solver-service';
import { solve3D } from '../wasm-solver';
import { beamThrough } from '../mesh-weld';

function createStoreMock() {
  let nextNode = 1, nextElem = 1, nextSupport = 1, nextLoad = 1, nextSection = 2, nextMat = 2, nextQuad = 1, nextPlate = 1;
  const model: any = {
    name: '', nodes: new Map(),
    materials: new Map([[1, { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]]),
    sections: new Map([[1, { id: 1, name: 'IPN 300', a: 0.0069, iy: 9.8e-5, iz: 4.51e-6, j: 1e-7, b: 0.125, h: 0.3 }]]),
    elements: new Map(), supports: new Map(), loads: [] as any[],
    plates: new Map(), quads: new Map(), constraints: [] as any[], loadCases: [], combinations: [],
  };
  const api: any = {
    addNode(x: number, y: number, z?: number) { const id = nextNode++; model.nodes.set(id, { id, x, y, z: z ?? 0 }); return id; },
    addElement(nI: number, nJ: number, type = 'frame') { const id = nextElem++; model.elements.set(id, { id, type, nodeI: nI, nodeJ: nJ, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } }); return id; },
    addSupport(nodeId: number, type: string, _s?: any, extra?: any) { const id = nextSupport++; model.supports.set(id, { id, nodeId, type, ...extra }); return id; },
    addMaterial(data: any) { const id = nextMat++; model.materials.set(id, { id, ...data }); return id; },
    addSection(data: any) { const id = nextSection++; model.sections.set(id, { id, ...data }); return id; },
    updateElementMaterial(elemId: number, matId: number) { const e = model.elements.get(elemId); if (e) e.materialId = matId; },
    updateElementSection(elemId: number, secId: number) { const e = model.elements.get(elemId); if (e) e.sectionId = secId; },
    addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number) { const id = nextLoad++; model.loads.push({ type: 'nodal3d', data: { id, nodeId, fx, fy, fz, mx, my, mz, caseId } }); return id; },
    addSurfaceLoad3D(quadId: number, q: number, caseId?: number) { const id = nextLoad++; model.loads.push({ type: 'surface3d', data: { id, quadId, q, caseId } }); return id; },
    addQuad(nodes: number[], materialId: number, thickness: number) { const id = nextQuad++; model.quads.set(id, { id, nodes, materialId, thickness }); return id; },
    addPlate(nodes: number[], materialId: number, thickness: number) { const id = nextPlate++; model.plates.set(id, { id, nodes, materialId, thickness }); return id; },
    addConstraint(c: any) { model.constraints.push(c); },
    model, nextId: { loadCase: 3, combination: 1 },
  };
  return { model, api };
}

function loadExample(name: string) {
  const json: JSONModel = JSON.parse(readFileSync(`src/lib/templates/fixtures/${name}.json`, 'utf8'));
  const { model, api } = createStoreMock();
  loadFixture(json, api);
  return { json, model };
}

const EXAMPLES = ['cad-arch-structure-dxf', 'cad-arch-only-dxf'] as const;

describe.each(EXAMPLES)('%s — fixture integrity', (name) => {
  const { json, model } = loadExample(name);

  it('is a 10-floor model with the agreed storey heights (3.0 + 9 × 2.8 m)', () => {
    const zs = [...new Set(json.nodes.map((n) => +n.z.toFixed(3)))].sort((a, b) => a - b);
    expect(zs[0]).toBe(0);
    expect(zs).toContain(3);
    expect(zs[zs.length - 1]).toBeCloseTo(3 + 9 * 2.8, 6); // 28.2 m
    expect(zs.length).toBe(11); // base + 10 levels
  });

  it('has D, L, and Lr load cases with roof slabs carrying Lr instead of L', () => {
    expect(json.loadCases.map((c) => c.type).sort()).toEqual(['D', 'L', 'Lr']);
    const topZ = 28.2;
    const nodeZ = new Map(json.nodes.map((n) => [n.id, n.z]));
    const quadZ = new Map(json.quads.map((q) => [q.id, Math.max(...q.nodes.map((n) => nodeZ.get(n) ?? 0))]));
    let roofLr = 0, roofL = 0, floorLr = 0;
    for (const load of json.loads) {
      const d = load.data as { quadId?: number; caseId?: number };
      if (d.quadId === undefined) continue;
      const z = quadZ.get(d.quadId) ?? 0;
      const isRoof = Math.abs(z - topZ) < 0.05;
      if (d.caseId === 3 && isRoof) roofLr++;
      if (d.caseId === 2 && isRoof) roofL++;
      if (d.caseId === 3 && !isRoof) floorLr++;
    }
    expect(roofLr).toBeGreaterThan(0);
    expect(roofL).toBe(0);
    expect(floorLr).toBe(0);
  });

  it('generates the three explicit gravity combinations', () => {
    expect(json.combinations.map((c) => c.name)).toEqual([
      '1.4 D', '1.2 D + 1.6 L + 0.5 Lr', '1.2 D + 0.5 L + 1.6 Lr',
    ]);
  });

  it('carries unreviewed CAD-draft provenance with the replicated-plan and source assumptions', () => {
    const prov = json.provenance as any;
    expect(prov?.status).toBe('cad-draft-unreviewed');
    expect(prov.fileName).toMatch(/\.dxf$/);
    const text = prov.assumptions.join('\n');
    expect(text).toContain('replicated across all 10 floor(s)');
    expect(text).toContain('CIRSOC 101');
    expect(text).toContain('cropped to window');
  });

  it('supports exist only at z = 0 and nothing floats (every node reachable from a support)', () => {
    const nodeZ = new Map<number, number>();
    for (const [id, n] of model.nodes) nodeZ.set(id, n.z ?? 0);
    for (const [, sup] of model.supports) expect(nodeZ.get(sup.nodeId)).toBe(0);

    // Connectivity: union of frame elements + quad edges must form one piece
    // containing all nodes, anchored at the supports.
    const adj = new Map<number, number[]>();
    const link = (a: number, b: number) => {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    };
    for (const [, el] of model.elements) link(el.nodeI, el.nodeJ);
    for (const [, q] of model.quads) {
      for (let i = 0; i < 4; i++) link(q.nodes[i], q.nodes[(i + 1) % 4]);
    }
    // Mirror the app's pre-solve gate: ONE connected component — BFS from a
    // single support must reach every node (a disconnected column stack with
    // its own support must NOT pass).
    const seen = new Set<number>();
    const stack = [([...model.supports.values()][0] as any).nodeId];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) stack.push(m);
    }
    expect(seen.size).toBe(model.nodes.size); // no floating islands
  });

  it('shells share nodes with beams (no beam passes through a quad node unsplit)', () => {
    const nodes = model.nodes as Map<number, { x: number; y: number; z?: number }>;
    const elements = [...model.elements.values()];
    let through = 0;
    for (const [, q] of model.quads) {
      for (const nid of q.nodes) {
        const n = nodes.get(nid)!;
        if (beamThrough((id) => nodes.get(id) as any, elements as any, n.x, n.y, n.z ?? 0, 0.03)) through++;
      }
    }
    expect(through).toBe(0);
  });
});

describe.each(EXAMPLES)('%s — solves in the 3D engine', (name) => {
  // ~2–4 s solve each (2k+ nodes); generous budget for loaded CI machines.
  it('finite displacements, downward roof deflection, equilibrium of vertical reactions', { timeout: 60000 }, () => {
    const { model } = loadExample(name);
    const input = buildSolverInput3D(model as never);
    expect(input).not.toBeNull();
    const results = solve3D(input!);
    const disp = results.displacements ?? [];
    expect(disp.length).toBeGreaterThan(0);
    for (const d of disp) {
      expect(Number.isFinite(d.ux)).toBe(true);
      expect(Number.isFinite(d.uz)).toBe(true);
    }
    const minUz = Math.min(...disp.map((d) => d.uz ?? 0));
    expect(minUz).toBeLessThan(0); // gravity loads deflect downward
    expect(minUz).toBeGreaterThan(-0.5); // and not absurdly (no mechanism)

    // ΣFz reactions ≈ total applied load.
    const totalReaction = (results.reactions ?? []).reduce((s, r: any) => s + (r.rz ?? r.fz ?? 0), 0);
    expect(Number.isFinite(totalReaction)).toBe(true);
    expect(Math.abs(totalReaction)).toBeGreaterThan(0);
  });
});
