/**
 * More moment must never buy less steel.
 *
 * ── The shape of the bug ───────────────────────────────────────────
 *
 * `checkFlexure` has three doubly-reinforced paths, and all three design to
 * the same anchor: c = 3/7·d, the section at εt = 4 ‰. They did not agree on
 * what φ that anchor has. One used 0.65 — the value for the compression-
 * controlled trial it had just discarded — one used φ at the trial's own
 * strain, and one used φ at 4 ‰, which is the only one of the three that
 * describes the section being designed.
 *
 * So as the moment rose and the code crossed from one path to the next, the
 * required steel FELL: 36.5 cm² at Mu = 390 kN·m, 30.2 cm² at Mu = 400, on a
 * 20 × 50 beam. Seventeen per cent cheaper for carrying more load.
 *
 * Nothing built to those numbers was light — 0.65 is the conservative end of
 * the pair — but a design tool that gets cheaper as the load grows is saying
 * something false about the section, and a reader sweeping a load case would
 * have watched the answer walk backwards.
 *
 * ── Why a sweep and not three cases ────────────────────────────────
 *
 * The defect lives exactly at the handover between branches, and where those
 * handovers fall depends on b, h, f'c and fy. Picking sample moments would
 * have missed it — the original spot check at Mu = 300 and 500 passed while
 * the gap sat at 400. A sweep finds the boundary wherever it is.
 */

import { describe, it, expect } from 'vitest';
import { checkFlexure } from '../cirsoc201';

interface Section { b: number; h: number; fc: number; fy: number; label: string }

const SECTIONS: Section[] = [
  { b: 0.20, h: 0.50, fc: 25, fy: 420, label: 'the reported 20 × 50' },
  { b: 0.30, h: 0.60, fc: 25, fy: 420, label: 'a deeper 30 × 60' },
  { b: 0.12, h: 0.40, fc: 25, fy: 420, label: "the workbook's narrow 12 × 40" },
  { b: 0.25, h: 0.45, fc: 30, fy: 420, label: 'stronger concrete' },
  /* fy ≠ 420 also exercises the yield strain the φ ramp used to hardcode. */
  { b: 0.20, h: 0.50, fc: 25, fy: 500, label: 'fy = 500' },
  { b: 0.40, h: 0.80, fc: 20, fy: 420, label: 'weak concrete, big section' },
];

describe('the required steel rises with the moment', () => {
  for (const s of SECTIONS) {
    it(`${s.label}: never falls, at any moment`, () => {
      const params = {
        fc: s.fc, fy: s.fy, cover: 0.03, b: s.b, h: s.h, stirrupDia: 8,
      };
      let previous = 0;
      let previousMu = 0;
      for (let Mu = 20; Mu <= 1200; Mu += 5) {
        const r = checkFlexure(params, Mu);
        if (!Number.isFinite(r.AsReq)) continue;
        expect(
          r.AsReq,
          `Mu ${previousMu} → ${Mu}: As went ${previous.toFixed(2)} → ${r.AsReq.toFixed(2)} cm²`,
        ).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = r.AsReq;
        previousMu = Mu;
      }
    });
  }

  it('and the capacity it reports rises with it', () => {
    /*
     * The other half. Steel could rise monotonically while the reported
     * capacity jumped around, which is the same inconsistency seen from the
     * other side — the bars are chosen from a catalogue, so φMn moves in
     * steps, but never downward.
     */
    const params = { fc: 25, fy: 420, cover: 0.03, b: 0.20, h: 0.50, stirrupDia: 8 };
    let previous = 0;
    for (let Mu = 20; Mu <= 600; Mu += 5) {
      const r = checkFlexure(params, Mu);
      if (!Number.isFinite(r.phiMn)) continue;
      /*
       * Only while the section still works. Once it is over-reinforced the
       * next bar genuinely BUYS LESS: it pushes the neutral axis down, εt
       * falls, φ falls with it, and φMn drops even as the steel rises. That
       * is real behaviour and the reason the section is reported as failing
       * — reading it as a regression would be reading the physics backwards.
       */
      if (r.status === 'fail') continue;
      expect(r.phiMn, `Mu = ${Mu}`).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = r.phiMn;
    }
  });
});

/*
 * ── Two things this file deliberately does NOT assert ──────────────
 *
 * Both are real, both sit inside `checkFlexure`, and both want a decision
 * that is not this review's to make — it is PRO's flexural estimator, used
 * by `footing-flexure.ts`, so changing what it reports moves numbers well
 * outside the section calculator.
 *
 * 1. `epsilonT` is computed from `AsFlexural` alone, through the singly-
 *    reinforced stress block. For a DOUBLY reinforced section that is the
 *    wrong section: the compression steel raises the neutral axis, so the
 *    real strain is larger than the number reported. On a 20 × 50 at
 *    Mu = 315 kN·m it prints 1.86 ‰ for a section the branch above it
 *    anchored at 4 ‰. The reported strain, not the design, is what is off.
 *
 * 2. `status` is derived from `Mu/φMn` and never consults εt, so a section
 *    whose reported strain is below §10.3.5's 4 ‰ floor can still come back
 *    `ok`. Given (1), the reported strain cannot currently be trusted to
 *    gate it — fixing the report has to come first.
 *
 * The section calculator is not exposed to either: it runs on `solveFlex`,
 * which takes εt from the same interaction curve that produced the capacity
 * and cannot describe two different sections.
 */
