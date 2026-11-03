import { beforeEach, describe, expect, it } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import type { MethodContext } from '../registry';
import { fromSelection, chosenInput, setInfluenceDocInput } from '../methods/influence';
import { supportReaction } from '../../influence/quantities';

beforeEach(() => { modelStore.clear(); });

function picked(node: number) {
  const input = modelStore.buildSolverInput(false)!;
  const ctx: MethodContext = { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [node] }, options: {} };
  return fromSelection(ctx)!.input;
}

describe('a selected support explains a reaction it develops', () => {
  it('a vertical roller holds only x: the line is for Rx', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerZ');
    const q = picked(b);
    expect(q.quantity).toBe('Rx');
    expect(q.target).toEqual({ kind: 'node', nodeId: b });
  });

  it('a rotational spring alone gives My', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');
    const s = modelStore.addSupport(b, 'spring');
    modelStore.updateSupport(s, { kx: 0, ky: 0, kz: 500 });
    expect(picked(b).quantity).toBe('My');
  });

  it('a horizontal roller and a fixed end keep Rz', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX');
    expect(picked(b).quantity).toBe('Rz');
    expect(picked(a).quantity).toBe('Rz');
  });
});

describe('supportReaction', () => {
  it('reads what each support holds, Rz first', () => {
    expect(supportReaction({ type: 'fixed' })).toBe('Rz');
    expect(supportReaction({ type: 'pinned' })).toBe('Rz');
    expect(supportReaction({ type: 'rollerX' })).toBe('Rz');
    expect(supportReaction({ type: 'rollerZ' })).toBe('Rx');
    expect(supportReaction({ type: 'inclinedRoller' }, Math.cos(Math.PI / 6))).toBe('Rz');
    expect(supportReaction({ type: 'inclinedRoller' }, 0)).toBe('Rx');
    expect(supportReaction({ type: 'spring', kx: 100 })).toBe('Rx');
    expect(supportReaction({ type: 'spring', ky: 100, kz: 5 })).toBe('Rz');
    expect(supportReaction({ type: 'spring', kz: 5 })).toBe('My');
    expect(supportReaction({ type: 'spring' })).toBeNull();
    expect(supportReaction({ type: 'pinned', restrainedDofs: [false, false, true] })).toBe('My');
  });
});

describe('the line handed over from the tool holds for the structure it was drawn on', () => {
  const ctxOf = () => {
    const input = modelStore.buildSolverInput(false)!;
    return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] }, options: {} } as MethodContext;
  };
  const doc = (id: number) => ({ quantity: 'V' as const, target: { kind: 'section' as const, elementId: id, t: 0.25 }, direction: 'vertical' as const, loads: { g: 1, q: 2, P: 3 }, placement: 'zones' as const });

  it('on the same structure the document explains the tool\'s line; on another model with the same ids it chooses again', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    setInfluenceDocInput(doc(e), modelStore.buildSolverInput(false));
    expect(chosenInput(ctxOf())).toEqual({ input: doc(e), defaulted: false });
    modelStore.clear();
    const c = modelStore.addNode(0, 0), d = modelStore.addNode(10, 0);
    const f = modelStore.addElement(c, d);
    modelStore.addSupport(c, 'fixed');
    expect(f).toBe(e);
    const again = chosenInput(ctxOf())!;
    expect(again.defaulted).toBe(true);
    expect(again.input.quantity).toBe('M');
    expect(again.input.target).toEqual({ kind: 'section', elementId: f, t: 0.5 });
    setInfluenceDocInput(null);
  });
});
