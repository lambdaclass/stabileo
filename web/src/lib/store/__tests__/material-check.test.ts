/**
 * The other materials inside the design: a timber column (its material carries reference values),
 * an aluminium beam (a catalogued EN AW grade) and a composite filled column, solved and checked
 * by `runMaterialChecks`; the CIRSOC 301 check leaves all three alone; the desk lists them with
 * their families; the memoria carries them with the cautious vocabulary.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { materialCheckState, otherFamilyOf, runMaterialChecks } from '../material-check.svelte';
import { runSteelVerification } from '../../engine/verification-service';
import { deskMembers } from '../design-desk';
import { memoriaInput } from '../memoria-inputs';
import { familySummary } from '../../report/memoria/render';
import { serializeProject, deserializeProject } from '../file';

describe('other materials in the design', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; });

  function model() {
    modelStore.clear();
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    const timber = modelStore.addMaterial({ name: 'Pino', e: 10000, nu: 0.3, rho: 5, timber: { fb: 10, ft: 6, fc: 8, fv: 1, e: 10000, kind: 'sawn' } } as never);
    const alu = modelStore.addMaterial({ name: '6061-T6', e: 70000, nu: 0.3, rho: 27, fy: 240, gradeId: 'alu-6061-t6' } as never);
    const steel = modelStore.addMaterial({ name: 'F-36', e: 200000, nu: 0.3, rho: 78.5, fy: 355 } as never);
    const rect = modelStore.addSection({ name: 'T 15x30', a: 0.045, iz: 8.4375e-5, iy: 3.375e-4, j: 2.6e-4, b: 0.15, h: 0.3, shape: 'rect' } as never);
    const rhsA = modelStore.addSection({ name: 'RHS 100x150x6', a: 0.00286, iz: 3.9e-6, iy: 7.6e-6, j: 7.8e-6, b: 0.1, h: 0.15, t: 0.006, shape: 'RHS' } as never);
    const rhsS = modelStore.addSection({ name: 'RHS 200x8', a: 0.006144, iz: 3.78e-5, iy: 3.78e-5, j: 6e-5, b: 0.2, h: 0.2, t: 0.008, shape: 'RHS' } as never);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(4, 0, 0);
    const col = modelStore.addElement(a, b, 'frame'), beam = modelStore.addElement(b, c, 'frame'), comp = modelStore.addElement(d, c, 'frame');
    modelStore.updateElementMaterial(col, timber); modelStore.updateElementSection(col, rect);
    modelStore.updateElementMaterial(beam, alu); modelStore.updateElementSection(beam, rhsA);
    modelStore.updateElementMaterial(comp, steel); modelStore.updateElementSection(comp, rhsS);
    modelStore.updateElement(comp, { composite: { kind: 'filled', fc: 30 } } as never);
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
    modelStore.addNodalLoad3D(b, 2, 0, -15, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    return { col, beam, comp };
  }

  it('each member gets its own checker, and the CIRSOC 301 check leaves them alone', () => {
    const { col, beam, comp } = model();
    expect(otherFamilyOf(modelStore.elements.get(col)!, modelStore.sections.get(modelStore.elements.get(col)!.sectionId), modelStore.materials.get(modelStore.elements.get(col)!.materialId) as never)).toBe('timber');
    const out = runMaterialChecks();
    expect(out).toEqual({ checked: 3 });
    const res = materialCheckState.results;
    expect(res.get(col)!.family).toBe('timber');
    expect(res.get(col)!.code).toBe('cirsoc-601');
    expect(res.get(beam)!.family).toBe('aluminium');
    expect(res.get(comp)!.family).toBe('composite');
    for (const r of res.values()) {
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.filter((x) => !x.clause || !x.formula)).toEqual([]);
    }
    const checked = runSteelVerification(resultsStore.results3D!, { elements: modelStore.elements, nodes: modelStore.nodes, sections: modelStore.sections, materials: modelStore.materials, supports: modelStore.supports } as never).map((v) => v.elementId);
    expect(checked).not.toContain(beam);
    expect(checked).not.toContain(comp);
    expect(checked).not.toContain(col);
  });

  it('the desk lists them by family; the memoria states them without «satisfies»', () => {
    const { col, comp } = model();
    runMaterialChecks();
    const rows = deskMembers();
    expect(rows.find((r) => r.id === col)!.material).toBe('timber');
    expect(rows.find((r) => r.id === comp)!.material).toBe('composite');
    const m = memoriaInput((k) => k, 'en');
    const timber = m.elements.filter((e) => e.family === 'timber');
    expect(timber).toHaveLength(1);
    const html = familySummary(timber, { tr: (k) => k, msg: (x) => x.key, fmt: (v, d) => v.toFixed(d) }, 'timber');
    expect(html).toMatch(/memo\.state\.steel(Ok|Fail)/);
    expect(html).not.toContain('memo.state.ok');
    expect(m.scope.some((s) => s.code === 'cirsoc-601')).toBe(true);
  });

  it('the composite definition and the timber values travel with the project, and keep the solve', () => {
    const { col, comp } = model();
    const solved = !!resultsStore.results3D;
    modelStore.setElementDesign(comp, { composite: { kind: 'encased', fc: 25, b: 0.4, h: 0.4 } });
    expect(!!resultsStore.results3D).toBe(solved);
    const text = serializeProject();
    modelStore.clear();
    expect(deserializeProject(text)).toBe(true);
    expect((modelStore.elements.get(comp) as { composite?: { kind: string } }).composite?.kind).toBe('encased');
    const mat = modelStore.materials.get(modelStore.elements.get(col)!.materialId) as { timber?: { fb: number } };
    expect(mat.timber?.fb).toBe(10);
  });
});
