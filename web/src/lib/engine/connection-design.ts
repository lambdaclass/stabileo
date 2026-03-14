/**
 * Connection design & verification — Pure JS (no WASM dependency)
 * CIRSOC 301 Chapter J: Bolts (J3), Fillet welds (J2), Bearing (J3)
 */

// ─── Data tables (CIRSOC 301 Tabla J.3.2) ─────────────────

export type BoltGrade = '4.6' | '5.6' | '8.8' | '10.9';

interface BoltProps {
  Ft: number;        // MPa — nominal tensile strength
  FvIncl: number;    // MPa — shear, threads in shear plane
  FvExcl: number;    // MPa — shear, threads excluded (0 if N/A)
}

export const BOLT_TABLE: Record<BoltGrade, BoltProps> = {
  '4.6':  { Ft: 260, FvIncl: 140, FvExcl: 0 },
  '5.6':  { Ft: 310, FvIncl: 165, FvExcl: 0 },
  '8.8':  { Ft: 620, FvIncl: 330, FvExcl: 415 },
  '10.9': { Ft: 778, FvIncl: 414, FvExcl: 517 },
};

/** Minimum fillet weld size by thickest plate (CIRSOC 301 Tabla J.2.4) */
export const MIN_FILLET_SIZE: Array<{ maxThickness: number; minWeld: number }> = [
  { maxThickness: 6,  minWeld: 3 },
  { maxThickness: 13, minWeld: 5 },
  { maxThickness: 19, minWeld: 6 },
  { maxThickness: Infinity, minWeld: 8 },
];

const PHI_BOLT = 0.75;
const PHI_BEARING = 0.75;
const PHI_WELD = 0.60;

// ─── Bolt verification ────────────────────────────────────

export interface BoltInput {
  diameter: number;       // mm
  grade: BoltGrade;
  count: number;          // number of bolts
  shearPlanes: number;    // planes of shear (1 or 2)
  threadsInShear: boolean;
  plateThickness: number; // mm — thinnest connected plate
  plateFu: number;        // MPa — plate ultimate strength
  edgeDistance: number;    // mm — distance from bolt center to nearest edge
  Vu: number;             // kN — factored shear demand
  Tu: number;             // kN — factored tension demand
}

export interface BoltResult {
  phiRnShear: number;   // kN — design shear capacity (group)
  phiRnTension: number; // kN — design tension capacity (group)
  phiRnBearing: number; // kN — design bearing capacity (group)
  ratioShear: number;
  ratioTension: number;
  ratioBearing: number;
  ratioInteraction: number;
  governingRatio: number;
  status: 'ok' | 'warn' | 'fail';
}

export function checkBoltGroup(input: BoltInput): BoltResult {
  const { diameter: d, grade, count: n, shearPlanes: m, threadsInShear,
          plateThickness: t, plateFu: Fu, edgeDistance: Le, Vu, Tu } = input;
  const props = BOLT_TABLE[grade];
  const Ab = Math.PI * (d * d) / 4; // mm²

  // Shear capacity per bolt
  const Fv = threadsInShear ? props.FvIncl : (props.FvExcl || props.FvIncl);
  const phiRnShear = PHI_BOLT * Fv * Ab * m * n / 1000; // kN

  // Tension capacity per bolt
  const phiRnTension = PHI_BOLT * props.Ft * Ab * n / 1000; // kN

  // Bearing capacity: Rn = min(1.2×Lc×t×Fu, 2.4×d×t×Fu) per bolt
  const holeD = d + 2; // standard hole = d + 2mm
  const Lc = Math.max(Le - holeD / 2, 0); // clear distance to edge
  const RnBearingPerBolt = Math.min(1.2 * Lc * t * Fu, 2.4 * d * t * Fu);
  const phiRnBearing = PHI_BEARING * RnBearingPerBolt * n / 1000; // kN

  const ratioShear = Math.abs(Vu) > 0.001 ? Math.abs(Vu) / phiRnShear : 0;
  const ratioTension = Math.abs(Tu) > 0.001 ? Math.abs(Tu) / phiRnTension : 0;
  const ratioBearing = Math.abs(Vu) > 0.001 ? Math.abs(Vu) / phiRnBearing : 0;

  // Interaction: (fv/Fv)² + (ft/Ft)² ≤ 1.0 (simplified elliptic)
  const ratioInteraction = ratioShear * ratioShear + ratioTension * ratioTension;

  const governingRatio = Math.max(ratioShear, ratioTension, ratioBearing, ratioInteraction);
  const status: BoltResult['status'] = governingRatio > 1.0 ? 'fail' : governingRatio > 0.9 ? 'warn' : 'ok';

  return {
    phiRnShear, phiRnTension, phiRnBearing,
    ratioShear, ratioTension, ratioBearing, ratioInteraction,
    governingRatio, status,
  };
}

// ─── Fillet weld verification ─────────────────────────────

export interface WeldInput {
  legSize: number;      // mm — fillet leg
  length: number;       // mm — total weld length
  Fexx: number;         // MPa — electrode strength (E70xx = 490 MPa)
  Vu: number;           // kN — factored shear demand on weld
  plateThickness: number; // mm — thickest connected plate (for min size check)
}

export interface WeldResult {
  throatEff: number;    // mm — effective throat
  phiRn: number;        // kN — design capacity
  ratio: number;
  minSize: number;      // mm — minimum fillet size per code
  maxSize: number;      // mm — maximum fillet size per code
  sizeOk: boolean;
  lengthOk: boolean;    // L ≥ 4w
  status: 'ok' | 'warn' | 'fail';
}

export function checkFilletWeld(input: WeldInput): WeldResult {
  const { legSize: w, length: L, Fexx, Vu, plateThickness: tp } = input;

  const throatEff = 0.707 * w;

  // Length reduction factor (β)
  const ratio_Lw = L / w;
  let beta = 1.0;
  if (ratio_Lw > 300) beta = 0.6;
  else if (ratio_Lw > 100) beta = 1.2 - 0.002 * ratio_Lw;
  const Le = beta * L;

  const Aw = throatEff * Le; // mm²
  const phiRn = PHI_WELD * 0.6 * Fexx * Aw / 1000; // kN

  const ratio = Math.abs(Vu) > 0.001 ? Math.abs(Vu) / phiRn : 0;

  // Min size check (Tabla J.2.4)
  const minEntry = MIN_FILLET_SIZE.find(e => tp <= e.maxThickness);
  const minSize = minEntry?.minWeld ?? 3;
  // Max size: t < 6mm → w ≤ t; t ≥ 6mm → w ≤ t - 2mm
  const maxSize = tp < 6 ? tp : tp - 2;
  const sizeOk = w >= minSize && w <= Math.max(maxSize, minSize);
  const lengthOk = L >= 4 * w;

  const hasIssue = !sizeOk || !lengthOk;
  const status: WeldResult['status'] = ratio > 1.0 || hasIssue ? 'fail' : ratio > 0.9 ? 'warn' : 'ok';

  return { throatEff, phiRn, ratio, minSize, maxSize, sizeOk, lengthOk, status };
}

// ─── Joint detection ──────────────────────────────────────

export interface JointInfo {
  nodeId: number;
  x: number;
  y: number;
  z: number;
  elementIds: number[];
  hasSupport: boolean;
  elementCount: number;
}

interface NodeData { id: number; x: number; y: number; z?: number }
interface ElemData { id: number; nodeI: number; nodeJ: number }
interface SupData { nodeId: number }

/**
 * Detect structural joints — nodes where ≥2 elements connect.
 * Sorted by element count descending (busiest joints first).
 */
export function detectJoints(
  nodes: Map<number, NodeData>,
  elements: Map<number, ElemData>,
  supports: Map<number, SupData>,
): JointInfo[] {
  const nodeElems = new Map<number, number[]>();
  for (const [, el] of elements) {
    if (!nodeElems.has(el.nodeI)) nodeElems.set(el.nodeI, []);
    if (!nodeElems.has(el.nodeJ)) nodeElems.set(el.nodeJ, []);
    nodeElems.get(el.nodeI)!.push(el.id);
    nodeElems.get(el.nodeJ)!.push(el.id);
  }

  const supportNodeIds = new Set<number>();
  for (const [, s] of supports) supportNodeIds.add(s.nodeId);

  const joints: JointInfo[] = [];
  for (const [nodeId, elemIds] of nodeElems) {
    if (elemIds.length < 2) continue;
    const node = nodes.get(nodeId);
    if (!node) continue;
    joints.push({
      nodeId,
      x: node.x,
      y: node.y,
      z: node.z ?? 0,
      elementIds: elemIds,
      hasSupport: supportNodeIds.has(nodeId),
      elementCount: elemIds.length,
    });
  }

  joints.sort((a, b) => b.elementCount - a.elementCount);
  return joints;
}

// ─── Joint force extraction ───────────────────────────────

export interface JointForces {
  /** Forces per element at this joint. Positive convention: element-end forces in local coords. */
  elements: Array<{
    elementId: number;
    end: 'I' | 'J';
    N: number;   // kN — axial
    Vy: number;  // kN — shear Y
    Vz: number;  // kN — shear Z
    Mx: number;  // kN·m — torsion
    My: number;  // kN·m — moment Y
    Mz: number;  // kN·m — moment Z
  }>;
  /** Envelope: max absolute values across all connected elements */
  maxV: number;  // kN
  maxN: number;  // kN
  maxM: number;  // kN·m
}

/**
 * Extract element-end forces at a joint from 3D results.
 * results3D.elementForces format: { elementId, NI, VyI, VzI, MxI, MyI, MzI, NJ, VyJ, VzJ, MxJ, MyJ, MzJ }
 */
export function getJointForces(
  nodeId: number,
  jointElementIds: number[],
  elements: Map<number, ElemData>,
  elementForces: Array<Record<string, any>>,
): JointForces | null {
  if (!elementForces || elementForces.length === 0) return null;

  const forceMap = new Map<number, Record<string, any>>();
  for (const ef of elementForces) {
    forceMap.set(ef.elementId, ef);
  }

  const elems: JointForces['elements'] = [];
  let maxV = 0, maxN = 0, maxM = 0;

  for (const elemId of jointElementIds) {
    const el = elements.get(elemId);
    const ef = forceMap.get(elemId);
    if (!el || !ef) continue;

    const end: 'I' | 'J' = el.nodeI === nodeId ? 'I' : 'J';
    const suffix = end;
    const N = ef[`N${suffix}`] ?? 0;
    const Vy = ef[`Vy${suffix}`] ?? 0;
    const Vz = ef[`Vz${suffix}`] ?? 0;
    const Mx = ef[`Mx${suffix}`] ?? 0;
    const My = ef[`My${suffix}`] ?? 0;
    const Mz = ef[`Mz${suffix}`] ?? 0;

    elems.push({ elementId: elemId, end, N, Vy, Vz, Mx, My, Mz });

    const V = Math.sqrt(Vy * Vy + Vz * Vz);
    if (V > maxV) maxV = V;
    if (Math.abs(N) > maxN) maxN = Math.abs(N);
    const M = Math.sqrt(My * My + Mz * Mz);
    if (M > maxM) maxM = M;
  }

  if (elems.length === 0) return null;
  return { elements: elems, maxV, maxN, maxM };
}
