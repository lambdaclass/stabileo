/**
 * The figures the column sheets draw, computed from the result — pure, so the
 * panel only decides where they go.
 */
import type { FlexCase, FlexInput, FlexMode, FlexOutput } from '../../lib/engine/codes/argentina/cirsoc-flex';
import type { Materials } from '../../lib/engine/codes/argentina/cirsoc201-section';
import { characteristicPointsBothEdges } from '../../lib/engine/codes/argentina/cirsoc-flex-points';
import { diagramSeries } from '../../lib/engine/codes/argentina/cirsoc-flex-diagram';
import { surfaceCut } from '../../lib/engine/codes/argentina/cirsoc-flex-surface';
import { facesA1A2A3 } from '../../lib/engine/codes/argentina/cirsoc201-layouts';

type Result = FlexOutput | null | undefined;

/** The six characteristic points of the verification sheets, each edge computed on its own. */
export function characteristicPoints(r: Result, mat: Materials, kase: FlexCase, mode: FlexMode) {
  if (!r || mode !== 'verify') return null;
  if (kase !== 'FCR' && kase !== 'FCR-CIR') return null;
  try { return characteristicPointsBothEdges(r.outline, r.bars, mat); } catch { return null; }
}

/**
 * The diagram the column sheets plot: both curves, both edges, the demand,
 * and — on the verification sheets — the resistance at the demand's own
 * eccentricity with the ray through them. Moments signed as the sheet signs
 * them, so a negative Mu lands on the left, against the edge it compresses.
 */
export function columnDiagram(r: Result, mat: Materials, kase: FlexCase, mode: FlexMode, Pu: number, Mu: number) {
  if (!r || (kase !== 'FCR' && kase !== 'FCR-CIR')) return null;
  try {
    const s = diagramSeries(r.outline, r.bars, mat, 160);
    if (s.capped.length < 3) return null;
    const hasDemand = Math.abs(Pu) > 1e-9 || Math.abs(Mu) > 1e-9;
    return {
      ...s,
      demand: hasDemand ? { m: Mu, n: Pu } : null,
      resistance: mode === 'verify' && hasDemand && r.phiMn !== undefined
        ? { m: Math.sign(Mu || 1) * r.phiMn, n: r.phiPn ?? 0 }
        : null,
    };
  } catch { return null; }
}

/**
 * FCO's section 5, the surface cut at the fixed axial load.
 *
 * Sizing draws the contours for 1 % … 8 % and the adopted ratio's over them;
 * checking draws the contour of the steel given. Traced in 24 steps of the
 * neutral-axis angle — the sheet's 12, halved, so the curve reads as one.
 */
export function fcoSurfaceCut(
  r: Result, i: FlexInput, mat: Materials, kase: FlexCase, mode: FlexMode, Pu: number, Mu: number, Muy: number,
) {
  if (!r || kase !== 'FCO') return null;
  try {
    const bars = (astCm2: number) => facesA1A2A3(
      i.b, i.h, i.dPrimeH, i.dPrimeV, astCm2,
      { a1: i.pctA1, a2: i.pctA2, a3: i.pctA3 }, { n1: i.nA1, n2: i.nA2, n3: i.nA3 },
    );
    const q = { sx: Mu < 0 ? -1 : 1, sy: Muy < 0 ? -1 : 1, steps: 24 };
    const trace = (astCm2: number) => surfaceCut(r.outline, bars(astCm2), mat, Pu, q)
      .map((p) => ({ mx: p.phiMnx, my: p.phiMny }));
    const AgCm2 = r.AstCm2 / r.rho;
    const curves: Array<{ label: string; points: Array<{ mx: number; my: number }>; emphasis?: boolean }> =
      mode === 'design'
        ? [1, 2, 3, 4, 5, 6, 7, 8].map((pc) => ({ label: `${pc} %`, points: trace((pc / 100) * AgCm2) }))
        : [];
    curves.push({ label: `${(r.rho * 100).toFixed(2)} %`, points: trace(r.AstCm2), emphasis: true });
    const Mres = Math.hypot(Mu, Muy);
    const hasDemand = Mres > 1e-9;
    return {
      curves,
      demand: hasDemand ? { mx: Mu, my: Muy } : null,
      resistance: mode === 'verify' && hasDemand && r.phiMn
        ? { mx: (Mu * r.phiMn) / Mres, my: (Muy * r.phiMn) / Mres } : null,
    };
  } catch { return null; }
}

/** The bar layout the biaxial sheets tabulate: one row per bar, with its place. */
export function fcoBarTable(r: Result, kase: FlexCase) {
  if (!r || kase !== 'FCO') return [];
  return r.bars.map((bar, k) => ({ n: k + 1, area: bar.area * 1e4, x: bar.x, y: bar.y }));
}
