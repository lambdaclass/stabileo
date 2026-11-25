import { beforeEach, describe, expect, it } from 'vitest';
import { solvePDelta } from '../../engine/wasm-solver';
import { modelStore, uiStore } from '..';

const length = 2;
const qI = -4;
const qJ = -2;
const reaction = -(qI + qJ) * length / 2;

beforeEach(() => {
  uiStore.analysisMode = '2d';
  modelStore.clear();
  modelStore.model.loadCases = [{ id: 1, name: 'Test load', type: 'D' }];
  modelStore.model.combinations = [{ id: 1, name: 'Test combination', factors: [{ caseId: 1, factor: 1 }] }];
});

function distributedCantilever(plane: 'xy' | 'xz' | 'yz') {
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(plane === 'yz' ? 0 : length, plane === 'yz' ? length : 0, 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
  return { root, member };
}

async function expectProjectedLoad(plane: 'xy' | 'xz' | 'yz', root: number, member: number) {
  const expected = { reactions: [{ nodeId: root, rz: expect.closeTo(reaction, 12) }] };
  expect.soft(modelStore.solve(false, plane), 'linear').toMatchObject(expected);
  expect.soft(await modelStore.solveAsync(false, plane), 'async').toMatchObject(expected);

  const combined = modelStore.solveCombinations(false, plane);
  expect.soft(typeof combined === 'object' && combined?.perCase.get(1), 'load case').toMatchObject(expected);
  expect.soft(typeof combined === 'object' && combined?.perCombo.get(1), 'combination').toMatchObject(expected);

  const input = modelStore.buildSolverInput(false, plane);
  expect(input?.loads).toMatchObject([{ type: 'distributed', data: { elementId: member, qI, qJ } }]);
  expect(solvePDelta(input!)).toMatchObject({ converged: true, results: expected });
}

describe.skipIf(process.env.STABILEO_REPRODUCE_XY_LOAD !== '1')('known wrong result: #2583', () => {
  it('uses qY for a spatial distributed load in XY', async () => {
    const { root, member } = distributedCantilever('xy');
    modelStore.addDistributedLoad3D(member, qI, qJ, 0, 0);
    await expectProjectedLoad('xy', root, member);
  });
});

it.each(['xz', 'yz'] as const)('uses qZ for a spatial distributed load in %s', async plane => {
  const { root, member } = distributedCantilever(plane);
  modelStore.addDistributedLoad3D(member, 0, 0, qI, qJ);
  await expectProjectedLoad(plane, root, member);
});

it.each(['xy', 'xz', 'yz'] as const)('refuses to discard the other spatial load component in %s', async plane => {
  const { member } = distributedCantilever(plane);
  modelStore.addDistributedLoad3D(member, qI, qJ, qJ, qI, undefined, undefined, 1, { frame: 'global' });
  const refused = expect.stringMatching(/refus/i);
  expect.soft(modelStore.solve(false, plane)).toEqual(refused);
  expect.soft(await modelStore.solveAsync(false, plane)).toEqual(refused);
  expect.soft(modelStore.solveCombinations(false, plane)).toEqual(refused);
  expect(() => modelStore.buildSolverInput(false, plane)).toThrow(/refus/i);
});
