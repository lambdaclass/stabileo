// 3D Structural Analysis Types
// Phase 1: Engine Core — types for 3D frame/truss solver (6 DOF/node)

import type { SolverMaterial, SolverDiagnostic, ConstraintForce, DiagnosticSeverity } from './types';
export type { SolverMaterial, SolverDiagnostic, ConstraintForce, DiagnosticSeverity };

// ─── Geometry ────────────────────────────────────────────────────

export interface SolverNode3D {
  id: number;
  x: number;  // m (global X)
  y: number;  // m (global Y — up)
  z: number;  // m (global Z)
}

// ─── Section ─────────────────────────────────────────────────────

export interface SolverSection3D {
  id: number;
  name?: string;
  a: number;   // m² — cross-section area
  iy: number;  // m⁴ — moment of inertia about Y axis (horizontal) → controls Z-displacement bending (w, θy)
  iz: number;  // m⁴ — moment of inertia about Z axis (vertical) → controls Y-displacement bending (v, θz)
  j: number;   // m⁴ — torsional constant (Saint-Venant)
}

// ─── Elements ────────────────────────────────────────────────────

export interface SolverElement3D {
  id: number;
  type: 'frame' | 'truss';
  nodeI: number;
  nodeJ: number;
  materialId: number;
  sectionId: number;
  hingeStart: boolean;
  hingeEnd: boolean;
  // Optional orientation vector for local Y axis (perpendicular to element).
  // If not provided, computed automatically from global Y (or Z for vertical elements).
  localYx?: number;
  localYy?: number;
  localYz?: number;
  // Roll angle: rotation of local Y/Z around local X (degrees, 0/90/180/270)
  rollAngle?: number;
}

// ─── Supports ────────────────────────────────────────────────────

export interface SolverSupport3D {
  nodeId: number;
  // Which DOFs are restrained (true = fixed, false = free)
  rx: boolean;   // translation X
  ry: boolean;   // translation Y
  rz: boolean;   // translation Z
  rrx: boolean;  // rotation about X (torsion)
  rry: boolean;  // rotation about Y
  rrz: boolean;  // rotation about Z
  // Spring stiffnesses (kN/m or kN·m/rad). 0 or undefined = no spring.
  kx?: number;
  ky?: number;
  kz?: number;
  krx?: number;
  kry?: number;
  krz?: number;
  // Prescribed displacements (m or rad). Only for restrained DOFs.
  dx?: number;
  dy?: number;
  dz?: number;
  drx?: number;
  dry?: number;
  drz?: number;
  // Inclined support: normal vector of the constraint plane.
  // When isInclined=true, displacement is restrained along this normal direction
  // using the penalty method. The translational DOFs (rx,ry,rz) should be false
  // so the penalty stiffness acts on free DOFs.
  normalX?: number;
  normalY?: number;
  normalZ?: number;
  isInclined?: boolean;
}

// ─── Loads ────────────────────────────────────────────────────────

export interface SolverNodalLoad3D {
  nodeId: number;
  fx: number;  // kN (global X)
  fy: number;  // kN (global Y)
  fz: number;  // kN (global Z)
  mx: number;  // kN·m (about global X)
  my: number;  // kN·m (about global Y)
  mz: number;  // kN·m (about global Z)
}

export interface SolverDistributedLoad3D {
  elementId: number;
  qYI: number;  // kN/m in local Y at node I
  qYJ: number;  // kN/m in local Y at node J
  qZI: number;  // kN/m in local Z at node I
  qZJ: number;  // kN/m in local Z at node J
  a?: number;   // start position from node I (m). Default: 0
  b?: number;   // end position from node I (m). Default: L
}

export interface SolverPointLoad3D {
  elementId: number;
  a: number;   // distance from node I (m)
  py: number;  // kN in local Y
  pz: number;  // kN in local Z
}

export interface SolverThermalLoad3D {
  elementId: number;
  dtUniform: number;    // °C → axial (E·A·α·ΔT)
  dtGradientY: number;  // °C → My (E·Iy·α·ΔTy/hy)
  dtGradientZ: number;  // °C → Mz (E·Iz·α·ΔTz/hz)
}

export type SolverLoad3D =
  | { type: 'nodal'; data: SolverNodalLoad3D }
  | { type: 'distributed'; data: SolverDistributedLoad3D }
  | { type: 'pointOnElement'; data: SolverPointLoad3D }
  | { type: 'thermal'; data: SolverThermalLoad3D };

// ─── Shell / Plate Elements ─────────────────────────────────────

/** Shell element families — currently implemented + planned */
export type ShellFamily =
  | 'DKT'       // 3-node thin plate (Kirchhoff) — implemented
  | 'DKMT'      // 3-node thick plate (Mindlin)  — planned
  | 'MITC4'     // 4-node quad, thin/thick        — implemented
  | 'MITC9'     // 9-node quad, higher accuracy   — planned
  | 'SHB8PS';   // 8-node solid-shell (ANS)       — planned

/** Families that are actually available in the solver */
export const AVAILABLE_SHELL_FAMILIES: readonly ShellFamily[] = ['DKT', 'MITC4'] as const;

/** Result of the shell family selector — choice + explanation */
export interface ShellRecommendation {
  family: ShellFamily;
  reason: string;            // human-readable explanation
  confidence: 'high' | 'medium' | 'low';
  alternatives: Array<{
    family: ShellFamily;
    reason: string;
    available: boolean;      // implemented in solver?
  }>;
  warnings: string[];        // e.g. "element is highly warped"
  metrics: {                 // computed geometry diagnostics
    aspectRatio?: number;    // max edge / min edge
    warpAngle?: number;      // degrees, 0 = perfectly flat (quads only)
    skewAngle?: number;      // degrees, 90 = perfect (quads only)
    thicknessRatio?: number; // t / min_edge_length
  };
}

/** DKT triangular plate element (3-node shell) */
export interface SolverPlateElement {
  id: number;
  nodes: [number, number, number]; // 3 node IDs
  materialId: number;
  thickness: number; // m
  shellFamily?: ShellFamily;
}

/** MITC4 quadrilateral shell element (4-node shell) */
export interface SolverQuadElement {
  id: number;
  nodes: [number, number, number, number]; // 4 node IDs
  materialId: number;
  thickness: number; // m
  shellFamily?: ShellFamily;
}

// ─── Constraints ────────────────────────────────────────────────

export type ConstraintType = 'rigidLink' | 'diaphragm' | 'equalDof' | 'linearMpc';

export interface RigidLinkConstraint {
  type: 'rigidLink';
  masterNode: number;
  slaveNode: number;
  dofs?: number[]; // optional, empty = all translational
}

export interface DiaphragmConstraint {
  type: 'diaphragm';
  masterNode: number;
  slaveNodes: number[];
  plane?: string; // default "XY"
}

export interface EqualDofConstraint {
  type: 'equalDof';
  masterNode: number;
  slaveNode: number;
  dofs: number[];
}

export interface LinearMpcConstraint {
  type: 'linearMpc';
  terms: Array<{ nodeId: number; dof: number; coefficient: number }>;
}

export type Constraint3D = RigidLinkConstraint | DiaphragmConstraint | EqualDofConstraint | LinearMpcConstraint;

// ─── Input ───────────────────────────────────────────────────────

export interface SolverInput3D {
  nodes: Map<number, SolverNode3D>;
  materials: Map<number, SolverMaterial>;
  sections: Map<number, SolverSection3D>;
  elements: Map<number, SolverElement3D>;
  supports: Map<number, SolverSupport3D>;
  loads: SolverLoad3D[];
  plates?: Map<number, SolverPlateElement>;
  quads?: Map<number, SolverQuadElement>;
  constraints?: Constraint3D[];
  leftHand?: boolean;  // Terna izquierda: negate ey in local axes
}

// ─── Results ─────────────────────────────────────────────────────

export interface Displacement3D {
  nodeId: number;
  ux: number;  // m
  uy: number;  // m
  uz: number;  // m
  rx: number;  // rad (rotation about global X)
  ry: number;  // rad (rotation about global Y)
  rz: number;  // rad (rotation about global Z)
}

export interface Reaction3D {
  nodeId: number;
  fx: number;  // kN
  fy: number;  // kN
  fz: number;  // kN
  mx: number;  // kN·m
  my: number;  // kN·m
  mz: number;  // kN·m
}

export interface ElementForces3D {
  elementId: number;
  length: number;  // m
  // Axial force (+ = tension)
  nStart: number;
  nEnd: number;
  // Shear in local Y
  vyStart: number;
  vyEnd: number;
  // Shear in local Z
  vzStart: number;
  vzEnd: number;
  // Torsion (about local X)
  mxStart: number;
  mxEnd: number;
  // Bending about local Y (weak axis)
  myStart: number;
  myEnd: number;
  // Bending about local Z (strong axis)
  mzStart: number;
  mzEnd: number;
  // Hinge flags
  hingeStart: boolean;
  hingeEnd: boolean;
  // Loads on this element (for diagram/deformed shape computation)
  // Y-plane (strong axis: Mz, Vy bending)
  qYI: number;      // kN/m full-length equivalent at node I (local Y)
  qYJ: number;      // kN/m full-length equivalent at node J (local Y)
  distributedLoadsY: Array<{ qI: number; qJ: number; a: number; b: number }>;
  pointLoadsY: Array<{ a: number; p: number }>;
  // Z-plane (weak axis: My, Vz bending)
  qZI: number;
  qZJ: number;
  distributedLoadsZ: Array<{ qI: number; qJ: number; a: number; b: number }>;
  pointLoadsZ: Array<{ a: number; p: number }>;
}

/** Plate stress output (triangular) */
export interface PlateStress {
  elementId: number;
  sigmaXx: number;
  sigmaYy: number;
  tauXy: number;
  mx: number;
  my: number;
  mxy: number;
  sigma1: number;
  sigma2: number;
  vonMises: number;
  nodalVonMises?: number[];
}

/** Quad stress output */
export interface QuadStress {
  elementId: number;
  sigmaXx: number;
  sigmaYy: number;
  tauXy: number;
  mx: number;
  my: number;
  mxy: number;
  vonMises: number;
  nodalVonMises?: number[];
}

export interface AnalysisResults3D {
  displacements: Displacement3D[];
  reactions: Reaction3D[];
  elementForces: ElementForces3D[];
  constraintForces?: import('./types').ConstraintForce[];
  diagnostics?: import('./types').AssemblyDiagnostic[];
  plateStresses?: PlateStress[];
  quadStresses?: QuadStress[];
  solverDiagnostics?: import('./types').SolverDiagnostic[];
}

// ─── Envelope types for 3D load combinations ─────────────────

export interface ElementEnvelopeDiagram3D {
  elementId: number;
  tPositions: number[];
  posValues: number[];
  negValues: number[];
}

export interface EnvelopeDiagramData3D {
  kind: 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'axial' | 'torsion';
  elements: ElementEnvelopeDiagram3D[];
  globalMax: number;
}

export interface FullEnvelope3D {
  momentY: EnvelopeDiagramData3D;
  momentZ: EnvelopeDiagramData3D;
  shearY: EnvelopeDiagramData3D;
  shearZ: EnvelopeDiagramData3D;
  axial: EnvelopeDiagramData3D;
  torsion: EnvelopeDiagramData3D;
  maxAbsResults3D: AnalysisResults3D;
}
