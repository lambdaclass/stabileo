import { afterEach, expect, it, vi } from 'vitest';
import '..';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import { regulationsStore } from '../regulations.svelte';
import { memberConformityGates } from '../detailing-conformity-gates';
import { cirsoc201Adapter } from '../../engine/design/adapters/cirsoc201-adapter';
import { syntheticBeamContext } from '../../engine/design/__tests__/helpers';
import type { MemberDesignOutcome } from '../../engine/design/outcome';

afterEach(() => { vi.restoreAllMocks(); detailingStore.clear(); verificationStore.clear(); });

it('reverifies a tentative assignment against its own column cages, not the saved neighbours', () => {
  vi.spyOn(regulationsStore, 'concreteDesignCode').mockReturnValue('cirsoc');
  const verify = vi.spyOn(cirsoc201Adapter, 'verify').mockReturnValue({ overallStatus: 'ok' } as never);
  const ctx = { ...syntheticBeamContext({ elementId: 2 }), columnCages: new Map([[1, 25]]),
    columnBars: new Map([[1, { count: 8, diameterMm: 25 }]]) };
  const reinforcement = { regions: { bottomSpan: { count: 4, diameter: 16 } } };
  const outcomes = new Map([[2, { elementId: 2, outcome: 'VERIFIED', accepted: reinforcement } as MemberDesignOutcome]]);
  const loss = { bottomRaise: 0.01, topLower: 0, depthTolerance: 0.015 };
  expect(memberConformityGates(outcomes, new Map([[2, ctx]])).reverify!(2, loss)).toBe('ok');
  expect(verify).toHaveBeenCalledWith({ ...ctx, finalGeometry: loss }, reinforcement);
  expect(ctx.finalGeometry).toBeUndefined();
});

it('a persisted final-depth failure blocks a nominal pass and clears only with new assemblies', () => {
  vi.spyOn(verificationStore, 'localStatus').mockReturnValue('ok');
  const assembly = { id: 'floor', elementIds: [7, 8], bars: [], conflicts: [], unsupported: [{
    key: 'detailing.finalVerification.failed', scope: { elementIds: [7] },
    params: { element: 7 }, message: 'failed at final depth', refs: [],
  }] };
  detailingStore.setAssemblies([assembly] as never);
  expect(verificationStore.memberVerdict(7)).toMatchObject({ local: 'ok', status: 'fail',
    holds: [expect.objectContaining({ kind: 'detailing' })] });
  expect(verificationStore.memberVerdict(8).status).toBe('ok');
  // Read a fresh persisted copy, without any live final-verification callback.
  detailingStore.setAssemblies(JSON.parse(JSON.stringify([assembly])));
  expect(verificationStore.memberVerdict(7).status).toBe('fail');
  detailingStore.setAssemblies([{ ...assembly, unsupported: [] }] as never);
  expect(verificationStore.memberVerdict(7).status).toBe('ok');
});
