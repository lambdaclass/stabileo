// P-M Interaction Diagram Generator
// Generates point-by-point interaction diagrams for reinforced concrete sections
// per CIRSOC 201 (based on ACI 318). Does NOT modify the solver.
//
// Computes φPn-φMn pairs for a rectangular section with known reinforcement,
// scanning from pure compression to pure tension.

export interface InteractionPoint {
  phiPn: number;  // kN (+ = compression)
  phiMn: number;  // kN·m
  c: number;      // neutral axis depth (m)
  label?: string;
}

export interface InteractionDiagram {
  points: InteractionPoint[];
  balanced: InteractionPoint;    // balanced failure point
  pureCompression: InteractionPoint;
  pureTension: InteractionPoint;
  // Section info
  b: number;    // m
  h: number;    // m
  fc: number;   // MPa
  fy: number;   // MPa
  AsProv: number; // cm² total
  barCount: number;
  barDia: number; // mm
}

export interface DiagramParams {
  b: number;      // m
  h: number;      // m
  fc: number;     // MPa
  fy: number;     // MPa
  cover: number;  // m (to bar center)
  AsProv: number; // cm² (total, symmetric — half on each face)
  barCount: number;
  barDia: number; // mm
  nPoints?: number; // default 40
}

const PHI_TENSION = 0.90;
const PHI_COMPRESSION = 0.65;
const EPSILON_CU = 0.003; // concrete ultimate strain

/**
 * β₁ factor per CIRSOC 201
 */
function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  const b = 0.85 - 0.05 * (fc - 28) / 7;
  return Math.max(0.65, b);
}

/**
 * Generate P-M interaction diagram for a rectangular section
 */
export function generateInteractionDiagram(params: DiagramParams): InteractionDiagram {
  const { b, h, fc, fy, cover, AsProv, barCount, barDia } = params;
  const nPts = params.nPoints ?? 40;

  const d = h - cover;         // effective depth to tension steel (m)
  const dPrime = cover;        // depth to compression steel (m)
  const As = AsProv / 2 * 1e-4;  // tension steel area (m²), half of total
  const AsPrime = As;            // compression steel (m², symmetric)
  const b1 = beta1(fc);
  const fc_kPa = fc * 1000;     // kN/m²
  const fy_kPa = fy * 1000;     // kN/m²
  const Es = 200000 * 1000;     // kN/m² (200 GPa)

  const points: InteractionPoint[] = [];
  let balancedPt: InteractionPoint | null = null;

  // Scan neutral axis c from very large (pure compression) to very small (pure tension)
  // c ranges from > h (full compression) to ~ 0 (full tension)
  const cValues: number[] = [];

  // Pure compression (c → ∞, but practically c = 10h)
  cValues.push(10 * h);

  // Intermediate points
  for (let i = 0; i <= nPts; i++) {
    const c = h * 2 * (1 - i / nPts); // from 2h to 0
    if (c > 0.001) cValues.push(c);
  }

  // Add balanced point explicitly: c_b = d × εcu / (εcu + εy)
  const ey = fy / 200000;
  const cb = d * EPSILON_CU / (EPSILON_CU + ey);
  cValues.push(cb);

  // Pure tension (c → 0)
  cValues.push(0.001);

  // Sort by c descending
  cValues.sort((a, b_val) => b_val - a);

  for (const c of cValues) {
    // Concrete compression block
    const a = b1 * c;
    const aEff = Math.min(a, h); // can't exceed section height

    // Concrete force: Cc = 0.85·f'c·b·a
    const Cc = 0.85 * fc_kPa * b * aEff; // kN (compression, +)

    // Strain in compression steel: εs' = εcu × (c - d') / c
    const epsPrime = c > 0.001 ? EPSILON_CU * (c - dPrime) / c : -ey;
    const fsPrime = Math.min(Math.abs(epsPrime) * Es, fy_kPa) * Math.sign(epsPrime);
    const CsPrime = AsPrime * fsPrime; // kN (+ if compression)

    // Strain in tension steel: εs = εcu × (d - c) / c
    const eps = c > 0.001 ? EPSILON_CU * (d - c) / c : ey * 10;
    const fs = Math.min(Math.abs(eps) * Es, fy_kPa) * Math.sign(eps);
    const Ts = As * fs; // kN (+ if tension)

    // Nominal forces
    const Pn = Cc + CsPrime - Ts; // kN (+ = compression)
    const Mn = Cc * (h / 2 - aEff / 2) + CsPrime * (h / 2 - dPrime) + Ts * (d - h / 2); // kN·m

    // Determine φ based on strain in tension steel
    let phi: number;
    const epsT = Math.abs(eps);
    if (epsT >= 0.005) {
      phi = PHI_TENSION; // tension-controlled
    } else if (epsT <= ey) {
      phi = PHI_COMPRESSION; // compression-controlled
    } else {
      // Transition zone: linear interpolation
      phi = PHI_COMPRESSION + (PHI_TENSION - PHI_COMPRESSION) * (epsT - ey) / (0.005 - ey);
    }

    // Max axial: φPn,max = φ·0.80·Pn (for tied columns)
    const phiPn = phi * (Pn > 0 ? Math.min(Pn, 0.80 * Pn / phi * phi) : Pn);
    const phiMn = phi * Mn;

    const pt: InteractionPoint = { phiPn, phiMn, c };

    // Check if this is the balanced point
    if (Math.abs(c - cb) < 0.001) {
      pt.label = 'Balanceado';
      balancedPt = pt;
    }

    points.push(pt);
  }

  // Pure compression point
  const Ag = b * h;
  const Ast = AsProv * 1e-4;
  const pureComp: InteractionPoint = {
    phiPn: PHI_COMPRESSION * 0.80 * (0.85 * fc_kPa * (Ag - Ast) + fy_kPa * Ast),
    phiMn: 0,
    c: 999,
    label: 'Compresión pura',
  };

  // Pure tension point
  const pureTens: InteractionPoint = {
    phiPn: -PHI_TENSION * fy_kPa * Ast,
    phiMn: 0,
    c: 0,
    label: 'Tracción pura',
  };

  // Ensure balanced point exists
  if (!balancedPt) {
    balancedPt = points[Math.floor(points.length / 2)];
  }

  return {
    points,
    balanced: balancedPt,
    pureCompression: pureComp,
    pureTension: pureTens,
    b, h, fc, fy,
    AsProv, barCount, barDia,
  };
}

/**
 * Generate SVG string for a P-M interaction diagram
 */
export function generateInteractionSvg(
  diagram: InteractionDiagram,
  demand?: { Nu: number; Mu: number },
  width: number = 300,
  height: number = 400,
): string {
  const { points, pureCompression, pureTension } = diagram;
  const pureTens = pureTension;

  // Find data bounds
  const allPn = points.map(p => p.phiPn).concat([pureCompression.phiPn, pureTens.phiPn]);
  const allMn = points.map(p => p.phiMn);
  const maxPn = Math.max(...allPn) * 1.1;
  const minPn = Math.min(...allPn) * 1.1;
  const maxMn = Math.max(...allMn) * 1.1;

  const padL = 50, padR = 15, padT = 20, padB = 40;
  const w = width - padL - padR;
  const h = height - padT - padB;

  // Scale: M on X axis, P on Y axis (inverted: compression up)
  const scaleM = maxMn > 0 ? w / maxMn : 1;
  const scaleP = (maxPn - minPn) > 0 ? h / (maxPn - minPn) : 1;

  function toX(mn: number): number { return padL + mn * scaleM; }
  function toY(pn: number): number { return padT + (maxPn - pn) * scaleP; }

  // Build path
  const sortedPts = [...points].sort((a, b) => b.phiPn - a.phiPn);
  const pathData = sortedPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.phiMn).toFixed(1)} ${toY(p.phiPn).toFixed(1)}`)
    .join(' ');

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#1a2a40" rx="4"/>`;

  // Grid lines
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#2a4a6a" stroke-width="0.5"/>`;
  svg += `<line x1="${padL}" y1="${toY(0)}" x2="${width - padR}" y2="${toY(0)}" stroke="#2a4a6a" stroke-width="0.5" stroke-dasharray="4,2"/>`;

  // Axes
  svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#888" stroke-width="1"/>`;
  svg += `<line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="#888" stroke-width="1"/>`;

  // Labels
  svg += `<text x="${width / 2}" y="${height - 5}" text-anchor="middle" fill="#888" font-size="10">φMn (kN·m)</text>`;
  svg += `<text x="12" y="${height / 2}" text-anchor="middle" fill="#888" font-size="10" transform="rotate(-90 12 ${height / 2})">φPn (kN)</text>`;

  // Interaction curve
  svg += `<path d="${pathData}" fill="none" stroke="#4ecdc4" stroke-width="2"/>`;

  // Balanced point
  const bp = diagram.balanced;
  svg += `<circle cx="${toX(bp.phiMn)}" cy="${toY(bp.phiPn)}" r="4" fill="#f0a500" stroke="none"/>`;
  svg += `<text x="${toX(bp.phiMn) + 6}" y="${toY(bp.phiPn) - 4}" fill="#f0a500" font-size="8">Bal.</text>`;

  // Demand point
  if (demand) {
    const dx = toX(Math.abs(demand.Mu));
    const dy = toY(demand.Nu);
    svg += `<circle cx="${dx}" cy="${dy}" r="5" fill="#e94560" stroke="#fff" stroke-width="1"/>`;
    svg += `<text x="${dx + 7}" y="${dy + 3}" fill="#e94560" font-size="9" font-weight="bold">(Nu, Mu)</text>`;
  }

  // Scale marks
  const pStep = Math.pow(10, Math.floor(Math.log10(Math.max(maxPn, -minPn))));
  for (let p = Math.ceil(minPn / pStep) * pStep; p <= maxPn; p += pStep) {
    const y = toY(p);
    svg += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="#666" font-size="8">${p.toFixed(0)}</text>`;
    svg += `<line x1="${padL}" y1="${y}" x2="${padL + 3}" y2="${y}" stroke="#666" stroke-width="0.5"/>`;
  }

  const mStep = Math.pow(10, Math.floor(Math.log10(maxMn)));
  for (let m = 0; m <= maxMn; m += mStep) {
    const x = toX(m);
    svg += `<text x="${x}" y="${height - padB + 12}" text-anchor="middle" fill="#666" font-size="8">${m.toFixed(0)}</text>`;
  }

  svg += `</svg>`;
  return svg;
}
