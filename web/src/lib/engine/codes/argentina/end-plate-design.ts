// End Plate (Flush / Extended) Moment Connection Design
// Per CIRSOC 301 Chapter J + AISC Design Guide 4/16
// Pure calculation — no solver dependency

import type { VerifStatus } from './cirsoc201';
import { BOLT_TABLE, type BoltGrade } from '../../connection-design';

// ─── Types ──────────────────────────────────────────────────────

export type EndPlateType = 'flush' | 'extended';

export interface EndPlateInput {
  type: EndPlateType;
  // Beam
  beamDepth: number;        // mm — total beam depth
  beamBf: number;           // mm — beam flange width
  beamTf: number;           // mm — beam flange thickness
  beamTw: number;           // mm — beam web thickness
  beamFy: number;           // MPa
  beamFu: number;           // MPa
  // End plate
  plateWidth: number;       // mm — plate width (≥ beam flange width)
  plateThickness: number;   // mm
  plateFy: number;          // MPa
  plateFu: number;          // MPa
  // Bolts
  boltDia: number;          // mm
  boltGrade: BoltGrade;
  nBoltsPerRow: number;     // bolts per row (typically 2)
  nRowsTension: number;     // bolt rows in tension zone (1 for flush, 2 for extended)
  boltGageG: number;        // mm — horizontal gage between bolts
  pf: number;               // mm — distance from bolt to beam flange face (inside)
  pext?: number;            // mm — extension beyond flange (extended type only)
  threadsInShear: boolean;
  // Stiffeners
  hasStiffeners: boolean;   // column continuity plates present
  // Forces (factored, at connection)
  Mu: number;               // kN·m — moment demand
  Vu: number;               // kN — shear demand
}

export interface EndPlateResult {
  boltTension: {
    Tu_per_bolt: number; // kN
    phiRn: number;       // kN per bolt
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  plateBending: {
    tp_req: number;      // mm
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  beamFlangeForcce: {
    Ff: number;          // kN — flange force from moment
    phiRn: number;       // kN — flange capacity
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  shear: {
    phiRn: number;       // kN
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  overallStatus: VerifStatus;
  overallRatio: number;
}

// ─── Main Design Function ───────────────────────────────────────

export function designEndPlate(input: EndPlateInput): EndPlateResult {
  const boltTension = checkBoltTension(input);
  const plateBending = checkPlateBending(input);
  const beamFlangeForcce = checkBeamFlangeForce(input);
  const shear = checkShear(input);

  const allRatios = [
    boltTension.ratio,
    plateBending.ratio,
    beamFlangeForcce.ratio,
    shear.ratio,
  ];
  const overallRatio = Math.max(...allRatios);
  const overallStatus: VerifStatus = overallRatio > 1.0 ? 'fail' : overallRatio > 0.85 ? 'warn' : 'ok';

  return {
    boltTension,
    plateBending,
    beamFlangeForcce,
    shear,
    overallStatus,
    overallRatio,
  };
}

// ─── Bolt Tension (CIRSOC 301 §J3.6) ───────────────────────────

function checkBoltTension(input: EndPlateInput): EndPlateResult['boltTension'] {
  const steps: string[] = [];
  const phi = 0.75;
  const props = BOLT_TABLE[input.boltGrade];
  const Ab = Math.PI * input.boltDia * input.boltDia / 4;

  // Moment arm: distance between tension bolt group and compression flange centerline
  const d = input.beamDepth;
  const tf = input.beamTf;
  // For flush: bolts inside flanges, lever = d - tf
  // For extended: bolts above tension flange, lever ≈ d - tf/2 + pext
  const pext = input.pext ?? 0;
  const lever = input.type === 'extended'
    ? d - tf + pext
    : d - tf;

  const nBoltsTension = input.nRowsTension * input.nBoltsPerRow;
  const Tu_total = Math.abs(input.Mu) * 1000 / Math.max(lever, 1); // kN (Mu in kN·m → kN·mm / mm)
  const Tu_per_bolt = Tu_total / nBoltsTension;

  const phiRn = phi * props.Ft * Ab / 1000; // kN per bolt

  steps.push(`Lever arm = ${lever.toFixed(0)} mm`);
  steps.push(`Tu,total = Mu / lever = ${Math.abs(input.Mu).toFixed(1)}×1000 / ${lever.toFixed(0)} = ${Tu_total.toFixed(1)} kN`);
  steps.push(`n bolts (tension) = ${nBoltsTension}`);
  steps.push(`Tu/bolt = ${Tu_per_bolt.toFixed(1)} kN`);
  steps.push(`Ab = ${Ab.toFixed(0)} mm², Ft = ${props.Ft} MPa`);
  steps.push(`φRn = ${phi} × ${props.Ft} × ${Ab.toFixed(0)} / 1000 = ${phiRn.toFixed(1)} kN/bolt`);

  const ratio = phiRn > 0 ? Tu_per_bolt / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { Tu_per_bolt, phiRn, ratio, status, steps };
}

// ─── End Plate Bending (yield line model) ───────────────────────

function checkPlateBending(input: EndPlateInput): EndPlateResult['plateBending'] {
  const steps: string[] = [];
  const phi = 0.90;

  // Simplified yield line model (AISC Design Guide 4)
  // φMnp = φ × Fy × tp² × Yp  (Yp = yield line parameter)
  const g = input.boltGageG;
  const bf = input.plateWidth;
  const pf = input.pf;
  const pext = input.pext ?? 0;
  const d = input.beamDepth;
  const tf = input.beamTf;
  const s = Math.sqrt(bf * g); // effective width parameter

  // Yield line parameter Yp (simplified — flush end plate, 2 bolts per row)
  let Yp: number;
  if (input.type === 'flush') {
    // Yp = bf/2 × [h₁(1/pf + 1/s)] + 2/g × [h₁(pf + s)]
    const h1 = d - tf - pf;
    Yp = (bf / 2) * (1 / pf + 1 / s) * h1 + (2 / g) * h1 * (pf + s);
  } else {
    // Extended: additional yield lines from extension
    const h1 = d - tf - pf;
    const de = pext;
    Yp = (bf / 2) * (1 / pf + 1 / s) * h1 + (2 / g) * h1 * (pf + s)
       + (bf / 2) * (1 / de + 1 / s) * de + (2 / g) * de * (de + s);
  }

  // Required plate thickness
  // φMnp = φ × Fy × tp² × Yp ≥ Mu
  // tp_req = √(Mu × 1e6 / (φ × Fy × Yp))
  const tp_req = Math.sqrt(Math.abs(input.Mu) * 1e6 / (phi * input.plateFy * Math.max(Yp, 1)));

  steps.push(`g = ${g} mm, bf = ${bf} mm, pf = ${pf} mm`);
  steps.push(`s = √(bf×g) = ${s.toFixed(1)} mm`);
  steps.push(`Yp = ${Yp.toFixed(1)} mm`);
  steps.push(`tp,req = √(Mu/(φ×Fy×Yp)) = √(${Math.abs(input.Mu).toFixed(1)}×1e6 / (${phi}×${input.plateFy}×${Yp.toFixed(1)})) = ${tp_req.toFixed(1)} mm`);
  steps.push(`tp,prov = ${input.plateThickness} mm`);

  const ratio = input.plateThickness > 0 ? tp_req / input.plateThickness : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { tp_req, ratio, status, steps };
}

// ─── Beam Flange Force ─────────────────────────────────────────

function checkBeamFlangeForce(input: EndPlateInput): EndPlateResult['beamFlangeForcce'] {
  const steps: string[] = [];
  const phi = 0.90;

  const d = input.beamDepth;
  const tf = input.beamTf;
  const lever = d - tf; // center-to-center of flanges

  // Flange force from moment
  const Ff = Math.abs(input.Mu) * 1000 / Math.max(lever, 1); // kN

  // Flange capacity: yielding
  const Ag = input.beamBf * input.beamTf;
  const phiRn = phi * input.beamFy * Ag / 1000; // kN

  steps.push(`Flange force Ff = Mu / (d - tf) = ${Math.abs(input.Mu).toFixed(1)}×1000 / ${lever.toFixed(0)} = ${Ff.toFixed(1)} kN`);
  steps.push(`Ag,flange = ${input.beamBf} × ${input.beamTf} = ${Ag.toFixed(0)} mm²`);
  steps.push(`φRn = ${phi} × ${input.beamFy} × ${Ag.toFixed(0)} / 1000 = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Ff / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { Ff, phiRn, ratio, status, steps };
}

// ─── Shear Check (bolts in compression zone) ────────────────────

function checkShear(input: EndPlateInput): EndPlateResult['shear'] {
  const steps: string[] = [];
  const phi = 0.75;
  const props = BOLT_TABLE[input.boltGrade];
  const Ab = Math.PI * input.boltDia * input.boltDia / 4;
  const Fv = input.threadsInShear ? props.FvIncl : (props.FvExcl || props.FvIncl);

  // Shear bolts: compression zone bolts (for flush: nRows = total - nRowsTension; for extended: same)
  // Typical assumption: all bolts contribute to shear
  const nBoltsTotal = (input.nRowsTension + (input.type === 'flush' ? 1 : 2)) * input.nBoltsPerRow;
  const phiRn = phi * Fv * Ab * nBoltsTotal / 1000; // kN

  steps.push(`Total bolts = ${nBoltsTotal}`);
  steps.push(`Ab = ${Ab.toFixed(0)} mm², Fv = ${Fv} MPa`);
  steps.push(`φRn = ${phi} × ${Fv} × ${Ab.toFixed(0)} × ${nBoltsTotal} / 1000 = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Math.abs(input.Vu) / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`Vu / φRn = ${Math.abs(input.Vu).toFixed(1)} / ${phiRn.toFixed(1)} = ${(ratio * 100).toFixed(0)}%`);

  return { phiRn, ratio, status, steps };
}

// ─── SVG: End Plate Elevation ───────────────────────────────────

export function generateEndPlateSvg(input: EndPlateInput, result: EndPlateResult): string {
  const W = 300;
  const H = 320;
  const cx = W / 2;
  const scale = Math.min(220 / input.beamDepth, 200 / input.plateWidth);

  const beamDPx = input.beamDepth * scale;
  const beamBfPx = input.beamBf * scale;
  const beamTfPx = Math.max(input.beamTf * scale, 3);
  const beamTwPx = Math.max(input.beamTw * scale, 2);
  const plateTpPx = Math.max(input.plateThickness * scale, 4);
  const pextPx = (input.pext ?? 0) * scale;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 7px; fill: #888; }
    .label { font-size: 8px; fill: #4ecdc4; }
  </style>`);

  // End plate (vertical rect, at left)
  const plateTop = 30 - (input.type === 'extended' ? pextPx : 0);
  const totalPlateH = beamDPx + (input.type === 'extended' ? 2 * pextPx : 0);
  const plateLeft = cx - beamBfPx / 2 - plateTpPx - 10;
  lines.push(`<rect x="${plateLeft}" y="${plateTop}" width="${plateTpPx}" height="${totalPlateH}" fill="#2a3a50" stroke="#4ecdc4" stroke-width="1.2"/>`);

  // Beam (I-section, side view)
  const beamTop = 30;
  const beamLeft = plateLeft + plateTpPx;
  const beamRight = W - 20;

  // Top flange
  lines.push(`<rect x="${beamLeft}" y="${beamTop}" width="${beamRight - beamLeft}" height="${beamTfPx}" fill="#1a2a40" stroke="#e94560" stroke-width="1"/>`);
  // Bottom flange
  lines.push(`<rect x="${beamLeft}" y="${beamTop + beamDPx - beamTfPx}" width="${beamRight - beamLeft}" height="${beamTfPx}" fill="#1a2a40" stroke="#e94560" stroke-width="1"/>`);
  // Web
  const webLeft = beamLeft + (beamRight - beamLeft) / 2 - beamTwPx / 2;
  lines.push(`<rect x="${webLeft}" y="${beamTop + beamTfPx}" width="${beamTwPx}" height="${beamDPx - 2 * beamTfPx}" fill="none" stroke="#e94560" stroke-width="0.8" stroke-dasharray="3 1"/>`);

  // Bolts
  const boltR = Math.max(input.boltDia * scale * 0.3, 3);
  const boltX = plateLeft + plateTpPx / 2;
  const gHalf = input.boltGageG * scale / 2;

  // Tension zone bolts (near top flange)
  for (let row = 0; row < input.nRowsTension; row++) {
    let by: number;
    if (input.type === 'extended' && row === 0) {
      by = plateTop + pextPx / 2; // in extension
    } else {
      by = beamTop + beamTfPx + input.pf * scale + (row - (input.type === 'extended' ? 1 : 0)) * input.pf * scale * 2;
    }
    // Draw bolt pair
    for (const dx of [-gHalf, gHalf]) {
      const bx = boltX + dx;
      lines.push(`<circle cx="${bx}" cy="${by}" r="${boltR}" fill="none" stroke="#f0a500" stroke-width="1.2"/>`);
      lines.push(`<line x1="${bx - boltR * 0.5}" y1="${by - boltR * 0.5}" x2="${bx + boltR * 0.5}" y2="${by + boltR * 0.5}" stroke="#f0a500" stroke-width="0.5"/>`);
    }
  }

  // Compression zone bolt row (near bottom flange)
  const compBoltY = beamTop + beamDPx - beamTfPx - input.pf * scale;
  for (const dx of [-gHalf, gHalf]) {
    const bx = boltX + dx;
    lines.push(`<circle cx="${bx}" cy="${compBoltY}" r="${boltR}" fill="none" stroke="#f0a500" stroke-width="1.2"/>`);
  }

  // Extension bolt row for extended type (below bottom flange)
  if (input.type === 'extended') {
    const extBotY = beamTop + beamDPx + pextPx / 2;
    for (const dx of [-gHalf, gHalf]) {
      const bx = boltX + dx;
      lines.push(`<circle cx="${bx}" cy="${extBotY}" r="${boltR}" fill="none" stroke="#f0a500" stroke-width="1.2"/>`);
    }
  }

  // Dimensions — plate thickness
  lines.push(`<text x="${plateLeft - 5}" y="${plateTop + totalPlateH / 2}" text-anchor="end" dominant-baseline="middle" class="dim">tp=${input.plateThickness}</text>`);

  // Status
  const statusColor = result.overallStatus === 'ok' ? '#4caf50' : result.overallStatus === 'warn' ? '#f0a500' : '#e94560';
  lines.push(`<text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="label" fill="${statusColor}">${input.type} · tp=${input.plateThickness}mm · ${(result.overallRatio * 100).toFixed(0)}%</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}
