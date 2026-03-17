// Base Plate + Anchor Bolt Design
// Per CIRSOC 301 §J.8 (base plates) and ACI 318 Appendix D (anchorage to concrete)
// Pure calculation — no solver dependency

import type { VerifStatus } from './cirsoc201';

// ─── Types ──────────────────────────────────────────────────────

export interface BasePlateInput {
  // Column
  colB: number;       // column flange width (m)
  colD: number;       // column depth (m)
  // Plate
  N: number;          // plate length along column depth (m)
  B: number;          // plate width along column flange (m)
  tp: number;         // plate thickness (m)
  Fy_plate: number;   // plate yield strength (MPa)
  // Foundation
  fc: number;         // concrete compressive strength (MPa)
  A2: number;         // foundation area under plate (m²) — for confinement factor
  // Anchor bolts
  bolt: AnchorBoltInput;
  // Forces (factored, at base)
  Pu: number;         // axial compression (+) or tension (-) (kN)
  Vu: number;         // horizontal shear (kN)
  Mu: number;         // moment about strong axis (kN·m)
  // Options
  groutThickness?: number; // m, default 0.025
  mu?: number;        // friction coefficient, default 0.55
}

export interface AnchorBoltInput {
  diameter: number;        // mm
  grade: AnchorBoltGrade;
  nBolts: number;          // total bolt count
  nRows: number;           // rows along N direction
  nCols: number;           // columns along B direction
  edgeDistN: number;       // edge distance in N direction (m)
  edgeDistB: number;       // edge distance in B direction (m)
  embedment: number;       // effective embedment depth hef (m)
  Fu_bolt?: number;        // override bolt ultimate strength (MPa)
}

export type AnchorBoltGrade = 'F-24' | 'SAE-1040' | 'A307' | 'A325' | 'A490' | 'custom';

const BOLT_STRENGTHS: Record<string, { Futa: number }> = {
  'F-24':    { Futa: 400 },
  'SAE-1040': { Futa: 520 },
  'A307':    { Futa: 420 },
  'A325':    { Futa: 830 },
  'A490':    { Futa: 1040 },
};

// ─── Result Types ───────────────────────────────────────────────

export interface BasePlateResult {
  // Bearing
  bearing: {
    fp: number;          // actual bearing pressure (MPa)
    fpMax: number;       // allowable bearing (MPa)
    A1: number;          // plate area (m²)
    confinement: number; // sqrt(A2/A1) ≤ 2
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  // Plate bending
  plateBending: {
    m: number;           // cantilever length (m)
    n: number;           // cantilever length (m)
    lambda_n: number;    // modified cantilever
    l_crit: number;      // governing cantilever (m)
    tp_req: number;      // required plate thickness (m)
    ratio: number;       // tp_req / tp
    status: VerifStatus;
    steps: string[];
  };
  // Anchor bolts — tension
  anchorTension: {
    Tu_per_bolt: number; // tension per bolt (kN)
    phiNsa: number;      // steel strength (kN)
    phiNcbg: number;     // concrete breakout (kN per group)
    governing: number;   // min capacity (kN per bolt)
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  // Anchor bolts — shear
  anchorShear: {
    Vu_per_bolt: number;
    phiVsa: number;
    phiVcbg: number;
    phiVcpg: number;
    governing: number;
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  // Combined tension + shear interaction
  interaction: {
    tensionRatio: number;
    shearRatio: number;
    interactionValue: number;
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  // Shear transfer (friction + bolts)
  shearTransfer: {
    frictionCapacity: number;
    boltShearCapacity: number;
    totalCapacity: number;
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  overallStatus: VerifStatus;
  overallRatio: number;
}

// ─── Main Design Function ───────────────────────────────────────

export function designBasePlate(input: BasePlateInput): BasePlateResult {
  const { N, B, tp, Fy_plate, fc, A2, colB, colD, Pu, Vu, Mu, bolt, mu = 0.55 } = input;
  const A1 = N * B;

  // ═══ BEARING CHECK (CIRSOC 301 §J.8) ═══
  const bearing = checkBearing(Pu, Mu, N, B, A1, A2, fc, colD);

  // ═══ PLATE BENDING (AISC Design Guide 1 / CIRSOC 301 §J.8) ═══
  const plateBending = checkPlateBending(Pu, N, B, colD, colB, tp, Fy_plate, bearing.fp);

  // ═══ ANCHOR BOLT CHECKS ═══
  // Determine tension in bolts from moment + axial
  const eccentricity = Mu / Math.max(Math.abs(Pu), 0.001);
  const e_limit = N / 6; // kern limit
  const hasTension = Pu < 0 || eccentricity > e_limit;

  let Tu_total = 0;
  if (Pu < 0) {
    // Net tension
    Tu_total = Math.abs(Pu);
  } else if (eccentricity > e_limit) {
    // Large eccentricity — tension from moment exceeding compression zone
    // Simplified: T = Mu / lever_arm - Pu/2
    const lever = N - 2 * bolt.edgeDistN;
    Tu_total = Math.max(Mu / Math.max(lever, 0.1) - Pu / 2, 0);
  }

  const nTensionBolts = Math.max(Math.ceil(bolt.nBolts / 2), 1); // bolts on tension side
  const Tu_per_bolt = Tu_total / nTensionBolts;
  const Vu_per_bolt = Vu / bolt.nBolts;

  const anchorTension = checkAnchorTension(Tu_per_bolt, nTensionBolts, bolt, fc);
  const anchorShear = checkAnchorShear(Vu_per_bolt, bolt, fc);
  const interaction = checkAnchorInteraction(anchorTension, anchorShear);
  const shearTransfer = checkShearTransfer(Vu, Pu, mu, bolt, fc);

  // Overall
  const allRatios = [
    bearing.ratio,
    plateBending.ratio,
    hasTension ? anchorTension.ratio : 0,
    Vu > 0 ? anchorShear.ratio : 0,
    hasTension && Vu > 0 ? interaction.ratio : 0,
    Vu > 0 ? shearTransfer.ratio : 0,
  ];
  const overallRatio = Math.max(...allRatios);
  const overallStatus: VerifStatus = overallRatio > 1.0 ? 'fail' : overallRatio > 0.85 ? 'warn' : 'ok';

  return {
    bearing,
    plateBending,
    anchorTension,
    anchorShear,
    interaction,
    shearTransfer,
    overallStatus,
    overallRatio,
  };
}

// ─── Bearing ────────────────────────────────────────────────────

function checkBearing(
  Pu: number, Mu: number,
  N: number, B: number,
  A1: number, A2: number,
  fc: number, colD: number,
): BasePlateResult['bearing'] {
  const steps: string[] = [];
  const phi = 0.65; // CIRSOC 301 §J.8

  // Confinement factor: sqrt(A2/A1) ≤ 2.0
  const confinement = Math.min(Math.sqrt(A2 / A1), 2.0);
  steps.push(`A₁ = ${(A1 * 1e4).toFixed(1)} cm² (plate area)`);
  steps.push(`A₂ = ${(A2 * 1e4).toFixed(1)} cm² (foundation area)`);
  steps.push(`√(A₂/A₁) = ${confinement.toFixed(2)} ≤ 2.0`);

  // Max bearing pressure
  const fpMax = phi * 0.85 * fc * confinement; // MPa
  steps.push(`φ·Pp = φ × 0.85 × f'c × √(A₂/A₁) = ${phi} × 0.85 × ${fc} × ${confinement.toFixed(2)} = ${fpMax.toFixed(1)} MPa`);

  // Actual bearing pressure
  let fp: number;
  if (Pu <= 0) {
    fp = 0; // tension, no bearing
    steps.push(`Pu = ${Pu.toFixed(1)} kN (tension) → no bearing`);
  } else if (Mu === 0 || Mu / Pu <= N / 6) {
    // Uniform or within kern
    fp = (Pu * 1e-3) / A1; // kN → MN → MPa (1 MPa = 1 MN/m²)
    fp = Pu / (A1 * 1000); // Pu in kN, A1 in m², result in MPa
    steps.push(`e = ${(Mu / Pu).toFixed(3)} m ≤ N/6 = ${(N / 6).toFixed(3)} m → uniform bearing`);
    steps.push(`fp = Pu / A₁ = ${Pu.toFixed(1)} / ${(A1 * 1e4).toFixed(0)} = ${fp.toFixed(2)} MPa`);
  } else {
    // Outside kern — trapezoidal/triangular
    const e = Mu / Pu;
    const qmax = 2 * Pu / (3 * B * (N / 2 - e));
    fp = qmax / 1000; // kN/m² → MPa
    steps.push(`e = ${e.toFixed(3)} m > N/6 → triangular bearing`);
    steps.push(`fp,max = 2·Pu / (3·B·(N/2-e)) = ${fp.toFixed(2)} MPa`);
  }

  const ratio = fpMax > 0 ? fp / fpMax : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = fp / φPp = ${fp.toFixed(2)} / ${fpMax.toFixed(1)} = ${(ratio * 100).toFixed(0)}%`);

  return { fp, fpMax, A1, confinement, ratio, status, steps };
}

// ─── Plate Bending ──────────────────────────────────────────────

function checkPlateBending(
  Pu: number,
  N: number, B: number,
  colD: number, colB: number,
  tp: number, Fy: number,
  fp: number,
): BasePlateResult['plateBending'] {
  const steps: string[] = [];
  const phi = 0.90;

  // Cantilever lengths (AISC Design Guide 1)
  const m = (N - 0.95 * colD) / 2;
  const n = (B - 0.80 * colB) / 2;
  // Lambda method for lightly loaded plates
  const dbp = Math.sqrt(colD * colB);
  const lambda_n = dbp / 4;

  const l_crit = Math.max(m, n, lambda_n);
  steps.push(`m = (N - 0.95·d) / 2 = (${(N * 100).toFixed(0)} - 0.95×${(colD * 100).toFixed(0)}) / 2 = ${(m * 100).toFixed(1)} cm`);
  steps.push(`n = (B - 0.80·bf) / 2 = (${(B * 100).toFixed(0)} - 0.80×${(colB * 100).toFixed(0)}) / 2 = ${(n * 100).toFixed(1)} cm`);
  steps.push(`λ·n' = √(d·bf)/4 = ${(lambda_n * 100).toFixed(1)} cm`);
  steps.push(`l = max(m, n, λn') = ${(l_crit * 100).toFixed(1)} cm`);

  // Required plate thickness
  const tp_req = fp > 0 ? l_crit * Math.sqrt(2 * fp / (phi * Fy)) : 0;
  steps.push(`tp,req = l × √(2·fp / (φ·Fy)) = ${(l_crit * 100).toFixed(1)} × √(2×${fp.toFixed(1)} / (${phi}×${Fy})) = ${(tp_req * 1000).toFixed(1)} mm`);
  steps.push(`tp,prov = ${(tp * 1000).toFixed(1)} mm`);

  const ratio = tp > 0 ? tp_req / tp : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = tp,req / tp = ${(ratio * 100).toFixed(0)}%`);

  return { m, n, lambda_n, l_crit, tp_req, ratio, status, steps };
}

// ─── Anchor Bolt — Tension ──────────────────────────────────────

function checkAnchorTension(
  Tu_per_bolt: number,
  nTensionBolts: number,
  bolt: AnchorBoltInput,
  fc: number,
): BasePlateResult['anchorTension'] {
  const steps: string[] = [];
  const d = bolt.diameter / 1000; // m
  const Ase = Math.PI * (d * d) / 4; // m² — approximate tensile stress area
  const hef = bolt.embedment; // m
  const Futa = bolt.Fu_bolt ?? BOLT_STRENGTHS[bolt.grade]?.Futa ?? 420;

  // 1) Steel strength: φNsa = φ × n × Ase × futa
  const phiSteel = 0.75;
  const Nsa_per_bolt = Ase * Futa * 1e3; // kN (Ase in m², Futa in MPa → MN/m² × m² = MN → ×1e3 = kN)
  const phiNsa = phiSteel * Nsa_per_bolt;
  steps.push(`Ase = π/4 × d² = ${(Ase * 1e6).toFixed(1)} mm²`);
  steps.push(`φNsa = φ × Ase × futa = ${phiSteel} × ${(Ase * 1e6).toFixed(0)} × ${Futa} / 1000 = ${phiNsa.toFixed(1)} kN/bolt`);

  // 2) Concrete breakout: φNcbg = φ × (ANc/ANco) × ψed × ψc × Nb
  const phiBreakout = 0.70;
  // Single anchor breakout: Nb = kc × √f'c × hef^1.5
  const kc = 10; // cast-in-place
  const Nb = kc * Math.sqrt(fc) * Math.pow(hef * 1000, 1.5) / 1000; // kN
  steps.push(`Nb = kc × √f'c × hef^1.5 = ${kc} × √${fc} × ${(hef * 1000).toFixed(0)}^1.5 = ${Nb.toFixed(1)} kN`);

  // Group projected area (simplified: assume sufficient spacing, no edge effects)
  const ANco = 9 * hef * hef; // single anchor, m²
  // For the group, assume bolts are spaced > 3hef apart (conservative simplification)
  const ANc = ANco * nTensionBolts;

  const psi_ed = 1.0;  // no edge effect (simplified, interior)
  const psi_c = 1.0;   // uncracked concrete assumption

  const Ncbg = (ANc / ANco) * psi_ed * psi_c * Nb; // total group capacity
  const Ncbg_per_bolt = Ncbg / nTensionBolts;
  const phiNcbg = phiBreakout * Ncbg_per_bolt;
  steps.push(`ANco = 9 × hef² = 9 × ${(hef * 1000).toFixed(0)}² = ${(ANco * 1e6).toFixed(0)} mm²`);
  steps.push(`φNcbg = ${phiBreakout} × ${Ncbg_per_bolt.toFixed(1)} = ${phiNcbg.toFixed(1)} kN/bolt`);

  const governing = Math.min(phiNsa, phiNcbg);
  const ratio = governing > 0 ? Tu_per_bolt / governing : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';

  steps.push(`Tu/bolt = ${Tu_per_bolt.toFixed(1)} kN`);
  steps.push(`Governing = min(φNsa, φNcbg) = ${governing.toFixed(1)} kN`);
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { Tu_per_bolt, phiNsa, phiNcbg, governing, ratio, status, steps };
}

// ─── Anchor Bolt — Shear ────────────────────────────────────────

function checkAnchorShear(
  Vu_per_bolt: number,
  bolt: AnchorBoltInput,
  fc: number,
): BasePlateResult['anchorShear'] {
  const steps: string[] = [];
  const d = bolt.diameter / 1000;
  const Ase = Math.PI * (d * d) / 4;
  const hef = bolt.embedment;
  const Futa = bolt.Fu_bolt ?? BOLT_STRENGTHS[bolt.grade]?.Futa ?? 420;

  // 1) Steel strength: φVsa = φ × 0.6 × Ase × futa
  const phiSteel = 0.65;
  const Vsa = 0.6 * Ase * Futa * 1e3; // kN
  const phiVsa = phiSteel * Vsa;
  steps.push(`φVsa = ${phiSteel} × 0.6 × Ase × futa = ${phiVsa.toFixed(1)} kN/bolt`);

  // 2) Concrete breakout in shear (simplified)
  const phiBreakout = 0.70;
  const ca1 = Math.min(bolt.edgeDistN, bolt.edgeDistB); // min edge distance
  const Vb = 0.6 * Math.pow(d * 1000, 0.5) * Math.sqrt(fc) * Math.pow(ca1 * 1000, 1.5) / 1000; // kN
  const phiVcbg = phiBreakout * Vb;
  steps.push(`Vb = 0.6 × √d × √f'c × ca1^1.5 = ${Vb.toFixed(1)} kN`);
  steps.push(`φVcbg = ${phiVcbg.toFixed(1)} kN/bolt`);

  // 3) Pryout: φVcpg = φ × kcp × Ncbg
  const kcp = hef < 0.065 ? 1.0 : 2.0; // kcp = 1 for hef < 65mm, else 2
  const kc = 10;
  const Nb = kc * Math.sqrt(fc) * Math.pow(hef * 1000, 1.5) / 1000;
  const phiVcpg = 0.70 * kcp * Nb;
  steps.push(`φVcpg = ${0.70} × ${kcp} × Nb = ${phiVcpg.toFixed(1)} kN/bolt`);

  const governing = Math.min(phiVsa, phiVcbg, phiVcpg);
  const ratio = governing > 0 ? Math.abs(Vu_per_bolt) / governing : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';

  steps.push(`Vu/bolt = ${Math.abs(Vu_per_bolt).toFixed(1)} kN`);
  steps.push(`Governing = ${governing.toFixed(1)} kN`);
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { Vu_per_bolt: Math.abs(Vu_per_bolt), phiVsa, phiVcbg, phiVcpg, governing, ratio, status, steps };
}

// ─── Interaction (Tension + Shear) ──────────────────────────────

function checkAnchorInteraction(
  tension: BasePlateResult['anchorTension'],
  shear: BasePlateResult['anchorShear'],
): BasePlateResult['interaction'] {
  const steps: string[] = [];
  const tR = tension.ratio;
  const vR = shear.ratio;

  // Tri-linear interaction per ACI 318-19 §17.6.3
  let interactionValue: number;
  if (tR <= 0.2 && vR <= 0.2) {
    interactionValue = Math.max(tR, vR);
    steps.push(`Both ratios ≤ 0.2 → governed by individual check`);
  } else {
    // 5/3 power interaction (ACI 318 simplified as tri-linear: Tu/φNn + Vu/φVn ≤ 1.2)
    interactionValue = tR + vR;
    steps.push(`Tu/φNn + Vu/φVn = ${tR.toFixed(2)} + ${vR.toFixed(2)} = ${interactionValue.toFixed(2)} ≤ 1.2`);
  }

  const ratio = interactionValue / 1.2;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { tensionRatio: tR, shearRatio: vR, interactionValue, ratio, status, steps };
}

// ─── Shear Transfer ─────────────────────────────────────────────

function checkShearTransfer(
  Vu: number,
  Pu: number,
  mu: number,
  bolt: AnchorBoltInput,
  fc: number,
): BasePlateResult['shearTransfer'] {
  const steps: string[] = [];

  // Friction
  const Ncomp = Math.max(Pu, 0); // only compression contributes
  const frictionCapacity = mu * Ncomp;
  steps.push(`Friction = μ × Pu = ${mu} × ${Ncomp.toFixed(1)} = ${frictionCapacity.toFixed(1)} kN`);

  // Bolt shear contribution
  const d = bolt.diameter / 1000;
  const Ase = Math.PI * d * d / 4;
  const Futa = bolt.Fu_bolt ?? BOLT_STRENGTHS[bolt.grade]?.Futa ?? 420;
  const phiVsa = 0.65 * 0.6 * Ase * Futa * 1e3 * bolt.nBolts;
  steps.push(`Bolt shear = ${bolt.nBolts} × φVsa = ${phiVsa.toFixed(1)} kN`);

  const totalCapacity = frictionCapacity + phiVsa;
  steps.push(`Total = friction + bolts = ${totalCapacity.toFixed(1)} kN`);

  const ratio = totalCapacity > 0 ? Math.abs(Vu) / totalCapacity : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`Vu = ${Math.abs(Vu).toFixed(1)} kN → ratio = ${(ratio * 100).toFixed(0)}%`);

  return { frictionCapacity, boltShearCapacity: phiVsa, totalCapacity, ratio, status, steps };
}

// ─── SVG: Base Plate Plan View ──────────────────────────────────

export function generateBasePlatePlanSvg(input: BasePlateInput, result: BasePlateResult): string {
  const { N, B, colD, colB, bolt } = input;
  const scale = 350 / Math.max(N, B);
  const nPx = N * scale;
  const bPx = B * scale;
  const W = bPx + 100;
  const H = nPx + 100;
  const ox = 50;
  const oy = 40;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .label { font-size: 9px; fill: #4ecdc4; }
  </style>`);

  // Plate outline
  lines.push(`<rect x="${ox}" y="${oy}" width="${bPx}" height="${nPx}" fill="#2a3a50" stroke="#4ecdc4" stroke-width="1.5" rx="2"/>`);

  // Column footprint (dashed, centered)
  const colBPx = colB * scale;
  const colDPx = colD * scale;
  const colOx = ox + (bPx - colBPx) / 2;
  const colOy = oy + (nPx - colDPx) / 2;
  lines.push(`<rect x="${colOx}" y="${colOy}" width="${colBPx}" height="${colDPx}" fill="#1a2a4066" stroke="#e94560" stroke-width="1.2" stroke-dasharray="4 2"/>`);

  // Anchor bolts
  const edN = bolt.edgeDistN * scale;
  const edB = bolt.edgeDistB * scale;
  const boltR = Math.max(bolt.diameter / 1000 * scale * 0.5, 4);

  for (let r = 0; r < bolt.nRows; r++) {
    const yy = r === 0 ? oy + edN : (bolt.nRows === 1 ? oy + nPx / 2 : oy + nPx - edN);
    if (bolt.nRows > 2) {
      // Intermediate rows
      const t = r / (bolt.nRows - 1);
      const yi = oy + edN + t * (nPx - 2 * edN);
      for (let c = 0; c < bolt.nCols; c++) {
        const t2 = bolt.nCols === 1 ? 0.5 : c / (bolt.nCols - 1);
        const xi = ox + edB + t2 * (bPx - 2 * edB);
        lines.push(`<circle cx="${xi}" cy="${yi}" r="${boltR}" fill="none" stroke="#f0a500" stroke-width="1.5"/>`);
        lines.push(`<line x1="${xi - boltR * 0.6}" y1="${yi - boltR * 0.6}" x2="${xi + boltR * 0.6}" y2="${yi + boltR * 0.6}" stroke="#f0a500" stroke-width="0.8"/>`);
        lines.push(`<line x1="${xi + boltR * 0.6}" y1="${yi - boltR * 0.6}" x2="${xi - boltR * 0.6}" y2="${yi + boltR * 0.6}" stroke="#f0a500" stroke-width="0.8"/>`);
      }
    } else {
      for (let c = 0; c < bolt.nCols; c++) {
        const t2 = bolt.nCols === 1 ? 0.5 : c / (bolt.nCols - 1);
        const xi = ox + edB + t2 * (bPx - 2 * edB);
        lines.push(`<circle cx="${xi}" cy="${yy}" r="${boltR}" fill="none" stroke="#f0a500" stroke-width="1.5"/>`);
        lines.push(`<line x1="${xi - boltR * 0.6}" y1="${yy - boltR * 0.6}" x2="${xi + boltR * 0.6}" y2="${yy + boltR * 0.6}" stroke="#f0a500" stroke-width="0.8"/>`);
        lines.push(`<line x1="${xi + boltR * 0.6}" y1="${yy - boltR * 0.6}" x2="${xi - boltR * 0.6}" y2="${yy + boltR * 0.6}" stroke="#f0a500" stroke-width="0.8"/>`);
      }
    }
  }

  // Dimensions
  // Plate width (B)
  lines.push(`<line x1="${ox}" y1="${oy + nPx + 12}" x2="${ox + bPx}" y2="${oy + nPx + 12}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx / 2}" y="${oy + nPx + 24}" text-anchor="middle" class="dim">B = ${(B * 100).toFixed(0)} cm</text>`);

  // Plate length (N)
  lines.push(`<line x1="${ox + bPx + 12}" y1="${oy}" x2="${ox + bPx + 12}" y2="${oy + nPx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${ox + bPx + 18}" y="${oy + nPx / 2}" dominant-baseline="middle" class="dim">N = ${(N * 100).toFixed(0)}</text>`);

  // Status label
  const statusColor = result.overallStatus === 'ok' ? '#4caf50' : result.overallStatus === 'warn' ? '#f0a500' : '#e94560';
  lines.push(`<text x="${ox + bPx / 2}" y="${oy - 10}" text-anchor="middle" class="label" fill="${statusColor}">tp = ${(input.tp * 1000).toFixed(0)} mm · ${(result.overallRatio * 100).toFixed(0)}%</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}
