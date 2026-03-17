/**
 * Seismic Detailing — Capacity Design Checks
 * Pure JS implementation per CIRSOC 201-2005 §21 (based on ACI 318 Ch.21)
 *
 * Checks:
 *  1. Strong-column-weak-beam (§21.4.2.2): ΣMnc ≥ 1.2 × ΣMng
 *  2. Joint shear (§21.5.3): Vj ≤ φVn_joint
 *  3. Joint confinement requirements
 *
 * No WASM dependency. Uses interaction diagram for column φMn extraction.
 * Units: kN, m, MPa, cm²
 */

import { generateInteractionDiagram } from './interaction-diagram';
import type { InteractionDiagram, DiagramParams } from './interaction-diagram';
import type { ElementVerification } from './cirsoc201';

// ─── Helper: Extract φMn at given axial load from interaction diagram ──

/**
 * Interpolate the P-M interaction curve to find φMn at a specific Nu.
 * Returns null if Nu is outside the diagram range.
 */
export function getMomentCapacityAtAxial(diagram: InteractionDiagram, Nu: number): number | null {
  const pts = [...diagram.points].sort((a, b) => b.phiPn - a.phiPn); // descending by Pn

  // Find adjacent points that bracket Nu
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];

    if ((p1.phiPn >= Nu && p2.phiPn <= Nu) || (p1.phiPn <= Nu && p2.phiPn >= Nu)) {
      // Linear interpolation
      const dP = p2.phiPn - p1.phiPn;
      if (Math.abs(dP) < 0.01) return Math.max(p1.phiMn, p2.phiMn);
      const t = (Nu - p1.phiPn) / dP;
      return p1.phiMn + t * (p2.phiMn - p1.phiMn);
    }
  }

  // Nu is at extremes
  if (Nu >= pts[0].phiPn) return pts[0].phiMn;
  if (Nu <= pts[pts.length - 1].phiPn) return pts[pts.length - 1].phiMn;
  return null;
}

// ─── Strong-Column-Weak-Beam Check ──────────────────────────

export interface SCWBInput {
  joint: {
    nodeId: number;
  };
  /** Column elements framing into the joint */
  columns: Array<{
    elementId: number;
    Nu: number;        // axial load at joint (kN, compression +)
    verification: ElementVerification;
  }>;
  /** Beam elements framing into the joint */
  beams: Array<{
    elementId: number;
    verification: ElementVerification;
  }>;
}

export interface SCWBResult {
  nodeId: number;
  sumMnc: number;        // ΣMnc — sum of column moment capacities (kN·m)
  sumMng: number;        // ΣMng — sum of beam moment capacities (kN·m)
  ratio: number;         // ΣMnc / (1.2 × ΣMng)
  required: number;      // 1.2 × ΣMng
  status: 'ok' | 'fail';
  columnDetails: Array<{
    elementId: number;
    Nu: number;
    phiMn: number;
  }>;
  beamDetails: Array<{
    elementId: number;
    phiMn: number;
  }>;
  steps: string[];
}

/**
 * CIRSOC 201 §21.4.2.2 — Strong-column-weak-beam check.
 *
 * At each beam-column joint, the sum of column moment capacities
 * must exceed 1.2× the sum of beam moment capacities:
 *
 *   ΣMnc ≥ 1.2 × ΣMng
 *
 * Column capacities are extracted from the P-M interaction diagram
 * at the actual axial load level.
 */
export function checkStrongColumnWeakBeam(input: SCWBInput): SCWBResult {
  const steps: string[] = [];
  const columnDetails: SCWBResult['columnDetails'] = [];
  const beamDetails: SCWBResult['beamDetails'] = [];

  // Sum column moment capacities (from interaction diagram at actual Nu)
  let sumMnc = 0;
  for (const col of input.columns) {
    const v = col.verification;
    if (!v.column) continue;

    const diagParams: DiagramParams = {
      b: v.b, h: v.h, fc: v.fc, fy: v.fy,
      cover: v.cover,
      AsProv: v.column.AsProv,
      barCount: v.column.barCount,
      barDia: v.column.barDia,
    };
    const diagram = generateInteractionDiagram(diagParams);
    const phiMn = getMomentCapacityAtAxial(diagram, col.Nu) ?? v.column.phiMn;

    sumMnc += phiMn;
    columnDetails.push({ elementId: col.elementId, Nu: col.Nu, phiMn });
    steps.push(`Col ${col.elementId}: Nu=${col.Nu.toFixed(0)} kN → φMn=${phiMn.toFixed(1)} kN·m`);
  }

  // Sum beam moment capacities (positive = bottom steel)
  let sumMng = 0;
  for (const beam of input.beams) {
    const v = beam.verification;
    const phiMn = v.flexure.phiMn;
    sumMng += phiMn;
    beamDetails.push({ elementId: beam.elementId, phiMn });
    steps.push(`Beam ${beam.elementId}: φMn=${phiMn.toFixed(1)} kN·m`);
  }

  const required = 1.2 * sumMng;
  const ratio = required > 0 ? sumMnc / required : Infinity;

  steps.push(`ΣMnc = ${sumMnc.toFixed(1)} kN·m`);
  steps.push(`1.2 × ΣMng = 1.2 × ${sumMng.toFixed(1)} = ${required.toFixed(1)} kN·m`);
  steps.push(`Ratio = ${sumMnc.toFixed(1)} / ${required.toFixed(1)} = ${ratio.toFixed(2)} ${ratio >= 1.0 ? '≥ 1.0 ✓' : '< 1.0 ✗'}`);

  return {
    nodeId: input.joint.nodeId,
    sumMnc,
    sumMng,
    ratio,
    required,
    status: ratio >= 1.0 ? 'ok' : 'fail',
    columnDetails,
    beamDetails,
    steps,
  };
}

// ─── Joint Shear Check (CIRSOC 201 §21.5.3) ────────────────

export interface JointShearInput {
  nodeId: number;
  /** Column section at joint */
  bc: number;   // column width (m)
  hc: number;   // column depth in direction of shear (m)
  fc: number;   // MPa

  /** Beam forces entering the joint (tension from beam bars) */
  beamBarForces: Array<{
    elementId: number;
    T: number;   // tension force from beam reinforcement (kN) = As × fy
    end: 'top' | 'bottom'; // which face
  }>;

  /** Column shear at joint */
  Vcol: number;  // kN — column shear above or below joint

  /** Joint confinement type */
  confinement: 'interior' | 'exterior' | 'corner';
}

export interface JointShearResult {
  Vj: number;          // joint shear (kN)
  phiVn: number;       // joint shear capacity (kN)
  ratio: number;
  status: 'ok' | 'fail';
  Aj: number;          // effective joint area (m²)
  gamma: number;       // joint shear coefficient
  steps: string[];
}

/**
 * CIRSOC 201 §21.5.3 — Horizontal joint shear.
 *
 * Vj = ΣT_beams - Vcol
 * φVn = φ · γ · √f'c · Aj
 *
 * γ = 1.7 (interior), 1.2 (exterior), 1.0 (corner)
 */
export function checkJointShear(input: JointShearInput): JointShearResult {
  const { bc, hc, fc, beamBarForces, Vcol, confinement } = input;
  const steps: string[] = [];

  // Joint shear: sum of beam bar tension forces minus column shear
  const totalT = beamBarForces.reduce((s, f) => s + f.T, 0);
  const Vj = Math.abs(totalT - Vcol);

  steps.push(`ΣT_beams = ${totalT.toFixed(0)} kN`);
  steps.push(`V_col = ${Vcol.toFixed(0)} kN`);
  steps.push(`Vj = |${totalT.toFixed(0)} - ${Vcol.toFixed(0)}| = ${Vj.toFixed(0)} kN`);

  // Effective joint area
  const Aj = bc * hc;
  steps.push(`Aj = ${bc.toFixed(3)} × ${hc.toFixed(3)} = ${Aj.toFixed(4)} m²`);

  // Joint shear coefficient per §21.5.3.1
  const gamma = confinement === 'interior' ? 1.7
    : confinement === 'exterior' ? 1.2
    : 1.0;

  // φVn = φ × γ × √f'c × Aj (units: f'c in MPa, Aj in m² → kN)
  const sqrtFc = Math.sqrt(fc);
  const phiVn = 0.85 * gamma * sqrtFc * Aj * 1000; // ×1000: MPa·m² → kN

  steps.push(`γ = ${gamma} (${confinement})`);
  steps.push(`φVn = 0.85 × ${gamma} × √${fc} × ${Aj.toFixed(4)} × 1000 = ${phiVn.toFixed(0)} kN`);

  const ratio = Vj / phiVn;
  steps.push(`Vj/φVn = ${ratio.toFixed(2)}`);

  return {
    Vj, phiVn, ratio,
    status: ratio <= 1.0 ? 'ok' : 'fail',
    Aj, gamma, steps,
  };
}

// ─── Full Joint Seismic Assessment ──────────────────────────

export interface JointSeismicInput {
  nodeId: number;
  /** All element verifications keyed by elementId */
  verifications: Map<number, ElementVerification>;
  /** Element forces for axial load extraction */
  elementForces: Map<number, { NI: number; NJ: number; VyI?: number; VyJ?: number; MzI?: number; MzJ?: number }>;
  /** Element connectivity */
  elements: Map<number, { id: number; nodeI: number; nodeJ: number }>;
  /** Element IDs at this joint */
  elementIds: number[];
  /** Joint confinement type */
  confinement?: 'interior' | 'exterior' | 'corner';
}

export interface JointSeismicResult {
  nodeId: number;
  scwb: SCWBResult | null;
  jointShear: JointShearResult | null;
  overallStatus: 'ok' | 'fail' | 'n/a';
}

/**
 * Run all seismic detailing checks at a beam-column joint.
 * Classifies connected elements as beams/columns, extracts forces,
 * and runs SCWB + joint shear checks.
 */
export function checkJointSeismic(input: JointSeismicInput): JointSeismicResult {
  const { nodeId, verifications, elementForces, elements, elementIds, confinement } = input;

  // Classify elements at joint
  const columns: SCWBInput['columns'] = [];
  const beams: SCWBInput['beams'] = [];

  for (const elemId of elementIds) {
    const v = verifications.get(elemId);
    const el = elements.get(elemId);
    const ef = elementForces.get(elemId);
    if (!v || !el || !ef) continue;

    const end = el.nodeI === nodeId ? 'I' : 'J';

    if (v.elementType === 'column' || v.elementType === 'wall') {
      const Nu = end === 'I' ? (ef.NI ?? 0) : (ef.NJ ?? 0);
      columns.push({ elementId: elemId, Nu: Math.abs(Nu), verification: v });
    } else {
      beams.push({ elementId: elemId, verification: v });
    }
  }

  // SCWB check (needs at least 1 column and 1 beam)
  let scwb: SCWBResult | null = null;
  if (columns.length >= 1 && beams.length >= 1) {
    scwb = checkStrongColumnWeakBeam({
      joint: { nodeId },
      columns,
      beams,
    });
  }

  // Joint shear check (needs column and beam data)
  let jointShear: JointShearResult | null = null;
  if (columns.length >= 1 && beams.length >= 1) {
    const col0 = columns[0].verification;
    const colEl = elements.get(columns[0].elementId);
    const colEf = elementForces.get(columns[0].elementId);

    if (colEl && colEf) {
      const colEnd = colEl.nodeI === nodeId ? 'I' : 'J';
      const Vcol = Math.abs(colEnd === 'I' ? (colEf.VyI ?? 0) : (colEf.VyJ ?? 0));

      // Beam bar tension forces
      const beamBarForces: JointShearInput['beamBarForces'] = [];
      for (const beam of beams) {
        const v = beam.verification;
        const AsProv_m2 = v.flexure.AsProv * 1e-4; // cm² → m²
        const T = AsProv_m2 * v.fy * 1000; // kN
        beamBarForces.push({ elementId: beam.elementId, T, end: 'bottom' });
      }

      jointShear = checkJointShear({
        nodeId,
        bc: col0.b,
        hc: col0.h,
        fc: col0.fc,
        beamBarForces,
        Vcol,
        confinement: confinement ?? 'interior',
      });
    }
  }

  const overallStatus =
    !scwb && !jointShear ? 'n/a' :
    (scwb?.status === 'fail' || jointShear?.status === 'fail') ? 'fail' : 'ok';

  return { nodeId, scwb, jointShear, overallStatus };
}
