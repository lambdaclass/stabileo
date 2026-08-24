// Section stress analysis: σ_x(y), τ_xy(y), Mohr's circle, failure criteria
// For analyzing stress distribution at any cross-section of a 2D frame element.
// In 2D analysis: only σ_x (from N+M via Navier) and τ_xy (from V via Jourawski).
// No torsion (T=0) and no out-of-plane shear (V_z=0).

import type { Section } from '../store/model.svelte';
import { ALL_PROFILES, type SectionShape } from '../data/steel-profiles';
import type { ElementForces } from './types';
import { computeSectionStress2D, isWasmReady } from './wasm-solver';
import { computeDiagramValueAt } from './diagrams';
import { t } from '../i18n';

// ─── Types ────────────────────────────────────────────────────────────

export interface ResolvedSection {
  shape: SectionShape;
  a: number;   // m²
  iy: number;  // m⁴ - inertia about Y-axis (horizontal) — primary 2D bending (Navier, Jourawski)
  iz: number;  // m⁴ - inertia about Z-axis (vertical) — secondary (central core)
  j: number;   // m⁴ - torsion constant (Saint-Venant J or Bredt-equivalent)
  h: number;   // m - total height
  b: number;   // m - total width (flange width for I/H)
  tw: number;  // m - web thickness
  tf: number;  // m - flange thickness
  t: number;   // m - wall thickness (for hollow sections) / lip length (C-channel)
  tl: number;  // m - lip thickness (C-channel only, 0 for others)
  yMin: number; // m - bottom fiber y from centroid (negative)
  yMax: number; // m - top fiber y from centroid (positive)
  zMin: number; // m - left fiber z from centroid (negative)
  zMax: number; // m - right fiber z from centroid (positive)
}

export interface StressPoint {
  y: number;     // m from centroid (positive up)
  sigma: number; // MPa - normal stress (positive = tension)
  tau: number;   // MPa - shear stress τ_xy (from V, Jourawski)
}

export interface MohrCircle {
  center: number;   // MPa - (σ₁ + σ₂) / 2
  radius: number;   // MPa
  sigma1: number;   // MPa - major principal stress
  sigma2: number;   // MPa - minor principal stress
  thetaP: number;   // rad - principal angle
  tauMax: number;   // MPa - max shear stress = radius
}

export interface FailureCheck {
  vonMises: number;    // MPa — √(σ² + 3τ²)
  tresca: number;      // MPa — 2·τ_max = 2·√((σ/2)² + τ²)
  rankine: number;     // MPa — max(|σ₁|, |σ₃|) = |center| + radius
  fy: number | null;   // MPa
  ratioVM: number | null;  // vonMises / fy
  ratioTresca: number | null;
  ratioRankine: number | null;
  ok: boolean | null;  // null if no fy
}

export interface SectionStressResult {
  // Internal forces at this section
  N: number;  // kN
  V: number;  // kN
  M: number;  // kN·m
  // Resolved geometry
  resolved: ResolvedSection;
  // Stress distribution (30 points from -h/2 to +h/2)
  distribution: StressPoint[];
  // Stress at selected fiber
  sigmaAtY: number;  // MPa
  tauAtY: number;    // MPa
  // Mohr's circle for selected fiber
  mohr: MohrCircle;
  // Failure checks
  failure: FailureCheck;
  // Neutral axis position in 2D (y from centroid, m) — null if NA outside section or N/M=0
  neutralAxisY: number | null;
}

export interface CriticalSection {
  t: number;      // position along element [0,1]
  reason: string; // description
}

// ─── Shape inference ──────────────────────────────────────────────────

/** Infer section shape from name if not explicitly set */
export function inferSectionShape(sec: Section): SectionShape {
  if (sec.shape) return sec.shape as SectionShape;
  // Inferring a shape from a NAME is the defect the canonical path exists to
  // remove — it means renaming a section can change its geometry. This survives
  // only because the legacy stress path still runs, and the honest fix is to
  // retire that path, not to grow this list. It is grown here anyway because
  // the alternative is worse: the IRAM families added to the catalogue would
  // otherwise fall through to 'generic' and be analysed as featureless blocks.
  const name = sec.name.toUpperCase();
  if (name.startsWith('IPE') || name.startsWith('IPN')) return 'I';
  if (/^(W|HP|M)\d/.test(name)) return name.startsWith('HP') ? 'H' : 'I';
  if (name.startsWith('HEB') || name.startsWith('HEA') || name.startsWith('HEM')) return 'H';
  if (name.startsWith('UPN') || name.startsWith('UPE')) return 'U';
  if (/^(MC|C)\d/.test(name)) return 'U';
  if (/^T\s?\d/.test(name)) return 'T';
  if (name.match(/^L\s?\d/)) return 'L';
  if (name.startsWith('RHS') || name.startsWith('SHS')) return 'RHS';
  if (name.startsWith('CHS')) return 'CHS';
  if (name.startsWith('H.A. T ') || name.startsWith('HA T ')) return 'T';
  if (name.startsWith('H.A. L INV') || name.startsWith('HA L INV')) return 'invL';
  if (name.startsWith('C ') && sec.t) return 'C';
  if (sec.b && sec.h && !sec.tw && !sec.tf) return 'rect';
  return 'generic';
}

// ─── Geometry resolution ──────────────────────────────────────────────

/**
 * LEGACY geometry reconstruction — properties-only compatibility ONLY.
 *
 * Infers a shape from the profile NAME and invents thicknesses when they are
 * missing (`tw = 0.05 b`, `tf = 0.06 h`), which measured a 40 % error in the
 * shear stress of an I-profile. It is retained solely so a properties-only
 * section loaded from an old file still renders its legacy shear/torsion view
 * in the narrow domain where that was validated.
 *
 * It must NEVER be used for a geometry-backed section: canonical geometry
 * comes from `lib/section/canonical.ts` and is proved identical to the drawing
 * by digest. A regression test asserts no canonical consumer imports this.
 *
 * @deprecated Use `resolveCanonicalSection` / `resolveDrawingGeometry`.
 */
export function resolveSectionGeometryLegacy(sec: Section): ResolvedSection {
  const shape = inferSectionShape(sec);

  // Try to get tw/tf/t from section first
  let tw = sec.tw;
  let tf = sec.tf;
  let t = sec.t;
  let h = sec.h;
  let b = sec.b;
  // sec.iy = about Y-axis (horizontal), sec.iz = about Z-axis (vertical)
  let aboutY = sec.iy;  // about Y horizontal (m⁴) — may be missing (optional)
  let j = sec.j;        // torsion constant (m⁴)

  // Look up in profile catalog by name for missing properties
  const profile = (shape !== 'rect' && shape !== 'generic')
    ? ALL_PROFILES.find(p => p.name.toUpperCase() === sec.name.toUpperCase())
    : undefined;
  if (profile) {
    if (tw == null && profile.tw) tw = profile.tw * 1e-3; // mm→m
    if (tf == null && profile.tf) tf = profile.tf * 1e-3;
    if (t == null && profile.t) t = profile.t * 1e-3;
    if (h == null) h = profile.h * 1e-3;
    if (b == null) b = profile.b * 1e-3;
    if (aboutY == null) aboutY = profile.iy * 1e-8; // cm⁴→m⁴ — about Y (horizontal)
  }

  // Estimate h from about-Y inertia (h³ term) if available, else from sec.iz
  if (!h) h = sec.a > 1e-15 ? Math.sqrt(12 * (aboutY ?? sec.iz) / sec.a) : 0.1;
  if (!b) b = h > 1e-12 ? sec.a / h : 0.01; // rough estimate

  // Defaults for thicknesses based on shape
  if (shape === 'I' || shape === 'H' || shape === 'U') {
    tw = tw ?? b * 0.05;   // rough fallback
    tf = tf ?? h * 0.06;
  } else if (shape === 'RHS' || shape === 'CHS') {
    t = t ?? Math.min(b, h) * 0.05;
  } else if (shape === 'L') {
    t = t ?? b * 0.1;
  } else if (shape === 'T' || shape === 'invL') {
    tw = tw ?? b * 0.3;   // fallback: web width ~30% of flange
    tf = tf ?? h * 0.15;  // fallback: flange ~15% of total height
  } else if (shape === 'C') {
    tw = tw ?? b * 0.08;
    tf = tf ?? h * 0.05;
    t = t ?? h * 0.1;    // lip length
  }

  const twR = tw ?? 0;
  const tfR = tf ?? 0;
  const tR = t ?? 0;

  // ── Resolve about-Y inertia (primary 2D bending) if still missing ──
  if (aboutY == null) {
    aboutY = estimateAboutY(shape, sec.a, sec.iz, h, b, twR, tfR, tR);
  }

  // ── Resolve about-Z inertia (secondary, for central core) ──
  // sec.iz = about Z (vertical), always available (required field) — use directly
  const aboutZ = sec.iz;

  // ── Resolve J (torsion constant) if still missing ──
  if (j == null) {
    j = estimateJ(shape, h, b, twR, tfR, tR);
  }

  // Compute actual y-bounds from centroid for asymmetric sections
  let yMin = -h / 2;
  let yMax = h / 2;
  if (shape === 'T' || shape === 'invL') {
    const hf = tfR;
    const hw = h - hf;
    const bw = twR;
    const bf = b;
    const Asec = bw * hw + bf * hf;
    if (Asec > 0) {
      const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / Asec;
      yMin = -yBar;
      yMax = h - yBar;
    }
  }

  // z-bounds from centroid (symmetric for most shapes)
  let zMin = -b / 2;
  let zMax = b / 2;

  return {
    shape,
    a: sec.a,
    iy: aboutY,    // about Y (horizontal) — primary 2D bending (Navier, Jourawski)
    iz: aboutZ,    // about Z (vertical) — secondary (central core)
    j,
    h,
    b,
    tw: twR,
    tf: tfR,
    t: tR,
    tl: sec.tl ?? (shape === 'C' ? tfR : 0),
    yMin,
    yMax,
    zMin,
    zMax,
  };
}

/** Estimate inertia about Y-axis (horizontal, h³ terms) — primary 2D bending inertia */
function estimateAboutY(
  shape: SectionShape, _A: number, Iz: number,
  h: number, b: number, tw: number, tf: number, t: number,
): number {
  switch (shape) {
    case 'rect':
    case 'generic':
      return b * h * h * h / 12;
    case 'I':
    case 'H': {
      // Iy ≈ 2·(b·tf³/12 + b·tf·d²) + tw·hw³/12 (parallel axis)
      const hw = h - 2 * tf;
      const d = (h - tf) / 2; // flange center to centroid
      return 2 * (b * tf * tf * tf / 12 + b * tf * d * d) + tw * hw * hw * hw / 12;
    }
    case 'U': {
      const hw = h - 2 * tf;
      const d = (h - tf) / 2;
      return 2 * (b * tf * tf * tf / 12 + b * tf * d * d) + tw * hw * hw * hw / 12;
    }
    case 'RHS': {
      const bI = b - 2 * t;
      const hI = h - 2 * t;
      return (b * h * h * h - bI * hI * hI * hI) / 12;
    }
    case 'CHS':
      return Iz; // by symmetry
    case 'L':
      return Iz; // equal legs approximation
    case 'T':
    case 'invL': {
      // Iy using parallel axis theorem
      const hf = tf;
      const hw = h - tf;
      const bw = tw;
      const bf = b;
      const Asec = bw * hw + bf * hf;
      if (Asec < 1e-15) return b * h * h * h / 12;
      const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / Asec;
      const iyWeb = bw * hw * hw * hw / 12 + bw * hw * (yBar - hw / 2) ** 2;
      const iyFlange = bf * hf * hf * hf / 12 + bf * hf * (hw + hf / 2 - yBar) ** 2;
      return iyWeb + iyFlange;
    }
    case 'C': {
      const hw = h - 2 * tf;
      const d = (h - tf) / 2;
      return 2 * (b * tf * tf * tf / 12 + b * tf * d * d) + tw * hw * hw * hw / 12;
    }
    default:
      // Fallback: scale from Iz by aspect ratio
      return b > 0 && h > 0 ? Iz * (h / b) * (h / b) : Iz;
  }
}

/** Estimate Saint-Venant torsion constant J when not provided */
function estimateJ(
  shape: SectionShape, h: number, b: number,
  tw: number, tf: number, t: number,
): number {
  switch (shape) {
    case 'rect':
    case 'generic': {
      // J = β·a·b³ where a ≥ b (longer side × shorter³)
      // Approximation: J ≈ a·b³·(1/3 - 0.21·(b/a)·(1 - (b/a)⁴/12))
      const a = Math.max(h, b);
      const bMin = Math.min(h, b);
      const ratio = bMin / a;
      return a * bMin * bMin * bMin * (1 / 3 - 0.21 * ratio * (1 - ratio * ratio * ratio * ratio / 12));
    }
    case 'I':
    case 'H':
      // J ≈ (1/3)·(2·b·tf³ + (h-2tf)·tw³)
      return (2 * b * tf * tf * tf + (h - 2 * tf) * tw * tw * tw) / 3;
    case 'U':
      // J ≈ (1/3)·(2·b·tf³ + (h-2tf)·tw³)  — same formula for U
      return (2 * b * tf * tf * tf + (h - 2 * tf) * tw * tw * tw) / 3;
    case 'RHS': {
      // J ≈ 2·t·(b-t)²·(h-t)² / (b+h-2t)
      const bm = b - t;
      const hm = h - t;
      return 2 * t * bm * bm * hm * hm / (b + h - 2 * t);
    }
    case 'CHS': {
      // J = 2·π·Rm³·t
      const Rm = (h / 2) - (t / 2);
      return 2 * Math.PI * Rm * Rm * Rm * t;
    }
    case 'L':
      // J ≈ (1/3)·(b+h-t)·t³
      return (b + h - t) * t * t * t / 3;
    case 'T':
    case 'invL': {
      // J ≈ (1/3)·(b·tf³ + (h-tf)·tw³)
      const hw = h - tf;
      return (b * tf * tf * tf + hw * tw * tw * tw) / 3;
    }
    case 'C': {
      // J ≈ (1/3)·(2·b·tf³ + (h-2tf)·tw³ + 2·lip·tl³) — tl≈tf
      const lip = t; // lip length stored in t for C-channels
      const tl = tf; // lip thickness ≈ flange thickness
      return (2 * b * tf * tf * tf + (h - 2 * tf) * tw * tw * tw + 2 * lip * tl * tl * tl) / 3;
    }
    default:
      // Very rough fallback for unknown shapes
      return Math.min(h, b) > 0
        ? (h * b * Math.min(h, b) * Math.min(h, b)) / 30
        : 1e-10;
  }
}

// ─── Normal stress σ(y) — Navier ─────────────────────────────────────

/**
 * Normal stress at fiber y from centroid.
 * σ(y) = N/A + M·y/Iz
 * Forces in kN/kN·m, areas in m², result in MPa (kN/m² / 1000).
 * Sign convention: positive N = tension, positive M with positive y = tension.
 */
export function normalStress(N: number, M: number, A: number, Iz: number, y: number): number {
  // N in kN, A in m² → N/A in kN/m² = kPa → /1000 → MPa
  // M in kN·m, Iz in m⁴, y in m → M·y/Iz in kN/m² → /1000 → MPa
  let sigma = 0;
  if (A > 1e-15) sigma += N / A;
  if (Iz > 1e-15) sigma += M * y / Iz;
  return sigma / 1000;
}

// ─── Shear stress τ(y) — Jourawski ───────────────────────────────────

/**
 * First moment of area Q(y) and width b(y) for different section shapes.
 * Returns { Q, bAtY } where Q is in m³ and bAtY in m.
 */
function computeQandB(y: number, rs: ResolvedSection): { Q: number; bAtY: number } {
  const halfH = rs.h / 2;

  switch (rs.shape) {
    case 'rect':
    case 'generic': {
      // Rectangular: Q(y) = (b/2)·(h²/4 - y²)
      const Q = (rs.b / 2) * (halfH * halfH - y * y);
      return { Q, bAtY: rs.b };
    }

    case 'I':
    case 'H':
    case 'U': {
      // I/H/U section — use |y| for symmetric computation.
      // Q(y) = first moment of area above the cut at |y|.
      // For doubly-symmetric sections: |Q(y)| = |Q(-y)|.
      const yAbs = Math.abs(y);
      const yJunction = halfH - rs.tf;  // flange-web boundary

      if (yAbs >= halfH) {
        return { Q: 0, bAtY: rs.b };
      }

      if (yAbs > yJunction) {
        // In the flange: area above is rectangle b × (h/2 - |y|)
        const dy = halfH - yAbs;
        const Q = rs.b * dy * (halfH - dy / 2);
        return { Q, bAtY: rs.b };
      }

      // In the web: Q = Q_flange + Q_web_above_|y|
      const Qflange = rs.b * rs.tf * (halfH - rs.tf / 2);
      const webAbove = yJunction - yAbs;
      const Qweb = rs.tw * webAbove * (yJunction - webAbove / 2);
      return { Q: Qflange + Qweb, bAtY: rs.tw };
    }

    case 'RHS': {
      // Rectangular hollow section
      const bOuter = rs.b;
      const hOuter = rs.h;
      const hInner = hOuter - 2 * rs.t;
      const halfHi = hInner / 2;

      if (Math.abs(y) > halfH) return { Q: 0, bAtY: bOuter };

      if (Math.abs(y) > halfHi) {
        // In the flange (top/bottom wall)
        const dy = halfH - Math.abs(y);
        const Q = bOuter * dy * (halfH - dy / 2);
        return { Q, bAtY: bOuter };
      }

      // In the web zone (two webs)
      const Qflange = bOuter * rs.t * (halfH - rs.t / 2);
      const webAbove = halfHi - Math.abs(y);
      const Qweb = 2 * rs.t * webAbove * (halfHi - webAbove / 2);
      return { Q: Qflange + Qweb, bAtY: 2 * rs.t };
    }

    case 'CHS': {
      // Circular tube, mean radius R ≈ h/2, wall t. A horizontal cut at
      // height y severs TWO walls, b(y) = 2t, and Q must then be the first
      // moment of the WHOLE area above the cut — both sides. With θ measured
      // from the crown (cos θ = y/R), integrating t·R dφ at height R·cos φ
      // from the free edge down to θ gives, per side, t·R²·sin θ, so
      //   Q(y) = 2·t·R²·sin θ = 2·t·R·√(R²−y²),
      //   τ(y) = V·Q/(I·b) = V·R·√(R²−y²)/I  →  τ_max = V·R²/I = 2V/A,
      // the classic thin-tube result — the same answer sfCHS draws, pinned
      // against this path in shear-flow-audit.test.ts. The earlier form
      // Q = t·(R²−y²) was the one-sided moment paired with the two-sided b:
      // half the magnitude and the wrong (parabolic) shape.
      const R = rs.h / 2;
      if (Math.abs(y) >= R) return { Q: 0, bAtY: rs.t > 0 ? rs.t : R };
      if (rs.t > 0) {
        const Q = 2 * rs.t * R * Math.sqrt(R * R - y * y);
        return { Q, bAtY: 2 * rs.t };
      }
      // t = 0 reads as a SOLID round bar (a tube with no wall has no area).
      // Exact Jourawski pair for a solid circle: Q(y) = (2/3)·(R²−y²)^{3/2}
      // over the chord b(y) = 2·√(R²−y²), so τ(y) = V·(R²−y²)/(3·I) and
      // τ_max = 4V/3A — not the thin-tube 2V/A, which here would say 4V/A.
      const chord = Math.sqrt(R * R - y * y);
      const Q = (2 / 3) * (R * R - y * y) * chord;
      return { Q, bAtY: 2 * chord };
    }

    case 'L': {
      // Angle section — approximate as rectangular for shear
      const Q = (rs.t / 2) * (halfH * halfH - y * y);
      return { Q, bAtY: rs.t };
    }

    case 'C': {
      // C-channel with lips: symmetric like U but with lip contribution to Q
      // Geometry is same vertical symmetry as I/H/U
      const yAbs = Math.abs(y);
      const yJunction = halfH - rs.tf;  // flange-web boundary
      const lipLen = rs.t;              // lip length
      const yLipTop = yJunction;        // lip starts at inner flange edge
      const yLipBot = yJunction - lipLen; // lip ends here

      if (yAbs >= halfH) {
        return { Q: 0, bAtY: rs.b };
      }

      if (yAbs > yJunction) {
        // In the flange
        const dy = halfH - yAbs;
        const Q = rs.b * dy * (halfH - dy / 2);
        return { Q, bAtY: rs.b };
      }

      // Below flange junction: Q_flange + Q_lip_above + Q_web_above
      const Qflange = rs.b * rs.tf * (halfH - rs.tf / 2);

      // Lip contribution above |y| (lip goes from yJunction down to yLipBot)
      const lipThk = rs.tl || rs.tf; // lip thickness (fallback to tf for old sections)
      let Qlip = 0;
      if (yAbs < yLipTop) {
        if (yAbs >= yLipBot) {
          // Partially in lip zone
          const lipDy = yLipTop - yAbs;
          Qlip = lipThk * lipDy * (yLipTop - lipDy / 2);
        } else {
          // Below lip entirely
          Qlip = lipThk * lipLen * (yLipTop - lipLen / 2);
        }
      }

      // Web above |y|
      const webAbove = yJunction - yAbs;
      const Qweb = rs.tw * webAbove * (yJunction - webAbove / 2);

      // Width at |y|: in lip zone it's tw + tl (web + lip), otherwise just tw
      const inLipZone = yAbs >= yLipBot && yAbs < yLipTop;
      const bAtY = inLipZone ? rs.tw + lipThk : rs.tw;

      return { Q: Qflange + Qlip + Qweb, bAtY };
    }

    case 'T':
    case 'invL': {
      // T-beam / inverted L: asymmetric section with centroid NOT at h/2
      const hf = rs.tf;            // flange thickness
      const hw = rs.h - hf;        // web height
      const bw = rs.tw;            // web width
      const bf = rs.b;             // flange width
      const A = bw * hw + bf * hf;
      // Centroid from bottom
      const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
      // Key positions in centroid coordinates (positive up)
      const yTop = rs.h - yBar;    // top of flange
      const yJunc = hw - yBar;     // junction (top of web / bottom of flange)
      const yBot = -yBar;          // bottom of web

      if (y >= yTop || y <= yBot) {
        return { Q: 0, bAtY: y >= yJunc ? bf : bw };
      }

      if (y > yJunc) {
        // In the flange: Q from top to y
        // Q(y) = bf/2 * (yTop² - y²)
        const Q = (bf / 2) * (yTop * yTop - y * y);
        return { Q, bAtY: bf };
      }

      // In the web: Q = Q_flange + Q_web_above_y
      const Qflange = bf * hf * (yTop - hf / 2);
      const Qweb = (bw / 2) * (yJunc * yJunc - y * y);
      return { Q: Qflange + Qweb, bAtY: bw };
    }

    default: {
      // Fallback: rectangular approximation
      const Q = (rs.b / 2) * (halfH * halfH - y * y);
      return { Q, bAtY: rs.b };
    }
  }
}

/**
 * Shear stress at fiber y.
 * τ(y) = V·Q(y) / (Iz·b(y))
 * V in kN, Q in m³, Iz in m⁴, b in m → kN/m² → /1000 → MPa
 */
/**
 * Shear stress at fiber y (Jourawski).
 * τ(y) = V·Q(y) / (Iz·b(y))
 * Returns SIGNED tau: positive when V > 0 (sign follows shear force direction).
 * For Mohr's circle the sign matters; for magnitude checks use |tau|.
 */
export function shearStress(V: number, y: number, rs: ResolvedSection): number {
  const { Q, bAtY } = computeQandB(y, rs);
  if (bAtY < 1e-12 || rs.iy < 1e-15) return 0;
  return (V * Q) / (rs.iy * bAtY) / 1000;
}

/**
 * τ_max / (V/A) for a section: the shear form factor, from Jourawski.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * Two colour maps were each estimating peak shear with a CONSTANT, and neither
 * constant belongs to the sections people actually use:
 *
 *   * the 3D heat map used 1.2, which is not a peak factor at all — it is
 *     `A/A_s` for a rectangle, the SHEAR-DEFLECTION coefficient. It answers
 *     "how much does shear add to the deflection", not "how high does the
 *     stress get";
 *   * the 2D map used 1.5, which IS the peak factor — for a solid rectangle,
 *     and only for one.
 *
 * Measured against this function on catalogue sections, both under-report the
 * real peak, in the unsafe direction:
 *
 *       section        1.2·V/A    1.5·V/A    Jourawski     error
 *       IPE 300         22.30      27.88       50.74      −56% / −45%
 *       HEB 300          8.05      10.06       32.33      −75% / −69%
 *       CHS 300×8       16.35      20.44       28.74      −43% / −29%
 *       rect 0.3×0.5     0.80       1.00        1.00      −20% /   0%
 *
 * An I-section is where the gap is worst and it is the ordinary case: the web
 * carries nearly all the shear over a fraction of the gross area, so V/A is
 * simply the wrong denominator. The factors this returns are the familiar
 * ones — 1.5 for a rectangle, ~2 for a thin tube, and whatever the geometry
 * gives for an I.
 *
 * ── Why a factor rather than the stress ────────────────────────────
 *
 * It depends only on the SECTION, so it can be computed once and reused for
 * every station of every load case. The callers are per-vertex render paths;
 * resolving the geometry inside them would put a profile-catalogue lookup on
 * the hot path for a number that never changes.
 *
 * Falls back to 1.5 — the rectangle — when the geometry is not resolvable,
 * which is what the 2D map already assumed for everything.
 */
const SHEAR_FACTOR_CACHE = new WeakMap<object, number>();

export function shearPeakFactor(sec: Section): number {
  const cached = SHEAR_FACTOR_CACHE.get(sec as unknown as object);
  if (cached !== undefined) return cached;

  let factor = 1.5;
  try {
    const rs = resolveSectionGeometryLegacy(sec);
    if (rs.a > 1e-15 && rs.iy > 1e-15) {
      // Walk the fibre range: the peak is at the neutral axis for the common
      // shapes, but not for a tee or an angle, whose centroid is off-centre.
      const lo = rs.yMin, hi = rs.yMax;
      let peak = 0;
      for (let i = 0; i <= 100; i++) {
        const y = lo + ((hi - lo) * i) / 100;
        peak = Math.max(peak, Math.abs(shearStress(1, y, rs)));
      }
      // `shearStress` divides by 1000 for MPa; the mean here is in the same
      // units, so the ratio is dimensionless either way.
      const mean = 1 / rs.a / 1000;
      if (peak > 0 && mean > 0) factor = peak / mean;
    }
  } catch {
    /* An unresolvable section keeps the rectangle default. */
  }

  SHEAR_FACTOR_CACHE.set(sec as unknown as object, factor);
  return factor;
}

// ─── Full stress distribution ─────────────────────────────────────────

const NUM_STRESS_POINTS = 31;

/**
 * Build sampling positions along section height.
 * For I/H/U sections, adds extra points just above/below the flange-web
 * junction to capture the tau discontinuity (b changes from flange to web).
 */
function buildSamplingPositions(rs: ResolvedSection): number[] {
  const halfH = rs.h / 2;
  const eps = rs.h * 0.001; // tiny offset for junction sampling

  // For asymmetric sections (T/invL), compute actual bounds from centroid
  let yMin = -halfH;
  let yMax = halfH;
  if (rs.shape === 'T' || rs.shape === 'invL') {
    const hf = rs.tf;
    const hw = rs.h - hf;
    const bw = rs.tw;
    const bf = rs.b;
    const A = bw * hw + bf * hf;
    const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
    yMin = -yBar;           // bottom of web
    yMax = rs.h - yBar;     // top of flange
  }

  // Base: uniform sampling between actual bounds
  const positions: number[] = [];
  const span = yMax - yMin;
  for (let i = 0; i < NUM_STRESS_POINTS; i++) {
    positions.push(yMin + (i / (NUM_STRESS_POINTS - 1)) * span);
  }

  // For I/H/U: add points at flange-web junctions to show tau jump
  if ((rs.shape === 'I' || rs.shape === 'H' || rs.shape === 'U') && rs.tf > 0) {
    const yJunction = halfH - rs.tf;
    // Add points just inside flange and just inside web at both junctions
    positions.push(yJunction + eps, yJunction - eps);   // top junction
    positions.push(-yJunction + eps, -yJunction - eps); // bottom junction
  }

  // For RHS: junction at inner wall
  if (rs.shape === 'RHS' && rs.t > 0) {
    const yInner = halfH - rs.t;
    positions.push(yInner + eps, yInner - eps);
    positions.push(-yInner + eps, -yInner - eps);
  }

  // For C: junctions at flange-web and lip boundaries
  if (rs.shape === 'C' && rs.tf > 0 && rs.t > 0) {
    const yJunction = halfH - rs.tf;
    positions.push(yJunction + eps, yJunction - eps);
    positions.push(-yJunction + eps, -yJunction - eps);
    const yLipEnd = yJunction - rs.t;
    if (yLipEnd > -halfH + eps) {
      positions.push(yLipEnd + eps, yLipEnd - eps);
      positions.push(-yLipEnd + eps, -yLipEnd - eps);
    }
  }

  // For T/invL: junction at flange-web boundary (asymmetric centroid)
  if ((rs.shape === 'T' || rs.shape === 'invL') && rs.tf > 0 && rs.tw > 0) {
    const hf = rs.tf;
    const hw = rs.h - hf;
    const bw = rs.tw;
    const bf = rs.b;
    const A = bw * hw + bf * hf;
    const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
    const yJunction = hw - yBar;  // junction in centroid coords
    positions.push(yJunction + eps, yJunction - eps);
  }

  // Sort and deduplicate
  positions.sort((a, b) => a - b);
  const deduped: number[] = [positions[0]];
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] - deduped[deduped.length - 1] > eps * 0.5) {
      deduped.push(positions[i]);
    }
  }
  return deduped;
}

/** Compute σ(y) and τ(y) at sampled fibers across section height.
 *  Adds extra points at flange-web junctions for I/H sections. */
export function computeStressDistribution(
  N: number, V: number, M: number,
  rs: ResolvedSection,
): StressPoint[] {
  const yPositions = buildSamplingPositions(rs);
  return yPositions.map(y => ({
    y,
    sigma: normalStress(N, M, rs.a, rs.iy, y),
    tau: shearStress(V, y, rs),
  }));
}

// ─── Mohr's Circle ────────────────────────────────────────────────────

/**
 * Compute Mohr's circle for plane stress state.
 * σ_x = sigma, σ_y = 0 (free surface), τ_xy = tau
 */
export function computeMohrCircle(sigma: number, tau: number): MohrCircle {
  const center = sigma / 2;
  const radius = Math.sqrt((sigma / 2) ** 2 + tau ** 2);
  const sigma1 = center + radius;
  const sigma2 = center - radius;
  const thetaP = 0.5 * Math.atan2(2 * tau, sigma);

  return {
    center,
    radius,
    sigma1,
    sigma2,
    thetaP,
    tauMax: radius,
  };
}

// ─── Failure criteria ─────────────────────────────────────────────────

/**
 * Check Von Mises, Tresca, and Rankine failure criteria.
 * For plane stress with σ_y = 0:
 *   Von Mises: σ_vm = √(σ² + 3τ²)       — energía de distorsión
 *   Tresca:    2·τ_max = 2·√((σ/2)² + τ²) — máxima tensión tangencial
 *   Rankine:   max(|σ₁|, |σ₃|)            — máxima tensión normal
 */
export function checkFailure(sigma: number, tau: number, fy: number | undefined): FailureCheck {
  const vonMises = Math.sqrt(sigma ** 2 + 3 * tau ** 2);
  const trescaTauMax = Math.sqrt((sigma / 2) ** 2 + tau ** 2);
  const tresca = 2 * trescaTauMax; // equivalent stress

  // Rankine: max absolute value of principal stresses
  // σ₁ = σ/2 + R, σ₃ = σ/2 - R  where R = √((σ/2)² + τ²)
  const center = sigma / 2;
  const radius = trescaTauMax; // = √((σ/2)² + τ²)
  const rankine = Math.max(Math.abs(center + radius), Math.abs(center - radius));

  const fyVal = fy ?? null;
  const ratioVM = fyVal ? vonMises / fyVal : null;
  const ratioTresca = fyVal ? tresca / fyVal : null;
  const ratioRankine = fyVal ? rankine / fyVal : null;
  const ok = fyVal ? vonMises <= fyVal : null;

  return { vonMises, tresca, rankine, fy: fyVal, ratioVM, ratioTresca, ratioRankine, ok };
}

// ─── Full section analysis at a point ─────────────────────────────────

/**
 * Analyze stresses at a specific cross-section of an element.
 * @param ef Element forces from solver
 * @param sec Section properties
 * @param fy Yield stress in MPa (optional)
 * @param t Position along element [0,1]
 * @param yFiber Fiber position from centroid [m] (default: extreme fiber)
 */
export function analyzeSectionStress(
  ef: ElementForces,
  sec: Section,
  fy: number | undefined,
  t: number,
  yFiber?: number,
): SectionStressResult {
  if (isWasmReady()) {
    const raw = computeSectionStress2D({
      elementForces: ef,
      section: sec,
      fy: fy ?? null,
      t,
      yFiber: yFiber ?? null,
    });
    // WASM serde camelCase converts ratio_vm → ratioVm, but TS uses ratioVM
    if (raw.failure) {
      const f = raw.failure;
      if ('ratioVm' in f) { f.ratioVM = f.ratioVm; delete f.ratioVm; }
    }
    return raw;
  }

  // TS fallback
  const N = computeDiagramValueAt('axial', t, ef);
  const V = computeDiagramValueAt('shear', t, ef);
  const M = computeDiagramValueAt('moment', t, ef);

  const resolved = resolveSectionGeometryLegacy(sec);
  const y = yFiber ?? resolved.h / 2;
  const distribution = computeStressDistribution(N, V, M, resolved);
  const sigmaAtY = normalStress(N, M, resolved.a, resolved.iy, y);
  const tauAtY = shearStress(V, y, resolved);
  const mohr = computeMohrCircle(sigmaAtY, tauAtY);
  const failure = checkFailure(sigmaAtY, tauAtY, fy);

  let neutralAxisY: number | null = null;
  if (Math.abs(M) > 1e-10 && resolved.a > 1e-15) {
    const yEN = -(N * resolved.iy) / (resolved.a * M);
    if (yEN >= resolved.yMin - 1e-6 && yEN <= resolved.yMax + 1e-6) {
      neutralAxisY = yEN;
    }
  }

  return { N, V, M, resolved, distribution, sigmaAtY, tauAtY, mohr, failure, neutralAxisY };
}

// ─── Central Core (Núcleo Central) ───────────────────────────────────

/**
 * Central core (núcleo central): locus of points where an axial force N
 * can be applied such that the entire section remains in the same stress
 * sign (no tension if compressive, no compression if tensile).
 *
 * For any section: the core boundary is defined by eccentricities
 *   ey_max = Wz / A = Iz / (A · yMax)  [eccentricity in z-direction]
 *   ez_max = Wy / A = Iy / (A · zMax)  [eccentricity in y-direction]
 *
 * Shape-specific cores:
 *   - Rectangle: diamond (rombo) with vertices at (0, ±h/6) and (±b/6, 0)
 *   - Circle/CHS: circle of radius R/4 (solid) or Rm/4·(1+(Ri/Ro)²) (hollow)
 *   - I/H: hexagon (6 vertices) considering different yMax for flange vs web
 */
export interface CentralCore {
  /** Vertices of the core boundary polygon in (ez, ey) space [m] — ez horizontal, ey vertical */
  vertices: Array<{ ez: number; ey: number }>;
  /** Max eccentricity in y-direction before tension/compression change (m) */
  eyMax: number;
  /** Max eccentricity in z-direction before tension/compression change (m) */
  ezMax: number;
}

/**
 * Compute the central core (núcleo central) of a section.
 * The core is the dual of the section boundary: for each extreme fiber,
 * there's a corresponding core boundary point.
 */
export function computeCentralCore(rs: ResolvedSection): CentralCore {
  const A = rs.a;
  const Iz = rs.iy;  // about Y (horizontal) — primary bending
  const Iy = rs.iz;  // about Z (vertical) — secondary

  if (A < 1e-15 || Iz < 1e-15 || Iy < 1e-15) {
    return { vertices: [], eyMax: 0, ezMax: 0 };
  }

  // Module resistentes (section moduli)
  // Wz_sup = Iz / yMax, Wz_inf = Iz / |yMin|
  // Wy_der = Iy / zMax, Wy_izq = Iy / |zMin|
  const WzSup = Math.abs(rs.yMax) > 1e-12 ? Iz / Math.abs(rs.yMax) : 0;
  const WzInf = Math.abs(rs.yMin) > 1e-12 ? Iz / Math.abs(rs.yMin) : 0;
  const WyDer = Math.abs(rs.zMax) > 1e-12 ? Iy / Math.abs(rs.zMax) : 0;
  const WyIzq = Math.abs(rs.zMin) > 1e-12 ? Iy / Math.abs(rs.zMin) : 0;

  // Eccentricities: e = W/A
  const eyPos = WzInf / A;  // eccentricity upward (fibra inferior determina límite superior)
  const eyNeg = WzSup / A;  // eccentricity downward (fibra superior → límite inferior)
  const ezPos = WyIzq / A;  // eccentricity to right
  const ezNeg = WyDer / A;  // eccentricity to left

  const eyMax = Math.max(eyPos, eyNeg);
  const ezMax = Math.max(ezPos, ezNeg);

  switch (rs.shape) {
    case 'CHS': {
      // Circular section: core is a circle of radius R/4 (solid) or generalized
      // For CHS: R_core = Iz / (A · R) where R = h/2
      const R = rs.h / 2;
      if (R < 1e-12) return { vertices: [], eyMax: 0, ezMax: 0 };
      const Rcore = Iz / (A * R);
      // Approximate circle with polygon
      const N = 24;
      const vertices: CentralCore['vertices'] = [];
      for (let i = 0; i < N; i++) {
        const theta = (2 * Math.PI * i) / N;
        vertices.push({ ez: Rcore * Math.cos(theta), ey: Rcore * Math.sin(theta) });
      }
      return { vertices, eyMax: Rcore, ezMax: Rcore };
    }

    case 'rect':
    case 'generic': {
      // Rectangle: diamond (rombo) → h/6, b/6
      // Vertices: (0, +ey), (+ez, 0), (0, -ey), (-ez, 0)
      return {
        vertices: [
          { ez: 0, ey: eyPos },
          { ez: ezPos, ey: 0 },
          { ez: 0, ey: -eyNeg },
          { ez: -ezNeg, ey: 0 },
        ],
        eyMax,
        ezMax,
      };
    }

    case 'I':
    case 'H': {
      // I/H sections: diamond (rhombus) core — same as rectangle.
      // The flange corners (±b/2, ±h/2) are material points that constrain
      // the core to the diamond. The re-entrant web-flange corners at
      // (±tw/2, ±(h/2-tf)) give less restrictive constraints.
      return {
        vertices: [
          { ez: 0, ey: eyPos },
          { ez: ezPos, ey: 0 },
          { ez: 0, ey: -eyNeg },
          { ez: -ezNeg, ey: 0 },
        ],
        eyMax,
        ezMax,
      };
    }

    default: {
      // Generic: diamond (most conservative approximation)
      return {
        vertices: [
          { ez: 0, ey: eyPos },
          { ez: ezPos, ey: 0 },
          { ez: 0, ey: -eyNeg },
          { ez: -ezNeg, ey: 0 },
        ],
        eyMax,
        ezMax,
      };
    }
  }
}

// ─── Suggested critical sections ──────────────────────────────────────

/**
 * Suggest critical sections along an element where stresses may be maximum.
 */
export function suggestCriticalSections(ef: ElementForces): CriticalSection[] {
  const sections: CriticalSection[] = [];
  const L = ef.length;

  // Always include ends
  sections.push({ t: 0, reason: t('stress.endI') });
  sections.push({ t: 1, reason: t('stress.endJ') });

  // Find where V = 0 (M is maximum)
  // V(x) = Vs + q_i·x + (q_j - q_i)·x²/(2L) + Σ(point loads before x)
  // For simple case (no point loads, uniform load q):
  // V(x) = Vs + q·x = 0 → x = -Vs/q
  const Vs = ef.vStart;
  const qi = ef.qI;
  const qj = ef.qJ;

  if (Math.abs(qi) > 1e-10 || Math.abs(qj) > 1e-10) {
    // For uniform load (qi ≈ qj): V(x) = Vs + q·x = 0 → x = -Vs/q
    if (Math.abs(qi - qj) < 1e-10 && Math.abs(qi) > 1e-10) {
      const x0 = -Vs / qi;
      const t0 = x0 / L;
      if (t0 > 0.01 && t0 < 0.99) {
        sections.push({ t: t0, reason: 'M max (V=0)' });
      }
    } else if (Math.abs(qj - qi) > 1e-10) {
      // Trapezoidal: V(x) = Vs + qi·x + (qj-qi)·x²/(2L) = 0
      // Quadratic: a·x² + b·x + c = 0
      const a = (qj - qi) / (2 * L);
      const b = qi;
      const c = Vs;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        for (const x0 of [(-b + sqrtDisc) / (2 * a), (-b - sqrtDisc) / (2 * a)]) {
          const t0 = x0 / L;
          if (t0 > 0.01 && t0 < 0.99) {
            sections.push({ t: t0, reason: 'M max (V=0)' });
          }
        }
      }
    }
  }

  // Point load positions — discontinuities in V, potential M maxima
  if (ef.pointLoads) {
    for (const pl of ef.pointLoads) {
      const tPl = pl.a / L;
      if (tPl > 0.01 && tPl < 0.99) {
        sections.push({ t: tPl, reason: t('stress.pointLoadReason') });
      }
    }
  }

  // Midpoint (useful for uniform loads)
  if (sections.every(s => Math.abs(s.t - 0.5) > 0.05)) {
    sections.push({ t: 0.5, reason: t('stress.midspan') });
  }

  // Sort by t and deduplicate (merge close ones)
  sections.sort((a, b) => a.t - b.t);
  const deduped: CriticalSection[] = [];
  for (const s of sections) {
    if (deduped.length === 0 || Math.abs(s.t - deduped[deduped.length - 1].t) > 0.02) {
      deduped.push(s);
    }
  }

  return deduped;
}

// ─── Shear flow (Jourawski along thin-wall centerline) ───────────────

export interface ShearFlowPoint {
  z: number;     // m, horizontal position on section from centroid
  y: number;     // m, vertical position on section from centroid
  tau: number;   // MPa, magnitude (>= 0)
}

export interface ShearFlowSegment {
  /** Points ordered in the flow direction (for V > 0).
   *  If V < 0, flow direction reverses but magnitudes stay the same. */
  points: ShearFlowPoint[];
}

/**
 * Whether a section shape is "massive" (solid cross-section) vs thin-walled.
 *
 * For massive sections, Jourawski τ(y) = V·Q/(I·b) is still valid, but the
 * "shear flow" visualization (directional paths along wall centerlines) is
 * conceptually inappropriate — massive sections show a τ(y) distribution.
 *
 * For thin-walled sections, shear flow q = V·Q/I [force/length] along the
 * wall centerline is the appropriate visualization.
 */
export function isMassiveSection(shape: SectionShape): boolean {
  return shape === 'rect' || shape === 'generic';
}

/**
 * Compute shear flow paths along the thin-wall centerline of a section.
 *
 * Unlike the 1D τ(y) distribution (which only shows magnitude vs height),
 * this returns DIRECTIONAL flow along each wall segment:
 *
 * - I/H: flanges carry horizontal flow (inward at top, outward at bottom),
 *         web carries vertical flow (parabolic, max at neutral axis).
 * - RHS:  top/bottom walls horizontal, side walls vertical (closed section with q₀).
 * - CHS:  sinusoidal flow on two semicircles, both downward.
 * - Rect/generic: single vertical path showing τ(y) distribution (Jourawski).
 */
export function computeShearFlowPaths(V: number, rs: ResolvedSection): ShearFlowSegment[] {
  if (Math.abs(V) < 1e-6 || rs.iy < 1e-15) return [];
  const absV = Math.abs(V);

  switch (rs.shape) {
    case 'I':
    case 'H':
      return sfI(absV, rs);
    case 'U':
      return sfU(absV, rs);
    case 'L':
      return sfL(absV, rs);
    case 'RHS':
      return sfRHS(absV, rs);
    case 'CHS':
      return sfCHS(absV, rs);
    case 'T':
      return sfT(absV, rs);
    case 'invL':
      return sfInvL(absV, rs);
    case 'C':
      return sfC(absV, rs);
    default:
      return sfRect(absV, rs);
  }
}

// ── Rect / generic ──

function sfRect(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const halfH = rs.h / 2;
  const N = 16;
  const pts: ShearFlowPoint[] = [];
  for (let i = 0; i <= N; i++) {
    const y = halfH - (i / N) * rs.h;
    const Q = (rs.b / 2) * (halfH * halfH - y * y);
    pts.push({ z: 0, y, tau: absV * Q / (rs.iy * rs.b) / 1000 });
  }
  return [{ points: pts }];
}

// ── I / H / U (open section — 5 segments) ──

function sfI(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const halfH = rs.h / 2;
  const halfB = rs.b / 2;
  const N = 10;
  const yFlCL = halfH - rs.tf / 2;   // flange centerline y
  const hw = rs.h - 2 * rs.tf;       // web clear height

  // τ in flange at distance s from free edge:
  // Q(s) = tf·s·yFlCL  →  τ = V·s·yFlCL / Iz  (tf cancels)
  const flangeT = (s: number) => absV * s * yFlCL / rs.iy / 1000;

  // Total Q of both flange halves entering web
  const QflTotal = rs.b * rs.tf * yFlCL;

  // τ in web at distance s from top of web:
  // Q_web(s) = Q_flanges + tw·[(hw/2)·s - s²/2]
  const webT = (s: number) => {
    const Qweb = rs.tw * ((hw / 2) * s - s * s / 2);
    return absV * (QflTotal + Qweb) / (rs.iy * rs.tw) / 1000;
  };

  return [
    // 1. Top flange right: tip (b/2) → junction (0) — flow inward ←
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfB;
      return { z: halfB - s, y: yFlCL, tau: flangeT(s) };
    })},
    // 2. Top flange left: tip (-b/2) → junction (0) — flow inward →
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfB;
      return { z: -halfB + s, y: yFlCL, tau: flangeT(s) };
    })},
    // 3. Web: top junction → bottom junction — flow downward ↓
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * hw;
      return { z: 0, y: hw / 2 - s, tau: webT(s) };
    })},
    // 4. Bottom flange: junction (0) → right tip (b/2) — flow outward →
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfB;
      return { z: s, y: -yFlCL, tau: flangeT(halfB - s) };
    })},
    // 5. Bottom flange: junction (0) → left tip (-b/2) — flow outward ←
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfB;
      return { z: -s, y: -yFlCL, tau: flangeT(halfB - s) };
    })},
  ];
}

// ── U / Channel (open section — 3 segments, single flange per side) ──

function sfU(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const halfH = rs.h / 2;
  const halfB = rs.b / 2;
  const N = 10;
  const yFlCL = halfH - rs.tf / 2;
  const hw = rs.h - 2 * rs.tf;

  // UPN: one flange per side extending from tip to web.
  // Q in flange at distance s from free edge:
  const flangeT = (s: number) => absV * s * yFlCL / rs.iy / 1000;

  // Only ONE flange contributes Q to the web (not two like I-section)
  const QflTotal = rs.tf * halfB * yFlCL;

  const webT = (s: number) => {
    const Qweb = rs.tw * ((hw / 2) * s - s * s / 2);
    return absV * (QflTotal + Qweb) / (rs.iy * rs.tw) / 1000;
  };

  return [
    // 1. Top flange: right tip (halfB) → web (0) — flow toward web ←
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfB;
      return { z: halfB - s, y: yFlCL, tau: flangeT(s) };
    })},
    // 2. Web: top → bottom — flow downward ↓
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * hw;
      return { z: 0, y: hw / 2 - s, tau: webT(s) };
    })},
    // 3. Bottom flange: web (0) → right tip (halfB) — flow away from web →
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfB;
      return { z: s, y: -yFlCL, tau: flangeT(halfB - s) };
    })},
  ];
}

// ── L / Angle (open section — 2 segments: vertical + horizontal leg) ──

function sfL(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const halfH = rs.h / 2;
  const halfB = rs.b / 2;
  const t = rs.t || Math.min(rs.b, rs.h) * 0.1;
  const N = 10;

  // L-path: vertical leg top → corner → horizontal leg tip.
  // Q(s) computed numerically; y measured from centroid (y=0).
  const yTop = halfH;
  const yCorner = -halfH + t;
  const legH = yTop - yCorner;
  const zVert = -halfB + t / 2;    // vertical leg centerline z
  const yHoriz = -halfH + t / 2;   // horizontal leg centerline y
  const zCorner = -halfB + t;
  const zTip = halfB;
  const legW = zTip - zCorner;

  let Qacc = 0;

  // Segment 1: vertical leg (top → corner)
  const vertPts: ShearFlowPoint[] = [];
  for (let i = 0; i <= N; i++) {
    const frac = i / N;
    const y = yTop - frac * legH;
    if (i > 0) {
      const yPrev = yTop - ((i - 1) / N) * legH;
      Qacc += t * ((y + yPrev) / 2) * (legH / N);
    }
    vertPts.push({ z: zVert, y, tau: absV * Math.abs(Qacc) / (rs.iy * t) / 1000 });
  }

  // Segment 2: horizontal leg (corner → tip)
  const horizPts: ShearFlowPoint[] = [];
  for (let i = 0; i <= N; i++) {
    const frac = i / N;
    const z = zCorner + frac * legW;
    if (i > 0) {
      Qacc += t * yHoriz * (legW / N);
    }
    horizPts.push({ z, y: yHoriz, tau: absV * Math.abs(Qacc) / (rs.iy * t) / 1000 });
  }

  return [{ points: vertPts }, { points: horizPts }];
}

// ── RHS (closed section — numerical q₀ correction) ──

function sfRHS(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const t = rs.t;
  if (t < 1e-8) return sfRect(absV, rs);
  const bCL = rs.b - t;
  const hCL = rs.h - t;
  const halfBcl = bCL / 2;
  const halfHcl = hCL / 2;
  const N = 10;

  // Trace right half clockwise from top-center, compute open-section Q(s).
  interface QP { z: number; y: number; Q: number }
  const path: QP[] = [];
  let Qacc = 0;

  // Top right: z from 0 → halfBcl, y = halfHcl
  for (let i = 0; i <= N; i++) {
    const z = (i / N) * halfBcl;
    if (i > 0) Qacc += t * halfHcl * (halfBcl / N);
    path.push({ z, y: halfHcl, Q: Qacc });
  }
  // Right wall: y from halfHcl → -halfHcl
  for (let i = 1; i <= N; i++) {
    const y = halfHcl - (i / N) * hCL;
    const yPrev = halfHcl - ((i - 1) / N) * hCL;
    Qacc += t * ((y + yPrev) / 2) * (hCL / N);
    path.push({ z: halfBcl, y, Q: Qacc });
  }
  // Bottom right: z from halfBcl → 0, y = -halfHcl
  for (let i = 1; i <= N; i++) {
    Qacc += t * (-halfHcl) * (halfBcl / N);
    path.push({ z: halfBcl - (i / N) * halfBcl, y: -halfHcl, Q: Qacc });
  }

  // q₀ = (V/Iz) · 2·∫Q·ds / P  (for uniform t)
  let sumQds = 0;
  for (let i = 1; i < path.length; i++) {
    const ds = Math.hypot(path[i].z - path[i - 1].z, path[i].y - path[i - 1].y);
    sumQds += ((path[i].Q + path[i - 1].Q) / 2) * ds;
  }
  const P = 2 * (bCL + hCL);
  const tau0 = (absV / rs.iy) * 2 * sumQds / (P * t) / 1000;

  // Helper: corrected τ at a path point
  const corrT = (Q: number) => Math.abs(absV * Q / (rs.iy * t) / 1000 + tau0);

  // Build 6 segments (right half + mirrored left half)
  const seg = (from: number, to: number): ShearFlowSegment => ({
    points: path.slice(from, to + 1).map(p => ({ z: p.z, y: p.y, tau: corrT(p.Q) })),
  });
  const mirrorSeg = (from: number, to: number, reverse: boolean): ShearFlowSegment => {
    const slice = path.slice(from, to + 1);
    if (reverse) slice.reverse();
    return { points: slice.map(p => ({ z: -p.z, y: p.y, tau: corrT(p.Q) })) };
  };

  return [
    seg(0, N),               // top right
    seg(N, 2 * N),           // right wall
    seg(2 * N, 3 * N),       // bottom right
    mirrorSeg(0, N, false),         // top left: center → left corner (outward)
    mirrorSeg(N, 2 * N, false),     // left wall: top → bottom (downward)
    mirrorSeg(2 * N, 3 * N, false), // bottom left: left corner → center (inward)
  ];
}

// ── CHS (q₀ = 0 by symmetry) ──

function sfCHS(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const R = rs.h / 2;
  const t = rs.t;
  const N = 16;

  // Walking the wall from the crown, `Q(theta) = t·R²·sin(theta)` is the first
  // moment of the arc traversed so far — ONE side of the tube. The matching
  // width in `V·Q/(I·b)` is therefore the single wall thickness `t`, not `2t`.
  //
  // Pairing this one-sided Q with `b = 2t` — as this did — halves the answer,
  // and the halved distribution still has the right shape, peaks in the right
  // place and vanishes at the crown, so nothing about the picture betrays it.
  // Every circular tube in the catalogue reported half its shear stress, on the
  // unconservative side.
  //
  // The `2t` reasoning is not wrong in itself, it is simply the OTHER
  // formulation: a horizontal cut severs two walls, so with `b = 2t` the first
  // moment must be that of the whole area above the cut, `2t·R²·sin(theta)`.
  // Both give tau_max = 2·V/A, the classic thin-tube result. Mixing them does
  // not. See `shear-flow-audit.test.ts`, which pins the factor.
  //
  // t = 0 reads as a SOLID round bar (a tube with no wall has no area), and
  // the thin-tube formula must not be extrapolated there: with t cancelling
  // out it would report tau_max = 4V/A, where a solid circle peaks at 4V/3A —
  // Jourawski on the solid circle gives tau(y) = V·(R²−y²)/(3·I), i.e.
  // V·R²·sin²θ/(3·I) along the walk. Same convention as computeQandB.
  const tauAt = (theta: number): number =>
    t > 0
      ? absV * t * R * R * Math.sin(theta) / (rs.iy * t) / 1000
      : absV * R * R * Math.sin(theta) ** 2 / (3 * rs.iy) / 1000;

  const mkSemi = (signZ: number): ShearFlowSegment => ({
    points: Array.from({ length: N + 1 }, (_, i) => {
      const theta = (i / N) * Math.PI;
      return {
        z: signZ * R * Math.sin(theta),
        y: R * Math.cos(theta),
        tau: tauAt(theta),
      };
    }),
  });

  return [mkSemi(1), mkSemi(-1)]; // right and left semicircles
}

// ── T-beam (open section — 3 segments: left flange overhang, right flange overhang, web) ──

function sfT(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const hf = rs.tf;
  const hw = rs.h - hf;
  const bw = rs.tw;
  const bf = rs.b;
  const A = bw * hw + bf * hf;
  if (A < 1e-15) return [];
  const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
  const N = 10;

  // Centroid coordinates
  const yTop = rs.h - yBar;           // top of flange
  const yJunc = hw - yBar;            // junction (top of web / bottom of flange)
  const yFlCL = (yJunc + yTop) / 2;   // flange centerline y

  const halfOvhg = (bf - bw) / 2;     // flange overhang on each side

  // τ in flange overhang at distance s from free edge:
  // Q(s) = hf·s·(yTop - hf/2)  →  τ = V·hf·s·yFlCL / (Iz·hf) = V·s·yFlCL / Iz
  const flangeT = (s: number) => absV * s * Math.abs(yFlCL) / rs.iy / 1000;

  // Full Q entering web from both flange overhangs
  const QflTotal = 2 * hf * halfOvhg * Math.abs(yFlCL);

  // τ in web at distance s from junction (downward):
  const webT = (s: number) => {
    const yAt = yJunc - s;
    const Qweb = bw * s * ((yJunc + yAt) / 2); // = bw * s * (yJunc - s/2)
    return absV * Math.abs(QflTotal + Qweb) / (rs.iy * bw) / 1000;
  };

  return [
    // 1. Left flange overhang: tip → junction (flow inward →)
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfOvhg;
      return { z: -(bw / 2 + halfOvhg - s), y: yFlCL, tau: flangeT(s) };
    })},
    // 2. Right flange overhang: tip → junction (flow inward ←)
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * halfOvhg;
      return { z: (bw / 2 + halfOvhg - s), y: yFlCL, tau: flangeT(s) };
    })},
    // 3. Web: junction → bottom (flow downward ↓)
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * hw;
      return { z: 0, y: yJunc - s, tau: webT(s) };
    })},
  ];
}

// ── Inverted L (open section — 2 segments: flange overhang + web) ──

function sfInvL(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const hf = rs.tf;
  const hw = rs.h - hf;
  const bw = rs.tw;
  const bf = rs.b;
  const A = bw * hw + bf * hf;
  if (A < 1e-15) return [];
  const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
  const N = 10;

  const yTop = rs.h - yBar;
  const yJunc = hw - yBar;
  const yFlCL = (yJunc + yTop) / 2;

  // Flange overhang (one side only)
  const ovhg = bf - bw;
  const halfW = bf / 2;
  const webLeft = -halfW;
  const webRight = webLeft + bw;

  const flangeT = (s: number) => absV * s * Math.abs(yFlCL) / rs.iy / 1000;

  const QflTotal = hf * ovhg * Math.abs(yFlCL);

  const webT = (s: number) => {
    const yAt = yJunc - s;
    const Qweb = bw * s * ((yJunc + yAt) / 2);
    return absV * Math.abs(QflTotal + Qweb) / (rs.iy * bw) / 1000;
  };

  const webCenterZ = (webLeft + webRight) / 2;

  return [
    // 1. Flange overhang: right tip → web junction (flow inward ←)
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * ovhg;
      return { z: halfW - s, y: yFlCL, tau: flangeT(s) };
    })},
    // 2. Web: junction → bottom (flow downward ↓)
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * hw;
      return { z: webCenterZ, y: yJunc - s, tau: webT(s) };
    })},
  ];
}

// ── C-channel with lips (open section — 5 segments: 2 lips + 2 flanges + web) ──

function sfC(absV: number, rs: ResolvedSection): ShearFlowSegment[] {
  const halfH = rs.h / 2;
  const halfB = rs.b / 2;
  const lip = rs.t;            // lip length
  const lipThk = rs.tl || rs.tf; // lip thickness (fallback to tf)
  const N = 10;
  const yFlCL = halfH - rs.tf / 2;   // flange centerline y
  const hw = rs.h - 2 * rs.tf;       // web clear height

  // Lip: vertical strip at flange tip, going inward from tip
  // Top lip: from y = halfH - tf (= yJunction) downward by 'lip' length
  // Q_lip(s) = tl * s * (yJunction - s/2)  where yJunction = halfH - tf
  const yJunction = halfH - rs.tf;
  const lipT = (s: number) => {
    const yCenterStrip = yJunction - s / 2;
    return absV * lipThk * s * Math.abs(yCenterStrip) / rs.iy / 1000;
  };

  // Q accumulated after full lip
  const QlipFull = lipThk * lip * (yJunction - lip / 2);

  // Flange: from lip junction to web junction
  // Q_flange(s) = Q_lip + tf * s * yFlCL
  const flangeLen = halfB - rs.tw; // flange runs from lip to web
  const flangeT = (s: number) => {
    const Qfl = rs.tf * s * yFlCL;
    return absV * Math.abs(QlipFull + Qfl) / rs.iy / 1000;
  };

  // Q from one lip+flange entering the web
  const QentryOne = QlipFull + rs.tf * flangeLen * yFlCL;

  // Web: accumulates from both sides
  const webT = (s: number) => {
    const Qweb = rs.tw * ((hw / 2) * s - s * s / 2);
    return absV * Math.abs(QentryOne + Qweb) / (rs.iy * rs.tw) / 1000;
  };

  return [
    // 1. Top-right lip: tip (down from yJunction) → yJunction (flow upward ↑)
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * lip;
      return { z: halfB, y: yJunction - lip + s, tau: lipT(lip - s) };
    })},
    // 2. Top flange: right (halfB) → web junction (tw/2) — flow toward web ←
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * flangeLen;
      return { z: halfB - s, y: yFlCL, tau: flangeT(s) };
    })},
    // 3. Web: top junction → bottom junction — flow downward ↓
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * hw;
      return { z: 0, y: hw / 2 - s, tau: webT(s) };
    })},
    // 4. Bottom flange: web junction → right (halfB) — flow away from web →
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * flangeLen;
      return { z: rs.tw / 2 + s, y: -yFlCL, tau: flangeT(flangeLen - s) };
    })},
    // 5. Bottom-right lip: yJunction → down — flow downward ↓
    { points: Array.from({ length: N + 1 }, (_, i) => {
      const s = (i / N) * lip;
      return { z: halfB, y: -(yJunction - s), tau: lipT(s) };
    })},
  ];
}
