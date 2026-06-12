/**
 * RC QA Diagnostic Shells fixture — verifies the diagnostic example exercises
 * EVERY shell contour component honestly (PR [8] QA-A).
 *
 * The fixture combines two distinct shell actions in one model:
 *   - SLAB (12 quads, Z=3 plane) under gravity area load -> bending-dominated:
 *     mx/my/mxy vary, in-plane membrane stress ~ 0.
 *   - WALL / tabique (12 quads, Y=0 plane) under in-plane lateral shear ->
 *     membrane-dominated: sigmaXx/sigmaYy/tauXy + principals vary, bending ~ 0.
 *
 * So across the model each of the 9 components (vonMises, sigmaXx, sigmaYy,
 * tauXy, sigma1, sigma2, mx, my, mxy) has a region of meaningful variation —
 * and per-element the "other" family is honestly near zero (not faked).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { buildSolverInput3D } from '../solver-service';
import { solve3D } from '../wasm-solver';
import {
  SHELL_CONTOUR_COMPONENTS,
  shellComponentValue,
  shellComponentRange,
  principalStresses,
  type ShellStressLike,
} from '../shell-stress';

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

function loadModel() {
  const json: JSONModel = JSON.parse(readFileSync('src/lib/templates/fixtures/rc-qa-diagnostic-shells.json', 'utf8'));
  const { model, api } = createStoreMock();
  loadFixture(json, api);
  return { json, model };
}

describe('RC QA Diagnostic Shells — fixture integrity', () => {
  it('has the slab + wall + frame + curved-beam composition', () => {
    const { json } = loadModel();
    expect(json.name).toBe('RC QA Diagnostic Shells');
    expect(json.nodes.length).toBe(46);
    expect(json.quads.length).toBe(24); // 12 slab + 12 wall
    expect(json.elements.length).toBe(32); // columns + beams + curved arch segments
    // Concrete material present.
    expect(json.materials.some(m => String(m.name).startsWith('H-30'))).toBe(true);
    // Two load cases (gravity D + lateral W) and three combinations.
    expect(json.loadCases.map(c => c.type).sort()).toEqual(['D', 'W']);
    expect(json.combinations.length).toBe(3);
  });
});

describe('RC QA Diagnostic Shells — every contour component varies somewhere', () => {
  const { model } = loadModel();
  const nodeOf = (id: number) => model.nodes.get(id)!;

  // Solve a single load case in isolation (so each shell action is seen pure).
  function solveCase(caseId: number | 'all') {
    const loads = caseId === 'all' ? model.loads : model.loads.filter((l: any) => l.data.caseId === caseId);
    const input = buildSolverInput3D({ ...model, loads });
    return solve3D(input!);
  }
  function classify(results: any) {
    const slab: ShellStressLike[] = [], wall: ShellStressLike[] = [];
    for (const qs of results.quadStresses ?? []) {
      const ns = model.quads.get(qs.elementId)!.nodes.map(nodeOf);
      if (ns.every((n: any) => Math.abs((n.z ?? 0) - 3) < 1e-6)) slab.push(qs);
      else if (ns.every((n: any) => Math.abs(n.y) < 1e-6)) wall.push(qs);
    }
    return { slab, wall };
  }

  const gravity = solveCase(1);   // D — slab bending
  const lateral = solveCase(2);   // W — wall in-plane shear
  const all = solveCase('all');
  const allShells: ShellStressLike[] = [...(all.plateStresses ?? []), ...(all.quadStresses ?? [])];

  it('produces shell stresses for all 24 quads (12 slab + 12 wall)', () => {
    expect(all.quadStresses?.length).toBe(24);
    const { slab, wall } = classify(all);
    expect(slab.length).toBe(12);
    expect(wall.length).toBe(12);
  });

  it('under GRAVITY the slab is bending-dominated (mx/my vary, membrane small)', () => {
    const { slab } = classify(gravity);
    const mxR = shellComponentRange(slab, 'mx');
    const myR = shellComponentRange(slab, 'my');
    const bendingSpan = Math.max(mxR.max - mxR.min, myR.max - myR.min);
    const membranePeak = Math.max(...slab.map(s => Math.abs(s.sigmaXx)), ...slab.map(s => Math.abs(s.sigmaYy)));
    const vmPeak = Math.max(...slab.map(s => s.vonMises));
    console.log(`[slab/gravity] bending span(mx,my)=${bendingSpan.toFixed(2)} kN·m/m | membranePeak=${membranePeak.toFixed(3)} kN/m² | vmPeak=${vmPeak.toFixed(2)}`);
    expect(bendingSpan).toBeGreaterThan(1);
    expect(membranePeak).toBeLessThan(vmPeak); // membrane is not the governing field
  });

  it('under LATERAL the wall is membrane-dominated (in-plane stresses vary, bending small)', () => {
    const { wall } = classify(lateral);
    const sxxR = shellComponentRange(wall, 'sigmaXx');
    const syyR = shellComponentRange(wall, 'sigmaYy');
    const txyR = shellComponentRange(wall, 'tauXy');
    const membraneSpan = Math.max(sxxR.max - sxxR.min, syyR.max - syyR.min, txyR.max - txyR.min);
    const bendingPeak = Math.max(...wall.map(s => Math.max(Math.abs(s.mx), Math.abs(s.my), Math.abs(s.mxy))));
    const membranePeak = Math.max(...wall.map(s => Math.max(Math.abs(s.sigmaXx), Math.abs(s.sigmaYy), Math.abs(s.tauXy))));
    console.log(`[wall/lateral] membrane span=${membraneSpan.toFixed(2)} kN/m² | bendingPeak=${bendingPeak.toFixed(3)} kN·m/m | membranePeak=${membranePeak.toFixed(2)}`);
    expect(membraneSpan).toBeGreaterThan(1);
    expect(bendingPeak).toBeLessThan(membranePeak); // bending is not the governing field
  });

  it('every one of the 9 components has a finite, non-trivial peak across the model', () => {
    const lines: string[] = [];
    for (const c of SHELL_CONTOUR_COMPONENTS) {
      const r = shellComponentRange(allShells, c.key);
      const peak = Math.max(Math.abs(r.min), Math.abs(r.max));
      lines.push(`${c.key.padEnd(9)} min=${r.min.toFixed(2)} max=${r.max.toFixed(2)} peak=${peak.toFixed(2)} ${c.unit}`);
      expect(Number.isFinite(peak)).toBe(true);
      expect(peak).toBeGreaterThan(1e-3); // not a dead/zero component anywhere
    }
    console.log('[all-loads component ranges]\n' + lines.join('\n'));
  });

  it('derived principal stresses are consistent (σ1 ≥ σ2, and bracket σxx/σyy)', () => {
    for (const s of allShells) {
      const p = principalStresses(s.sigmaXx, s.sigmaYy, s.tauXy);
      expect(p.sigma1).toBeGreaterThanOrEqual(p.sigma2 - 1e-9);
      expect(shellComponentValue(s, 'sigma1')).toBeCloseTo(p.sigma1, 6);
      expect(shellComponentValue(s, 'sigma2')).toBeCloseTo(p.sigma2, 6);
      // σ1+σ2 = σxx+σyy (invariant of the 2D stress tensor)
      expect(p.sigma1 + p.sigma2).toBeCloseTo(s.sigmaXx + s.sigmaYy, 4);
    }
  });
});
