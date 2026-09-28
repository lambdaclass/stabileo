/**
 * Detailed DSM solver — captures all intermediate steps for pedagogical display.
 * Mirrors the logic in solver-js.ts but stores every matrix, vector, and contribution.
 */

import type {
  SolverInput, SolverNode, SolverSupport,
  SolverPointLoadOnElement, SolverThermalLoad,
} from './types';
import { t } from '../i18n';
import { solveAllowingNullModes } from './dense-solve';

// ─── Types ──────────────────────────────────────────────────────

export interface DofInfo {
  nodeId: number;
  localDof: number;  // 0=ux, 1=uz, 2=θy
  globalIndex: number;
  isFree: boolean;
  label: string; // "u₁", "w₁", "θ₁", etc.
}

export interface ElementStepData {
  elementId: number;
  nodeI: number;
  nodeJ: number;
  type: 'frame' | 'truss';
  length: number;
  angle: number; // radians
  E: number;     // kN/m²
  A: number;     // m²
  Iz: number;    // m⁴
  Iy?: number;   // m⁴ (3D frames only)
  J?: number;    // m⁴ torsion constant (3D frames only)
  G?: number;    // kN/m² shear modulus (3D frames only)
  kLocal: number[][];  // local stiffness (6×6 frame, 4×4 truss) or (12×12, 6×6 for 3D)
  T: number[][];       // transformation matrix
  kGlobal: number[][]; // global stiffness = T^t·k·T
  dofIndices: number[]; // which global DOFs
  dofLabels: string[];  // labels for display
  /** 2D: a moment release at each end. */
  hingeStart?: boolean;
  hingeEnd?: boolean;
  /** 3D: which end moments are released, per axis. */
  releases?: { myStart: boolean; myEnd: boolean; mzStart: boolean; mzEnd: boolean; tStart: boolean; tEnd: boolean };
}

export interface LoadContribution {
  dofIndex: number;
  dofLabel: string;
  source: string; // human-readable description
  value: number;
}

export interface ElementForceStep {
  elementId: number;
  uGlobal: number[];     // element displacements in global coords
  uLocal: number[];      // element displacements in local coords
  fLocalRaw: number[];   // k·u_local (before subtracting FEF)
  fixedEndForces: number[]; // FEF from distributed/point/thermal loads
  fLocalFinal: number[]; // final = fLocalRaw - FEF
}

export interface DSMStepData {
  // Step 1: DOF Numbering
  dofNumbering: {
    nFree: number;
    nTotal: number;
    dofsPerNode: number;
    nodeOrder: number[];
    dofs: DofInfo[];
  };

  // Steps 2-3: Element matrices
  elements: ElementStepData[];

  // Step 4: Global assembly
  K: number[][];
  /** Maps "i,j" → array of element IDs that contributed to K[i][j] */
  kContributions: Map<string, number[]>;

  // Step 5: Load vector
  F: number[];
  loadContributions: LoadContribution[];

  // Step 6: Partitioning
  Kff: number[][];
  Kfr: number[][];
  Krf: number[][];
  Krr: number[][];
  Ff: number[];
  Fr: number[];
  uPrescribed: number[];
  FfMod: number[]; // Ff - Kfr·uR

  // Step 7: Solution
  uFree: number[];
  uAll: number[];

  // Step 8: Reactions
  reactionsRaw: number[]; // raw reaction vector (nRestr)

  // Step 9: Internal forces
  elementForces: ElementForceStep[];

  /**
   * Nodes whose DOFs are in their own rotated axes — an inclined roller's,
   * along and normal to its rolling surface. Their displacements, loads and
   * reactions in the vectors above are in that frame.
   */
  nodeFrames: Array<{ nodeId: number; angle: number }>;
  /** 3D inclined supports: the node's axes R = (n, e2, e3), rows. */
  nodeFrames3D?: Array<{ nodeId: number; R: number[][] }>;
  /**
   * Free DOFs left at zero because no stiffness governs them and no load
   * excites them — an infinitesimal mechanism the loads do not touch.
   * Empty for a stable structure.
   */
  nullModes: string[];

  // Labels for display
  dofLabels: string[]; // nTotal labels: "u₁", "w₁", "θ₁", ...
  freeDofLabels: string[];
  restrDofLabels: string[];
}

// ─── Internal helpers (same as solver-js.ts) ────────────────────

function dofKey(nodeId: number, localDof: number): string {
  return `${nodeId}:${localDof}`;
}

/**
 * A support whose restrained DOFs are stated outright.
 *
 * The force method's primary structure needs supports the model's types do
 * not name — a fixed end with only its horizontal reaction released is
 * "restrain uz and θ", which is no SupportType. Only this pedagogical solver
 * reads the field; the analysis solver never sees such an input.
 */
export type DetailedSupport = SolverSupport & { restrainedDofs?: [boolean, boolean, boolean] };

function isDofRestrained(sup: SolverSupport, localDof: number): boolean {
  const explicit = (sup as DetailedSupport).restrainedDofs;
  if (explicit) return !!explicit[localDof];
  switch (sup.type) {
    case 'fixed': return true;
    case 'pinned': return localDof === 0 || localDof === 1;
    case 'rollerX': return localDof === 1;
    case 'rollerY':
    case 'rollerZ': return localDof === 0;
    /* In the node's own axes — along the surface, normal to it — which is the
       frame `solveDetailed` gives an inclined-roller node. */
    case 'inclinedRoller': return localDof === 1;
    case 'spring': return false;
    default: return false;
  }
}

/*
 * The 2D wire plane is x–z, not x–y.
 *
 * `SolverNode` carries `x` and `z`; there is no `y` on it. Both helpers read
 * `b.y - a.y`, which is `undefined - undefined` — NaN — so every element got a
 * NaN length and a NaN angle. Nodal loads survived (they never ask for
 * geometry), but every distributed, point-on-element and thermal load produced
 * NaN fixed-end forces, and `addLC` lets NaN through because `Math.abs(NaN) <
 * 1e-15` is false. The step-by-step wizard therefore showed an entire load
 * vector of NaN at Step 5 and carried it into every step after it.
 *
 * Only the pedagogical path was affected: the analysis the user sees on the
 * canvas comes from the WASM solver, which has its own geometry.
 */
function nodeDistance(a: SolverNode, b: SolverNode): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
}

function nodeAngle(a: SolverNode, b: SolverNode): number {
  return Math.atan2(b.z - a.z, b.x - a.x);
}

function frameLocalStiffness(
  e: number, a: number, iz: number, l: number,
  hingeStart: boolean, hingeEnd: boolean,
): Float64Array {
  const n = 6;
  const k = new Float64Array(n * n);
  const ea_l = e * a / l;
  const ei_l = e * iz / l;
  const ei_l2 = ei_l / l;
  const ei_l3 = ei_l2 / l;

  k[0 * n + 0] = ea_l;   k[0 * n + 3] = -ea_l;
  k[3 * n + 0] = -ea_l;  k[3 * n + 3] = ea_l;

  if (!hingeStart && !hingeEnd) {
    k[1*n+1] = 12*ei_l3;   k[1*n+2] = 6*ei_l2;   k[1*n+4] = -12*ei_l3;  k[1*n+5] = 6*ei_l2;
    k[2*n+1] = 6*ei_l2;    k[2*n+2] = 4*ei_l;     k[2*n+4] = -6*ei_l2;   k[2*n+5] = 2*ei_l;
    k[4*n+1] = -12*ei_l3;  k[4*n+2] = -6*ei_l2;   k[4*n+4] = 12*ei_l3;   k[4*n+5] = -6*ei_l2;
    k[5*n+1] = 6*ei_l2;    k[5*n+2] = 2*ei_l;     k[5*n+4] = -6*ei_l2;   k[5*n+5] = 4*ei_l;
  } else if (hingeStart && !hingeEnd) {
    k[1*n+1] = 3*ei_l3;   k[1*n+4] = -3*ei_l3;  k[1*n+5] = 3*ei_l2;
    k[4*n+1] = -3*ei_l3;  k[4*n+4] = 3*ei_l3;   k[4*n+5] = -3*ei_l2;
    k[5*n+1] = 3*ei_l2;   k[5*n+4] = -3*ei_l2;  k[5*n+5] = 3*ei_l;
  } else if (!hingeStart && hingeEnd) {
    k[1*n+1] = 3*ei_l3;   k[1*n+2] = 3*ei_l2;   k[1*n+4] = -3*ei_l3;
    k[2*n+1] = 3*ei_l2;   k[2*n+2] = 3*ei_l;    k[2*n+4] = -3*ei_l2;
    k[4*n+1] = -3*ei_l3;  k[4*n+2] = -3*ei_l2;  k[4*n+4] = 3*ei_l3;
  }

  return k;
}

function frameTransformationMatrix(cos: number, sin: number): Float64Array {
  const t = new Float64Array(36);
  t[0*6+0] = cos;  t[0*6+1] = sin;
  t[1*6+0] = -sin; t[1*6+1] = cos;
  t[2*6+2] = 1;
  t[3*6+3] = cos;  t[3*6+4] = sin;
  t[4*6+3] = -sin; t[4*6+4] = cos;
  t[5*6+5] = 1;
  return t;
}

function transformMatrix(kLocal: Float64Array, t: Float64Array, n: number): Float64Array {
  const temp = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += kLocal[i * n + k] * t[k * n + j];
      temp[i * n + j] = sum;
    }
  const kGlobal = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += t[k * n + i] * temp[k * n + j];
      kGlobal[i * n + j] = sum;
    }
  return kGlobal;
}



/** Adjust FEF for hinges using static condensation (same as solver-js) */
function adjustFEFForHinges(
  vi: number, mi: number, vj: number, mj: number,
  L: number, hingeStart: boolean, hingeEnd: boolean,
): [number, number, number, number] {
  if (!hingeStart && !hingeEnd) return [vi, mi, vj, mj];
  if (hingeStart && hingeEnd) return [vi - (mi + mj) / L, 0, vj + (mi + mj) / L, 0];
  if (hingeStart) return [vi - (3 / (2 * L)) * mi, 0, vj + (3 / (2 * L)) * mi, mj - 0.5 * mi];
  return [vi - (3 / (2 * L)) * mj, mi - 0.5 * mj, vj + (3 / (2 * L)) * mj, 0];
}

/*
 * ── One place computes what a load does to an element ─────────────
 *
 * Step 5 (equivalent nodal loads) and Step 9 (end forces = k·u − those loads)
 * used to compute them separately, and disagreed: Step 9 kept only the LAST
 * distributed load on an element, and neither read a partial load's `a`/`b`
 * or a point load's `px` and `my`. Both now ask this function.
 *
 * The vector is the element's EQUIVALENT NODAL LOADS in local axes,
 * [Ni, Vi, Mi, Nj, Vj, Mj] — the consistent load vector ∫ q·N dx with the
 * beam's own Hermite shape functions, which for a fixed-fixed element is the
 * negative of its fixed-end reactions. Gauss–Legendre on [a, b] with three
 * points is exact for a linear load times a cubic shape function.
 */
const GAUSS3 = [
  { x: -Math.sqrt(3 / 5), w: 5 / 9 },
  { x: 0, w: 8 / 9 },
  { x: Math.sqrt(3 / 5), w: 5 / 9 },
];

function hermite(xi: number, l: number): [number, number, number, number] {
  return [
    1 - 3 * xi * xi + 2 * xi ** 3,
    l * (xi - 2 * xi * xi + xi ** 3),
    3 * xi * xi - 2 * xi ** 3,
    l * (-xi * xi + xi ** 3),
  ];
}
function hermiteSlope(xi: number, l: number): [number, number, number, number] {
  return [
    (-6 * xi + 6 * xi * xi) / l,
    1 - 4 * xi + 3 * xi * xi,
    (6 * xi - 6 * xi * xi) / l,
    -2 * xi + 3 * xi * xi,
  ];
}

export function elementEquivalentLoads(
  input: SolverInput, elemId: number, l: number,
  hingeStart: boolean, hingeEnd: boolean, eKn: number, secA: number, secIz: number,
): { local: number[]; transverse: boolean } {
  const f = [0, 0, 0, 0, 0, 0];
  let transverse = false;
  const addBending = (vi: number, mi: number, vj: number, mj: number) => {
    const [a, b, c, d] = adjustFEFForHinges(vi, mi, vj, mj, l, hingeStart, hingeEnd);
    f[1] += a; f[2] += b; f[4] += c; f[5] += d;
    transverse = true;
  };
  for (const load of input.loads) {
    if (load.type === 'distributed' && load.data.elementId === elemId) {
      const { qI, qJ } = load.data;
      const a = Math.max(0, load.data.a ?? 0);
      const b = Math.min(l, load.data.b ?? l);
      if (!(b > a)) continue;
      const acc = [0, 0, 0, 0];
      for (const g of GAUSS3) {
        const x = (a + b) / 2 + ((b - a) / 2) * g.x;
        const q = qI + ((qJ - qI) * (x - a)) / (b - a);
        const n = hermite(x / l, l);
        for (let k = 0; k < 4; k++) acc[k] += g.w * ((b - a) / 2) * q * n[k];
      }
      addBending(acc[0], acc[1], acc[2], acc[3]);
    } else if (load.type === 'pointOnElement' && (load.data as SolverPointLoadOnElement).elementId === elemId) {
      const pl = load.data as SolverPointLoadOnElement;
      const xi = Math.min(Math.max(pl.a / l, 0), 1);
      if (pl.p) {
        const n = hermite(xi, l);
        addBending(pl.p * n[0], pl.p * n[1], pl.p * n[2], pl.p * n[3]);
      }
      if (pl.my) {
        /* A couple does work on the rotation v′(a), so it loads by N′(a). */
        const d = hermiteSlope(xi, l);
        addBending(pl.my * d[0], pl.my * d[1], pl.my * d[2], pl.my * d[3]);
      }
      if (pl.px) {
        f[0] += pl.px * (1 - xi);
        f[3] += pl.px * xi;
      }
    } else if (load.type === 'thermal' && (load.data as SolverThermalLoad).elementId === elemId) {
      const tl = load.data as SolverThermalLoad;
      const alpha = 1.2e-5;
      if (Math.abs(tl.dtUniform) > 1e-10) {
        /* The bar wants to grow: its equivalent loads push its ends apart. */
        const nTh = eKn * secA * alpha * tl.dtUniform;
        f[0] -= nTh; f[3] += nTh;
      }
      if (Math.abs(tl.dtGradient) > 1e-10 && secIz > 0) {
        const h = Math.sqrt(12 * secIz / secA);
        const mTh = eKn * secIz * alpha * tl.dtGradient / h;
        addBending(0, -mTh, 0, mTh);
      }
    }
  }
  return { local: f, transverse };
}


// ─── Utility ────────────────────────────────────────────────────

function float64ToMatrix(arr: Float64Array | number[], rows: number, cols: number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) row.push(arr[i * cols + j]);
    m.push(row);
  }
  return m;
}

function dofLabel(nodeId: number, localDof: number, dofsPerNode: number): string {
  const labels = dofsPerNode === 3 ? ['u', 'v', 'θ'] : ['u', 'v'];
  return `${labels[localDof]}${nodeId}`;
}

// ─── Main detailed solver ───────────────────────────────────────

export function solveDetailed(input: SolverInput): DSMStepData {
  // ─── Step 1: DOF Numbering ────────────────────────────────────
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');
  const dofsPerNode = hasFrames ? 3 : 2;
  const nodeOrder = Array.from(input.nodes.keys()).sort((a, b) => a - b);

  const dofMap = new Map<string, number>();
  let freeDofIdx = 0;
  const restrainedDofs: [number, number][] = [];

  const supportByNode = new Map<number, SolverSupport>();
  for (const sup of input.supports.values()) supportByNode.set(sup.nodeId, sup);

  for (const nodeId of nodeOrder) {
    const sup = supportByNode.get(nodeId);
    for (let ld = 0; ld < dofsPerNode; ld++) {
      const isRestrained = sup ? isDofRestrained(sup, ld) : false;
      if (isRestrained) restrainedDofs.push([nodeId, ld]);
      else dofMap.set(dofKey(nodeId, ld), freeDofIdx++);
    }
  }
  const nFree = freeDofIdx;
  for (const [nodeId, ld] of restrainedDofs) dofMap.set(dofKey(nodeId, ld), freeDofIdx++);
  const nTotal = freeDofIdx;

  // Build DOF info array
  const dofsInfo: DofInfo[] = [];
  const allDofLabels: string[] = new Array(nTotal);
  for (const [key, idx] of dofMap) {
    const [nid, ld] = key.split(':').map(Number);
    /* A node in its own axes gets primed labels: u′ along the surface, v′ normal. */
    const rotated = supportByNode.get(nid)?.type === 'inclinedRoller' && ld < 2;
    const lbl = dofLabel(nid, ld, dofsPerNode) + (rotated ? '′' : '');
    dofsInfo.push({ nodeId: nid, localDof: ld, globalIndex: idx, isFree: idx < nFree, label: lbl });
    allDofLabels[idx] = lbl;
  }
  dofsInfo.sort((a, b) => a.globalIndex - b.globalIndex);

  const freeDofLabels = allDofLabels.slice(0, nFree);
  const restrDofLabels = allDofLabels.slice(nFree);

  const globalDof = (nodeId: number, ld: number) => dofMap.get(dofKey(nodeId, ld));
  const elementDofs = (nodeI: number, nodeJ: number): number[] => {
    const dofs: number[] = [];
    for (let d = 0; d < dofsPerNode; d++) { const i = globalDof(nodeI, d); if (i !== undefined) dofs.push(i); }
    for (let d = 0; d < dofsPerNode; d++) { const i = globalDof(nodeJ, d); if (i !== undefined) dofs.push(i); }
    return dofs;
  };

  // ─── Node frames ──────────────────────────────────────────────
  /*
   * An inclined roller restrains the displacement NORMAL to its surface,
   * which is neither of the global directions. The textbook treatment, and
   * the one used here, is to give that node its own axes — t along the
   * surface, n normal to it — so the restraint is again a single DOF. Every
   * element meeting the node sees that rotation folded into its T.
   * It used to be read as no restraint at all, which left the structure a
   * mechanism and the wizard throwing "singular matrix" on a stable model.
   */
  const nodeRot = new Map<number, { c: number; s: number }>();
  for (const sup of input.supports.values()) {
    if (sup.type === 'inclinedRoller') {
      /*
       * The analysis solver's orientation, so the wizard restrains the same
       * direction the canvas analysed: normal n = (sin α, cos α), tangent
       * along (cos α, −sin α). Stored as the angle of that tangent.
       */
      const a = sup.angle ?? 0;
      nodeRot.set(sup.nodeId, { c: Math.cos(a), s: -Math.sin(a) });
    }
  }
  /** B for one element: global = B · node-frame, block-diagonal per node. */
  const nodeFrameBlock = (nodeI: number, nodeJ: number, per: number): Float64Array | null => {
    const rI = nodeRot.get(nodeI);
    const rJ = nodeRot.get(nodeJ);
    if (!rI && !rJ) return null;
    const n = 2 * per;
    const B = new Float64Array(n * n);
    for (let k = 0; k < n; k++) B[k * n + k] = 1;
    const put = (off: number, r: { c: number; s: number } | undefined) => {
      if (!r) return;
      /* u_global = Rᵀ · u_frame, R = [c s; −s c]. */
      B[off * n + off] = r.c; B[off * n + off + 1] = -r.s;
      B[(off + 1) * n + off] = r.s; B[(off + 1) * n + off + 1] = r.c;
    };
    put(0, rI);
    put(per, rJ);
    return B;
  };
  const matMul = (A: Float64Array, Bm: Float64Array, n: number) => {
    const C = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) sum += A[i * n + k] * Bm[k * n + j];
        C[i * n + j] = sum;
      }
    return C;
  };
  /** A global-axes nodal vector (fx, fz) into the node's own frame. */
  const toNodeFrame = (nodeId: number, fx: number, fz: number): [number, number] => {
    const r = nodeRot.get(nodeId);
    return r ? [r.c * fx + r.s * fz, -r.s * fx + r.c * fz] : [fx, fz];
  };

  // ─── Steps 2-4: Element matrices + Assembly ───────────────────
  const K = new Float64Array(nTotal * nTotal);
  const F = new Float64Array(nTotal);
  const kContributions = new Map<string, number[]>();
  const elementsData: ElementStepData[] = [];
  /** The effective T of each element — node frames included — for Step 9. */
  const effectiveT = new Map<number, Float64Array>();

  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;
    const l = nodeDistance(nodeI, nodeJ);
    const angle = nodeAngle(nodeI, nodeJ);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const eKnM2 = mat.e * 1000;

    if (elem.type === 'frame') {
      const kLocal = frameLocalStiffness(eKnM2, sec.a, sec.iz, l, elem.hingeStart, elem.hingeEnd);
      const t0 = frameTransformationMatrix(cos, sin);
      const B = nodeFrameBlock(elem.nodeI, elem.nodeJ, 3);
      const t = B ? matMul(t0, B, 6) : t0;
      effectiveT.set(elem.id, t);
      const kGlobal = transformMatrix(kLocal, t, 6);
      const dofs = elementDofs(elem.nodeI, elem.nodeJ);
      const dLabels = dofs.map(d => allDofLabels[d]);

      elementsData.push({
        elementId: elem.id, nodeI: elem.nodeI, nodeJ: elem.nodeJ, type: 'frame',
        length: l, angle, E: eKnM2, A: sec.a, Iz: sec.iz,
        kLocal: float64ToMatrix(kLocal, 6, 6),
        T: float64ToMatrix(t, 6, 6),
        kGlobal: float64ToMatrix(kGlobal, 6, 6),
        dofIndices: dofs, dofLabels: dLabels,
        hingeStart: !!elem.hingeStart, hingeEnd: !!elem.hingeEnd,
      });

      for (let i = 0; i < dofs.length; i++) {
        for (let j = 0; j < dofs.length; j++) {
          const gi = dofs[i], gj = dofs[j];
          K[gi * nTotal + gj] += kGlobal[i * 6 + j];
          const key = `${gi},${gj}`;
          const existing = kContributions.get(key);
          if (existing) existing.push(elem.id);
          else kContributions.set(key, [elem.id]);
        }
      }
    } else {
      // Truss: EA/L on the axial DOFs, written 4×4 so T can act on it.
      const k = eKnM2 * sec.a / l;
      const kLocal4 = new Float64Array([k, 0, -k, 0, 0, 0, 0, 0, -k, 0, k, 0, 0, 0, 0, 0]);
      const t0 = new Float64Array([cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, cos, sin, 0, 0, -sin, cos]);
      const B = nodeFrameBlock(elem.nodeI, elem.nodeJ, 2);
      const t = B ? matMul(t0, B, 4) : t0;
      effectiveT.set(elem.id, t);
      const kG = transformMatrix(kLocal4, t, 4);

      const diI = globalDof(elem.nodeI, 0)!;
      const djI = globalDof(elem.nodeI, 1)!;
      const diJ = globalDof(elem.nodeJ, 0)!;
      const djJ = globalDof(elem.nodeJ, 1)!;
      const dofs = [diI, djI, diJ, djJ];
      const dLabels = dofs.map(d => allDofLabels[d]);

      elementsData.push({
        elementId: elem.id, nodeI: elem.nodeI, nodeJ: elem.nodeJ, type: 'truss',
        length: l, angle, E: eKnM2, A: sec.a, Iz: 0,
        /* Written 4×4 like its T, so the zero rows say what a truss bar is: axial only. */
        kLocal: float64ToMatrix(kLocal4, 4, 4),
        T: float64ToMatrix(t, 4, 4),
        kGlobal: float64ToMatrix(kG, 4, 4),
        dofIndices: dofs, dofLabels: dLabels,
      });

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          K[dofs[i] * nTotal + dofs[j]] += kG[i * 4 + j];
          const key = `${dofs[i]},${dofs[j]}`;
          const existing = kContributions.get(key);
          if (existing) existing.push(elem.id);
          else kContributions.set(key, [elem.id]);
        }
      }
    }
  }

  // Spring supports — kx, ky in the spring's own axes when it is rotated.
  for (const sup of input.supports.values()) {
    if (sup.type !== 'spring') continue;
    const a = sup.angle ?? 0;
    const c = Math.cos(a), sn = Math.sin(a);
    const kx = sup.kx && sup.kx > 0 ? sup.kx : 0;
    const ky = sup.ky && sup.ky > 0 ? sup.ky : 0;
    const iX = globalDof(sup.nodeId, 0);
    const iZ = globalDof(sup.nodeId, 1);
    /* Rᵀ·diag(kx, ky)·R with R = [c s; −s c]. */
    const kxx = kx * c * c + ky * sn * sn;
    const kzz = kx * sn * sn + ky * c * c;
    const kxz = (kx - ky) * c * sn;
    if (iX !== undefined) K[iX * nTotal + iX] += kxx;
    if (iZ !== undefined) K[iZ * nTotal + iZ] += kzz;
    if (iX !== undefined && iZ !== undefined) {
      K[iX * nTotal + iZ] += kxz;
      K[iZ * nTotal + iX] += kxz;
    }
    if (sup.kz && sup.kz > 0 && dofsPerNode >= 3) {
      const i = globalDof(sup.nodeId, 2);
      if (i !== undefined) K[i * nTotal + i] += sup.kz;
    }
  }

  /*
   * Fictitious rotational springs where no element resists a rotation:
   * nodes where every frame end is hinged (as solver-js does), and nodes
   * reached only by truss bars in a model that also has frames — those carry
   * a θ DOF because the model does, and nothing stiffens it.
   */
  if (dofsPerNode >= 3) {
    let maxDiagK = 0;
    for (let i = 0; i < nTotal; i++) maxDiagK = Math.max(maxDiagK, Math.abs(K[i * nTotal + i]));
    const artificialK = maxDiagK > 0 ? maxDiagK * 1e-10 : 1e-6;

    const nodeHingeCount = new Map<number, number>();
    const nodeFrameCount = new Map<number, number>();
    for (const elem of input.elements.values()) {
      if (elem.type !== 'frame') continue;
      nodeFrameCount.set(elem.nodeI, (nodeFrameCount.get(elem.nodeI) ?? 0) + 1);
      nodeFrameCount.set(elem.nodeJ, (nodeFrameCount.get(elem.nodeJ) ?? 0) + 1);
      if (elem.hingeStart) nodeHingeCount.set(elem.nodeI, (nodeHingeCount.get(elem.nodeI) ?? 0) + 1);
      if (elem.hingeEnd) nodeHingeCount.set(elem.nodeJ, (nodeHingeCount.get(elem.nodeJ) ?? 0) + 1);
    }
    const rotRestrainedNodes = new Set<number>();
    for (const sup of input.supports.values()) {
      if (sup.type !== 'spring' && isDofRestrained(sup, 2)) rotRestrainedNodes.add(sup.nodeId);
      if (sup.type === 'spring' && sup.kz && sup.kz > 0) rotRestrainedNodes.add(sup.nodeId);
    }
    for (const nodeId of nodeOrder) {
      if (rotRestrainedNodes.has(nodeId)) continue;
      const frames = nodeFrameCount.get(nodeId) ?? 0;
      const hinges = nodeHingeCount.get(nodeId) ?? 0;
      if (frames === 0 || hinges >= frames) {
        const idx = globalDof(nodeId, 2);
        if (idx !== undefined && idx < nFree) K[idx * nTotal + idx] += artificialK;
      }
    }
  }

  // ─── Step 5: Load vector ──────────────────────────────────────
  const loadContributions: LoadContribution[] = [];
  const addLC = (nodeId: number, ld: number, val: number, desc: string) => {
    if (!Number.isFinite(val) || Math.abs(val) < 1e-15) return;
    const idx = globalDof(nodeId, ld);
    if (idx === undefined) return;
    F[idx] += val;
    loadContributions.push({ dofIndex: idx, dofLabel: allDofLabels[idx], source: desc, value: val });
  };

  for (const load of input.loads) {
    if (load.type !== 'nodal') continue;
    /*
     * The 2D plane is x–z: a nodal load is (fx, fz, my). This read
     * (fx, fy, mz), which do not exist on it, and every nodal load reached
     * the vector as `undefined` — NaN in every step after Step 5, on any
     * model with a point load at a node.
     */
    const { nodeId, fx, fz, my } = load.data;
    const [f0, f1] = toNodeFrame(nodeId, fx ?? 0, fz ?? 0);
    const src = t('detailed.lc.nodal').replace('{id}', String(nodeId));
    addLC(nodeId, 0, f0, `${src} · Fx`);
    addLC(nodeId, 1, f1, `${src} · Fz`);
    if (dofsPerNode >= 3) addLC(nodeId, 2, my ?? 0, `${src} · My`);
  }

  /* Element loads, one equivalent vector per element, into global axes. */
  const eqByElem = new Map<number, number[]>();
  for (const elem of input.elements.values()) {
    const nI = input.nodes.get(elem.nodeI)!;
    const nJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;
    const l = nodeDistance(nI, nJ);
    const { local } = elementEquivalentLoads(
      input, elem.id, l, elem.hingeStart, elem.hingeEnd, mat.e * 1000, sec.a,
      elem.type === 'frame' ? sec.iz : 0,
    );
    if (local.every((v) => Math.abs(v) < 1e-15)) continue;
    eqByElem.set(elem.id, local);
    const ang = nodeAngle(nI, nJ);
    const c = Math.cos(ang), sn = Math.sin(ang);
    const src = t('detailed.lc.element').replace('{id}', String(elem.id));
    const put = (nodeId: number, N: number, V: number, M: number, end: string) => {
      const [f0, f1] = toNodeFrame(nodeId, N * c - V * sn, N * sn + V * c);
      addLC(nodeId, 0, f0, `${src}, ${end} · Fx`);
      addLC(nodeId, 1, f1, `${src}, ${end} · Fz`);
      if (dofsPerNode >= 3 && elem.type === 'frame') addLC(nodeId, 2, M, `${src}, ${end} · My`);
    };
    if (elem.type === 'frame') {
      put(elem.nodeI, local[0], local[1], local[2], 'I');
      put(elem.nodeJ, local[3], local[4], local[5], 'J');
    } else {
      put(elem.nodeI, local[0], 0, 0, 'I');
      put(elem.nodeJ, local[3], 0, 0, 'J');
    }
  }

  // ─── Step 6: Partitioning ─────────────────────────────────────
  const nRestr = nTotal - nFree;
  const uR = new Float64Array(nRestr);

  for (const sup of input.supports.values()) {
    if (sup.type === 'spring') continue;
    const pDofs: [number, number | undefined][] = [];
    /* x–z plane: a settlement is `dz` and an imposed rotation `dry` — this
       read `dy` and `drz`, which the wire format does not have. */
    if (isDofRestrained(sup, 0)) pDofs.push([0, sup.dx]);
    if (isDofRestrained(sup, 1)) pDofs.push([1, sup.dz]);
    if (dofsPerNode >= 3 && isDofRestrained(sup, 2)) pDofs.push([2, sup.dry]);
    for (const [ld, value] of pDofs) {
      if (value !== undefined && value !== 0) {
        const gIdx = globalDof(sup.nodeId, ld);
        if (gIdx !== undefined && gIdx >= nFree) uR[gIdx - nFree] = value;
      }
    }
  }

  // Extract partitions
  const KffArr = new Float64Array(nFree * nFree);
  const KfrArr = new Float64Array(nFree * nRestr);
  const KrfArr = new Float64Array(nRestr * nFree);
  const KrrArr = new Float64Array(nRestr * nRestr);

  for (let i = 0; i < nFree; i++) {
    for (let j = 0; j < nFree; j++) KffArr[i * nFree + j] = K[i * nTotal + j];
    for (let j = 0; j < nRestr; j++) KfrArr[i * nRestr + j] = K[i * nTotal + (nFree + j)];
  }
  for (let i = 0; i < nRestr; i++) {
    for (let j = 0; j < nFree; j++) KrfArr[i * nFree + j] = K[(nFree + i) * nTotal + j];
    for (let j = 0; j < nRestr; j++) KrrArr[i * nRestr + j] = K[(nFree + i) * nTotal + (nFree + j)];
  }

  const FfRaw = Array.from(F.subarray(0, nFree));
  const FrRaw = Array.from(F.subarray(nFree));

  // F_mod = Ff - Kfr · uR
  const FfMod = new Float64Array(FfRaw);
  for (let i = 0; i < nFree; i++) {
    for (let j = 0; j < nRestr; j++) {
      FfMod[i] -= K[i * nTotal + (nFree + j)] * uR[j];
    }
  }

  // ─── Step 7: Solve ────────────────────────────────────────────
  /** Free DOFs no stiffness governs and no load excites — see dense-solve.ts. */
  let nullModes: string[] = [];
  let uf: Float64Array;
  const uAll = new Float64Array(nTotal);
  if (nFree > 0) {
    {
      const sol = solveAllowingNullModes(KffArr, FfMod, nFree, t('detailed.singularHypostatic'));
      uf = sol.x;
      /* Every DOF that moves in a mode, not only the one the elimination freed. */
      const moving = new Set<number>();
      for (const mode of sol.modes) {
        const peak = Math.max(...Array.from(mode, Math.abs));
        mode.forEach((v, k) => { if (Math.abs(v) > 1e-6 * peak) moving.add(k); });
      }
      nullModes = [...moving].sort((p, q) => p - q).map((k) => allDofLabels[k]);
    }
    for (let i = 0; i < nFree; i++) uAll[i] = uf[i];
  } else {
    uf = new Float64Array(0);
  }
  for (let i = 0; i < nRestr; i++) uAll[nFree + i] = uR[i];

  // ─── Step 8: Reactions ────────────────────────────────────────
  const reactionsRaw = new Float64Array(nRestr);
  for (let i = 0; i < nRestr; i++) {
    let sum = 0;
    for (let j = 0; j < nFree; j++) sum += K[(nFree + i) * nTotal + j] * uf[j];
    for (let j = 0; j < nRestr; j++) sum += K[(nFree + i) * nTotal + (nFree + j)] * uR[j];
    reactionsRaw[i] = sum - F[nFree + i];
  }

  // ─── Step 9: Internal forces ──────────────────────────────────
  /*
   * f = k·u_local − f_eq, with f_eq the element's equivalent nodal loads
   * from the same function Step 5 used. (Uniform temperature was subtracted
   * with the wrong sign here, which turned a restrained bar's compression
   * into tension.)
   */
  const elementForcesSteps: ElementForceStep[] = [];

  for (const elem of input.elements.values()) {
    const nodeI = input.nodes.get(elem.nodeI)!;
    const nodeJ = input.nodes.get(elem.nodeJ)!;
    const mat = input.materials.get(elem.materialId)!;
    const sec = input.sections.get(elem.sectionId)!;
    const l = nodeDistance(nodeI, nodeJ);
    const eKn = mat.e * 1000;
    const t = effectiveT.get(elem.id)!;
    const eq = eqByElem.get(elem.id) ?? [0, 0, 0, 0, 0, 0];

    if (elem.type === 'frame') {
      const uGlob = new Float64Array(6);
      for (let d = 0; d < 3; d++) {
        const iI = globalDof(elem.nodeI, d); uGlob[d] = iI !== undefined ? uAll[iI] : 0;
        const iJ = globalDof(elem.nodeJ, d); uGlob[3 + d] = iJ !== undefined ? uAll[iJ] : 0;
      }
      const uLoc = new Float64Array(6);
      for (let i = 0; i < 6; i++) { let sum = 0; for (let j = 0; j < 6; j++) sum += t[i * 6 + j] * uGlob[j]; uLoc[i] = sum; }

      const kL = frameLocalStiffness(eKn, sec.a, sec.iz, l, elem.hingeStart, elem.hingeEnd);
      const fRaw = new Float64Array(6);
      for (let i = 0; i < 6; i++) { let sum = 0; for (let j = 0; j < 6; j++) sum += kL[i * 6 + j] * uLoc[j]; fRaw[i] = sum; }

      const fFinal = Array.from(fRaw, (v, i) => v - eq[i]);
      elementForcesSteps.push({
        elementId: elem.id,
        uGlobal: Array.from(uGlob), uLocal: Array.from(uLoc),
        fLocalRaw: Array.from(fRaw), fixedEndForces: eq.slice(),
        fLocalFinal: fFinal,
      });
    } else {
      // Truss — 4-component arrays [N_i, V_i, N_j, V_j] for consistency with UI
      const idx = [
        globalDof(elem.nodeI, 0), globalDof(elem.nodeI, 1),
        globalDof(elem.nodeJ, 0), globalDof(elem.nodeJ, 1),
      ];
      const uGlob = idx.map((i) => (i !== undefined ? uAll[i] : 0));
      const uLoc = [0, 1, 2, 3].map((i) => {
        let sum = 0;
        for (let j = 0; j < 4; j++) sum += t[i * 4 + j] * uGlob[j];
        return sum;
      });
      const N = eKn * sec.a * (uLoc[2] - uLoc[0]) / l;
      const eqI = eq[0];
      const eqJ = eq[3];
      elementForcesSteps.push({
        elementId: elem.id,
        uGlobal: uGlob,
        uLocal: uLoc,
        fLocalRaw: [-N, 0, N, 0],
        fixedEndForces: [eqI, 0, eqJ, 0],
        fLocalFinal: [-N - eqI, 0, N - eqJ, 0],
      });
    }
  }

  // ─── Build result ─────────────────────────────────────────────
  return {
    dofNumbering: { nFree, nTotal, dofsPerNode, nodeOrder, dofs: dofsInfo },
    elements: elementsData,
    K: float64ToMatrix(K, nTotal, nTotal),
    kContributions,
    F: Array.from(F),
    loadContributions,
    Kff: float64ToMatrix(KffArr, nFree, nFree),
    Kfr: float64ToMatrix(KfrArr, nFree, nRestr),
    Krf: float64ToMatrix(KrfArr, nRestr, nFree),
    Krr: float64ToMatrix(KrrArr, nRestr, nRestr),
    Ff: FfRaw,
    Fr: FrRaw,
    uPrescribed: Array.from(uR),
    FfMod: Array.from(FfMod),
    uFree: Array.from(uf),
    uAll: Array.from(uAll),
    reactionsRaw: Array.from(reactionsRaw),
    elementForces: elementForcesSteps,
    nodeFrames: [...nodeRot.entries()].map(([nodeId, r]) => ({ nodeId, angle: Math.atan2(r.s, r.c) })),
    dofLabels: allDofLabels,
    freeDofLabels,
    restrDofLabels,
    nullModes,
  };
}
