/**
 * Tests for computeDiagramDisplayDirection — the shared helper that ensures
 * 3D diagrams render vertically (Z-up) for horizontal beams regardless of
 * the solver's local axis convention.
 *
 * These tests prevent regression of the bug where My diagrams for Y-direction
 * beams rendered horizontally (along X) instead of vertically (along Z).
 */

import { describe, it, expect } from 'vitest';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { computeDiagramDisplayDirection } from '../diagram-render-3d';

// Helper: build a solver node
function node(id: number, x: number, y: number, z: number) {
  return { id, x, y, z };
}

describe('computeDiagramDisplayDirection', () => {
  describe('horizontal beams should have vertical (Z-dominated) perpVec', () => {
    const horizontalCases = [
      { name: '+X beam', nI: node(1, 0, 0, 0), nJ: node(2, 5, 0, 0) },
      { name: '-X beam', nI: node(1, 5, 0, 0), nJ: node(2, 0, 0, 0) },
      { name: '+Y beam', nI: node(1, 0, 0, 0), nJ: node(2, 0, 5, 0) },
      { name: '-Y beam', nI: node(1, 0, 5, 0), nJ: node(2, 0, 0, 0) },
      { name: 'XY diagonal', nI: node(1, 0, 0, 0), nJ: node(2, 3, 4, 0) },
    ];

    for (const { name, nI, nJ } of horizontalCases) {
      it(`${name}: perpVec.z should dominate for perpDir='y'`, () => {
        const axes = computeLocalAxes3D(nI, nJ);
        const { perpVec } = computeDiagramDisplayDirection(axes, 'y');
        // For a horizontal beam, the display perpendicular must point mostly in Z
        expect(Math.abs(perpVec.z)).toBeGreaterThan(0.9);
      });

      it(`${name}: perpVec.z should dominate for perpDir='z'`, () => {
        const axes = computeLocalAxes3D(nI, nJ);
        const { perpVec } = computeDiagramDisplayDirection(axes, 'z');
        expect(Math.abs(perpVec.z)).toBeGreaterThan(0.9);
      });
    }
  });

  describe('vertical beams should use solver perpendicular (no override)', () => {
    const verticalCases = [
      { name: '+Z beam', nI: node(1, 0, 0, 0), nJ: node(2, 0, 0, 5) },
      { name: '-Z beam', nI: node(1, 0, 0, 5), nJ: node(2, 0, 0, 0) },
    ];

    for (const { name, nI, nJ } of verticalCases) {
      it(`${name}: perpVec should NOT have dominant Z (it's along the element)`, () => {
        const axes = computeLocalAxes3D(nI, nJ);
        const { perpVec } = computeDiagramDisplayDirection(axes, 'y');
        // For vertical beams, Z is the element axis, so perp should be in XY plane
        expect(Math.abs(perpVec.z)).toBeLessThan(0.5);
      });
    }
  });

  describe('sign convention', () => {
    it('+X beam: perpDir=y gives sign=+1, perpDir=z gives sign=-1 (θy convention)', () => {
      // Canonical +X beam: solverPerp aligns with projected Z, so no flip
      const axes = computeLocalAxes3D(node(1, 0, 0, 0), node(2, 5, 0, 0));
      const dirY = computeDiagramDisplayDirection(axes, 'y');
      const dirZ = computeDiagramDisplayDirection(axes, 'z');
      expect(dirY.sign).toBe(1);   // no negation for y-plane diagrams
      expect(dirZ.sign).toBe(-1);  // negated for z-plane (θy = -dw/dx)
    });

    it('reversed beam flips sign to compensate reversed element direction', () => {
      const fwd = computeLocalAxes3D(node(1, 0, 0, 0), node(2, 5, 0, 0));
      const rev = computeLocalAxes3D(node(1, 5, 0, 0), node(2, 0, 0, 0));
      const dirFwd = computeDiagramDisplayDirection(fwd, 'z');
      const dirRev = computeDiagramDisplayDirection(rev, 'z');
      // Signs should be opposite (reversed element → reversed diagram values → same visual)
      expect(dirFwd.sign).toBe(-dirRev.sign);
    });
  });

  describe('inclined beams', () => {
    it('mostly-horizontal inclined beam still gets vertical display', () => {
      // 30° from horizontal: ex.z = sin(30°) ≈ 0.5, just at threshold
      const axes = computeLocalAxes3D(node(1, 0, 0, 0), node(2, 5, 0, 2));
      const { perpVec } = computeDiagramDisplayDirection(axes, 'y');
      // Should still have significant Z component
      expect(Math.abs(perpVec.z)).toBeGreaterThan(0.5);
    });

    it('mostly-vertical inclined beam uses solver perp', () => {
      // Steep: ex.z ≈ 0.89
      const axes = computeLocalAxes3D(node(1, 0, 0, 0), node(2, 1, 0, 5));
      const { perpVec } = computeDiagramDisplayDirection(axes, 'y');
      // Nearly vertical — should use solver perp, which is in XY plane
      expect(Math.abs(perpVec.z)).toBeLessThan(0.5);
    });
  });
});
