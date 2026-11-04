/**
 * A wall's P–M checks take φ from CIRSOC 201-2025 Tabla 21.2.2, ADN 500 (εty = 0,0025), at the
 * axial load where the extreme bar strains εt = 0,004: φ = 0,65 + 0,25·(0,004 − 0,0025)/0,003 =
 * 0,775. (The 2005 ramp, εy to 0,005, gives 0,80.)
 *
 * The hand section: a rectangle b × t, compressed on one face, the Whitney block a = 0,85·c, each
 * bar εs = 0,003·(c − ds)/c, fs = Es·εs within ±fy, the concrete a compressed bar displaces taken
 * out. c is fixed by εt = 0,004 at the farthest bar; Pu = φ·Pn and the capacity there φ·Mn.
 */
import { describe, it, expect } from 'vitest';
import { wallInPlane, wallOutOfPlane, wallVerticalBars } from '../wall-member';
import type { WallReinforcement } from '../../../design-contract/reinforcement';

const fc = 25, fy = 500, Es = 200000, ecu = 0.003, fcd = 0.85 * fc * 1000;
const phi = 0.65 + 0.25 * (0.004 - 0.0025) / 0.003;

/** Bars as (depth from the compressed face, area); moment about the mid-depth `half`. */
function hand(width: number, half: number, bars: Array<{ ds: number; area: number }>) {
  const dt = Math.max(...bars.map((x) => x.ds));
  const c = ecu * dt / (ecu + 0.004);
  const a = 0.85 * c;
  let N = fcd * width * a, M = fcd * width * a * (half - a / 2);
  for (const x of bars) {
    const eps = ecu * (c - x.ds) / c;
    const fs = Math.max(-fy, Math.min(fy, Es * eps)) * 1000 - (eps > 0 && x.ds <= a ? fcd : 0);
    N += x.area * fs; M += x.area * fs * (half - x.ds);
  }
  return { N, M };
}

const r: WallReinforcement = { vertical: { diameter: 12, spacing: 0.2 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 2 };
const a12 = Math.PI * 0.012 ** 2 / 4;

describe('a wall, ADN 500, in the transition zone', () => {
  it('out of its plane: a metre strip, both curtains', () => {
    // t = 0,20; the curtains at ±(0,10 − 0,025 − 0,010 − 0,006) = ±0,059; 5Ø12 per metre each.
    const t = 0.2, y = t / 2 - 0.025 - 0.010 - 0.006;
    const { N, M } = hand(1, t / 2, [{ ds: t / 2 - y, area: a12 / 0.2 }, { ds: t / 2 + y, area: a12 / 0.2 }]);
    const length = 3;
    const muV = 40;
    const [v] = wallOutOfPlane({ length, thickness: t, cover: 0.025, fc, fy, pu: phi * N * length, muV, muH: 0, r });
    expect(muV / v!.utilization).toBeCloseTo(phi * M, 1);
  });

  it('in its plane: the length as the depth', () => {
    const length = 2, t = 0.2;
    const bars = wallVerticalBars(length, t, 0.025, r);
    // Compression at −x: a bar's depth is length/2 + x.
    const { N, M } = hand(t, length / 2, bars.map((x) => ({ ds: length / 2 + x.x, area: x.area })));
    const mu = 500;
    const res = wallInPlane({ length, thickness: t, cover: 0.025, fc, fy, pu: phi * N, mu, r });
    expect(res.phiMn).toBeCloseTo(phi * M, 0);
  });
});
