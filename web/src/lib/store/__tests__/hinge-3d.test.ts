/**
 * "Art. I / Art. J" in a space model: a pin in bending, both moments released.
 * The toggle used to release Mz alone, and a beam's local z is vertical, so the
 * gravity moment My stayed fully fixed at the "hinged" end.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import type { AnalysisResults3D } from '../../engine/types-3d';

describe('3D hinge', () => {
  it('releases the gravity moment of the 3d-portal-frame beam', async () => {
    historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
    await modelStore.loadExample('3d-portal-frame');
    const beam = [...modelStore.elements.values()].find((e) => {
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-9 && Math.abs(a.z ?? 0) > 0.1;
    })!;
    const before = (modelStore.solve3D(false, false) as AnalysisResults3D).elementForces.find((f) => f.elementId === beam.id)!;
    expect(Math.abs(before.myStart)).toBeGreaterThan(1);
    modelStore.toggleHinge3D(beam.id, 'start');
    const e = modelStore.elements.get(beam.id)!;
    expect(e.releaseI?.my && e.releaseI?.mz).toBe(true);
    const after = (modelStore.solve3D(false, false) as AnalysisResults3D).elementForces.find((f) => f.elementId === beam.id)!;
    expect(Math.abs(after.myStart)).toBeLessThan(1e-6);
    expect(Math.abs(after.mzStart)).toBeLessThan(1e-6);
    modelStore.toggleHinge3D(beam.id, 'start');
    expect(modelStore.elements.get(beam.id)!.releaseI?.my || modelStore.elements.get(beam.id)!.releaseI?.mz).toBe(false);
  });
});
