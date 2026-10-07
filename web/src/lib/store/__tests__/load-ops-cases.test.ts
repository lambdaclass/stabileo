/**
 * Cases made of others, through the store's operations on cases: a duplicate is the case it
 * copies, a case may not read itself, and deleting a case says which composite and notional
 * cases it leaves.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { historyStore } from '../history.svelte';
import { duplicateCase, caseDeletionScope } from '../load-ops';
import { checkModel } from '../../engine/model-diagnostics';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const caseOf = (id: number) => modelStore.model.loadCases.find((c) => c.id === id)!;

describe('duplicating a case', () => {
  it('copies what it is made of and how it is solved', () => {
    const D = modelStore.addLoadCase('D', 'D'), L = modelStore.addLoadCase('L', 'L');
    const C = modelStore.addLoadCase('C', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }], reference: true });
    const N = modelStore.addLoadCase('N', 'N');
    modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: D, ratio: 0.002, dir: '+Y' }, solve: false });
    const reduction = { ratio: 0.6, tributaryAreaM2: 80, elementKind: 'interiorBeam', floorsSupported: 1, occupancyKey: 'vivienda' };
    modelStore.updateLoadCaseFields(L, { reduction });

    const c2 = caseOf(duplicateCase(C, 'C copy')!);
    expect(c2.includes).toEqual([{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
    expect(c2.reference).toBe(true);
    const n2 = caseOf(duplicateCase(N, 'N copy')!);
    expect(n2.notional).toEqual({ sourceCaseId: D, ratio: 0.002, dir: '+Y' });
    expect(n2.solve).toBe(false);
    expect(caseOf(duplicateCase(L, 'L copy')!).reduction).toEqual(reduction);
    // Times the factor, as its loads are.
    expect(caseOf(duplicateCase(C, 'C × 2', 2)!).includes).toEqual([{ caseId: D, factor: 2.4 }, { caseId: L, factor: 3.2 }]);
    expect(caseOf(duplicateCase(N, 'N × 2', 2)!).notional!.ratio).toBeCloseTo(0.004, 12);
  });
});

describe('a case that would read itself', () => {
  it('is refused, through what it takes in or its notional source, itself included', () => {
    const D = modelStore.addLoadCase('D', 'D');
    const C = modelStore.addLoadCase('C', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1 }] });
    const N = modelStore.addLoadCase('N', 'N');
    // N reads C, then C takes N in: a loop, refused.
    modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: C, ratio: 0.002, dir: '+X' } });
    const took = modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1 }, { caseId: N, factor: 1 }] });
    expect(caseOf(C).includes).toEqual([{ caseId: D, factor: 1 }]);
    expect(took).toBe(false);
    // A notional case of its own gravity.
    modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: N, ratio: 0.002, dir: '+X' } });
    expect(caseOf(N).notional!.sourceCaseId).toBe(C);
    // What does not loop is taken.
    expect(modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: D, ratio: 0.002, dir: '+X' } })).toBe(true);
  });

  it('read from a file, is a finding of the model', () => {
    const A = modelStore.addLoadCase('A', ''), B = modelStore.addLoadCase('B', '');
    // As a file can hold them: written past the store.
    caseOf(A).includes = [{ caseId: B, factor: 1 }];
    caseOf(B).notional = { sourceCaseId: A, ratio: 0.002, dir: '+X' };
    const found = checkModel({
      nodes: modelStore.nodes, elements: modelStore.elements, materials: modelStore.materials, sections: modelStore.sections,
      supports: modelStore.supports, loads: modelStore.loads as never, loadCases: modelStore.model.loadCases,
    }).find((d) => d.code === 'MODEL_CASE_LOOP');
    expect(found?.details).toEqual({ cases: 'A, B' });
  });
});

describe('deleting a case', () => {
  it('says which composite cases it leaves, and which notional cases it leaves empty', () => {
    const D = modelStore.addLoadCase('D', 'D');
    const C = modelStore.addLoadCase('C', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1.2 }] });
    const N = modelStore.addLoadCase('N +X', 'N');
    modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: D, ratio: 0.002, dir: '+X' } });
    expect(caseDeletionScope(D)).toMatchObject({ composites: ['C'], notional: ['N +X'] });
    expect(caseDeletionScope(C)).toMatchObject({ composites: [], notional: [] });
  });
});
