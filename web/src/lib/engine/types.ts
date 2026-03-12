// Shared types for the structural analysis engine

export interface SolverNode {
  id: number;
  x: number;
  y: number;
}

export interface SolverMaterial {
  id: number;
  e: number;  // MPa (converted to kN/m² internally: E * 1000)
  nu: number;
}

export interface SolverSection {
  id: number;
  a: number;   // m²
  iz: number;  // m⁴
}

export interface SolverElement {
  id: number;
  type: 'frame' | 'truss';
  nodeI: number;
  nodeJ: number;
  materialId: number;
  sectionId: number;
  hingeStart: boolean;
  hingeEnd: boolean;
}

export type SupportType = 'fixed' | 'pinned' | 'rollerX' | 'rollerY' | 'spring' | 'inclinedRoller';

export interface SolverSupport {
  id: number;
  nodeId: number;
  type: SupportType;
  // Optional spring stiffnesses (kN/m or kN·m/rad). If set, that DOF is free but has spring.
  kx?: number;
  ky?: number;
  kz?: number; // rotational spring
  // Optional prescribed displacements (m or rad). Only for restrained DOFs.
  dx?: number; // prescribed ux (m)
  dy?: number; // prescribed uy (m)
  drz?: number; // prescribed rotation (rad)
  // Rotation angle (radians). Used for:
  // - inclinedRoller: rolling surface angle from horizontal (α=0 → rollerX, α=π/2 → rollerY)
  // - spring: local axes rotation from global (kx/ky are in rotated frame)
  angle?: number;
}

export interface SolverNodalLoad {
  nodeId: number;
  fx: number;  // kN
  fy: number;  // kN
  mz: number;  // kN·m
}

export interface SolverDistributedLoad {
  elementId: number;
  qI: number;  // kN/m at node I or at position a (perpendicular to element, local coords)
  qJ: number;  // kN/m at node J or at position b
  a?: number;  // start position from node I (m). Default: 0
  b?: number;  // end position from node I (m). Default: L
}

export interface SolverPointLoadOnElement {
  elementId: number;
  a: number;   // distance from node I (meters)
  p: number;   // kN (perpendicular to element, local coords)
  px?: number; // kN (axial, local coords — positive = toward J)
  mz?: number; // kN·m (moment at position a — positive = CCW)
}

export interface SolverThermalLoad {
  elementId: number;
  dtUniform: number;  // °C — uniform temperature change (causes axial expansion)
  dtGradient: number; // °C — temperature difference top-bottom (causes bending)
}

export type SolverLoad =
  | { type: 'nodal'; data: SolverNodalLoad }
  | { type: 'distributed'; data: SolverDistributedLoad }
  | { type: 'pointOnElement'; data: SolverPointLoadOnElement }
  | { type: 'thermal'; data: SolverThermalLoad };

export interface SolverInput {
  nodes: Map<number, SolverNode>;
  materials: Map<number, SolverMaterial>;
  sections: Map<number, SolverSection>;
  elements: Map<number, SolverElement>;
  supports: Map<number, SolverSupport>;
  loads: SolverLoad[];
}

export interface Displacement {
  nodeId: number;
  ux: number;  // m
  uy: number;  // m
  rz: number;  // rad
}

export interface Reaction {
  nodeId: number;
  rx: number;  // kN
  ry: number;  // kN
  mz: number;  // kN·m
}

export interface ElementForces {
  elementId: number;
  nStart: number;  // kN (axial, + = tension)
  nEnd: number;
  vStart: number;  // kN (shear)
  vEnd: number;
  mStart: number;  // kN·m (moment)
  mEnd: number;
  length: number;  // m
  // Loads on this element (for diagram calculation)
  qI: number;      // kN/m at node I (distributed) — legacy, sum of full-length loads
  qJ: number;      // kN/m at node J (distributed) — legacy, sum of full-length loads
  pointLoads: Array<{ a: number; p: number; px?: number; mz?: number }>; // point loads
  // All distributed loads on this element (supports partial loads with a/b)
  distributedLoads: Array<{ qI: number; qJ: number; a: number; b: number }>;
  // Hinge flags (needed for correct deformed shape visualization)
  hingeStart: boolean;
  hingeEnd: boolean;
}

export interface ConstraintForce {
  nodeId: number;
  dof: string;   // "ux", "uy", "rz", etc.
  force: number; // kN or kN·m
}

export interface AssemblyDiagnostic {
  elementId: number;
  elementType: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

export interface SolverDiagnostic {
  category: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface AnalysisResults {
  displacements: Displacement[];
  reactions: Reaction[];
  elementForces: ElementForces[];
  constraintForces?: ConstraintForce[];
  diagnostics?: AssemblyDiagnostic[];
  solverDiagnostics?: SolverDiagnostic[];
}

/** Envolvente puntual pre-computada para un elemento */
export interface ElementEnvelopeDiagram {
  elementId: number;
  /** Posiciones normalizadas 0..1 (21 puntos) */
  tPositions: number[];
  /** Valor máximo positivo en cada punto (≥ 0) */
  posValues: number[];
  /** Valor máximo negativo en cada punto (≤ 0) */
  negValues: number[];
}

/** Datos de envolvente para un tipo de diagrama */
export interface EnvelopeDiagramData {
  kind: 'moment' | 'shear' | 'axial';
  elements: ElementEnvelopeDiagram[];
  /** Máximo absoluto global (para escala uniforme) */
  globalMax: number;
}

// ─── Diagnostics ───────────────────────────────────────────────

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/** A single diagnostic message from the solver, verifier, or post-processor */
export interface SolverDiagnostic {
  severity: DiagnosticSeverity;
  code: string;                    // machine-readable: 'VERIF_FAIL_SHEAR', 'PDELTA_NOT_CONVERGED', etc.
  message: string;                 // i18n key or pre-translated string
  elementIds?: number[];
  nodeIds?: number[];
  source: 'solver' | 'assembly' | 'kinematic' | 'verification' | 'serviceability' | 'stability' | 'model';
  details?: Record<string, unknown>;
}


/** Envolvente completa con datos puntuales para M, V, N */
export interface FullEnvelope {
  moment: EnvelopeDiagramData;
  shear: EnvelopeDiagramData;
  axial: EnvelopeDiagramData;
  /** AnalysisResults con max-abs (backward compat para deformada, tabla, reacciones) */
  maxAbsResults: AnalysisResults;
}
