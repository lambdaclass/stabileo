// Shell Family Selector
// Chooses the best shell element formulation based on geometry, thickness,
// mesh topology, and analysis context. Returns a recommendation with reasons.

import type { ShellFamily, ShellRecommendation } from './types-3d';
import { AVAILABLE_SHELL_FAMILIES } from './types-3d';

// ─── Input types ────────────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number; }

export type AnalysisIntent =
  | 'linear'
  | 'modal'
  | 'buckling'
  | 'pDelta'
  | 'spectral';

export interface ShellSelectionContext {
  /** Node positions (3 for tri, 4 for quad) */
  nodes: Vec3[];
  /** Element thickness in meters */
  thickness: number;
  /** What analysis will be run */
  analysisType?: AnalysisIntent;
  /** User prefers higher accuracy over speed */
  preferAccuracy?: boolean;
}

// ─── Geometry helpers ───────────────────────────────────────────

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vec3): Vec3 {
  const l = length(v);
  if (l < 1e-12) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Angle between two vectors in degrees */
function angleDeg(a: Vec3, b: Vec3): number {
  const la = length(a);
  const lb = length(b);
  if (la < 1e-12 || lb < 1e-12) return 0;
  const cos = Math.max(-1, Math.min(1, dot(a, b) / (la * lb)));
  return Math.acos(cos) * (180 / Math.PI);
}

// ─── Geometry metrics ───────────────────────────────────────────

interface TriMetrics {
  type: 'tri';
  aspectRatio: number;
  thicknessRatio: number;
  minEdge: number;
}

interface QuadMetrics {
  type: 'quad';
  aspectRatio: number;
  warpAngle: number;    // degrees, 0 = flat
  skewAngle: number;    // degrees, 90 = rectangular
  thicknessRatio: number;
  minEdge: number;
}

function computeTriMetrics(nodes: Vec3[], thickness: number): TriMetrics {
  const edges = [
    length(sub(nodes[1], nodes[0])),
    length(sub(nodes[2], nodes[1])),
    length(sub(nodes[0], nodes[2])),
  ];
  const minEdge = Math.min(...edges);
  const maxEdge = Math.max(...edges);

  return {
    type: 'tri',
    aspectRatio: minEdge > 1e-12 ? maxEdge / minEdge : Infinity,
    thicknessRatio: minEdge > 1e-12 ? thickness / minEdge : Infinity,
    minEdge,
  };
}

function computeQuadMetrics(nodes: Vec3[], thickness: number): QuadMetrics {
  // Edge lengths
  const edges = [
    length(sub(nodes[1], nodes[0])),
    length(sub(nodes[2], nodes[1])),
    length(sub(nodes[3], nodes[2])),
    length(sub(nodes[0], nodes[3])),
  ];
  const minEdge = Math.min(...edges);
  const maxEdge = Math.max(...edges);
  const aspectRatio = minEdge > 1e-12 ? maxEdge / minEdge : Infinity;

  // Warp angle: split quad into 2 triangles, compare normals
  const n1 = cross(sub(nodes[1], nodes[0]), sub(nodes[2], nodes[0]));
  const n2 = cross(sub(nodes[2], nodes[0]), sub(nodes[3], nodes[0]));
  const warpAngle = angleDeg(n1, n2);

  // Skew angle: angle between diagonals (90° = perfect rectangle)
  const d1 = sub(nodes[2], nodes[0]);
  const d2 = sub(nodes[3], nodes[1]);
  const diagAngle = angleDeg(d1, d2);
  // Skew = how far from 90° the diagonals are
  const skewAngle = diagAngle > 90 ? 180 - diagAngle : diagAngle;

  return {
    type: 'quad',
    aspectRatio,
    warpAngle,
    skewAngle,
    thicknessRatio: minEdge > 1e-12 ? thickness / minEdge : Infinity,
    minEdge,
  };
}

// ─── Thresholds ─────────────────────────────────────────────────

const THIN_THICK_BOUNDARY = 0.1;   // t/L > 0.1 → thick plate behavior
const WARP_MILD = 5;               // degrees — below this = essentially flat
const WARP_STRONG = 15;            // degrees — above this = strongly non-planar
const ASPECT_RATIO_WARN = 5;       // warn above this
const SKEW_WARN = 45;              // warn if skew < 45°

// ─── Selector ───────────────────────────────────────────────────

function isAvailable(f: ShellFamily): boolean {
  return (AVAILABLE_SHELL_FAMILIES as readonly string[]).includes(f);
}

/** Select the best shell family for a triangular element */
export function selectTriFamily(ctx: ShellSelectionContext): ShellRecommendation {
  const { nodes, thickness, analysisType, preferAccuracy } = ctx;
  const m = computeTriMetrics(nodes, thickness);
  const warnings: string[] = [];

  if (m.aspectRatio > ASPECT_RATIO_WARN) {
    warnings.push(`High aspect ratio (${m.aspectRatio.toFixed(1)}). Consider refining the mesh.`);
  }

  const isThick = m.thicknessRatio > THIN_THICK_BOUNDARY;

  // Decision logic
  if (isThick || preferAccuracy) {
    // Thick plate → DKMT preferred, but not yet available
    return {
      family: 'DKT',  // fallback to available
      reason: isThick
        ? `Thick plate (t/L = ${m.thicknessRatio.toFixed(3)}). DKT used (Kirchhoff); DKMT (Mindlin) would be more accurate but is not yet available.`
        : `DKT selected. For higher accuracy, DKMT (Mindlin) is planned but not yet available.`,
      confidence: isThick ? 'medium' : 'high',
      alternatives: [{
        family: 'DKMT',
        reason: 'Mindlin formulation handles thick plates and transverse shear — recommended when t/L > 0.1.',
        available: false,
      }],
      warnings,
      metrics: {
        aspectRatio: m.aspectRatio,
        thicknessRatio: m.thicknessRatio,
      },
    };
  }

  // Default: DKT — the standard thin-plate choice
  return {
    family: 'DKT',
    reason: 'Thin triangular plate — DKT (Discrete Kirchhoff Triangle) is the standard choice.',
    confidence: 'high',
    alternatives: [{
      family: 'DKMT',
      reason: 'Mindlin variant for thick plates (planned).',
      available: false,
    }],
    warnings,
    metrics: {
      aspectRatio: m.aspectRatio,
      thicknessRatio: m.thicknessRatio,
    },
  };
}

/** Select the best shell family for a quadrilateral element */
export function selectQuadFamily(ctx: ShellSelectionContext): ShellRecommendation {
  const { nodes, thickness, analysisType, preferAccuracy } = ctx;
  const m = computeQuadMetrics(nodes, thickness);
  const warnings: string[] = [];

  // Collect geometry warnings
  if (m.aspectRatio > ASPECT_RATIO_WARN) {
    warnings.push(`High aspect ratio (${m.aspectRatio.toFixed(1)}). Consider refining the mesh.`);
  }
  if (m.warpAngle > WARP_MILD) {
    warnings.push(`Element is warped (${m.warpAngle.toFixed(1)}°). Results may be less accurate.`);
  }
  if (m.skewAngle < SKEW_WARN) {
    warnings.push(`Highly skewed element (${m.skewAngle.toFixed(1)}°). Consider improving mesh quality.`);
  }

  const isThick = m.thicknessRatio > THIN_THICK_BOUNDARY;
  const isWarped = m.warpAngle > WARP_MILD;
  const isStronglyWarped = m.warpAngle > WARP_STRONG;
  const metricsOut = {
    aspectRatio: m.aspectRatio,
    warpAngle: m.warpAngle,
    skewAngle: m.skewAngle,
    thicknessRatio: m.thicknessRatio,
  };

  // Strongly non-planar → SHB8PS would be ideal
  if (isStronglyWarped) {
    return {
      family: 'MITC4',  // fallback
      reason: `Strongly warped quad (${m.warpAngle.toFixed(1)}°). MITC4 used as fallback; SHB8PS solid-shell would handle this geometry better but is not yet available.`,
      confidence: 'low',
      alternatives: [
        {
          family: 'SHB8PS',
          reason: 'Solid-shell formulation handles strongly curved and non-planar geometries without locking.',
          available: false,
        },
        {
          family: 'MITC9',
          reason: 'Higher-order quad with better curved-surface accuracy.',
          available: false,
        },
      ],
      warnings,
      metrics: metricsOut,
    };
  }

  // Higher accuracy requested or coarse mesh → MITC9 would help
  if (preferAccuracy) {
    return {
      family: 'MITC4',  // fallback
      reason: 'MITC4 used. For higher accuracy, MITC9 (9-node quad) is planned but not yet available.',
      confidence: 'medium',
      alternatives: [{
        family: 'MITC9',
        reason: 'Quadratic interpolation captures stress gradients better with fewer elements.',
        available: false,
      }],
      warnings,
      metrics: metricsOut,
    };
  }

  // Mildly warped → MITC4 works but warn
  if (isWarped) {
    return {
      family: 'MITC4',
      reason: `Mildly warped quad (${m.warpAngle.toFixed(1)}°). MITC4 handles this adequately for most practical cases.`,
      confidence: 'medium',
      alternatives: [
        {
          family: 'MITC9',
          reason: 'Better accuracy for curved surfaces.',
          available: false,
        },
        {
          family: 'SHB8PS',
          reason: 'Solid-shell for strongly curved geometry (planned).',
          available: false,
        },
      ],
      warnings,
      metrics: metricsOut,
    };
  }

  // Default: flat/nearly-flat quad → MITC4
  return {
    family: 'MITC4',
    reason: isThick
      ? 'Flat quad shell — MITC4 handles both thin and thick plate behavior via mixed interpolation.'
      : 'Flat quad shell — MITC4 is the standard choice for quadrilateral shells.',
    confidence: 'high',
    alternatives: [
      {
        family: 'MITC9',
        reason: 'Higher-order accuracy with fewer elements (planned).',
        available: false,
      },
    ],
    warnings,
    metrics: metricsOut,
  };
}

// ─── Unified selector ───────────────────────────────────────────

/**
 * Select the best shell family for an element.
 * Dispatches to tri or quad selector based on node count.
 */
export function selectShellFamily(ctx: ShellSelectionContext): ShellRecommendation {
  if (ctx.nodes.length === 3) return selectTriFamily(ctx);
  if (ctx.nodes.length === 4) return selectQuadFamily(ctx);
  throw new Error(`selectShellFamily: expected 3 or 4 nodes, got ${ctx.nodes.length}`);
}

/**
 * Batch-select families for an entire mesh.
 * Returns a summary recommendation (most common family) + per-element details.
 */
export function selectShellFamilyBatch(
  elements: Array<{ nodes: Vec3[]; thickness: number }>,
  analysisType?: AnalysisIntent,
  preferAccuracy?: boolean,
): {
  defaultFamily: ShellFamily;
  summary: string;
  perElement: ShellRecommendation[];
  warningCount: number;
} {
  const perElement = elements.map(el =>
    selectShellFamily({ nodes: el.nodes, thickness: el.thickness, analysisType, preferAccuracy })
  );

  // Count families
  const counts = new Map<ShellFamily, number>();
  for (const r of perElement) {
    counts.set(r.family, (counts.get(r.family) ?? 0) + 1);
  }

  // Most common family
  let defaultFamily: ShellFamily = 'MITC4';
  let maxCount = 0;
  for (const [family, count] of counts) {
    if (count > maxCount) {
      defaultFamily = family;
      maxCount = count;
    }
  }

  const warningCount = perElement.reduce((sum, r) => sum + r.warnings.length, 0);

  const parts: string[] = [];
  for (const [family, count] of counts) {
    parts.push(`${count} ${family}`);
  }

  return {
    defaultFamily,
    summary: `${elements.length} elements: ${parts.join(', ')}. ${warningCount > 0 ? `${warningCount} warning(s).` : 'No warnings.'}`,
    perElement,
    warningCount,
  };
}
