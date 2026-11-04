/**
 * CIRSOC 301-2018 §G.6 — shear along the weak axis of an I or a channel, carried by the flanges.
 *
 * The one limit state of the steel check the engine does not have: its shear check
 * (`engine/src/postprocess/cirsoc301_check.rs`, `shear_capacity`) is G.2 on the web and G.4 on an
 * angle's legs, and reads one shear force. A member of an I or channel takes the shear that goes
 * with its strong-axis moment on the web (G.2) and the shear that goes with its weak-axis moment on
 * the flanges (here), so the app sends the engine the first and checks the second with this.
 *
 *   Aw = bf·tf per flange, both flanges;   b/tf with b = bf/2 for an I, bf for a channel;
 *   kv = 1,2;   Cv as G.2.1(b): 1 up to 1,10·√(kv·E/Fy), 1,10·√(kv·E/Fy)/(b/tf) up to 1,37·√(kv·E/Fy),
 *   1,51·E·kv/((b/tf)²·Fy) beyond;   Vn = 0,6·Fy·Aw·Cv,  φv = 0,90.
 *
 * It can only lower a verdict: a failure here fails the member, and a pass here does not stand in
 * for anything the engine certifies (`cirsoc301-engine-gate.ts` confirms the engine's checks).
 * Pure; Spanish steps and localisable messages (`c301.g6.*`), as the engine's checks report them.
 */
import type { EngineMessage } from '../../../codes/message';

export interface WeakShearInput {
  Fy: number; E: number;
  /** Flange width and thickness, m. */
  b: number; tf: number;
  shape: 'I' | 'U';
}

export interface WeakShear {
  phiVn: number; Cv: number; ratio: number; Vu: number;
  messages: EngineMessage[];
}

const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** φVn along the weak axis and the ratio at `Vu` (kN). */
export function weakAxisShear(p: WeakShearInput, Vu: number): WeakShear {
  const kv = 1.2;
  const bf = p.b * 1000, tf = p.tf * 1000;
  const Aw = 2 * bf * tf;
  const bt = (p.shape === 'U' ? bf : bf / 2) / tf;
  const lim = Math.sqrt((kv * p.E) / p.Fy);
  const l1 = 1.10 * lim, l2 = 1.37 * lim;
  const Cv = bt <= l1 ? 1 : bt <= l2 ? l1 / bt : (1.51 * p.E * kv) / (bt * bt * p.Fy);
  const Vn = (0.6 * p.Fy * Aw * Cv) / 1000;
  const phiVn = 0.9 * Vn;
  const vu = Math.abs(Vu);
  const ratio = phiVn > 0 ? vu / phiVn : vu > 0 ? Infinity : 0;
  return {
    phiVn, Cv, ratio, Vu: vu,
    messages: [
      { key: 'c301.g6.title' },
      { key: 'c301.g6.flanges', params: { bf: r(bf, 1), tf: r(tf, 1), Aw: r(Aw, 0), bt: r(bt, 1) } },
      { key: 'c301.g6.cv', params: { lim1: r(l1, 1), lim2: r(l2, 1), Cv: r(Cv, 3) } },
      { key: 'c301.g.vn', params: { Fy: r(p.Fy, 1), Aw: r(Aw, 0), Cv: r(Cv, 3), Vn: r(Vn, 2), phiVn: r(phiVn, 2) } },
      { key: 'c301.demand', params: { what: 'Vu', value: r(vu, 2), ratio: r(ratio, 3) } },
    ],
  };
}
