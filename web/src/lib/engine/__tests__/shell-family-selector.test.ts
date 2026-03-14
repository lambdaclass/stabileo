import { describe, it, expect } from 'vitest';
import {
  selectShellFamily,
  selectTriFamily,
  selectQuadFamily,
  selectShellFamilyBatch,
} from '../shell-family-selector';
import type { Vec3 } from '../shell-family-selector';

// ─── Helpers ────────────────────────────────────────────────────

/** Equilateral triangle in the XY plane */
function flatTri(size = 3, thickness = 0.15): { nodes: Vec3[]; thickness: number } {
  return {
    nodes: [
      { x: 0, y: 0, z: 0 },
      { x: size, y: 0, z: 0 },
      { x: size / 2, y: size * Math.sqrt(3) / 2, z: 0 },
    ],
    thickness,
  };
}

/** Square quad in the XY plane */
function flatQuad(size = 2, thickness = 0.15): { nodes: Vec3[]; thickness: number } {
  return {
    nodes: [
      { x: 0, y: 0, z: 0 },
      { x: size, y: 0, z: 0 },
      { x: size, y: size, z: 0 },
      { x: 0, y: size, z: 0 },
    ],
    thickness,
  };
}

/** Quad with one node lifted out of plane (warped) */
function warpedQuad(warp: number, size = 2, thickness = 0.15): { nodes: Vec3[]; thickness: number } {
  return {
    nodes: [
      { x: 0, y: 0, z: 0 },
      { x: size, y: 0, z: 0 },
      { x: size, y: size, z: 0 },
      { x: 0, y: size, z: warp },  // lifted
    ],
    thickness,
  };
}

/** Very elongated triangle (aspect ratio > 5) */
function elongatedTri(): { nodes: Vec3[]; thickness: number } {
  // Edges: 10, ~1.0, ~9.05 → aspect ≈ 10
  return {
    nodes: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    thickness: 0.15,
  };
}

// ─── Triangle tests ─────────────────────────────────────────────

describe('selectTriFamily', () => {
  it('selects DKT for a flat thin triangle', () => {
    const r = selectTriFamily({ ...flatTri(), });
    expect(r.family).toBe('DKT');
    expect(r.confidence).toBe('high');
    expect(r.warnings).toHaveLength(0);
  });

  it('still selects DKT for thick plate (only option) but warns', () => {
    // thickness/minEdge > 0.1 → thick
    const r = selectTriFamily({ ...flatTri(1, 0.5) });
    expect(r.family).toBe('DKT');
    expect(r.confidence).toBe('medium');
    expect(r.reason).toContain('DKMT');
    expect(r.alternatives[0].family).toBe('DKMT');
    expect(r.alternatives[0].available).toBe(false);
  });

  it('warns about high aspect ratio', () => {
    const r = selectTriFamily({ ...elongatedTri() });
    expect(r.family).toBe('DKT');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('aspect ratio');
  });

  it('includes thickness ratio in metrics', () => {
    const r = selectTriFamily({ ...flatTri(2, 0.3) });
    expect(r.metrics.thicknessRatio).toBeDefined();
    expect(r.metrics.aspectRatio).toBeDefined();
  });
});

// ─── Quad tests ─────────────────────────────────────────────────

describe('selectQuadFamily', () => {
  it('selects MITC4 for a flat quad', () => {
    const r = selectQuadFamily({ ...flatQuad() });
    expect(r.family).toBe('MITC4');
    expect(r.confidence).toBe('high');
    expect(r.warnings).toHaveLength(0);
  });

  it('selects MITC4 with medium confidence for mildly warped quad', () => {
    // Warp of 0.5 on a size-2 quad → moderate warp angle
    const r = selectQuadFamily({ ...warpedQuad(0.5) });
    expect(r.family).toBe('MITC4');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some(w => w.toLowerCase().includes('warp'))).toBe(true);
  });

  it('warns strongly for highly warped quad and suggests SHB8PS', () => {
    // Warp of 3.0 on a size-2 quad → very strong warp
    const r = selectQuadFamily({ ...warpedQuad(3.0) });
    expect(r.family).toBe('MITC4'); // fallback
    expect(r.confidence).toBe('low');
    expect(r.alternatives.some(a => a.family === 'SHB8PS')).toBe(true);
  });

  it('suggests MITC9 when preferAccuracy is set', () => {
    const r = selectQuadFamily({ ...flatQuad(), preferAccuracy: true });
    expect(r.family).toBe('MITC4'); // fallback (MITC9 not available)
    expect(r.alternatives.some(a => a.family === 'MITC9')).toBe(true);
    expect(r.reason).toContain('MITC9');
  });

  it('includes warp and skew in metrics', () => {
    const r = selectQuadFamily({ ...flatQuad() });
    expect(r.metrics.warpAngle).toBeDefined();
    expect(r.metrics.skewAngle).toBeDefined();
    expect(r.metrics.warpAngle).toBeCloseTo(0, 1);
    // Square → diagonals at 90°
    expect(r.metrics.skewAngle).toBeCloseTo(90, 1);
  });

  it('detects skewed elements', () => {
    // Parallelogram: very skewed
    const r = selectQuadFamily({
      nodes: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 5, y: 0.5, z: 0 },
        { x: 1, y: 0.5, z: 0 },
      ],
      thickness: 0.15,
    });
    expect(r.metrics.skewAngle).toBeDefined();
    // Very flat parallelogram should have low skew angle
    expect(r.metrics.skewAngle!).toBeLessThan(45);
    expect(r.warnings.some(w => w.toLowerCase().includes('skew'))).toBe(true);
  });
});

// ─── Unified selector ───────────────────────────────────────────

describe('selectShellFamily', () => {
  it('dispatches to tri for 3 nodes', () => {
    const r = selectShellFamily({ ...flatTri() });
    expect(r.family).toBe('DKT');
  });

  it('dispatches to quad for 4 nodes', () => {
    const r = selectShellFamily({ ...flatQuad() });
    expect(r.family).toBe('MITC4');
  });

  it('throws for invalid node count', () => {
    expect(() => selectShellFamily({
      nodes: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
      thickness: 0.1,
    })).toThrow('expected 3 or 4 nodes');
  });
});

// ─── Batch selector ─────────────────────────────────────────────

describe('selectShellFamilyBatch', () => {
  it('processes a mixed mesh', () => {
    const elements = [
      flatTri(),
      flatTri(),
      flatQuad(),
      flatQuad(),
      flatQuad(),
    ];
    const result = selectShellFamilyBatch(elements);
    expect(result.perElement).toHaveLength(5);
    expect(result.defaultFamily).toBe('MITC4'); // 3 quads > 2 tris
    expect(result.summary).toContain('5 elements');
    expect(result.warningCount).toBe(0);
  });

  it('counts warnings from warped elements', () => {
    const elements = [
      flatQuad(),
      warpedQuad(0.5),
      warpedQuad(3.0),
    ];
    const result = selectShellFamilyBatch(elements);
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it('passes analysisType and preferAccuracy through', () => {
    const result = selectShellFamilyBatch(
      [flatQuad()],
      'linear',
      true,
    );
    expect(result.perElement[0].reason).toContain('MITC9');
  });
});
