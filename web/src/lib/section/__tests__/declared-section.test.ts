/**
 * A section whose properties are declared keeps them, whatever its name.
 *
 * The catalogue lookup is by name, ignoring case, so a section written as `W30X90` with another
 * program's numbers used to become the catalogue's W30x90 outline: its A, Iy and Iz were
 * replaced by the outline's (fillets included), up to 3 % stiffer, while J, the shear areas and
 * the self-weight kept the declared values. `declared` makes the name a label.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveCanonicalSection } from '../canonical';
import { resolveSectionState, solverProperties } from '../state';
import { initSolver, hasCanonicalGeometryExport } from '../../engine/wasm-solver';
import { codeToModel, modelToCode } from '../../model/code/format';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { loadValidationModel } from '../../templates/validation';
import type { Section } from '../../store/model.svelte';

beforeAll(async () => { await initSolver(); });

const W = (over: Partial<Section> = {}): Section =>
  ({ id: 1, name: 'W30X90', a: 0.01696770751, iy: 0.001502595446, iz: 4.786661394e-5, j: 1.182097213e-6, ...over }) as Section;

describe.skipIf(!hasCanonicalGeometryExport())('a declared section', () => {
  it('is not looked up in the catalogue, though its name is there', () => {
    // Without the flag the name finds the catalogue profile, and its outline gives other numbers.
    const looked = resolveCanonicalSection(W());
    expect(looked.state).toBe('geometry-backed');
    const declared = resolveCanonicalSection(W({ declared: true }));
    expect(declared.state).toBe('properties-only');
    expect(declared.state === 'properties-only' && declared.reason.kind).toBe('declared');
  });

  it('solves with its own A, Iy and Iz', () => {
    const s = W({ declared: true });
    s.canonical = resolveSectionState(s);
    const p = solverProperties(s);
    expect(p.a).toBe(s.a);
    expect(p.iy).toBe(s.iy);
    expect(p.iz).toBe(s.iz);

    const plain = W();
    plain.canonical = resolveSectionState(plain);
    expect(Math.abs(solverProperties(plain).a / plain.a - 1)).toBeGreaterThan(1e-3);
  });

  it('keeps the flag through the model code', () => {
    const text = 'stabileo-model 1\nsection 1 name="W30X90" declared=true a=0.0169677 iy=0.0015026 iz=4.7867e-5\n';
    const snap = codeToModel(text).snapshot!;
    const sec = snap.sections!.find(([id]) => id === 1)![1] as Section;
    expect(sec.declared).toBe(true);
    expect(modelToCode(snap as Parameters<typeof modelToCode>[0])).toContain('declared=true');
  });

  it('solves the validation models with the properties they declare', async () => {
    uiStore.analysisMode = 'pro';
    await loadValidationModel('validation-04');
    const w = [...modelStore.sections.values()].filter((s) => /^W\d/.test(s.name));
    expect(w.length).toBeGreaterThan(20);
    for (const s of w) {
      const p = solverProperties(s);
      expect(p.a, s.name).toBe(s.a);
      expect(p.iz, s.name).toBe(s.iz);
    }
  });
});
