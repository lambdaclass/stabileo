/**
 * Flanged sections in simple flexure — the T beam — designed against the engine.
 *
 * The engine's beam check takes the flange itself (`cirsoc201_check`: the web strip over the
 * whole block plus the overhangs (bf − bw) over min(a, hf), strain compatibility, φ of the
 * edition), and the legacy designer sizes against it (`checkFlexure` with `flange`). So there is
 * no split into "a rectangle of width bf" and "the overhangs plus a web problem" here any more:
 * that was TypeScript arithmetic, closed with fs = fy, and it is the oracle in
 * `__tests__/differential/oracle/cirsoc201-flanged.ts`.
 *
 * §9.6.1.2's minimum is ρmin·bw·d, on the WEB (the flange is in compression).
 *
 * Edition: default 2025, the edition in force; pass 2005 to reproduce the workbook.
 */

import { checkFlexure, type ConcreteDesignParams, type FlexureResult } from './cirsoc201';
import type { Cirsoc201EditionLike } from './cirsoc201-basis';
import { evaluateBeamSection } from './cirsoc201-beam-kernel';
import { Cirsoc201EngineUnavailable } from './cirsoc201-engine';

/** A T or L section: a flange on top of a web. */
export interface FlangedGeometry {
  /** Effective flange width, m. */
  bf: number;
  /** Flange thickness, m. */
  hf: number;
  /** Web width, m. */
  bw: number;
}

export interface FlangedFlexureResult extends FlexureResult {
  /** Whether the compression block stayed inside the flange (at the required steel). */
  withinFlange: boolean;
  /** Steel balancing the flange overhangs, cm² (0,85·f'c·(bf − bw)·hf / fy). Zero when `withinFlange`. */
  AsFlange: number;
}

/**
 * Design a flanged section for a moment. `params.b` is ignored; the flange geometry supplies
 * every width. `Mu` in kN·m, the flange in compression.
 */
export function checkFlexureFlanged(
  params: ConcreteDesignParams,
  geom: FlangedGeometry,
  Mu: number,
  edition: Cirsoc201EditionLike = '2025',
): FlangedFlexureResult {
  const { fc, fy } = params;
  const { bf, hf, bw } = geom;
  const r = checkFlexure({ ...params, b: bw }, Mu, 0, {
    edition: edition === '2005' ? '2005' : '2025', flange: { bf, hf },
  });
  const withinFlange = r.aReq <= hf;
  const AsFlange = withinFlange ? 0 : ((0.85 * fc * (bf - bw) * hf) / fy) * 1e4;
  return {
    ...r,
    withinFlange,
    AsFlange,
    steps: [
      withinFlange
        ? `Sección T: a ≤ hf — el bloque queda en el ala (bf = ${(bf * 100).toFixed(0)} cm)`
        : `Sección T: a > hf — el bloque entra en el alma`,
      ...r.steps,
      `As,mín se toma sobre el alma (bw = ${(bw * 100).toFixed(0)} cm) = ${r.AsMin.toFixed(2)} cm²`,
    ],
  };
}

/**
 * The depth of the compression block a given steel area produces in a T — the engine's, by
 * strain compatibility (the steel need not yield). `d` assumes a Ø16 bar, like the designer.
 */
export function flangedBlockDepth(
  params: ConcreteDesignParams,
  geom: FlangedGeometry,
  AsCm2: number,
  edition: Cirsoc201EditionLike = '2025',
): { a: number; withinFlange: boolean } {
  const { fc, fy, h, cover, stirrupDia } = params;
  const d = h - cover - stirrupDia / 1000 - 0.008;
  const r = evaluateBeamSection({
    edition: edition === '2005' ? '2005' : '2025', fc: fc * 1e6, fy: fy * 1e6, b: geom.bw, h, d,
    As: AsCm2 * 1e-4, bf: geom.bf, hf: geom.hf,
  });
  if (!r) throw new Cirsoc201EngineUnavailable('flanged block depth');
  const a = r.flexureValid ? r.a : 0;
  return { a, withinFlange: a <= geom.hf };
}
