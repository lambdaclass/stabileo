import { beforeEach, describe, expect, it } from 'vitest';
import { validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync } from '../../engine/solver-service';
import { historyStore, modelStore, uiStore } from '..';
import { deserializeProject, serializeProject } from '../file';

beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
  uiStore.includeSelfWeight = false;
});

describe.skip('known wrong result: #1928 batched commands and analyses share the edited inventories', () => {
  for (const mode of ['2d', '3d'] as const) {
    it.each(['single', 'multiple', 'case'] as const)(mode + ' keeps a removed load out of the solve after %s removal', async method => {
      uiStore.analysisMode = mode;
      const root = modelStore.addNode(0, 0, 0);
      const tip = modelStore.addNode(2, 0, 0);
      modelStore.addElement(root, tip);
      modelStore.addSupportEntry({ nodeId: root, type: mode === '2d' ? 'fixed' : 'fixed3d' });
      const add = (force: number, caseId: number) => mode === '2d'
        ? modelStore.addNodalLoad(tip, force, 0, 0, caseId)
        : modelStore.addNodalLoad3D(tip, force, 0, 0, 0, 0, 0, caseId);
      const permanent = modelStore.loadCases[0]!.id;
      const temporary = modelStore.addLoadCase('Temporary');
      const retained = add(7, permanent);
      const solve = () => mode === '2d' ? validateAndSolve2D(modelStore.model) : validateAndSolve3D(modelStore.model);
      const control = solve();
      if (!control || typeof control === 'string') throw new Error(String(control));
      const unwanted = add(13, temporary);
      const before = modelStore.snapshot();
      historyStore.clear();
      modelStore.bulkMutate(() => modelStore.bulkMutate(() => {
        if (method === 'case') modelStore.removeLoadCase(temporary);
        else if (method === 'single') expect(modelStore.removeLoad(unwanted)).toBe(true);
        else expect(modelStore.removeLoads([unwanted])).toBe(1);
      }));
      expect.soft(modelStore.loads.map(load => load.data.id)).toEqual([retained]);
      const sync = solve();
      const asyncResult = mode === '2d' ? await validateAndSolve2DAsync(modelStore.model) : await validateAndSolve3DAsync(modelStore.model);
      for (const result of [sync, asyncResult]) {
        if (!result || typeof result === 'string') throw new Error(String(result));
        expect.soft(result.reactions).toEqual(control.reactions);
      }
      expect(historyStore.undoCount).toBe(1);
      historyStore.undo();
      expect(modelStore.snapshot()).toEqual(before);
      historyStore.redo();
      expect(deserializeProject(serializeProject())).toBe(true);
      expect(modelStore.loads.map(load => load.data.id)).toEqual([retained]);
    });
  }

  it('updates a newly added load in working snapshots and the published list', () => {
    const node = modelStore.addNode(0, 0, 0);
    modelStore.bulkMutate(() => {
      const id = modelStore.addNodalLoad(node, 1, 0);
      expect.soft(modelStore.updateLoad(id, { fx: 9 })).toBe(true);
      expect.soft(modelStore.snapshot().loads).toMatchObject([{ data: { id, fx: 9 } }]);
    });
    expect(modelStore.loads).toMatchObject([{ data: { fx: 9 } }]);
  });

  it('keeps cleared and welded constraints out of the committed model', () => {
    const [a, b, c] = [0, 1, 2].map(x => modelStore.addNode(x, 0, 0)) as [number, number, number];
    modelStore.addConstraint({ type: 'equalDOF', masterNode: a, slaveNode: c, dofs: [0] });
    modelStore.bulkMutate(() => {
      modelStore.clearConstraints();
      modelStore.addConstraint({ type: 'equalDOF', masterNode: b, slaveNode: c, dofs: [0] });
      modelStore.remapNodeReferences(new Map([[b, a]]));
      expect.soft(modelStore.snapshot().constraints).toEqual([{ type: 'equalDOF', masterNode: a, slaveNode: c, dofs: [0] }]);
      modelStore.remapNodeReferences(new Map([[c, a]]));
    });
    expect(modelStore.model.constraints).toEqual([]);
  });
});

describe.skip('known wrong result: #1928 load arrays share single-entry alias validation', () => {
  it.each([false, true])('converts compatible aliases and refuses the entire conflicting array, bulk=%s', bulk => {
    const nodeId = modelStore.addNode(0, 0, 0);
    const record = (extra: Record<string, number>) => ({ type: 'nodal', data: { id: 0, nodeId, fx: 0, fy: 2, mz: 3, ...extra } } as never);
    const edit = () => {
      const id = modelStore.addLoadEntry(record({}));
      const [next] = modelStore.addLoadEntries([record({})]);
      expect.soft(modelStore.model.loads.find(load => load.data.id === next)).toEqual({ type: 'nodal', data: { id: next, nodeId, fx: 0, fz: 2, my: 3 } });
      const before = modelStore.snapshot();
      const undoCount = historyStore.undoCount;
      expect.soft(() => modelStore.addLoadEntries([record({}), record({ my: -3 })])).toThrow();
      expect.soft(modelStore.snapshot()).toEqual(before);
      expect.soft(historyStore.undoCount).toBe(undoCount);
      expect.soft(modelStore.addLoadEntry(record({}))).toBe(id + 2);
    };
    if (bulk) modelStore.bulkMutate(edit);
    else edit();
  });
});
