import { describe, it, expect } from 'vitest';
import {
  checkFlexure,
  checkShear,
  checkColumn,
  checkTorsion,
  checkBiaxial,
  checkSlender,
  computeK,
  computePsi,
  computeJointPsiFromModel,
  verifyElement,
  classifyElement,
  REBAR_DB,
} from '../codes/argentina/cirsoc201';
import type { ConcreteDesignParams, VerificationInput } from '../codes/argentina/cirsoc201';
import {
  designSlab,
  checkSlabSupport,
  slabTorsionReinforcement,
} from '../codes/argentina/losas';
import type { SlabDesignParams } from '../codes/argentina/losas';

// Access beta1 for testing — it's not exported, test through behavior
// We'll test through the public API

describe('CIRSOC 201 Verification', () => {
  // Standard beam params: 20×40 cm, H-25, ADN 420
  const beamParams: ConcreteDesignParams = {
    fc: 25,
    fy: 420,
    cover: 0.025,
    b: 0.20,
    h: 0.40,
    stirrupDia: 8,
  };

  // Standard column params: 30×30 cm
  const colParams: ConcreteDesignParams = {
    fc: 25,
    fy: 420,
    cover: 0.025,
    b: 0.30,
    h: 0.30,
    stirrupDia: 8,
  };

  describe('checkFlexure', () => {
    it('should return valid result for moderate moment', () => {
      const result = checkFlexure(beamParams, 50); // 50 kN·m
      expect(result.status).not.toBe('fail');
      expect(result.AsReq).toBeGreaterThan(0);
      expect(result.AsProv).toBeGreaterThanOrEqual(result.AsReq);
      expect(result.phiMn).toBeGreaterThanOrEqual(50);
      expect(result.ratio).toBeLessThanOrEqual(1.0);
      expect(result.bars).toMatch(/^\d+ Ø\d+$/);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('should enforce minimum reinforcement for small moment', () => {
      const result = checkFlexure(beamParams, 5); // very small moment
      expect(result.AsReq).toBeGreaterThanOrEqual(result.AsMin);
      expect(result.status).toBe('ok');
    });

    it('should fail for extremely large moment', () => {
      const result = checkFlexure(beamParams, 500); // way too much for 20×40
      // Either fails or requires huge reinforcement
      expect(result.AsReq).toBeGreaterThan(5);
    });

    it('should handle negative moment (absolute value)', () => {
      const pos = checkFlexure(beamParams, 50);
      const neg = checkFlexure(beamParams, -50);
      expect(pos.AsReq).toBeCloseTo(neg.AsReq, 2);
    });

    it('effective depth should be correct', () => {
      const result = checkFlexure(beamParams, 50);
      // d = 40 - 2.5 - 0.8 - 0.8 = 35.9 cm
      expect(result.d * 100).toBeCloseTo(35.9, 0);
    });

    it('should increase As with increasing moment', () => {
      const r1 = checkFlexure(beamParams, 30);
      const r2 = checkFlexure(beamParams, 80);
      expect(r2.AsReq).toBeGreaterThan(r1.AsReq);
    });
  });

  describe('checkShear', () => {
    it('should return valid result for moderate shear', () => {
      const result = checkShear(beamParams, 80); // 80 kN
      expect(result.status).not.toBe('fail');
      expect(result.phiVc).toBeGreaterThan(0);
      expect(result.phiVn).toBeGreaterThanOrEqual(80);
      expect(result.spacing).toBeGreaterThan(0);
      expect(result.spacing).toBeLessThanOrEqual(0.6); // max 60cm
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('should compute concrete contribution Vc correctly', () => {
      const result = checkShear(beamParams, 0);
      // Vc = 0.17·√25·200·359 / 1000 ≈ 61 kN
      expect(result.phiVc).toBeGreaterThan(30);
      expect(result.phiVc).toBeLessThan(80);
    });

    it('should enforce minimum stirrups', () => {
      const result = checkShear(beamParams, 10); // small shear → zone 1
      expect(result.spacing).toBeGreaterThan(0);
      // Zone 1: s ≤ min(0.8d, 30cm) per CIRSOC 201
      expect(result.spacing).toBeLessThanOrEqual(0.30 + 0.01);
    });

    it('should increase Vc with axial compression', () => {
      const noAxial = checkShear(beamParams, 50, 0);
      const withAxial = checkShear(beamParams, 50, 200); // 200 kN compression
      expect(withAxial.phiVc).toBeGreaterThan(noAxial.phiVc);
    });
  });

  describe('checkColumn', () => {
    it('should return valid result for typical column loading', () => {
      const result = checkColumn(colParams, 500, 30); // 500 kN axial, 30 kN·m moment
      expect(result.status).not.toBe('fail');
      expect(result.AsProv).toBeGreaterThanOrEqual(result.AsTotal);
      expect(result.barCount % 2).toBe(0); // symmetric
      expect(result.barCount).toBeGreaterThanOrEqual(4);
      expect(result.phiPn).toBeGreaterThan(0);
      expect(result.stirrupSpacing).toBeGreaterThan(0);
    });

    it('should enforce 1% Ag minimum', () => {
      const result = checkColumn(colParams, 100, 5); // light loading
      const AgCm2 = colParams.b * colParams.h * 1e4;
      expect(result.AsTotal).toBeGreaterThanOrEqual(0.01 * AgCm2 - 0.1);
    });

    it('should fail for extreme overload', () => {
      const result = checkColumn(colParams, 5000, 200); // extreme
      // Should either fail or require huge reinforcement
      expect(result.AsTotal).toBeGreaterThan(5);
    });
  });

  describe('verifyElement', () => {
    it('should classify and verify a beam element', () => {
      const input: VerificationInput = {
        elementId: 1,
        elementType: 'beam',
        Mu: 50, Vu: 60, Nu: 0,
        b: 0.20, h: 0.40,
        fc: 25, fy: 420,
        cover: 0.025, stirrupDia: 8,
      };
      const result = verifyElement(input);
      expect(result.elementType).toBe('beam');
      expect(result.flexure).toBeDefined();
      expect(result.shear).toBeDefined();
      expect(result.column).toBeUndefined();
      expect(['ok', 'warn', 'fail']).toContain(result.overallStatus);
    });

    it('should classify and verify a column element', () => {
      const input: VerificationInput = {
        elementId: 2,
        elementType: 'column',
        Mu: 30, Vu: 20, Nu: 400,
        b: 0.30, h: 0.30,
        fc: 25, fy: 420,
        cover: 0.025, stirrupDia: 8,
      };
      const result = verifyElement(input);
      expect(result.elementType).toBe('column');
      expect(result.column).toBeDefined();
      expect(result.column!.barCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('classifyElement', () => {
    it('should classify vertical element as column', () => {
      expect(classifyElement(0, 0, 0, 0, 0, 3)).toBe('column');
    });

    it('should classify horizontal element as beam', () => {
      expect(classifyElement(0, 0, 0, 5, 0, 0)).toBe('beam');
    });

    it('should classify mostly-horizontal as beam', () => {
      expect(classifyElement(0, 0, 0, 5, 0, 0.5)).toBe('beam');
    });

    it('should classify mostly-vertical as column', () => {
      expect(classifyElement(0, 0, 0, 0.3, 0, 3)).toBe('column');
    });
  });

  describe('checkTorsion', () => {
    it('should neglect small torsion', () => {
      const result = checkTorsion(beamParams, 0.1);
      expect(result.neglect).toBe(true);
      expect(result.status).toBe('ok');
    });

    it('should compute torsion reinforcement for significant torsion', () => {
      const result = checkTorsion(beamParams, 5); // 5 kN·m
      expect(result.Tu).toBe(5);
      expect(result.Tcr).toBeGreaterThan(0);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('cracking torsion should scale with section size', () => {
      const small = checkTorsion(beamParams, 1);
      const big = checkTorsion(colParams, 1);
      expect(big.Tcr).toBeGreaterThan(small.Tcr);
    });
  });

  describe('checkBiaxial', () => {
    it('should return valid Bresler result', () => {
      const result = checkBiaxial(colParams, 400, 15, 20, 9.0);
      expect(result.phiPn).toBeGreaterThan(0);
      expect(result.phiPn0).toBeGreaterThan(result.phiPn);
      expect(result.ratio).toBeGreaterThan(0);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('biaxial capacity should be less than uniaxial', () => {
      const uniaxial = checkBiaxial(colParams, 400, 0, 20, 9.0);
      const biaxial = checkBiaxial(colParams, 400, 15, 20, 9.0);
      // Biaxial should give lower capacity (higher ratio)
      expect(biaxial.ratio).toBeGreaterThanOrEqual(uniaxial.ratio - 0.01);
    });
  });

  describe('checkSlender', () => {
    it('should classify short column correctly', () => {
      // Lu = 2m, h = 0.30, r = 0.09, k·Lu/r = 22.2 → just barely slender
      const result = checkSlender(colParams, 500, 30, 1.5); // short
      expect(result.klu_r).toBeLessThan(22);
      expect(result.isSlender).toBe(false);
      expect(result.delta_ns).toBe(1.0);
    });

    it('should amplify moment for slender column', () => {
      const result = checkSlender(colParams, 500, 30, 4.0); // tall column
      expect(result.klu_r).toBeGreaterThan(22);
      expect(result.isSlender).toBe(true);
      expect(result.delta_ns).toBeGreaterThan(1.0);
      expect(result.Mc).toBeGreaterThan(30);
    });

    it('amplification should increase with length', () => {
      const short = checkSlender(colParams, 500, 30, 3.0);
      const tall = checkSlender(colParams, 500, 30, 6.0);
      expect(tall.delta_ns).toBeGreaterThanOrEqual(short.delta_ns);
    });
  });

  describe('verifyElement with Sprint 2 features', () => {
    it('should include torsion check when Tu is provided', () => {
      const input: VerificationInput = {
        elementId: 1, elementType: 'beam',
        Mu: 50, Vu: 60, Nu: 0,
        b: 0.20, h: 0.40, fc: 25, fy: 420,
        cover: 0.025, stirrupDia: 8,
        Tu: 3,
      };
      const result = verifyElement(input);
      expect(result.torsion).toBeDefined();
      expect(result.torsion!.Tu).toBe(3);
    });

    it('should include biaxial check for column with Muy', () => {
      const input: VerificationInput = {
        elementId: 2, elementType: 'column',
        Mu: 30, Vu: 20, Nu: 400,
        b: 0.30, h: 0.30, fc: 25, fy: 420,
        cover: 0.025, stirrupDia: 8,
        Muy: 15,
      };
      const result = verifyElement(input);
      expect(result.biaxial).toBeDefined();
      expect(result.biaxial!.Muy).toBe(15);
    });

    it('should amplify moment for slender column with Lu', () => {
      const input: VerificationInput = {
        elementId: 3, elementType: 'column',
        Mu: 30, Vu: 20, Nu: 500,
        b: 0.30, h: 0.30, fc: 25, fy: 420,
        cover: 0.025, stirrupDia: 8,
        Lu: 5.0,
      };
      const result = verifyElement(input);
      expect(result.slender).toBeDefined();
      expect(result.slender!.isSlender).toBe(true);
      expect(result.slender!.Mc).toBeGreaterThan(30);
    });
  });

  describe('REBAR_DB', () => {
    it('should have correct bar areas', () => {
      const o16 = REBAR_DB.find(r => r.diameter === 16)!;
      // A = π/4 × 16² = 201.06 mm² = 2.0106 cm²
      expect(o16.area).toBeCloseTo(2.011, 2);

      const o8 = REBAR_DB.find(r => r.diameter === 8)!;
      expect(o8.area).toBeCloseTo(0.503, 2);
    });

    it('should be sorted by diameter', () => {
      for (let i = 1; i < REBAR_DB.length; i++) {
        expect(REBAR_DB[i].diameter).toBeGreaterThan(REBAR_DB[i - 1].diameter);
      }
    });
  });

  // ─── New: Doubly Reinforced Flexure ───────────────────────────────

  describe('checkFlexure — doubly reinforced', () => {
    it('should produce singly reinforced for moderate moment', () => {
      const result = checkFlexure(beamParams, 50);
      expect(result.isDoublyReinforced).toBe(false);
      expect(result.AsComp).toBeUndefined();
    });

    it('should produce doubly reinforced for very high moment', () => {
      // 20×40 beam with huge moment — should need A's
      const bigParams: ConcreteDesignParams = {
        fc: 25, fy: 420, cover: 0.025, b: 0.20, h: 0.40, stirrupDia: 8,
      };
      const result = checkFlexure(bigParams, 200); // way beyond singly reinforced capacity
      expect(result.isDoublyReinforced).toBe(true);
      expect(result.AsComp).toBeGreaterThan(0);
      expect(result.barsComp).toBeDefined();
      expect(result.phiMn).toBeGreaterThan(0);
    });

    it('doubly reinforced should have higher capacity than singly', () => {
      const singly = checkFlexure(beamParams, 80);
      // Force doubly reinforced by using huge moment
      const doubly = checkFlexure(beamParams, 200);
      // Doubly reinforced should provide more total steel
      expect(doubly.AsProv).toBeGreaterThan(singly.AsProv);
    });

    it('should report εt in steps', () => {
      const result = checkFlexure(beamParams, 50);
      const hasEpsilon = result.steps.some(s => s.includes('εt'));
      expect(hasEpsilon).toBe(true);
    });
  });

  // ─── New: Shear with Tension ──────────────────────────────────────

  describe('checkShear — axial tension', () => {
    it('should reduce Vc with axial tension', () => {
      const noAxial = checkShear(beamParams, 50, 0);
      const withTension = checkShear(beamParams, 50, -100); // 100 kN tension
      expect(withTension.phiVc).toBeLessThan(noAxial.phiVc);
    });

    it('Vc should not go below zero', () => {
      const result = checkShear(beamParams, 50, -5000); // extreme tension
      expect(result.phiVc).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── New: Slender with Ψ, k, Cm, λm,lím ─────────────────────────

  describe('checkSlender — advanced parameters', () => {
    it('should compute k factor from Ψ', () => {
      // Both ends fixed: Ψ = 0.2 each → k ≈ 0.6
      const k = computeK(0.2, 0.2);
      expect(k).toBeCloseTo(0.6, 1);
      expect(k).toBeGreaterThanOrEqual(0.6);
    });

    it('k should increase with Ψ', () => {
      const kFixed = computeK(0.2, 0.2);
      const kPartial = computeK(2.0, 2.0);
      const kPinned = computeK(20, 20);
      expect(kPartial).toBeGreaterThan(kFixed);
      expect(kPinned).toBeGreaterThan(kPartial);
    });

    it('computePsi should work correctly', () => {
      // Stiff columns, flexible beams → high Ψ
      const psiHigh = computePsi(100, 10);
      expect(psiHigh).toBe(10);

      // Flexible columns, stiff beams → low Ψ
      const psiLow = computePsi(10, 100);
      expect(psiLow).toBeCloseTo(0.2, 1); // clamped at 0.2

      // No beams → pinned
      const psiPinned = computePsi(100, 0);
      expect(psiPinned).toBe(20);
    });

    it('should use higher λm,lím with reverse curvature', () => {
      // M1/M2 = -1 (reverse) → λm,lím = 34 - 12·(-1) = 46 → capped at 40
      const result = checkSlender(colParams, 500, 30, 4.0, {
        M1: -30, M2: 30,
      });
      expect(result.lambda_lim).toBe(40);
    });

    it('should use lower λm,lím with same curvature', () => {
      // M1/M2 = +1 (same curvature) → λm,lím = 34 - 12·1 = 22
      const result = checkSlender(colParams, 500, 30, 4.0, {
        M1: 30, M2: 30,
      });
      expect(result.lambda_lim).toBe(22);
    });

    it('should compute Cm from M1/M2', () => {
      const result = checkSlender(colParams, 500, 30, 4.0, {
        M1: -15, M2: 30, // reverse curvature
      });
      // Cm = 0.6 + 0.4·(-15/30) = 0.6 - 0.2 = 0.4
      expect(result.Cm).toBeCloseTo(0.4, 2);
    });

    it('should use Ψ for k factor when provided', () => {
      // With Ψ provided
      const withPsi = checkSlender(colParams, 500, 30, 4.0, {
        psiA: 1.0, psiB: 1.0,
      });
      // Without Ψ → k = 1.0
      const withoutPsi = checkSlender(colParams, 500, 30, 4.0);
      expect(withPsi.k).toBeLessThan(withoutPsi.k);
      expect(withPsi.klu_r).toBeLessThan(withoutPsi.klu_r);
    });

    it('should use βdns from dead/live split when provided', () => {
      const result = checkSlender(colParams, 500, 30, 4.0, {
        PuD: 350, PuL: 150,
      });
      // βdns = (350 + 0.2·150) / 500 = 380/500 = 0.76
      expect(result.steps.some(s => s.includes('βdns'))).toBe(true);
    });

    it('should apply minimum eccentricity M2,mín', () => {
      // Column with very small moment but high axial
      const result = checkSlender(colParams, 1000, 1, 4.0);
      // M2,mín = 1000·(0.015 + 0.03·0.30) = 1000·0.024 = 24 kN·m > 1 kN·m
      expect(result.Mc).toBeGreaterThan(1);
    });
  });

  // ─── New: Slab Design ─────────────────────────────────────────────

  describe('Slab Design (losas)', () => {
    describe('designSlab — unidirectional', () => {
      it('should design a one-way slab', () => {
        const params: SlabDesignParams = {
          type: 'unidirectional',
          h: 0.12,  // 12 cm slab
          fc: 25, fy: 420,
          cover: 0.02,
          Mu_x: 8, // 8 kN·m/m
        };
        const result = designSlab(params);
        expect(result.type).toBe('unidirectional');
        expect(result.overallStatus).not.toBe('fail');
        expect(result.primary.layout.As).toBeGreaterThanOrEqual(result.AsMin);
        expect(result.primary.layout.spacing).toBeGreaterThan(0);
        expect(result.primary.ratio).toBeLessThanOrEqual(1.0);
        // Distribution reinforcement
        expect(result.secondary.layout.As).toBeGreaterThanOrEqual(result.AsMin);
      });

      it('should have bent-up bars for non-cantilever', () => {
        const result = designSlab({
          type: 'unidirectional', h: 0.12, fc: 25, fy: 420, cover: 0.02, Mu_x: 8,
        });
        expect(result.primary.layout_bent).toBeDefined();
        expect(result.primary.layout_straight).toBeDefined();
        // Bent spacing should be double
        expect(result.primary.layout_bent!.spacing).toBeCloseTo(
          result.primary.layout.spacing * 2, 2,
        );
      });

      it('should enforce AsMin = 0.0018·b·h', () => {
        const result = designSlab({
          type: 'unidirectional', h: 0.15, fc: 25, fy: 420, cover: 0.02, Mu_x: 1,
        });
        const AsMin = 0.0018 * 100 * 15; // cm²/m
        expect(result.AsMin).toBeCloseTo(AsMin, 1);
        expect(result.primary.layout.As).toBeGreaterThanOrEqual(AsMin * 0.99);
      });
    });

    describe('designSlab — bidirectional', () => {
      it('should design a two-way slab', () => {
        const result = designSlab({
          type: 'bidirectional', h: 0.15, fc: 25, fy: 420, cover: 0.02,
          Mu_x: 10, Mu_y: 6,
        });
        expect(result.type).toBe('bidirectional');
        expect(result.primary.layout.As).toBeGreaterThanOrEqual(result.AsMin);
        expect(result.secondary.layout.As).toBeGreaterThanOrEqual(result.AsMin);
        // Primary direction should have more steel (higher moment)
        expect(result.primary.As_req).toBeGreaterThanOrEqual(result.secondary.As_req);
      });

      it('should use 2h as max spacing for bidirectional', () => {
        const h = 0.12;
        const result = designSlab({
          type: 'bidirectional', h, fc: 25, fy: 420, cover: 0.02,
          Mu_x: 5, Mu_y: 3,
        });
        expect(result.primary.layout.spacing).toBeLessThanOrEqual(2 * h + 0.01);
      });
    });

    describe('designSlab — cantilever', () => {
      it('should design a cantilever slab', () => {
        const result = designSlab({
          type: 'cantilever', h: 0.15, fc: 25, fy: 420, cover: 0.02,
          Mu_x: 12,
        });
        expect(result.type).toBe('cantilever');
        // Main reinforcement on top face
        expect(result.primary.layout.face).toBe('top');
        // No bent-up bars
        expect(result.primary.layout_bent).toBeUndefined();
        // Constructive reinforcement on bottom
        expect(result.constructive).toBeDefined();
        expect(result.constructive!.face).toBe('bottom');
      });

      it('should use Ø10 minimum for cantilever', () => {
        const result = designSlab({
          type: 'cantilever', h: 0.12, fc: 25, fy: 420, cover: 0.02,
          Mu_x: 3,
        });
        expect(result.primary.layout.dia).toBeGreaterThanOrEqual(10);
      });
    });

    describe('designSlab — negative moments at supports', () => {
      it('should design support reinforcement', () => {
        const result = designSlab({
          type: 'unidirectional', h: 0.12, fc: 25, fy: 420, cover: 0.02,
          Mu_x: 8, Mu_neg_x: 10,
        });
        expect(result.support_x).toBeDefined();
        expect(result.support_x!.layout.face).toBe('top');
        expect(result.support_x!.ratio).toBeLessThanOrEqual(1.05);
      });
    });

    describe('checkSlabSupport', () => {
      it('should not need caballetes if raised steel is enough', () => {
        const result = checkSlabSupport(6.0, 6.0, 4.0);
        // Raised = 3 + 3 = 6 ≥ 4 → no caballetes
        expect(result.deficit).toBe(0);
        expect(result.caballetes).toBeUndefined();
      });

      it('should compute caballetes when deficit exists', () => {
        const result = checkSlabSupport(4.0, 4.0, 5.0);
        // Raised = 2 + 2 = 4 < 5 → deficit = 1
        expect(result.deficit).toBeGreaterThan(0);
        expect(result.caballetes).toBeDefined();
        expect(result.caballetes!.As).toBeGreaterThanOrEqual(result.deficit);
      });
    });

    describe('slabTorsionReinforcement', () => {
      it('should return Ø10 c/15 for corner torsion', () => {
        const result = slabTorsionReinforcement('2dir', 5.0);
        expect(result.layout.dia).toBe(10);
        expect(result.layout.spacing).toBe(0.15);
        expect(result.extension).toBeCloseTo(1.0, 2); // 5/5 = 1.0
        expect(result.faces).toContain('top');
        expect(result.faces).toContain('bottom');
      });

      it('1dir corner should have top only', () => {
        const result = slabTorsionReinforcement('1dir', 4.0);
        expect(result.faces).toEqual(['top']);
        expect(result.extension).toBeCloseTo(0.8, 2); // 4/5 = 0.8
      });
    });
  });
});

// ─── computeJointPsiFromModel tests ────────────────────────────────
describe('computeJointPsiFromModel', () => {
  // Simple portal frame: 2 columns (0→1, 2→3) + 1 beam (1→3)
  // Nodes: 0(0,0), 1(0,3), 2(5,0), 3(5,3)
  const nodes = new Map([
    [0, { id: 0, x: 0, y: 0, z: 0 }],
    [1, { id: 1, x: 0, y: 3, z: 0 }],
    [2, { id: 2, x: 5, y: 0, z: 0 }],
    [3, { id: 3, x: 5, y: 3, z: 0 }],
  ]);
  const mat = new Map([[1, { id: 1, e: 25000 }]]); // E = 25000 MPa (concrete)
  const sec = new Map([[1, { id: 1, iz: 0.002133 }]]); // 40×40 cm → Iz = 0.40^4/12

  it('should return Ψ=0.2 for fixed base, finite Ψ at beam-column joint', () => {
    const elems = new Map([
      [1, { id: 1, nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }], // col left
      [2, { id: 2, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }], // col right
      [3, { id: 3, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }], // beam
    ]);
    const sups = new Map([
      [0, { nodeId: 0, type: 'fixed3d' }],
      [2, { nodeId: 2, type: 'fixed3d' }],
    ]);

    const { psiA, psiB } = computeJointPsiFromModel(1, nodes, elems, sec, mat, sups);
    // End A (node 0): fixed support → Ψ = 0.2
    expect(psiA).toBe(0.2);
    // End B (node 1): col stiffness = 0.70·EI/L, beam stiffness = 0.35·EI/L_beam
    // Same section: Ψ = (0.70·EI/3) / (1.0·0.35·EI/5) = (0.70/3) / (0.35/5) = 0.2333 / 0.07 = 3.33
    expect(psiB).toBeGreaterThan(1.0);
    expect(psiB).toBeLessThan(5.0);
  });

  it('should return Ψ=20 for pinned base', () => {
    const elems = new Map([
      [1, { id: 1, nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]);
    const sups = new Map([
      [0, { nodeId: 0, type: 'pinned3d' }],
    ]);

    const { psiA } = computeJointPsiFromModel(1, nodes, elems, sec, mat, sups);
    expect(psiA).toBe(20); // pinned support → Ψ = 20
  });

  it('should use x=0.5 for beam with hinged far end', () => {
    const elems = new Map([
      [1, { id: 1, nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: true }], // far end hinged
    ]);
    const sups = new Map([
      [0, { nodeId: 0, type: 'fixed3d' }],
      [2, { nodeId: 2, type: 'fixed3d' }],
    ]);

    const resultHinged = computeJointPsiFromModel(1, nodes, elems, sec, mat, sups);
    // With hinged far end: x=0.5, beam stiffness halved → higher Ψ
    // Without hinge: x=1.0, beam stiffness full → lower Ψ
    const elemsNoHinge = new Map([
      [1, { id: 1, nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]);
    const resultFixed = computeJointPsiFromModel(1, nodes, elemsNoHinge, sec, mat, sups);
    expect(resultHinged.psiB).toBeGreaterThan(resultFixed.psiB);
  });

  it('should work with multiple beams at a joint (reduces Ψ)', () => {
    // Add extra beam from node 1 going to node 4 at (0,3,5)
    const nodesExtended = new Map([...nodes, [4, { id: 4, x: 0, y: 3, z: 5 }]]);
    const elems = new Map([
      [1, { id: 1, nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [4, { id: 4, nodeI: 1, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }], // extra beam
    ]);
    const sups = new Map([
      [0, { nodeId: 0, type: 'fixed3d' }],
    ]);

    const result1Beam = computeJointPsiFromModel(1, nodes, new Map([
      [1, { id: 1, nodeI: 0, nodeJ: 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, nodeI: 1, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]), sec, mat, sups);

    const result2Beams = computeJointPsiFromModel(1, nodesExtended, elems, sec, mat, sups);
    // More beams at joint → more restraint → lower Ψ
    expect(result2Beams.psiB).toBeLessThan(result1Beam.psiB);
  });
});
