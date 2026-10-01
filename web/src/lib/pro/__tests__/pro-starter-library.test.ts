/** A new PRO model's starter sections and materials, and only on an untouched model. */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { seedProStarterLibrary } from '../pro-starter-library';

describe('PRO starter library', () => {
  it('adds H-30 and two rectangles beside the steel default, which stays first', () => {
    historyStore.clear(); uiStore.analysisMode = 'pro'; modelStore.clear();
    expect(seedProStarterLibrary()).toBe(true);
    expect([...modelStore.materials.values()].map((m) => m.name)).toEqual(['Acero A36', 'H-30']);
    const secs = [...modelStore.sections.values()];
    expect(secs.map((s) => s.name)).toEqual(['IPN 300', 'Rect 30x30 cm', 'Rect 20x50 cm']);
    expect(secs[2]).toMatchObject({ b: 0.2, h: 0.5, shape: 'rect' });
    expect(secs[2]!.a).toBeCloseTo(0.1, 12);
    expect(modelStore.materials.get(2)).toMatchObject({ e: 25743, fy: 30 });
    // Twice is once.
    expect(seedProStarterLibrary()).toBe(false);
    expect(modelStore.sections.size).toBe(3);
  });

  it('leaves a model with geometry as it is', async () => {
    modelStore.clear();
    await modelStore.loadExample('3d-portal-frame');
    const n = modelStore.sections.size;
    expect(seedProStarterLibrary()).toBe(false);
    expect(modelStore.sections.size).toBe(n);
  });
});
