// Punching Shear Check — CIRSOC 201 §11.11
// Handles interior, edge, and corner columns with unbalanced moment transfer

import type { VerifStatus } from './cirsoc201';

// ─── Types ──────────────────────────────────────────────────────

export type ColumnPosition = 'interior' | 'edge' | 'corner';

export interface PunchingInput {
  // Slab
  slabH: number;          // slab thickness (m)
  d: number;              // effective depth (m)
  fc: number;             // concrete strength (MPa)
  // Column
  bc: number;             // column width (m) — along slab edge for edge columns
  lc: number;             // column depth (m) — perpendicular to slab edge
  colPosition: ColumnPosition;
  // Edge distances (only for edge/corner columns)
  edgeDistX?: number;     // distance from column center to nearest edge in X (m)
  edgeDistZ?: number;     // distance from column center to nearest edge in Z (m)
  // Forces
  Vu: number;             // factored shear (kN)
  Mu?: number;            // unbalanced moment (kN·m), optional
}

export interface PunchingResult {
  // Perimeter geometry
  b0: number;             // critical perimeter length (m)
  b1: number;             // dimension of critical section in moment direction (m)
  b2: number;             // dimension perpendicular to moment direction (m)
  perimeterPoints: [number, number][]; // polygon vertices for SVG (m, relative to column center)
  // Capacity — 3 equations per CIRSOC 201 §11.11.2.1
  vc_a: number;           // vc = (1/3)√f'c (MPa)
  vc_b: number;           // vc = (1/6)(1 + 2/βc)√f'c (MPa)
  vc_c: number;           // vc = (1/12)(αs·d/b0 + 2)√f'c (MPa)
  vc_governing: number;   // min of the three (MPa)
  phiVc: number;          // φ × vc × b0 × d (kN)
  // Applied stress
  vu: number;             // factored shear stress (MPa) — includes moment transfer
  gamma_v: number;        // fraction of moment transferred by shear
  Jc: number;             // polar moment of critical section (m⁴)
  // Checks
  betaC: number;          // column aspect ratio (long/short)
  alphaS: number;         // 40 (interior), 30 (edge), 20 (corner)
  ratio: number;
  status: VerifStatus;
  steps: string[];
}

// ─── Main Check ─────────────────────────────────────────────────

export function checkPunchingShear(input: PunchingInput): PunchingResult {
  const { slabH, d, fc, bc, lc, colPosition, Vu, Mu = 0 } = input;
  const steps: string[] = [];
  const phi = 0.75; // CIRSOC 201

  // Alpha_s per column position
  const alphaS = colPosition === 'interior' ? 40 : colPosition === 'edge' ? 30 : 20;
  steps.push(`Column position: ${colPosition} → αs = ${alphaS}`);

  // Column aspect ratio
  const betaC = Math.max(lc, bc) / Math.min(lc, bc);
  steps.push(`βc = ${Math.max(lc, bc).toFixed(3)} / ${Math.min(lc, bc).toFixed(3)} = ${betaC.toFixed(2)}`);

  // Critical perimeter at d/2 from column face
  const { b0, b1, b2, perimeterPoints } = computePerimeter(bc, lc, d, colPosition, input.edgeDistX, input.edgeDistZ);
  steps.push(`b0 = ${(b0 * 100).toFixed(1)} cm`);
  steps.push(`b1 = ${(b1 * 100).toFixed(1)} cm, b2 = ${(b2 * 100).toFixed(1)} cm`);

  // Three capacity equations (CIRSOC 201 §11.11.2.1)
  const sqrtFc = Math.sqrt(fc);

  // (a) vc = (1/3)√f'c
  const vc_a = (1 / 3) * sqrtFc;
  steps.push(`(a) vc = (1/3)√f'c = ${vc_a.toFixed(2)} MPa`);

  // (b) vc = (1/6)(1 + 2/βc)√f'c
  const vc_b = (1 / 6) * (1 + 2 / betaC) * sqrtFc;
  steps.push(`(b) vc = (1/6)(1 + 2/${betaC.toFixed(1)})√f'c = ${vc_b.toFixed(2)} MPa`);

  // (c) vc = (1/12)(αs·d/b0 + 2)√f'c
  const vc_c = (1 / 12) * (alphaS * d / b0 + 2) * sqrtFc;
  steps.push(`(c) vc = (1/12)(${alphaS}×${(d * 100).toFixed(0)}/${(b0 * 100).toFixed(0)} + 2)√f'c = ${vc_c.toFixed(2)} MPa`);

  const vc_governing = Math.min(vc_a, vc_b, vc_c);
  const govLabel = vc_governing === vc_a ? '(a)' : vc_governing === vc_b ? '(b)' : '(c)';
  steps.push(`Governing: ${govLabel} → vc = ${vc_governing.toFixed(2)} MPa`);

  // φVc capacity
  const phiVc = phi * vc_governing * b0 * d * 1000; // kN
  steps.push(`φVc = ${phi} × ${vc_governing.toFixed(2)} × ${(b0 * 100).toFixed(0)} × ${(d * 100).toFixed(0)} = ${phiVc.toFixed(1)} kN`);

  // Shear stress including unbalanced moment transfer
  let gamma_v = 0;
  let Jc = 0;
  let vu: number;

  if (Mu > 0 && b1 > 0 && b2 > 0) {
    // gamma_f: fraction transferred by flexure
    const gamma_f = 1 / (1 + (2 / 3) * Math.sqrt(b1 / b2));
    gamma_v = 1 - gamma_f;
    steps.push(`γf = 1/(1 + (2/3)√(b1/b2)) = ${gamma_f.toFixed(3)}`);
    steps.push(`γv = 1 - γf = ${gamma_v.toFixed(3)}`);

    // Jc (polar moment of critical section about centroid)
    // For rectangular perimeter: Jc = d×b1³/6 + b1×d³/6 + d×b2×b1²/2
    Jc = (d * Math.pow(b1, 3)) / 6 + (b1 * Math.pow(d, 3)) / 6 + d * b2 * Math.pow(b1, 2) / 2;
    steps.push(`Jc = ${(Jc * 1e8).toFixed(0)} cm⁴`);

    // c_AB = b1/2 (distance from centroid to extreme fiber)
    const c_AB = b1 / 2;
    vu = Vu / (b0 * d * 1000) + gamma_v * Mu * c_AB / (Jc * 1000); // MPa
    steps.push(`vu = Vu/(b0·d) + γv·Mu·c/Jc = ${vu.toFixed(2)} MPa`);
  } else {
    vu = Vu / (b0 * d * 1000); // MPa
    steps.push(`vu = Vu/(b0·d) = ${Vu.toFixed(1)} / (${(b0 * 100).toFixed(0)}×${(d * 100).toFixed(0)}) = ${vu.toFixed(2)} MPa`);
  }

  const ratio = vu / (phi * vc_governing);
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = vu / (φ·vc) = ${vu.toFixed(2)} / ${(phi * vc_governing).toFixed(2)} = ${(ratio * 100).toFixed(0)}%`);

  return {
    b0, b1, b2, perimeterPoints,
    vc_a, vc_b, vc_c, vc_governing, phiVc,
    vu, gamma_v, Jc,
    betaC, alphaS,
    ratio, status, steps,
  };
}

// ─── Perimeter Geometry ─────────────────────────────────────────

function computePerimeter(
  bc: number, lc: number, d: number,
  position: ColumnPosition,
  edgeDistX?: number, edgeDistZ?: number,
): { b0: number; b1: number; b2: number; perimeterPoints: [number, number][] } {
  const halfD = d / 2;

  if (position === 'interior') {
    const b1 = lc + d;  // in moment direction
    const b2 = bc + d;  // perpendicular
    const b0 = 2 * (b1 + b2);

    const x = bc / 2 + halfD;
    const z = lc / 2 + halfD;
    const perimeterPoints: [number, number][] = [
      [-x, -z], [x, -z], [x, z], [-x, z],
    ];
    return { b0, b1, b2, perimeterPoints };
  }

  if (position === 'edge') {
    // Column at slab edge — one free side
    // Assume edge is in X direction (edgeDistZ is distance to edge)
    const freeZ = edgeDistZ !== undefined ? Math.min(edgeDistZ, lc / 2 + halfD) : lc / 2 + halfD;
    const b1_full = lc / 2 + halfD + freeZ;
    const b1 = Math.min(b1_full, lc + d); // cap at full perimeter
    const b2 = bc + d;
    const b0 = 2 * b1 + b2;

    const x = bc / 2 + halfD;
    const z1 = -(lc / 2 + halfD);
    const z2 = freeZ;
    const perimeterPoints: [number, number][] = [
      [-x, z1], [x, z1], [x, z2], [-x, z2],
    ];
    return { b0, b1, b2, perimeterPoints };
  }

  // Corner column — two free sides
  const freeX = edgeDistX !== undefined ? Math.min(edgeDistX, bc / 2 + halfD) : bc / 2 + halfD;
  const freeZ = edgeDistZ !== undefined ? Math.min(edgeDistZ, lc / 2 + halfD) : lc / 2 + halfD;
  const b1 = lc / 2 + halfD + freeZ;
  const b2 = bc / 2 + halfD + freeX;
  const b0 = b1 + b2;

  const x1 = -(bc / 2 + halfD);
  const z1 = -(lc / 2 + halfD);
  const perimeterPoints: [number, number][] = [
    [x1, z1], [freeX, z1], [freeX, freeZ], [x1, freeZ],
  ];
  return { b0, b1, b2, perimeterPoints };
}

// ─── SVG: Punching Shear Plan View ─────────────────────────────

export function generatePunchingSvg(input: PunchingInput, result: PunchingResult): string {
  const { bc, lc, d, colPosition } = input;
  const extent = Math.max(bc, lc) + 2 * d;
  const scale = 280 / extent;
  const W = 360;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 8px; fill: #888; }
    .label { font-size: 9px; fill: #4ecdc4; }
    .status { font-size: 10px; font-weight: bold; }
  </style>`);

  // Slab background
  lines.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="#1a2a40" stroke="#334" stroke-width="0.5" rx="2"/>`);

  // Column (solid)
  const colW = bc * scale;
  const colH = lc * scale;
  lines.push(`<rect x="${cx - colW / 2}" y="${cy - colH / 2}" width="${colW}" height="${colH}" fill="#3a5a80" stroke="#4ecdc4" stroke-width="1.5"/>`);

  // Critical perimeter (dashed)
  const statusColor = result.status === 'ok' ? '#4caf50' : result.status === 'warn' ? '#f0a500' : '#e94560';
  const pts = result.perimeterPoints.map(([x, z]) => `${cx + x * scale},${cy + z * scale}`).join(' ');
  lines.push(`<polygon points="${pts}" fill="${statusColor}15" stroke="${statusColor}" stroke-width="1.5" stroke-dasharray="5 3"/>`);

  // d/2 annotation
  const halfD = d / 2;
  const annX = cx + (bc / 2) * scale;
  const annX2 = cx + (bc / 2 + halfD) * scale;
  const annY = cy - (lc / 2 + halfD) * scale - 5;
  lines.push(`<line x1="${annX}" y1="${annY}" x2="${annX2}" y2="${annY}" stroke="#888" stroke-width="0.5"/>`);
  lines.push(`<text x="${(annX + annX2) / 2}" y="${annY - 4}" text-anchor="middle" class="dim">d/2</text>`);

  // Column dimensions
  lines.push(`<text x="${cx}" y="${cy + colH / 2 + 14}" text-anchor="middle" class="dim">${(bc * 100).toFixed(0)}×${(lc * 100).toFixed(0)} cm</text>`);

  // Position label
  lines.push(`<text x="${cx}" y="${cy - colH / 2 - 20}" text-anchor="middle" class="label">${colPosition}</text>`);

  // Result
  lines.push(`<text x="${cx}" y="${H - 20}" text-anchor="middle" class="status" fill="${statusColor}">${(result.ratio * 100).toFixed(0)}%</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}
