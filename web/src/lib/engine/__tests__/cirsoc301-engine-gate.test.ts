/**
 * The CIRSOC 301 engine gate: a steel pass stands only when the engine's certified check
 * confirms it on the exact input (`codes/argentina/cirsoc301-engine-gate.ts`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { verifySteelElement, type SteelDesignParams } from '../codes/argentina/cirsoc301';
import { engineGateSteel } from '../codes/argentina/cirsoc301-engine-gate';
import { registerCirsoc301Kernel } from '../codes/argentina/cirsoc301-kernel';
import { checkSteelMember } from '../verification-service';
import * as wasm from '../../wasm/dedaliano_engine.js';

const IPN180: SteelDesignParams = {
  Fy: 235, Fu: 370, E: 200_000, A: 27.9e-4, Iz: 1450e-8, Iy: 81.3e-8, h: 0.18, b: 0.082, tw: 0.0069,
  tf: 0.0104, Zx: 187e-6, Sx: 161e-6, J: 7.89e-8, L: 5, Lb: 0, shape: 'I',
};

const restore = () => registerCirsoc301Kernel({ check: wasm.check_cirsoc301_members, certify: wasm.certify_cirsoc301_members });

describe('CIRSOC 301 engine gate', () => {
  afterEach(restore);

  it('a pass the certified check confirms stands, with its enclosure', () => {
    const f = { Nu: 0, Muz: 20, Muy: 0, Vu: 30 };
    const v = verifySteelElement({ elementId: 3, ...f, params: IPN180 });
    expect(v.overallStatus).toBe('ok');
    const g = engineGateSteel(v, IPN180, [f]);
    expect(g.overallStatus).toBe('ok');
    expect(g.engineRecheck.certifiedOk).toBe(true);
    expect(g.engineRecheck.utilizationLower!).toBeLessThanOrEqual(v.engine.unityRatio);
    expect(v.engine.unityRatio).toBeLessThanOrEqual(g.engineRecheck.utilizationUpper!);
  });

  it('a pass the engine does not confirm becomes a failure with VERIF_ENGINE_DISAGREES', () => {
    // The verdict computed for a small moment, gated against the demand actually carried.
    const v = verifySteelElement({ elementId: 3, Nu: 0, Muz: 5, Muy: 0, Vu: 0, params: IPN180 });
    expect(v.overallStatus).toBe('ok');
    const g = engineGateSteel(v, IPN180, [{ Nu: 0, Muz: 60, Muy: 0, Vu: 0 }]);
    expect(g.overallStatus).toBe('fail');
    expect(g.flexureZ.status).toBe('fail');
    expect(g.engineRecheck.disagrees).toBe(true);
    expect(g.diagnostics!.map((d) => d.code)).toContain('VERIF_ENGINE_DISAGREES');
  });

  it('a pass at a ratio the engine cannot certify below 1 is not confirmed', () => {
    // A loaded check the engine refuses (tension with no end connection) is never certified.
    const v = verifySteelElement({ elementId: 3, Nu: 0, Muz: 5, Muy: 0, Vu: 0, params: IPN180 });
    const g = engineGateSteel(v, IPN180, [{ Nu: -10, Muz: 5, Muy: 0, Vu: 0 }]);
    expect(g.overallStatus).toBe('fail');
    expect(g.engineRecheck.certified).toBe(false);
  });

  it('no engine: the verifier and the gate both fail, never pass by default', () => {
    registerCirsoc301Kernel(null);
    const f = { Nu: 0, Muz: 1, Muy: 0, Vu: 1 };
    const v = verifySteelElement({ elementId: 3, ...f, params: IPN180 });
    expect(v.overallStatus).toBe('fail');
    expect(v.engine.available).toBe(false);
    expect(v.flexureZ.notEvaluatedMessage?.key).toBe('c301.refuse.engineUnavailable');
    const fake = { ...v, overallStatus: 'ok' as const };
    const g = engineGateSteel(fake, IPN180, [f]);
    expect(g.overallStatus).toBe('fail');
    expect(g.engineRecheck.unavailable).toBe(true);
    expect(g.diagnostics!.map((d) => d.code)).toContain('VERIF_ENGINE_UNAVAILABLE');
  });

  it('checkSteelMember — the path of the verifier, the optimiser and the tables — is gated', () => {
    const r = checkSteelMember(
      1,
      { Nc: 0, Nt: 0, MuStrong: 10, MuWeak: 0, Vu: 20, diagram: [] },
      { a: 27.9e-4, iy: 1450e-8, iz: 81.3e-8, h: 0.18, b: 0.082, tw: 0.0069, tf: 0.0104, j: 7.89e-8, shape: 'I' },
      { fy: 235, fu: 370, e: 200_000 },
      { L: 2, Lb: 0.5 },
    )!;
    expect(r.engineRecheck).toBeDefined();
    expect(r.overallStatus === 'ok').toBe(r.engineRecheck.certifiedOk);
  });
});
