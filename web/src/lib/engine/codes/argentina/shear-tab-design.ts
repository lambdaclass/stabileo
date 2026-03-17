// Shear Tab (Single Plate) Connection Design
// Per CIRSOC 301 Chapter J + AISC Steel Construction Manual
// Pure calculation — no solver dependency

import type { VerifStatus } from './cirsoc201';
import { BOLT_TABLE, type BoltGrade } from '../../connection-design';

// ─── Types ──────────────────────────────────────────────────────

export interface ShearTabInput {
  // Beam
  beamDepth: number;        // mm — beam depth
  beamTw: number;           // mm — beam web thickness
  beamFy: number;           // MPa — beam yield strength
  beamFu: number;           // MPa — beam ultimate strength
  // Plate
  plateHeight: number;      // mm — plate height (vertical)
  plateThickness: number;   // mm
  plateFy: number;          // MPa
  plateFu: number;          // MPa
  // Bolts
  boltDia: number;          // mm
  boltGrade: BoltGrade;
  nBolts: number;           // number of bolts in a single vertical line
  boltSpacing: number;      // mm — vertical spacing between bolts
  boltEdgeDist: number;     // mm — edge distance (vertical, from plate edge to first bolt)
  boltGage: number;         // mm — horizontal distance from weld to bolt line
  threadsInShear: boolean;
  // Weld (plate to column/support)
  weldLeg: number;          // mm — fillet weld leg size
  weldFexx: number;         // MPa — electrode strength (E70xx = 490)
  // Forces (factored)
  Vu: number;               // kN — shear demand
}

export interface ShearTabResult {
  boltShear: {
    phiRn: number;       // kN
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  boltBearing: {
    phiRn: number;       // kN
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  plateShearYield: {
    phiRn: number;       // kN
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  plateShearRupture: {
    phiRn: number;       // kN
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  blockShear: {
    phiRn: number;       // kN
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  weld: {
    phiRn: number;       // kN
    ratio: number;
    status: VerifStatus;
    steps: string[];
  };
  overallStatus: VerifStatus;
  overallRatio: number;
}

// ─── Main Design Function ───────────────────────────────────────

export function designShearTab(input: ShearTabInput): ShearTabResult {
  const boltShear = checkBoltShear(input);
  const boltBearing = checkBoltBearing(input);
  const plateShearYield = checkPlateShearYield(input);
  const plateShearRupture = checkPlateShearRupture(input);
  const blockShear = checkBlockShear(input);
  const weld = checkWeld(input);

  const allRatios = [
    boltShear.ratio,
    boltBearing.ratio,
    plateShearYield.ratio,
    plateShearRupture.ratio,
    blockShear.ratio,
    weld.ratio,
  ];
  const overallRatio = Math.max(...allRatios);
  const overallStatus: VerifStatus = overallRatio > 1.0 ? 'fail' : overallRatio > 0.85 ? 'warn' : 'ok';

  return {
    boltShear,
    boltBearing,
    plateShearYield,
    plateShearRupture,
    blockShear,
    weld,
    overallStatus,
    overallRatio,
  };
}

// ─── Bolt Shear (CIRSOC 301 §J3.6) ─────────────────────────────

function checkBoltShear(input: ShearTabInput): ShearTabResult['boltShear'] {
  const steps: string[] = [];
  const phi = 0.75;
  const props = BOLT_TABLE[input.boltGrade];
  const Ab = Math.PI * input.boltDia * input.boltDia / 4; // mm²
  const Fv = input.threadsInShear ? props.FvIncl : (props.FvExcl || props.FvIncl);

  // Single shear plane
  const Rn_per_bolt = Fv * Ab / 1000; // kN
  const phiRn = phi * Rn_per_bolt * input.nBolts;

  steps.push(`Ab = π/4 × ${input.boltDia}² = ${Ab.toFixed(0)} mm²`);
  steps.push(`Fv = ${Fv} MPa (${input.threadsInShear ? 'N' : 'X'})`);
  steps.push(`φRn = ${phi} × ${input.nBolts} × ${Fv} × ${Ab.toFixed(0)} / 1000 = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Math.abs(input.Vu) / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`Vu / φRn = ${Math.abs(input.Vu).toFixed(1)} / ${phiRn.toFixed(1)} = ${(ratio * 100).toFixed(0)}%`);

  return { phiRn, ratio, status, steps };
}

// ─── Bolt Bearing (CIRSOC 301 §J3.10) ──────────────────────────

function checkBoltBearing(input: ShearTabInput): ShearTabResult['boltBearing'] {
  const steps: string[] = [];
  const phi = 0.75;
  const d = input.boltDia;
  const holeD = d + 2; // standard hole
  const t = input.plateThickness;
  const Fu = input.plateFu;

  // Edge bolt: Lc = Le - holeD/2
  const LcEdge = Math.max(input.boltEdgeDist - holeD / 2, 0);
  const RnEdge = Math.min(1.2 * LcEdge * t * Fu, 2.4 * d * t * Fu) / 1000; // kN

  // Interior bolts: Lc = s - holeD
  const LcInt = Math.max(input.boltSpacing - holeD, 0);
  const RnInt = Math.min(1.2 * LcInt * t * Fu, 2.4 * d * t * Fu) / 1000;

  // Total: 2 edge bolts (top + bottom) + (n-2) interior (if vertical line)
  // Actually for shear tab: 1 edge bolt + (n-1) interior bolts (bottom edge has Le)
  const nEdge = Math.min(2, input.nBolts);
  const nInt = Math.max(input.nBolts - nEdge, 0);
  const phiRn = phi * (nEdge * RnEdge + nInt * RnInt);

  steps.push(`Hole Ø = ${d} + 2 = ${holeD} mm`);
  steps.push(`Lc,edge = ${input.boltEdgeDist} - ${holeD}/2 = ${LcEdge.toFixed(1)} mm`);
  steps.push(`Lc,int = ${input.boltSpacing} - ${holeD} = ${LcInt.toFixed(1)} mm`);
  steps.push(`Rn,edge = min(1.2×Lc×t×Fu, 2.4×d×t×Fu) = ${RnEdge.toFixed(1)} kN/bolt`);
  steps.push(`Rn,int = ${RnInt.toFixed(1)} kN/bolt`);
  steps.push(`φRn = ${phi} × (${nEdge}×${RnEdge.toFixed(1)} + ${nInt}×${RnInt.toFixed(1)}) = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Math.abs(input.Vu) / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { phiRn, ratio, status, steps };
}

// ─── Plate Shear Yielding (§J4.2) ──────────────────────────────

function checkPlateShearYield(input: ShearTabInput): ShearTabResult['plateShearYield'] {
  const steps: string[] = [];
  const phi = 1.00;
  const Agv = input.plateHeight * input.plateThickness; // mm²
  const phiRn = phi * 0.6 * input.plateFy * Agv / 1000; // kN

  steps.push(`Agv = ${input.plateHeight} × ${input.plateThickness} = ${Agv.toFixed(0)} mm²`);
  steps.push(`φRn = ${phi} × 0.6 × ${input.plateFy} × ${Agv.toFixed(0)} / 1000 = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Math.abs(input.Vu) / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { phiRn, ratio, status, steps };
}

// ─── Plate Shear Rupture (§J4.2) ───────────────────────────────

function checkPlateShearRupture(input: ShearTabInput): ShearTabResult['plateShearRupture'] {
  const steps: string[] = [];
  const phi = 0.75;
  const holeD = input.boltDia + 2;
  const Anv = (input.plateHeight - input.nBolts * (holeD + 2)) * input.plateThickness; // mm² (hole + 2mm clearance)
  const phiRn = phi * 0.6 * input.plateFu * Math.max(Anv, 0) / 1000;

  steps.push(`Hole = ${holeD} + 2 = ${holeD + 2} mm (effective)`);
  steps.push(`Anv = (${input.plateHeight} - ${input.nBolts}×${holeD + 2}) × ${input.plateThickness} = ${Anv.toFixed(0)} mm²`);
  steps.push(`φRn = ${phi} × 0.6 × ${input.plateFu} × ${Math.max(Anv, 0).toFixed(0)} / 1000 = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Math.abs(input.Vu) / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { phiRn, ratio, status, steps };
}

// ─── Block Shear (§J4.3) ────────────────────────────────────────

function checkBlockShear(input: ShearTabInput): ShearTabResult['blockShear'] {
  const steps: string[] = [];
  const phi = 0.75;
  const holeD = input.boltDia + 2;
  const holeEff = holeD + 2; // effective hole = nominal + 2mm

  // Shear path: along bolt line (vertical)
  const Lshear = input.boltEdgeDist + (input.nBolts - 1) * input.boltSpacing;
  const Agv = Lshear * input.plateThickness;
  const nHolesShear = input.nBolts - 0.5; // half hole at each end
  const Anv = (Lshear - nHolesShear * holeEff) * input.plateThickness;

  // Tension path: horizontal from bolt to plate edge (= bolt gage)
  const Lt = input.boltGage;
  const Ant = (Lt - 0.5 * holeEff) * input.plateThickness;

  // Block shear: φRn = φ × (0.6×Fu×Anv + Ubs×Fu×Ant) ≤ φ × (0.6×Fy×Agv + Ubs×Fu×Ant)
  const Ubs = 1.0; // uniform stress
  const Rn1 = 0.6 * input.plateFu * Math.max(Anv, 0) + Ubs * input.plateFu * Math.max(Ant, 0);
  const Rn2 = 0.6 * input.plateFy * Agv + Ubs * input.plateFu * Math.max(Ant, 0);
  const Rn = Math.min(Rn1, Rn2);
  const phiRn = phi * Rn / 1000;

  steps.push(`Shear path L = ${Lshear.toFixed(0)} mm`);
  steps.push(`Agv = ${Agv.toFixed(0)} mm², Anv = ${Math.max(Anv, 0).toFixed(0)} mm²`);
  steps.push(`Tension path L = ${Lt.toFixed(0)} mm, Ant = ${Math.max(Ant, 0).toFixed(0)} mm²`);
  steps.push(`Rn = min(0.6Fu·Anv + Fu·Ant, 0.6Fy·Agv + Fu·Ant) = ${(Rn / 1000).toFixed(1)} kN`);
  steps.push(`φRn = ${phi} × ${(Rn / 1000).toFixed(1)} = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Math.abs(input.Vu) / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { phiRn, ratio, status, steps };
}

// ─── Weld (plate to support, CIRSOC 301 §J2) ───────────────────

function checkWeld(input: ShearTabInput): ShearTabResult['weld'] {
  const steps: string[] = [];
  const phi = 0.60;
  const w = input.weldLeg;
  const te = 0.707 * w;
  // Two vertical fillet welds (both sides of plate)
  const L = input.plateHeight;
  const Aw = te * L * 2; // mm² — both welds

  const phiRn = phi * 0.6 * input.weldFexx * Aw / 1000; // kN

  steps.push(`te = 0.707 × ${w} = ${te.toFixed(1)} mm`);
  steps.push(`Aw = 2 × ${te.toFixed(1)} × ${L} = ${Aw.toFixed(0)} mm²`);
  steps.push(`φRn = ${phi} × 0.6 × ${input.weldFexx} × ${Aw.toFixed(0)} / 1000 = ${phiRn.toFixed(1)} kN`);

  const ratio = phiRn > 0 ? Math.abs(input.Vu) / phiRn : 0;
  const status: VerifStatus = ratio > 1.0 ? 'fail' : ratio > 0.85 ? 'warn' : 'ok';
  steps.push(`ratio = ${(ratio * 100).toFixed(0)}%`);

  return { phiRn, ratio, status, steps };
}

// ─── SVG: Shear Tab Elevation ───────────────────────────────────

export function generateShearTabSvg(input: ShearTabInput, result: ShearTabResult): string {
  const W = 300;
  const H = 280;
  const ox = 60;    // left offset (column face)
  const oy = 30;
  const scale = Math.min(200 / input.beamDepth, 200 / input.plateHeight);

  const platePx = input.plateHeight * scale;
  const plateWPx = input.boltGage * scale + 20; // plate width in px
  const beamDPx = input.beamDepth * scale;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  lines.push(`<style>
    text { font-family: monospace; fill: #ccc; }
    .dim { font-size: 7px; fill: #888; }
    .label { font-size: 8px; fill: #4ecdc4; }
  </style>`);

  // Column face (left vertical line)
  const colTop = oy;
  const colBot = oy + Math.max(beamDPx, platePx) + 40;
  lines.push(`<line x1="${ox}" y1="${colTop}" x2="${ox}" y2="${colBot}" stroke="#888" stroke-width="2"/>`);
  // Hatch pattern for column
  for (let y = colTop; y < colBot; y += 8) {
    lines.push(`<line x1="${ox - 12}" y1="${y + 8}" x2="${ox}" y2="${y}" stroke="#555" stroke-width="0.5"/>`);
  }

  // Plate (shaded rect welded to column)
  const plateTop = oy + (Math.max(beamDPx, platePx) - platePx) / 2 + 20;
  const plateLeft = ox;
  lines.push(`<rect x="${plateLeft}" y="${plateTop}" width="${plateWPx}" height="${platePx}" fill="#2a3a50" stroke="#4ecdc4" stroke-width="1.2"/>`);

  // Weld symbols (zigzag on column side)
  const weldX = ox;
  for (let y = plateTop; y < plateTop + platePx - 4; y += 6) {
    lines.push(`<line x1="${weldX - 3}" y1="${y}" x2="${weldX}" y2="${y + 3}" stroke="#f0a500" stroke-width="0.8"/>`);
    lines.push(`<line x1="${weldX}" y1="${y + 3}" x2="${weldX - 3}" y2="${y + 6}" stroke="#f0a500" stroke-width="0.8"/>`);
  }

  // Beam outline (right side, connected by bolts)
  const beamLeft = plateLeft + plateWPx + 5;
  const beamTop = oy + 20;
  const beamRight = W - 20;
  // Top flange
  lines.push(`<line x1="${beamLeft}" y1="${beamTop}" x2="${beamRight}" y2="${beamTop}" stroke="#e94560" stroke-width="1.5"/>`);
  // Bottom flange
  lines.push(`<line x1="${beamLeft}" y1="${beamTop + beamDPx}" x2="${beamRight}" y2="${beamTop + beamDPx}" stroke="#e94560" stroke-width="1.5"/>`);
  // Web (dashed)
  const webX = beamLeft + 2;
  lines.push(`<line x1="${webX}" y1="${beamTop}" x2="${webX}" y2="${beamTop + beamDPx}" stroke="#e94560" stroke-width="1" stroke-dasharray="4 2"/>`);

  // Bolts
  const boltR = Math.max(input.boltDia * scale * 0.3, 3.5);
  const boltX = plateLeft + input.boltGage * scale;
  for (let i = 0; i < input.nBolts; i++) {
    const by = plateTop + input.boltEdgeDist * scale + i * input.boltSpacing * scale;
    lines.push(`<circle cx="${boltX}" cy="${by}" r="${boltR}" fill="none" stroke="#f0a500" stroke-width="1.2"/>`);
    lines.push(`<line x1="${boltX - boltR * 0.6}" y1="${by - boltR * 0.6}" x2="${boltX + boltR * 0.6}" y2="${by + boltR * 0.6}" stroke="#f0a500" stroke-width="0.6"/>`);
    lines.push(`<line x1="${boltX + boltR * 0.6}" y1="${by - boltR * 0.6}" x2="${boltX - boltR * 0.6}" y2="${by + boltR * 0.6}" stroke="#f0a500" stroke-width="0.6"/>`);
  }

  // Dimensions
  // Plate height
  lines.push(`<line x1="${plateLeft - 15}" y1="${plateTop}" x2="${plateLeft - 15}" y2="${plateTop + platePx}" stroke="#666" stroke-width="0.5"/>`);
  lines.push(`<text x="${plateLeft - 18}" y="${plateTop + platePx / 2}" text-anchor="end" dominant-baseline="middle" class="dim">${input.plateHeight}</text>`);

  // Status
  const statusColor = result.overallStatus === 'ok' ? '#4caf50' : result.overallStatus === 'warn' ? '#f0a500' : '#e94560';
  lines.push(`<text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="label" fill="${statusColor}">tp=${input.plateThickness}mm · ${input.nBolts}×Ø${input.boltDia} · ${(result.overallRatio * 100).toFixed(0)}%</text>`);

  lines.push(`</svg>`);
  return lines.join('\n');
}
