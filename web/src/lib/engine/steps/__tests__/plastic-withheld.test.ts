/**
 * The catalog's plastic methods apply only where the engine releases the collapse factor they are
 * compared against: a factor the exact certificate does not confirm keeps them withheld (#758).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

const refuse = { on: false };
vi.mock('../../wasm-solver', async (load) => {
  const real = await load<typeof import('../../wasm-solver')>();
  return {
    ...real,
    plasticLimit2D: (...args: Parameters<typeof real.plasticLimit2D>) => {
      if (refuse.on) throw '{"message":"Results withheld (known issue #758, PL-2D-INVARIANCE)"}';
      return real.plasticLimit2D(...args);
    },
  };
});

const { modelStore } = await import('../../../store/model.svelte');
const { planeModel } = await import('../plane-model');
const { solveReference } = await import('../reference');
const { methodById } = await import('../methods');
type Ctx = import('../registry').MethodContext;

let ctx: Ctx;
beforeAll(async () => {
  await modelStore.loadExample('portal-frame');
  const input = modelStore.buildSolverInput(false)!;
  ctx = { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] }, options: {} };
});

describe('plastic methods behind the #758 gate', () => {
  it('apply when the engine releases the factor, and are withheld with the known issue when it does not', () => {
    for (const id of ['plasticKinematic', 'plasticStatic']) {
      refuse.on = false;
      expect(methodById(id)!.applies(ctx)).toEqual({ ok: true });
      refuse.on = true;
      expect(methodById(id)!.applies(ctx)).toEqual({ ok: false, reason: { key: 'knownIssue.PL-2D-INVARIANCE' }, issue: 758 });
    }
    refuse.on = false;
  });
});
