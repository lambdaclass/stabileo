// Model store - manages the structural model
import type { KinematicResult } from '../engine/solver-js';
import type { SolverInput, FullEnvelope, AnalysisResults } from '../engine/types';
import type { SolverInput3D, AnalysisResults3D, FullEnvelope3D } from '../engine/types-3d';
import type { ModelSnapshot } from './history.svelte';
import { load2DExample } from './model-examples-2d';
import { load3DExample } from './model-examples-3d';
import type { ExampleAPI3D } from './model-examples-3d';
import { inferLoadCaseType } from '../engine/combinations-service';
import { t } from '../i18n';
import { validateAndSolve2D, buildSolverInput2D, validateAndSolve3D, buildSolverInput3D as buildSolverInput3DFn, solveCombinations2D, solveCombinations3D as solveCombinations3DFn } from '../engine/solver-service';
import { computeInfluenceLine as computeInfluenceLineFn } from '../engine/influence-service';

export interface Node {
  id: number;
  x: number;
  y: number;
  z?: number;  // 3D coordinate (default 0 for 2D models)
}

export interface Material {
  id: number;
  name: string;
  e: number;  // MPa
  nu: number;
  rho: number; // kN/m³
  fy?: number; // MPa (yield stress for stress verification)
}

export interface Section {
  id: number;
  name: string;
  a: number;  // m²
  iz: number; // m⁴ — moment of inertia about Z-axis (vertical)
  b?: number; // m
  h?: number; // m
  shape?: 'I' | 'H' | 'U' | 'L' | 'RHS' | 'CHS' | 'rect' | 'generic' | 'T' | 'invL' | 'C';
  tw?: number;  // m - espesor alma (web thickness)
  tf?: number;  // m - espesor ala (flange thickness)
  t?: number;   // m - espesor pared (wall thickness, hollow sections) / lip length (C-channel)
  tl?: number;  // m - lip thickness (C-channel only)
  iy?: number;  // m⁴ — moment of inertia about Y-axis (horizontal) (3D only)
  j?: number;   // m⁴ — torsional constant Saint-Venant (3D only)
  rotation?: number;  // degrees — rotation of section profile around bar axis (0-360)
}

export interface Element {
  id: number;
  type: 'frame' | 'truss';
  nodeI: number;
  nodeJ: number;
  materialId: number;
  sectionId: number;
  hingeStart: boolean;
  hingeEnd: boolean;
  // Optional orientation vector for local Y axis (3D only)
  localYx?: number;
  localYy?: number;
  localYz?: number;
  // Roll angle: rotation of local Y/Z around local X (degrees, 3D only)
  rollAngle?: number;
}

export type SupportType = 'fixed' | 'pinned' | 'rollerX' | 'rollerY' | 'spring'
  | 'fixed3d' | 'pinned3d' | 'rollerXZ' | 'rollerXY' | 'rollerYZ' | 'spring3d'
  | 'custom3d';

export interface Support {
  id: number;
  nodeId: number;
  type: SupportType;
  kx?: number; // kN/m
  ky?: number; // kN/m
  kz?: number; // kN·m/rad (2D rotation spring / 3D rotation-Z spring)
  dx?: number; // prescribed ux (m)
  dy?: number; // prescribed uy (m)
  drz?: number; // prescribed rotation about Z (rad)
  angle?: number;    // ángulo en grados (solo para rollers) — 0 = horizontal
  isGlobal?: boolean; // true = ejes globales (default), false = ejes locales
  // 3D-specific fields
  dz?: number;   // prescribed uz (m, 3D)
  drx?: number;  // prescribed rotation about X (rad, 3D)
  dry?: number;  // prescribed rotation about Y (rad, 3D)
  krx?: number;  // kN·m/rad — torsional spring (3D)
  kry?: number;  // kN·m/rad — rotation about Y spring (3D)
  krz?: number;  // kN·m/rad — rotation about Z spring (3D)
  // Inclined support (3D): normal vector of constraint plane
  normalX?: number;
  normalY?: number;
  normalZ?: number;
  isInclined?: boolean;
  // Per-DOF 3D configuration (overrides 'type' for 3D solver when present)
  dofRestraints?: {
    tx: boolean; ty: boolean; tz: boolean;
    rx: boolean; ry: boolean; rz: boolean;
  };
  dofFrame?: 'global' | 'local';
  dofLocalElementId?: number;  // Element ID for local axis reference
}

export interface NodalLoad {
  id: number;
  nodeId: number;
  fx: number; // kN
  fy: number; // kN
  mz: number; // kN·m
  caseId?: number; // load case ID (default: 1)
}

export interface DistributedLoad {
  id: number;
  elementId: number;
  qI: number; // kN/m at node I (or at position a if partial)
  qJ: number; // kN/m at node J (or at position b if partial)
  caseId?: number;
  angle?: number;     // degrees, rotation from base direction (default 0)
  isGlobal?: boolean; // false=local coords (default), true=global coords
  a?: number; // start position from node I (m). Default: 0 (full length)
  b?: number; // end position from node I (m). Default: L (full length)
}

export interface PointLoadOnElement {
  id: number;
  elementId: number;
  a: number; // distance from node I (m)
  p: number; // kN (perpendicular, local coords)
  px?: number; // kN (axial, local coords — positive = tension toward J)
  mz?: number; // kN·m (moment at position a — positive = CCW)
  caseId?: number;
  angle?: number;     // degrees, rotation from base direction (default 0)
  isGlobal?: boolean; // false=local coords (default), true=global coords
}

export interface ThermalLoad {
  id: number;
  elementId: number;
  dtUniform: number;  // °C (uniform temperature change)
  dtGradient: number; // °C (temperature difference top-bottom)
  caseId?: number;
}

// ─── 3D Load Types ──────────────────────────────────────────────

export interface NodalLoad3D {
  id: number;
  nodeId: number;
  fx: number; fy: number; fz: number;  // kN (global)
  mx: number; my: number; mz: number;  // kN·m (global)
  caseId?: number;
}

export interface DistributedLoad3D {
  id: number;
  elementId: number;
  qYI: number; qYJ: number;  // kN/m in local Y at node I/J
  qZI: number; qZJ: number;  // kN/m in local Z at node I/J
  a?: number; b?: number;     // partial load positions (m from node I)
  caseId?: number;
}

export interface PointLoadOnElement3D {
  id: number;
  elementId: number;
  a: number;    // distance from node I (m)
  py: number;   // kN in local Y
  pz: number;   // kN in local Z
  caseId?: number;
}

export type Load =
  | { type: 'nodal'; data: NodalLoad }
  | { type: 'distributed'; data: DistributedLoad }
  | { type: 'pointOnElement'; data: PointLoadOnElement }
  | { type: 'thermal'; data: ThermalLoad }
  | { type: 'nodal3d'; data: NodalLoad3D }
  | { type: 'distributed3d'; data: DistributedLoad3D }
  | { type: 'pointOnElement3d'; data: PointLoadOnElement3D };

export type LoadCaseType = string;

export interface LoadCase {
  id: number;
  type: LoadCaseType;
  name: string;
}

export interface LoadCombination {
  id: number;
  name: string;
  factors: Array<{ caseId: number; factor: number }>;
}

export interface StructureModel {
  name: string;
  nodes: Map<number, Node>;
  materials: Map<number, Material>;
  sections: Map<number, Section>;
  elements: Map<number, Element>;
  supports: Map<number, Support>;
  loads: Load[];
  loadCases: LoadCase[];
  combinations: LoadCombination[];
}

export type { AnalysisResults };
export type { AnalysisResults3D };

// ─── Influence Line Types ───────────────────────────────────────

export type InfluenceQuantity = 'Ry' | 'Rx' | 'Mz' | 'V' | 'M';

export interface InfluenceLineResult {
  /** What quantity is being tracked */
  quantity: InfluenceQuantity;
  /** Target node for reactions, or target element+position for V/M */
  targetNodeId?: number;
  targetElementId?: number;
  targetPosition?: number; // 0..1 along target element
  /** Data points: loadPosition (global x along structure) → quantity value */
  points: Array<{ x: number; y: number; elementId: number; t: number; value: number }>;
}

function createModelStore() {
  let model = $state<StructureModel>({
    name: t('tabBar.newStructure'),
    nodes: new Map(),
    materials: new Map(),
    sections: new Map(),
    elements: new Map(),
    supports: new Map(),
    loads: [],
    loadCases: [
      { id: 1, type: 'D', name: 'Dead Load' },
      { id: 2, type: 'L', name: 'Live Load' },
      { id: 3, type: 'W', name: 'Wind' },
      { id: 4, type: 'E', name: 'Earthquake' },
    ],
    combinations: [
      { id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
      { id: 2, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
      { id: 3, name: '1.2D + L + 1.6W', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
      { id: 4, name: '1.2D + L + E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 4, factor: 1.0 }] },
    ],
  });

  let lastKinematicResult = $state<KinematicResult | null>(null);
  let modelVersion = $state(0);

  let nextId = $state({
    node: 1,
    material: 1,
    section: 1,
    element: 1,
    support: 1,
    load: 1,
    loadCase: 5,
    combination: 5,
  });



  // Default material and section
  const defaultMaterial: Material = {
    id: 1,
    name: 'Acero A36',
    e: 200000,
    nu: 0.3,
    rho: 78.5,
    fy: 250,
  };

  const defaultSection: Section = {
    id: 1,
    name: 'IPN 300',
    a: 0.00690,           // 69.0 cm² → m²
    iy: 0.00009800,       // 9800 cm⁴ → m⁴ — about Y (horizontal)
    iz: 0.00000451,       // 451 cm⁴ → m⁴ — about Z (vertical)
    j: 0.0000004666,      // ≈46.7 cm⁴ → m⁴
    b: 0.125,             // 125 mm → m
    h: 0.300,             // 300 mm → m
    shape: 'I',
    tw: 0.0108,           // 10.8 mm → m
    tf: 0.0162,           // 16.2 mm → m
  };

  // Initialize with defaults
  model.materials.set(1, defaultMaterial);
  model.sections.set(1, defaultSection);
  nextId.material = 2;
  nextId.section = 2;

  // History integration — set externally to avoid circular import
  let _pushUndo: (() => void) | null = null;
  let _undoBatching = false;
  // Results invalidation callback — set externally by store/index.ts to clear stale results
  let _onMutation: (() => void) | null = null;

  return {
    _setHistoryPush(fn: () => void) {
      _pushUndo = () => { modelVersion++; _onMutation?.(); fn(); };
    },

    /** Register a callback to be called on every model mutation (used to clear stale results) */
    _setOnMutation(fn: () => void) { _onMutation = fn; },

    /** Increment modelVersion to signal model changed (used by historyStore for direct mutations) */
    bumpModelVersion() { modelVersion++; _onMutation?.(); },

    /** Run multiple mutations as a single undo step */
    batch(fn: () => void): void {
      _pushUndo?.();
      _undoBatching = true;
      try { fn(); } finally { _undoBatching = false; }
    },

    get modelVersion() { return modelVersion; },

    get model() { return model; },
    get nodes() { return model.nodes; },
    get elements() { return model.elements; },
    get supports() { return model.supports; },
    get loads() { return model.loads; },
    get materials() { return model.materials; },
    get sections() { return model.sections; },
    get loadCases() { return model.loadCases; },
    get combinations() { return model.combinations; },
    get kinematicResult() { return lastKinematicResult; },

    snapshot(): ModelSnapshot {
      // $state.snapshot() is the official Svelte 5 API to deeply unwrap reactive proxies
      // into plain JavaScript objects. This avoids all proxy-related serialization issues.
      const snap = $state.snapshot(model);
      const snapId = $state.snapshot(nextId);
      const result: ModelSnapshot = {
        name: snap.name,
        nodes: Array.from(snap.nodes.entries()) as ModelSnapshot['nodes'],
        materials: Array.from(snap.materials.entries()) as ModelSnapshot['materials'],
        sections: Array.from(snap.sections.entries()) as ModelSnapshot['sections'],
        elements: Array.from(snap.elements.entries()).map(([k, v]) => [k, {
          ...v,
          hingeStart: v.hingeStart ?? false,
          hingeEnd: v.hingeEnd ?? false,
        }]) as ModelSnapshot['elements'],
        supports: Array.from(snap.supports.entries()) as ModelSnapshot['supports'],
        loads: snap.loads as ModelSnapshot['loads'],
        loadCases: snap.loadCases as ModelSnapshot['loadCases'],
        combinations: snap.combinations as ModelSnapshot['combinations'],
        nextId: snapId as ModelSnapshot['nextId'],
      };
      return result;
    },

    restore(s: ModelSnapshot): void {
      modelVersion++;
      _onMutation?.();
      if (s.name) model.name = s.name;
      model.nodes = new Map(s.nodes.map(([k, v]) => [k, { ...v }]));
      model.materials = new Map(s.materials.map(([k, v]) => [k, { ...v }]));
      model.sections = new Map(s.sections.map(([k, v]) => [k, { ...v } as Section]));
      model.elements = new Map(s.elements.map(([k, v]) => [k, {
        ...v,
        hingeStart: v.hingeStart ?? false,
        hingeEnd: v.hingeEnd ?? false,
      }]));
      // Deduplicate supports: keep only the last support per node (legacy cleanup)
      const supEntries = s.supports.map(([k, v]) => [k, { ...v }] as [number, Support]);
      const seenNodes = new Set<number>();
      const dedupedEntries: [number, Support][] = [];
      for (let i = supEntries.length - 1; i >= 0; i--) {
        const [k, v] = supEntries[i];
        if (!seenNodes.has(v.nodeId)) {
          seenNodes.add(v.nodeId);
          dedupedEntries.push([k, v]);
        }
      }
      dedupedEntries.reverse();
      model.supports = new Map(dedupedEntries);
      // Deep-copy loads manually (structuredClone fails on Svelte reactive proxies)
      model.loads = s.loads.map(l => ({ type: l.type, data: { ...l.data } })) as unknown as Load[];
      // Migrate old distributed loads: q → qI/qJ
      for (const l of model.loads) {
        if (l.type === 'distributed') {
          const d = l.data as any;
          if (d.q !== undefined && d.qI === undefined) {
            d.qI = d.q;
            d.qJ = d.q;
            delete d.q;
          }
        }
      }
      model.loadCases = s.loadCases
        ? s.loadCases.map(c => ({ type: (c as any).type ?? inferLoadCaseType(c.name), ...c }))
        : [{ id: 1, type: 'D' as LoadCaseType, name: 'Dead Load' }, { id: 2, type: 'L' as LoadCaseType, name: 'Live Load' }, { id: 3, type: 'W' as LoadCaseType, name: 'Wind' }, { id: 4, type: 'E' as LoadCaseType, name: 'Earthquake' }];
      model.combinations = s.combinations
        ? s.combinations.map(c => ({ ...c, factors: c.factors.map(f => ({ ...f })) }))
        : [];
      nextId.node = s.nextId.node;
      nextId.material = s.nextId.material;
      nextId.section = s.nextId.section;
      nextId.element = s.nextId.element;
      nextId.support = s.nextId.support;
      nextId.load = s.nextId.load;
      nextId.loadCase = s.nextId.loadCase ?? 3;
      nextId.combination = s.nextId.combination ?? 1;
    },

    addNode(x: number, y: number, z?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.node++;
      const node: Node = { id, x, y };
      if (z !== undefined && z !== 0) node.z = z;
      model.nodes.set(id, node);
      model.nodes = new Map(model.nodes);
      return id;
    },

    updateNodeZ(id: number, z: number): void {
      const node = model.nodes.get(id);
      if (node) {
        if (!_undoBatching) _pushUndo?.();
        model.nodes.set(id, { ...node, z });
        model.nodes = new Map(model.nodes);
      }
    },

    addElement(nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame'): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.element++;
      model.elements.set(id, {
        id,
        type,
        nodeI,
        nodeJ,
        materialId: 1,
        sectionId: 1,
        hingeStart: false,
        hingeEnd: false,
      });
      model.elements = new Map(model.elements);
      return id;
    },

    addSupport(nodeId: number, type: SupportType, springs?: { kx?: number; ky?: number; kz?: number; krx?: number; kry?: number; krz?: number }, opts?: { angle?: number; isGlobal?: boolean; dx?: number; dy?: number; dz?: number; drx?: number; dry?: number; drz?: number; dofRestraints?: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean }; dofFrame?: 'global' | 'local'; dofLocalElementId?: number }): number {
      if (!_undoBatching) _pushUndo?.();
      // Remove existing support on this node (only one support per node allowed)
      for (const [existingId, existingSup] of model.supports) {
        if (existingSup.nodeId === nodeId) {
          model.supports.delete(existingId);
          break;
        }
      }
      const id = nextId.support++;
      const sup: Support = { id, nodeId, type };
      if (springs) {
        if (springs.kx !== undefined) sup.kx = springs.kx;
        if (springs.ky !== undefined) sup.ky = springs.ky;
        if (springs.kz !== undefined) sup.kz = springs.kz;
        if (springs.krx !== undefined) sup.krx = springs.krx;
        if (springs.kry !== undefined) sup.kry = springs.kry;
        if (springs.krz !== undefined) sup.krz = springs.krz;
      }
      if (opts?.angle !== undefined && opts.angle !== 0) sup.angle = opts.angle;
      if (opts?.isGlobal !== undefined) sup.isGlobal = opts.isGlobal;
      // Prescribed displacements
      if (opts?.dx !== undefined && opts.dx !== 0) sup.dx = opts.dx;
      if (opts?.dy !== undefined && opts.dy !== 0) sup.dy = opts.dy;
      if (opts?.dz !== undefined && opts.dz !== 0) sup.dz = opts.dz;
      if (opts?.drx !== undefined && opts.drx !== 0) sup.drx = opts.drx;
      if (opts?.dry !== undefined && opts.dry !== 0) sup.dry = opts.dry;
      if (opts?.drz !== undefined && opts.drz !== 0) sup.drz = opts.drz;
      // Per-DOF 3D configuration
      if (opts?.dofRestraints) sup.dofRestraints = opts.dofRestraints;
      if (opts?.dofFrame) sup.dofFrame = opts.dofFrame;
      if (opts?.dofLocalElementId !== undefined) sup.dofLocalElementId = opts.dofLocalElementId;
      model.supports.set(id, sup);
      model.supports = new Map(model.supports);
      return id;
    },

    addNodalLoad(nodeId: number, fx: number, fy: number, mz: number = 0, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: NodalLoad = { id, nodeId, fx, fy, mz };
      if (caseId !== undefined) data.caseId = caseId;
      model.loads = [...model.loads, { type: 'nodal', data }];
      return id;
    },

    addDistributedLoad(elementId: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number, a?: number, b?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: DistributedLoad = { id, elementId, qI, qJ: qJ ?? qI };
      if (angle !== undefined && angle !== 0) data.angle = angle;
      if (isGlobal) data.isGlobal = true;
      if (caseId !== undefined) data.caseId = caseId;
      if (a !== undefined && a > 0) data.a = a;
      if (b !== undefined) data.b = b;
      model.loads = [...model.loads, { type: 'distributed', data }];
      return id;
    },

    addPointLoadOnElement(elementId: number, a: number, p: number, opts?: { px?: number; mz?: number; angle?: number; isGlobal?: boolean; caseId?: number }): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: PointLoadOnElement = { id, elementId, a, p };
      if (opts?.px !== undefined && opts.px !== 0) data.px = opts.px;
      if (opts?.mz !== undefined && opts.mz !== 0) data.mz = opts.mz;
      if (opts?.angle !== undefined && opts.angle !== 0) data.angle = opts.angle;
      if (opts?.isGlobal) data.isGlobal = true;
      if (opts?.caseId !== undefined) data.caseId = opts.caseId;
      model.loads = [...model.loads, { type: 'pointOnElement', data }];
      return id;
    },

    addThermalLoad(elementId: number, dtUniform: number, dtGradient: number = 0, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: ThermalLoad = { id, elementId, dtUniform, dtGradient };
      if (caseId !== undefined) data.caseId = caseId;
      model.loads = [...model.loads, { type: 'thermal', data }];
      return id;
    },

    // ─── 3D Load CRUD ─────────────────────────────────────────────

    addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: NodalLoad3D = { id, nodeId, fx, fy, fz, mx, my, mz };
      if (caseId !== undefined) data.caseId = caseId;
      model.loads = [...model.loads, { type: 'nodal3d', data }];
      return id;
    },

    addDistributedLoad3D(elementId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: DistributedLoad3D = { id, elementId, qYI, qYJ, qZI, qZJ };
      if (a !== undefined && a > 0) data.a = a;
      if (b !== undefined) data.b = b;
      if (caseId !== undefined) data.caseId = caseId;
      model.loads = [...model.loads, { type: 'distributed3d', data }];
      return id;
    },

    addPointLoadOnElement3D(elementId: number, a: number, py: number, pz: number, caseId?: number): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.load++;
      const data: PointLoadOnElement3D = { id, elementId, a, py, pz };
      if (caseId !== undefined) data.caseId = caseId;
      model.loads = [...model.loads, { type: 'pointOnElement3d', data }];
      return id;
    },

    removeNode(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.nodes.delete(id);
      model.nodes = new Map(model.nodes);
      for (const [elemId, elem] of model.elements) {
        if (elem.nodeI === id || elem.nodeJ === id) {
          model.elements.delete(elemId);
        }
      }
      model.elements = new Map(model.elements);
      for (const [supId, sup] of model.supports) {
        if (sup.nodeId === id) {
          model.supports.delete(supId);
        }
      }
      model.supports = new Map(model.supports);
      model.loads = model.loads.filter(l =>
        !((l.type === 'nodal' || l.type === 'nodal3d') && l.data.nodeId === id)
      );
    },

    removeElement(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.elements.delete(id);
      model.elements = new Map(model.elements);
      model.loads = model.loads.filter(l =>
        !((l.type === 'distributed' || l.type === 'pointOnElement' || l.type === 'thermal'
          || l.type === 'distributed3d' || l.type === 'pointOnElement3d') &&
          (l.data as any).elementId === id)
      );
    },

    removeLoad(loadId: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.loads = model.loads.filter(l => l.data.id !== loadId);
    },

    removeSupport(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.supports.delete(id);
      model.supports = new Map(model.supports);
    },

    updateSupport(id: number, data: Partial<{ nodeId: number; type: SupportType; kx: number; ky: number; kz: number; dx: number; dy: number; drz: number; angle: number; isGlobal: boolean; dz: number; drx: number; dry: number; krx: number; kry: number; krz: number; dofRestraints: { tx: boolean; ty: boolean; tz: boolean; rx: boolean; ry: boolean; rz: boolean }; dofFrame: 'global' | 'local'; dofLocalElementId: number }>): void {
      if (!_undoBatching) _pushUndo?.();
      const sup = model.supports.get(id);
      if (!sup) return;
      // If changing nodeId, remove any existing support on the target node
      if (data.nodeId !== undefined && data.nodeId !== sup.nodeId) {
        for (const [existingId, existingSup] of model.supports) {
          if (existingSup.nodeId === data.nodeId && existingId !== id) {
            model.supports.delete(existingId);
            break;
          }
        }
      }
      // Replace entire object to guarantee Svelte 5 reactivity
      model.supports.set(id, {
        id: sup.id,
        nodeId: data.nodeId ?? sup.nodeId,
        type: data.type ?? sup.type,
        kx: data.kx ?? sup.kx,
        ky: data.ky ?? sup.ky,
        kz: data.kz ?? sup.kz,
        dx: data.dx ?? sup.dx,
        dy: data.dy ?? sup.dy,
        drz: data.drz ?? sup.drz,
        angle: 'angle' in data ? data.angle : sup.angle,
        isGlobal: 'isGlobal' in data ? data.isGlobal : sup.isGlobal,
        // 3D fields
        dz: data.dz ?? sup.dz,
        drx: data.drx ?? sup.drx,
        dry: data.dry ?? sup.dry,
        krx: data.krx ?? sup.krx,
        kry: data.kry ?? sup.kry,
        krz: data.krz ?? sup.krz,
        // Per-DOF 3D configuration
        dofRestraints: data.dofRestraints ?? sup.dofRestraints,
        dofFrame: data.dofFrame ?? sup.dofFrame,
        dofLocalElementId: data.dofLocalElementId ?? sup.dofLocalElementId,
        // Preserve inclined support fields
        normalX: sup.normalX,
        normalY: sup.normalY,
        normalZ: sup.normalZ,
        isInclined: sup.isInclined,
      });
      model.supports = new Map(model.supports);
    },

    updateLoad(loadId: number, data: Record<string, number | boolean | undefined>): void {
      if (!_undoBatching) _pushUndo?.();
      const load = model.loads.find(l => l.data.id === loadId);
      if (!load) return;
      // Handle caseId for all load types
      if (data.caseId !== undefined) {
        (load.data as any).caseId = data.caseId as number | undefined;
      }
      if (load.type === 'nodal') {
        const d = load.data as NodalLoad;
        if (data.fx !== undefined) d.fx = data.fx as number;
        if (data.fy !== undefined) d.fy = data.fy as number;
        if (data.mz !== undefined) d.mz = data.mz as number;
      } else if (load.type === 'distributed') {
        const d = load.data as DistributedLoad;
        if (data.qI !== undefined) d.qI = data.qI as number;
        if (data.qJ !== undefined) d.qJ = data.qJ as number;
        if (data.angle !== undefined) d.angle = data.angle as number;
        if (data.isGlobal !== undefined) d.isGlobal = data.isGlobal as boolean;
        if (data.a !== undefined) {
          const aVal = Math.max(0, data.a as number);
          d.a = aVal > 0 ? aVal : undefined;
        }
        if (data.b !== undefined) {
          const bVal = data.b as number;
          const L = this.getElementLength(d.elementId);
          d.b = (bVal < L - 1e-10) ? Math.max(d.a ?? 0, bVal) : undefined;
        }
      } else if (load.type === 'pointOnElement') {
        const d = load.data as PointLoadOnElement;
        if (data.a !== undefined) d.a = data.a as number;
        if (data.p !== undefined) d.p = data.p as number;
        if (data.px !== undefined) d.px = (data.px as number) || undefined;
        if (data.mz !== undefined) d.mz = (data.mz as number) || undefined;
        if (data.angle !== undefined) d.angle = data.angle as number;
        if (data.isGlobal !== undefined) d.isGlobal = data.isGlobal as boolean;
      } else if (load.type === 'thermal') {
        const d = load.data as ThermalLoad;
        if (data.dtUniform !== undefined) d.dtUniform = data.dtUniform as number;
        if (data.dtGradient !== undefined) d.dtGradient = data.dtGradient as number;
      } else if (load.type === 'nodal3d') {
        const d = load.data as NodalLoad3D;
        if (data.fx !== undefined) d.fx = data.fx as number;
        if (data.fy !== undefined) d.fy = data.fy as number;
        if (data.fz !== undefined) d.fz = data.fz as number;
        if (data.mx !== undefined) d.mx = data.mx as number;
        if (data.my !== undefined) d.my = data.my as number;
        if (data.mz !== undefined) d.mz = data.mz as number;
      } else if (load.type === 'distributed3d') {
        const d = load.data as DistributedLoad3D;
        if (data.qYI !== undefined) d.qYI = data.qYI as number;
        if (data.qYJ !== undefined) d.qYJ = data.qYJ as number;
        if (data.qZI !== undefined) d.qZI = data.qZI as number;
        if (data.qZJ !== undefined) d.qZJ = data.qZJ as number;
        if (data.a !== undefined) {
          const aVal = Math.max(0, data.a as number);
          d.a = aVal > 0 ? aVal : undefined;
        }
        if (data.b !== undefined) {
          const bVal = data.b as number;
          const L = this.getElementLength(d.elementId);
          d.b = (bVal < L - 1e-10) ? Math.max(d.a ?? 0, bVal) : undefined;
        }
      } else if (load.type === 'pointOnElement3d') {
        const d = load.data as PointLoadOnElement3D;
        if (data.a !== undefined) d.a = data.a as number;
        if (data.py !== undefined) d.py = data.py as number;
        if (data.pz !== undefined) d.pz = data.pz as number;
      }
      // Reassign array to trigger Svelte 5 reactivity after in-place mutation
      model.loads = [...model.loads];
    },

    clear(): void {
      if (!_undoBatching) _pushUndo?.();
      model.name = t('tabBar.newStructure');
      model.nodes = new Map();
      model.elements = new Map();
      model.supports = new Map();
      model.loads = [];
      // Reset materials/sections to defaults
      model.materials = new Map([[1, { ...defaultMaterial }]]);
      model.sections = new Map([[1, { ...defaultSection }]]);
      model.loadCases = [
        { id: 1, type: 'D', name: 'Dead Load' },
        { id: 2, type: 'L', name: 'Live Load' },
        { id: 3, type: 'W', name: 'Wind' },
        { id: 4, type: 'E', name: 'Earthquake' },
      ];
      model.combinations = [
        { id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
        { id: 2, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
        { id: 3, name: '1.2D + L + 1.6W', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }] },
        { id: 4, name: '1.2D + L + E', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 4, factor: 1.0 }] },
      ];
      nextId.node = 1;
      nextId.material = 2;
      nextId.section = 2;
      nextId.element = 1;
      nextId.support = 1;
      nextId.load = 1;
      nextId.loadCase = 5;
      nextId.combination = 5;
      lastKinematicResult = null;
    },

    updateNode(id: number, x: number, y: number, z?: number): void {
      const node = model.nodes.get(id);
      if (node) {
        modelVersion++;
        _onMutation?.();
        model.nodes.set(id, { id: node.id, x, y, z: z !== undefined ? z : node.z });
        model.nodes = new Map(model.nodes);
        // Clamp distributed load a/b when element length changes
        for (const elem of model.elements.values()) {
          if (elem.nodeI === id || elem.nodeJ === id) {
            const ni = model.nodes.get(elem.nodeI);
            const nj = model.nodes.get(elem.nodeJ);
            if (!ni || !nj) continue;
            const dz = (nj.z ?? 0) - (ni.z ?? 0);
            const newL = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2 + dz * dz);
            for (const load of model.loads) {
              if (load.type === 'distributed' && (load.data as DistributedLoad).elementId === elem.id) {
                const d = load.data as DistributedLoad;
                if (d.a !== undefined && d.a > newL) d.a = newL;
                if (d.b !== undefined && d.b > newL) d.b = newL;
                // If a >= b after clamping, load has zero length (won't act)
              }
              if (load.type === 'pointOnElement' && (load.data as PointLoadOnElement).elementId === elem.id) {
                const d = load.data as PointLoadOnElement;
                if (d.a > newL) d.a = newL;
              }
            }
          }
        }
      }
    },

    subdivideElement(elementId: number, n: number): void {
      if (n < 2 || n > 20) return;
      const elem = model.elements.get(elementId);
      if (!elem) return;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) return;

      if (!_undoBatching) _pushUndo?.();
      _undoBatching = true;

      const dx = (nj.x - ni.x) / n;
      const dy = (nj.y - ni.y) / n;
      const dz = ((nj.z ?? 0) - (ni.z ?? 0)) / n;
      const hasZ = ni.z !== undefined || nj.z !== undefined;

      // Create intermediate nodes
      const nodeIds: number[] = [elem.nodeI];
      for (let i = 1; i < n; i++) {
        const id = nextId.node++;
        model.nodes.set(id, {
          id, x: ni.x + dx * i, y: ni.y + dy * i,
          ...(hasZ ? { z: (ni.z ?? 0) + dz * i } : {}),
        });
        nodeIds.push(id);
      }
      nodeIds.push(elem.nodeJ);

      // Collect distributed loads on this element (they get replicated on each sub-element)
      const distLoads = model.loads.filter(
        l => l.type === 'distributed' && (l.data as DistributedLoad).elementId === elementId
      );

      // Remove loads on original element (they will be replicated)
      model.loads = model.loads.filter(l =>
        !((l.type === 'distributed' || l.type === 'pointOnElement') &&
          (l.data as any).elementId === elementId)
      );

      // 3D properties to inherit on new sub-elements
      const inherited3D: Record<string, unknown> = {};
      if (elem.rollAngle != null) inherited3D.rollAngle = elem.rollAngle;
      if ((elem as any).localYx != null) inherited3D.localYx = (elem as any).localYx;
      if ((elem as any).localYy != null) inherited3D.localYy = (elem as any).localYy;
      if ((elem as any).localYz != null) inherited3D.localYz = (elem as any).localYz;

      // Preserve original element as first segment
      const origHingeEnd = elem.hingeEnd ?? false;
      elem.nodeJ = nodeIds[1];
      elem.hingeEnd = false;

      // Build ordered list of all segment element IDs (original first, then new)
      const segmentElemIds: number[] = [elementId];

      // Create new sub-elements for segments 2..n
      for (let i = 1; i < n; i++) {
        const id = nextId.element++;
        model.elements.set(id, {
          id,
          type: elem.type,
          nodeI: nodeIds[i],
          nodeJ: nodeIds[i + 1],
          materialId: elem.materialId,
          sectionId: elem.sectionId,
          hingeStart: false,
          hingeEnd: i === n - 1 ? origHingeEnd : false,
          ...inherited3D,
        });
        segmentElemIds.push(id);
      }

      // Replicate distributed loads on each sub-element (interpolate for trapezoidal)
      const newSubLoads: typeof model.loads = [];
      for (const dl of distLoads) {
        const d = dl.data as DistributedLoad;
        for (let i = 0; i < segmentElemIds.length; i++) {
          const tI = i / n;
          const tJ = (i + 1) / n;
          const subQI = d.qI + (d.qJ - d.qI) * tI;
          const subQJ = d.qI + (d.qJ - d.qI) * tJ;
          const lid = nextId.load++;
          newSubLoads.push({
            type: 'distributed',
            data: { id: lid, elementId: segmentElemIds[i], qI: subQI, qJ: subQJ } as DistributedLoad,
          });
        }
      }
      model.loads = [...model.loads, ...newSubLoads];

      model.nodes = new Map(model.nodes);
      model.elements = new Map(model.elements);
      _undoBatching = false;
    },

    toggleHinge(elementId: number, end: 'start' | 'end'): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elementId);
      if (!elem) return;
      // Build a fully explicit plain object — no proxy spreading, no JSON, no snapshot
      // Read each property individually through the proxy's get trap
      const wasStart = elem.hingeStart === true;
      const wasEnd = elem.hingeEnd === true;
      const plain: Element = {
        id: elem.id,
        type: elem.type,
        nodeI: elem.nodeI,
        nodeJ: elem.nodeJ,
        materialId: elem.materialId,
        sectionId: elem.sectionId,
        hingeStart: end === 'start' ? !wasStart : wasStart,
        hingeEnd: end === 'end' ? !wasEnd : wasEnd,
      };
      model.elements.set(elementId, plain);
      model.elements = new Map(model.elements);
    },

    /** Get all elements connected to a node, annotated with which end touches the node */
    getElementsAtNode(nodeId: number): Array<{ element: Element; end: 'start' | 'end' }> {
      const result: Array<{ element: Element; end: 'start' | 'end' }> = [];
      for (const elem of model.elements.values()) {
        if (elem.nodeI === nodeId) result.push({ element: elem, end: 'start' });
        if (elem.nodeJ === nodeId) result.push({ element: elem, end: 'end' });
      }
      return result;
    },

    /** Get hinge state of all element-ends connected to a node */
    getHingesAtNode(nodeId: number): Array<{ elementId: number; end: 'start' | 'end'; hasHinge: boolean }> {
      const result: Array<{ elementId: number; end: 'start' | 'end'; hasHinge: boolean }> = [];
      for (const elem of model.elements.values()) {
        if (elem.nodeI === nodeId) result.push({ elementId: elem.id, end: 'start', hasHinge: elem.hingeStart === true });
        if (elem.nodeJ === nodeId) result.push({ elementId: elem.id, end: 'end', hasHinge: elem.hingeEnd === true });
      }
      return result;
    },

    /** Split an element at parametric position t ∈ (0,1), creating a new node and two sub-elements.
     *  Redistributes loads (distributed, point, thermal) to the sub-elements.
     *  Preserves hingeStart on elemA and hingeEnd on elemB from the original element. */
    splitElementAtPoint(elementId: number, t: number): { nodeId: number; elemA: number; elemB: number } | null {
      if (t <= 0.01 || t >= 0.99) return null;
      const elem = model.elements.get(elementId);
      if (!elem) return null;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) return null;

      if (!_undoBatching) _pushUndo?.();
      _undoBatching = true;

      // Compute new node position
      const px = ni.x + t * (nj.x - ni.x);
      const py = ni.y + t * (nj.y - ni.y);

      // Check if a node already exists at this position (within tolerance)
      let newNodeId: number | null = null;
      for (const node of model.nodes.values()) {
        if (Math.abs(node.x - px) < 0.01 && Math.abs(node.y - py) < 0.01) {
          newNodeId = node.id;
          break;
        }
      }
      if (newNodeId === null) {
        newNodeId = nextId.node++;
        model.nodes.set(newNodeId, { id: newNodeId, x: px, y: py });
      }

      // Compute element length for load redistribution
      const L = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2);
      const LA = L * t;

      // Collect loads on this element
      const distLoads = model.loads.filter(
        l => l.type === 'distributed' && (l.data as DistributedLoad).elementId === elementId
      );
      const pointLoads = model.loads.filter(
        l => l.type === 'pointOnElement' && (l.data as PointLoadOnElement).elementId === elementId
      );
      const thermalLoads = model.loads.filter(
        l => l.type === 'thermal' && (l.data as ThermalLoad).elementId === elementId
      );

      // Read original hinge state explicitly
      const origHingeStart = elem.hingeStart === true;
      const origHingeEnd = elem.hingeEnd === true;
      const origType = elem.type;
      const origMatId = elem.materialId;
      const origSecId = elem.sectionId;

      // Remove original element and its loads
      model.elements.delete(elementId);
      model.loads = model.loads.filter(l => {
        if (l.type === 'distributed' || l.type === 'pointOnElement' || l.type === 'thermal') {
          return (l.data as any).elementId !== elementId;
        }
        return true;
      });

      // Create two new sub-elements
      const elemAId = nextId.element++;
      model.elements.set(elemAId, {
        id: elemAId,
        type: origType,
        nodeI: elem.nodeI,
        nodeJ: newNodeId,
        materialId: origMatId,
        sectionId: origSecId,
        hingeStart: origHingeStart,
        hingeEnd: false,
      });

      const elemBId = nextId.element++;
      model.elements.set(elemBId, {
        id: elemBId,
        type: origType,
        nodeI: newNodeId,
        nodeJ: elem.nodeJ,
        materialId: origMatId,
        sectionId: origSecId,
        hingeStart: false,
        hingeEnd: origHingeEnd,
      });

      // Redistribute distributed loads (interpolate for trapezoidal, handle partial a/b)
      for (const dl of distLoads) {
        const d = dl.data as DistributedLoad;
        const loadA = d.a ?? 0;
        const loadB = d.b ?? L;
        const loadSpan = loadB - loadA;
        const copyMeta = (target: DistributedLoad) => {
          if (d.angle !== undefined) target.angle = d.angle;
          if (d.isGlobal !== undefined) target.isGlobal = d.isGlobal;
          if (d.caseId !== undefined) target.caseId = d.caseId;
        };

        if (loadB <= LA + 1e-10) {
          // Entire load falls on elemA
          const lidA = nextId.load++;
          const dataA: DistributedLoad = { id: lidA, elementId: elemAId, qI: d.qI, qJ: d.qJ };
          if (loadA > 1e-10) dataA.a = loadA;
          if (loadB < LA - 1e-10) dataA.b = loadB;
          copyMeta(dataA);
          model.loads = [...model.loads, { type: 'distributed', data: dataA }];
        } else if (loadA >= LA - 1e-10) {
          // Entire load falls on elemB
          const lidB = nextId.load++;
          const newA = loadA - LA;
          const newB = loadB - LA;
          const LB = L - LA;
          const dataB: DistributedLoad = { id: lidB, elementId: elemBId, qI: d.qI, qJ: d.qJ };
          if (newA > 1e-10) dataB.a = newA;
          if (newB < LB - 1e-10) dataB.b = newB;
          copyMeta(dataB);
          model.loads = [...model.loads, { type: 'distributed', data: dataB }];
        } else {
          // Load crosses the split point — split into two loads
          const tSplit = (LA - loadA) / loadSpan; // normalized position within load span
          const qMid = d.qI + (d.qJ - d.qI) * tSplit;
          // Load on elemA: from loadA to LA
          const lidA = nextId.load++;
          const dataA: DistributedLoad = { id: lidA, elementId: elemAId, qI: d.qI, qJ: qMid };
          if (loadA > 1e-10) dataA.a = loadA;
          // b = LA which is the full length of elemA, so no need to set b
          copyMeta(dataA);
          // Load on elemB: from 0 to (loadB - LA)
          const lidB = nextId.load++;
          const newB = loadB - LA;
          const LB = L - LA;
          const dataB: DistributedLoad = { id: lidB, elementId: elemBId, qI: qMid, qJ: d.qJ };
          if (newB < LB - 1e-10) dataB.b = newB;
          copyMeta(dataB);
          model.loads = [...model.loads, { type: 'distributed', data: dataA }, { type: 'distributed', data: dataB }];
        }
      }

      // Redistribute point loads on element
      for (const pl of pointLoads) {
        const d = pl.data as PointLoadOnElement;
        const lid = nextId.load++;
        if (d.a < LA - 1e-6) {
          // Point load is on elemA (distance from nodeI unchanged)
          const data: PointLoadOnElement = { id: lid, elementId: elemAId, a: d.a, p: d.p };
          if (d.angle !== undefined) data.angle = d.angle;
          if (d.isGlobal !== undefined) data.isGlobal = d.isGlobal;
          if (d.caseId !== undefined) data.caseId = d.caseId;
          if (d.px !== undefined) data.px = d.px;
          if (d.mz !== undefined) data.mz = d.mz;
          model.loads = [...model.loads, { type: 'pointOnElement', data }];
        } else {
          // Point load is on elemB (adjust distance: a' = a - LA)
          const data: PointLoadOnElement = { id: lid, elementId: elemBId, a: d.a - LA, p: d.p };
          if (d.angle !== undefined) data.angle = d.angle;
          if (d.isGlobal !== undefined) data.isGlobal = d.isGlobal;
          if (d.caseId !== undefined) data.caseId = d.caseId;
          if (d.px !== undefined) data.px = d.px;
          if (d.mz !== undefined) data.mz = d.mz;
          model.loads = [...model.loads, { type: 'pointOnElement', data }];
        }
      }

      // Replicate thermal loads on both sub-elements
      for (const tl of thermalLoads) {
        const d = tl.data as ThermalLoad;
        const lidA = nextId.load++;
        const dataA: ThermalLoad = { id: lidA, elementId: elemAId, dtUniform: d.dtUniform, dtGradient: d.dtGradient };
        if (d.caseId !== undefined) dataA.caseId = d.caseId;
        const lidB = nextId.load++;
        const dataB: ThermalLoad = { id: lidB, elementId: elemBId, dtUniform: d.dtUniform, dtGradient: d.dtGradient };
        if (d.caseId !== undefined) dataB.caseId = d.caseId;
        model.loads = [...model.loads, { type: 'thermal', data: dataA }, { type: 'thermal', data: dataB }];
      }

      model.nodes = new Map(model.nodes);
      model.elements = new Map(model.elements);
      _undoBatching = false;

      return { nodeId: newNodeId, elemA: elemAId, elemB: elemBId };
    },

    /** Mirror selected nodes about an axis through their centroid */
    mirrorNodes(nodeIds: Set<number>, axis: 'x' | 'y'): void {
      if (nodeIds.size === 0) return;
      _pushUndo?.();
      // Compute centroid
      let cx = 0, cy = 0;
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (n) { cx += n.x; cy += n.y; }
      }
      cx /= nodeIds.size;
      cy /= nodeIds.size;
      // Mirror
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (!n) continue;
        if (axis === 'x') {
          model.nodes.set(id, { id: n.id, x: 2 * cx - n.x, y: n.y });
        } else {
          model.nodes.set(id, { id: n.id, x: n.x, y: 2 * cy - n.y });
        }
      }
      model.nodes = new Map(model.nodes);
    },

    /** Rotate selected nodes by angle (degrees) around their centroid */
    rotateNodes(nodeIds: Set<number>, angleDeg: number): void {
      if (nodeIds.size === 0) return;
      _pushUndo?.();
      let cx = 0, cy = 0;
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (n) { cx += n.x; cy += n.y; }
      }
      cx /= nodeIds.size;
      cy /= nodeIds.size;
      const rad = angleDeg * Math.PI / 180;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);
      for (const id of nodeIds) {
        const n = model.nodes.get(id);
        if (!n) continue;
        const dx = n.x - cx;
        const dy = n.y - cy;
        model.nodes.set(id, { id: n.id, x: cx + dx * cosA - dy * sinA, y: cy + dx * sinA + dy * cosA });
      }
      model.nodes = new Map(model.nodes);
    },

    solve(includeSelfWeight = false): AnalysisResults | string | null {
      return validateAndSolve2D(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        includeSelfWeight,
        (k) => { lastKinematicResult = k; },
      );
    },

    /** Build a SolverInput from the current model state (no validation). Returns null if model is empty. */
    buildSolverInput(includeSelfWeight = false): SolverInput | null {
      return buildSolverInput2D(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        includeSelfWeight,
      );
    },

    // ─── Load Case Colors ───
    getLoadCaseColor(caseId: number): string {
      const TYPE_COLORS: Record<string, string> = {
        'D': '#ff4444', 'L': '#4ea8de', 'W': '#4ecdc4', 'E': '#e9c46a',
        'S': '#b0bec5', 'T': '#ff8a65', 'Lr': '#7986cb', 'R': '#4db6ac', 'H': '#9575cd',
      };
      const ROTATING_COLORS = ['#a855f7', '#f97316', '#22d3ee', '#84cc16', '#f43f5e'];
      const lc = model.loadCases.find(c => c.id === caseId);
      if (!lc) return '#ff4444';
      if (lc.type && TYPE_COLORS[lc.type]) return TYPE_COLORS[lc.type];
      // Fallback: check name for backward compat with old models
      if (TYPE_COLORS[lc.name]) return TYPE_COLORS[lc.name];
      // For custom cases, assign rotating colors based on position
      const idx = model.loadCases.filter(c => !(c.type && TYPE_COLORS[c.type]) && !TYPE_COLORS[c.name]).indexOf(lc);
      return ROTATING_COLORS[idx % ROTATING_COLORS.length];
    },

    getLoadCaseName(caseId: number): string {
      const lc = model.loadCases.find(c => c.id === caseId);
      if (!lc) return '?';
      return lc.type || lc.name || '?';
    },

    // ─── Load Case / Combination CRUD ───
    addLoadCase(name: string, type: LoadCaseType = ''): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.loadCase++;
      model.loadCases.push({ id, type, name });
      return id;
    },

    removeLoadCase(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.loadCases = model.loadCases.filter(c => c.id !== id);
      // Remove loads that belong to this case
      model.loads = model.loads.filter(l => (l.data.caseId ?? 1) !== id);
      // Remove from combinations
      for (const combo of model.combinations) {
        combo.factors = combo.factors.filter(f => f.caseId !== id);
      }
    },

    updateLoadCase(id: number, name: string): void {
      if (!_undoBatching) _pushUndo?.();
      const lc = model.loadCases.find(c => c.id === id);
      if (lc) lc.name = name;
    },

    updateLoadCaseType(id: number, type: LoadCaseType): void {
      if (!_undoBatching) _pushUndo?.();
      const lc = model.loadCases.find(c => c.id === id);
      if (lc) lc.type = type;
    },

    addCombination(name: string, factors: Array<{ caseId: number; factor: number }>): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.combination++;
      model.combinations.push({ id, name, factors: [...factors] });
      return id;
    },

    removeCombination(id: number): void {
      if (!_undoBatching) _pushUndo?.();
      model.combinations = model.combinations.filter(c => c.id !== id);
    },

    updateCombination(id: number, data: Partial<{ name: string; factors: Array<{ caseId: number; factor: number }> }>): void {
      if (!_undoBatching) _pushUndo?.();
      const combo = model.combinations.find(c => c.id === id);
      if (!combo) return;
      if (data.name !== undefined) combo.name = data.name;
      if (data.factors !== undefined) combo.factors = [...data.factors];
    },

    updateLoadCaseId(loadId: number, caseId: number): void {
      if (!_undoBatching) _pushUndo?.();
      const load = model.loads.find(l => l.data.id === loadId);
      if (load) (load.data as any).caseId = caseId;
    },

    /** Solve all load cases and combine. Returns per-case + per-combo + envelope results. */
    solveCombinations(includeSelfWeight = false): { perCase: Map<number, AnalysisResults>; perCombo: Map<number, AnalysisResults>; envelope: FullEnvelope } | string | null {
      return solveCombinations2D(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        model.loadCases, model.combinations, includeSelfWeight,
      );
    },

    // ─── 3D Analysis ──────────────────────────────────────────────

    /** Build a SolverInput3D from the current model state. Returns null if model is empty. */
    buildSolverInput3D(includeSelfWeight = false, leftHand = false): SolverInput3D | null {
      return buildSolverInput3DFn(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        includeSelfWeight, leftHand,
      );
    },

    /** Solve the current model using the 3D solver. Returns results or error string. */
    solve3D(includeSelfWeight = false, leftHand = false): AnalysisResults3D | string | null {
      return validateAndSolve3D(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        includeSelfWeight, leftHand,
      );
    },

    /** Solve load combinations for 3D analysis (mirrors 2D solveCombinations) */
    solveCombinations3D(includeSelfWeight = false, leftHand = false): { perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D } | string | null {
      return solveCombinations3DFn(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        model.loadCases, model.combinations, includeSelfWeight, leftHand,
      );
    },

    /** Compute influence line: move unit load P=1 (downward) across elements */
    computeInfluenceLine(
      quantity: InfluenceQuantity,
      targetNodeId?: number,
      targetElementId?: number,
      targetPosition: number = 0.5,
      nPointsPerElement: number = 20,
    ): InfluenceLineResult | string {
      return computeInfluenceLineFn(
        { nodes: model.nodes, elements: model.elements, supports: model.supports,
          loads: model.loads, materials: model.materials, sections: model.sections },
        quantity, targetNodeId, targetElementId, targetPosition, nPointsPerElement,
      );
    },

    // ─── Example Structures ───

    loadExample(name: string): void {
      if (!_undoBatching) _pushUndo?.();
      _undoBatching = true;
      this.clear();

      // Delegate to extracted example modules
      const api: ExampleAPI3D = {
        addNode: this.addNode.bind(this),
        addElement: this.addElement.bind(this),
        addSupport: this.addSupport.bind(this),
        updateSupport: this.updateSupport.bind(this),
        addMaterial: this.addMaterial.bind(this),
        addSection: this.addSection.bind(this),
        updateElementMaterial: this.updateElementMaterial.bind(this),
        updateElementSection: this.updateElementSection.bind(this),
        addDistributedLoad: this.addDistributedLoad.bind(this),
        addNodalLoad: this.addNodalLoad.bind(this),
        addPointLoadOnElement: this.addPointLoadOnElement.bind(this),
        addThermalLoad: this.addThermalLoad.bind(this),
        toggleHinge: this.toggleHinge.bind(this),
        addDistributedLoad3D: this.addDistributedLoad3D.bind(this),
        addNodalLoad3D: this.addNodalLoad3D.bind(this),
        model,
        nextId,
      };

      load2DExample(name, api) || load3DExample(name, api);

      _undoBatching = false;
    },

    // ─── REPLACED: ~1050 lines of example code extracted to ───
    // model-examples-2d.ts (22 2D examples)
    // model-examples-3d.ts (7 3D examples)
    // ─────────────────────────────────────────────────────────

    // ─── Material CRUD ───
    // NOTE: All material/section methods reassign the entire Map to guarantee
    // Svelte 5 reactivity. SvelteMap proxy .set()/.delete() don't reliably
    // trigger template re-renders; property assignment on $state always does.
    addMaterial(data: Omit<Material, 'id'>): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.material++;
      const m = new Map(model.materials);
      m.set(id, { id, ...data });
      model.materials = m;
      return id;
    },

    updateMaterial(id: number, data: Partial<Omit<Material, 'id'>>): void {
      if (!_undoBatching) _pushUndo?.();
      const mat = model.materials.get(id);
      if (!mat) return;
      const m = new Map(model.materials);
      m.set(id, { ...mat, ...data, id });
      model.materials = m;
      this.bumpModelVersion();
    },

    removeMaterial(id: number): boolean {
      for (const elem of model.elements.values()) {
        if (elem.materialId === id) return false;
      }
      if (!_undoBatching) _pushUndo?.();
      const m = new Map(model.materials);
      m.delete(id);
      model.materials = m;
      return true;
    },

    // ─── Section CRUD ───
    addSection(data: Omit<Section, 'id'>): number {
      if (!_undoBatching) _pushUndo?.();
      const id = nextId.section++;
      const m = new Map(model.sections);
      m.set(id, { id, ...data });
      model.sections = m;
      return id;
    },

    updateSection(id: number, data: Partial<Omit<Section, 'id'>>): void {
      if (!_undoBatching) _pushUndo?.();
      const sec = model.sections.get(id);
      if (!sec) return;
      const updated: Section = { ...sec, ...data, id };
      // Auto-calculate A, Iy, Iz, J from b×h ONLY for manual edits (no shape specified)
      if (data.shape === undefined) {
        const b = data.b ?? sec.b;
        const h = data.h ?? sec.h;
        if (b !== undefined && h !== undefined && b > 0 && h > 0 && (data.b !== undefined || data.h !== undefined)) {
          updated.a = b * h;
          updated.iy = (b * h * h * h) / 12;  // about Y-axis (horizontal) — h³ term
          // Also update iz and j for rectangular sections
          const shape = updated.shape ?? 'rect';
          if (shape === 'rect' || shape === 'generic' || !shape) {
            updated.iz = (h * b * b * b) / 12;  // about Z-axis (vertical) — b³ term
            const long = Math.max(b, h), short = Math.min(b, h);
            const r = short / long;
            updated.j = (1 / 3) * long * short ** 3 * (1 - 0.63 * r + 0.052 * r ** 5);
          }
        }
      }
      const m = new Map(model.sections);
      m.set(id, updated);
      model.sections = m;
      this.bumpModelVersion();
    },

    removeSection(id: number): boolean {
      for (const elem of model.elements.values()) {
        if (elem.sectionId === id) return false;
      }
      if (!_undoBatching) _pushUndo?.();
      const m = new Map(model.sections);
      m.delete(id);
      model.sections = m;
      return true;
    },

    // ─── Element property updates ───
    updateElementMaterial(elemId: number, materialId: number): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.materialId = materialId;
      model.elements.set(elemId, plain);
      model.elements = new Map(model.elements);
      this.bumpModelVersion();
    },

    updateElementSection(elemId: number, sectionId: number): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.sectionId = sectionId;
      model.elements.set(elemId, plain);
      model.elements = new Map(model.elements);
      this.bumpModelVersion();
    },

    updateElementLocalY(elemId: number, lx: number | undefined, ly: number | undefined, lz: number | undefined): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.localYx = lx;
      plain.localYy = ly;
      plain.localYz = lz;
      model.elements.set(elemId, plain);
      model.elements = new Map(model.elements);
    },

    rotateElementLocalAxes(elemId: number, angleDelta: number): void {
      if (!_undoBatching) _pushUndo?.();
      const elem = model.elements.get(elemId);
      if (!elem) return;
      const plain = $state.snapshot(elem) as Element;
      plain.rollAngle = ((plain.rollAngle ?? 0) + angleDelta) % 360;
      model.elements.set(elemId, plain);
      model.elements = new Map(model.elements);
    },

    // Get node by ID
    getNode(id: number): Node | undefined {
      return model.nodes.get(id);
    },

    // Get element length
    getElementLength(elemId: number): number {
      const elem = model.elements.get(elemId);
      if (!elem) return 0;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) return 0;
      return Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2);
    },

    /** Get angle (radians) of element connected to node. If multiple, returns average.
     *  Angle is measured from positive X axis. 0 = horizontal right, PI/2 = up. */
    getElementAngleAtNode(nodeId: number): number {
      let sumAngle = 0;
      let count = 0;
      for (const elem of model.elements.values()) {
        if (elem.nodeI === nodeId || elem.nodeJ === nodeId) {
          const ni = model.nodes.get(elem.nodeI);
          const nj = model.nodes.get(elem.nodeJ);
          if (!ni || !nj) continue;
          // Angle from the node's perspective (pointing away from the node)
          let angle: number;
          if (elem.nodeI === nodeId) {
            angle = Math.atan2(nj.y - ni.y, nj.x - ni.x);
          } else {
            angle = Math.atan2(ni.y - nj.y, ni.x - nj.x);
          }
          sumAngle += angle;
          count++;
        }
      }
      return count > 0 ? sumAngle / count : 0;
    },
  };
}

export const modelStore = createModelStore();
