import { describe, it, expect, vi } from 'vitest';

vi.mock('../../plastic/solve-limit', async (orig) => ({ ...(await orig<object>()), solveLimit: () => null }));

import { modelStore } from '../../../store/model.svelte';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import { methodById } from '../methods';
import { noSolutionNote, type PlasticCase } from '../plastic-common';
import type { Block, StepDoc } from '../doc';
import type { MethodContext } from '../registry';

const notes = (doc: StepDoc) => doc.steps.flatMap((s) => s.blocks).flatMap((b: Block) => (b.kind === 'note' ? [b.text.key] : []));

describe('when the limit search returns nothing', () => {
  it('a beam that does collapse step by step is inconclusive, never "does not collapse"', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    const input = { ...modelStore.buildSolverInput(false)!, loads: [{ type: 'distributed' as const, data: { elementId: e, qI: -10, qJ: 10 } }] };
    const ctx: MethodContext = { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] }, options: {} };
    for (const id of ['plasticKinematic', 'plasticStatic']) expect(notes(methodById(id)!.build!(ctx))).toEqual(['course.plastic.doc.inconclusive']);
  });

  it('says it does not collapse only when the step-by-step analysis ran to the end without a mechanism', () => {
    const pc = (r: Partial<NonNullable<PlasticCase['incrementalResult']>> | null) => ({ incrementalResult: r } as PlasticCase);
    const key = (c: PlasticCase) => (noSolutionNote(c) as Extract<Block, { kind: 'note' }>).text.key;
    expect(key(pc({ isMechanism: false }))).toBe('course.plastic.doc.noCollapse');
    expect(key(pc({ isMechanism: true, collapseFactor: 3 }))).toBe('course.plastic.doc.inconclusive');
    expect(key(pc({ isMechanism: false, unresolved: true }))).toBe('course.plastic.doc.inconclusive');
    expect(key(pc(null))).toBe('course.plastic.doc.inconclusive');
  });
});
