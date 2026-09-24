/**
 * A rotated section's plastic modulus is about the axis the analysis bends it
 * about. The 2D stiffness turns a rotated section (Iy·cos²α + Iz·sin²α); Zp
 * has to turn with it, or an IPN turned 90° collapses at six times the load
 * its weak axis can carry.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { plasticModulus, plasticMoments } from '../plastic-moments';
import { analyzeSectionPlastic, solvePlastic } from '../wasm-solver';
import { resolveCanonicalSection, isGeometryBacked } from '../../section/canonical';

describe('plastic Mp of a rotated section', () => {
  it('an IPN 300 rotated 90° bends about its weak axis, so Zp must be the weak-axis Zp', async () => {
    historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
    await modelStore.loadExample('cantilever-point');
    const sec = [...modelStore.sections.values()][0];
    const r = resolveCanonicalSection(sec);
    expect(isGeometryBacked(r)).toBe(true);
    const { zy, zz } = analyzeSectionPlastic({ geometry: (r as { geometry: never }).geometry });
    expect(zy / zz).toBeGreaterThan(5); // strong ≈ 761 cm³, weak ≈ 122 cm³

    const rotated = plasticModulus({ ...sec, rotation: 90 });
    expect(rotated.zp).toBeCloseTo(zz, 7);
  });

  it('plastic collapse of the rotated cantilever: first hinge at λ = fy·Zp,weak/(P·L)', async () => {
    historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
    await modelStore.loadExample('cantilever-point');
    const [id, sec] = [...modelStore.sections.entries()][0];
    modelStore.sections.set(id, { ...sec, rotation: 90 });
    const r = resolveCanonicalSection(modelStore.sections.get(id)!);
    const { zz } = analyzeSectionPlastic({ geometry: (r as { geometry: never }).geometry });

    // Exactly what ToolbarAdvanced.handlePlastic sends.
    const mps = plasticMoments(modelStore.sections, modelStore.materials, modelStore.elements);
    const sections = new Map([...modelStore.sections].map(([sid, s]) => [sid, { a: s.a, iz: s.iy ?? s.iz, materialId: 1 }]));
    const materials = new Map([...modelStore.materials].map(([mid, x]) => [mid, { fy: x.fy }]));
    const res = solvePlastic({ solver: modelStore.buildSolverInput(false)!, sections, materials, mpOverrides: new Map(mps.map((m) => [m.sectionId, m.mp])) });
    const fy = mps[0].fy;
    const lambdaWeak = fy * 1000 * zz / (15 * 3);
    console.log(JSON.stringify({ lambda: res.steps[0].loadFactor, lambdaWeak }));
    expect(res.steps[0].loadFactor).toBeCloseTo(lambdaWeak, 3);
  });
});
