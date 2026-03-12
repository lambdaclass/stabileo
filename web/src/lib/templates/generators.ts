// Parametric structural template generators
// Each generator returns a complete ModelSnapshot ready to restore

import type { ModelSnapshot } from '../store/history.svelte';
import { computeLocalAxes3D } from '../engine/solver-3d';
import { t } from '../i18n';

// Default material and section
const DEFAULT_MATERIAL = { id: 1, name: 'Acero S235', e: 210000000, nu: 0.3, rho: 78.5 }; // kN/m² for E
const DEFAULT_SECTION = { id: 1, name: 'IPN 300', a: 0.00690, iy: 0.00009800, iz: 0.00000451, b: 0.125, h: 0.300, shape: 'I' as const, tw: 0.0108, tf: 0.0162 };
const TRUSS_SECTION = { id: 2, name: 'L 80x80x8', a: 0.00123, iz: 0.0000008, iy: 0.0000008 };

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

interface BuilderState {
  nodeId: number;
  elemId: number;
  supportId: number;
  loadId: number;
  nodes: ModelSnapshot['nodes'];
  elements: ModelSnapshot['elements'];
  supports: ModelSnapshot['supports'];
  loads: ModelSnapshot['loads'];
  materials: ModelSnapshot['materials'];
  sections: ModelSnapshot['sections'];
}

function newBuilder(): BuilderState {
  return {
    nodeId: 1, elemId: 1, supportId: 1, loadId: 1,
    nodes: [], elements: [], supports: [], loads: [],
    materials: [[1, { ...DEFAULT_MATERIAL }]],
    sections: [[1, { ...DEFAULT_SECTION }]],
  };
}

function addNode(b: BuilderState, x: number, y: number): number {
  const id = b.nodeId++;
  b.nodes.push([id, { id, x, y }]);
  return id;
}

function addElement(b: BuilderState, nodeI: number, nodeJ: number, type: 'frame' | 'truss' = 'frame', sectionId = 1): number {
  const id = b.elemId++;
  b.elements.push([id, { id, type, nodeI, nodeJ, materialId: 1, sectionId }]);
  return id;
}

function addSupport(b: BuilderState, nodeId: number, type: string): void {
  const id = b.supportId++;
  b.supports.push([id, { id, nodeId, type }]);
}

function addDistributedLoad(b: BuilderState, elementId: number, qy: number, qyJ?: number): void {
  const id = b.loadId++;
  b.loads.push({
    type: 'distributed',
    data: { id, elementId, qx: 0, qy, qyJ: qyJ ?? qy, isGlobal: true, loadCaseId: 0 },
  });
}

function addNodalLoad(b: BuilderState, nodeId: number, fx: number, fy: number, mz: number = 0): void {
  const id = b.loadId++;
  b.loads.push({
    type: 'nodal',
    data: { id, nodeId, fx, fy, mz, loadCaseId: 0 },
  });
}

function toSnapshot(b: BuilderState): ModelSnapshot {
  return {
    nodes: b.nodes,
    materials: b.materials,
    sections: b.sections,
    elements: b.elements,
    supports: b.supports,
    loads: b.loads,
    nextId: {
      node: b.nodeId,
      material: 2 + (b.sections.length > 1 ? 1 : 0),
      section: b.sections.length + 1,
      element: b.elemId,
      support: b.supportId,
      load: b.loadId,
    },
  };
}

// -------------------------------------------------------------------
// 1. Simply-supported beam
// -------------------------------------------------------------------

export interface SimpleBeamParams {
  L: number;      // Span (m)
  q: number;      // Uniform load (kN/m, negative = downward)
  nDiv: number;   // Number of element divisions
}

export function generateSimpleBeam(p: SimpleBeamParams): ModelSnapshot {
  const b = newBuilder();
  const nNodes = p.nDiv + 1;
  const dx = p.L / p.nDiv;

  const nodeIds: number[] = [];
  for (let i = 0; i < nNodes; i++) {
    nodeIds.push(addNode(b, i * dx, 0));
  }

  for (let i = 0; i < p.nDiv; i++) {
    const eid = addElement(b, nodeIds[i], nodeIds[i + 1]);
    if (p.q !== 0) addDistributedLoad(b, eid, p.q);
  }

  addSupport(b, nodeIds[0], 'pinned');
  addSupport(b, nodeIds[nNodes - 1], 'rollerX');

  return toSnapshot(b);
}

// -------------------------------------------------------------------
// 2. Cantilever
// -------------------------------------------------------------------

export interface CantileverParams {
  L: number;      // Length (m)
  P: number;      // Point load at tip (kN, negative = downward)
  nDiv: number;
}

export function generateCantilever(p: CantileverParams): ModelSnapshot {
  const b = newBuilder();
  const nNodes = p.nDiv + 1;
  const dx = p.L / p.nDiv;

  const nodeIds: number[] = [];
  for (let i = 0; i < nNodes; i++) {
    nodeIds.push(addNode(b, i * dx, 0));
  }

  for (let i = 0; i < p.nDiv; i++) {
    addElement(b, nodeIds[i], nodeIds[i + 1]);
  }

  addSupport(b, nodeIds[0], 'fixed');
  if (p.P !== 0) addNodalLoad(b, nodeIds[nNodes - 1], 0, p.P);

  return toSnapshot(b);
}

// -------------------------------------------------------------------
// 3. Continuous beam
// -------------------------------------------------------------------

export interface ContinuousBeamParams {
  nSpans: number;     // Number of spans
  spanLength: number; // Length of each span (m)
  q: number;          // Load (kN/m)
  nDivPerSpan: number;
}

export function generateContinuousBeam(p: ContinuousBeamParams): ModelSnapshot {
  const b = newBuilder();
  const totalDiv = p.nSpans * p.nDivPerSpan;
  const dx = p.spanLength / p.nDivPerSpan;

  const nodeIds: number[] = [];
  for (let i = 0; i <= totalDiv; i++) {
    nodeIds.push(addNode(b, i * dx, 0));
  }

  for (let i = 0; i < totalDiv; i++) {
    const eid = addElement(b, nodeIds[i], nodeIds[i + 1]);
    if (p.q !== 0) addDistributedLoad(b, eid, p.q);
  }

  // Supports at each span boundary
  addSupport(b, nodeIds[0], 'pinned');
  for (let s = 1; s < p.nSpans; s++) {
    addSupport(b, nodeIds[s * p.nDivPerSpan], 'rollerX');
  }
  addSupport(b, nodeIds[totalDiv], 'rollerX');

  return toSnapshot(b);
}

// -------------------------------------------------------------------
// 4. Simple portal frame
// -------------------------------------------------------------------

export interface PortalFrameParams {
  width: number;      // Beam span (m)
  height: number;     // Column height (m)
  qBeam: number;      // Beam load (kN/m)
  Hlateral: number;   // Horizontal load at top-left (kN)
}

export function generatePortalFrame(p: PortalFrameParams): ModelSnapshot {
  const b = newBuilder();

  const n1 = addNode(b, 0, 0);          // base left
  const n2 = addNode(b, 0, p.height);   // top left
  const n3 = addNode(b, p.width, p.height); // top right
  const n4 = addNode(b, p.width, 0);    // base right

  addElement(b, n1, n2); // left column
  const beamElem = addElement(b, n2, n3); // beam
  addElement(b, n4, n3); // right column

  addSupport(b, n1, 'fixed');
  addSupport(b, n4, 'fixed');

  if (p.qBeam !== 0) addDistributedLoad(b, beamElem, p.qBeam);
  if (p.Hlateral !== 0) addNodalLoad(b, n2, p.Hlateral, 0);

  return toSnapshot(b);
}

// -------------------------------------------------------------------
// 5. Multi-story portal frame
// -------------------------------------------------------------------

export interface MultiStoryParams {
  nBays: number;        // Number of bays (horizontal)
  nFloors: number;      // Number of floors (vertical)
  bayWidth: number;     // Width of each bay (m)
  floorHeight: number;  // Height of each floor (m)
  qBeam: number;        // Load on beams (kN/m)
  Hlateral: number;     // Lateral load per floor (kN)
}

export function generateMultiStory(p: MultiStoryParams): ModelSnapshot {
  const b = newBuilder();

  // Node grid: nodeGrid[floor][column]
  // floor 0 = base, floor nFloors = top
  const nodeGrid: number[][] = [];

  for (let f = 0; f <= p.nFloors; f++) {
    const row: number[] = [];
    for (let c = 0; c <= p.nBays; c++) {
      row.push(addNode(b, c * p.bayWidth, f * p.floorHeight));
    }
    nodeGrid.push(row);
  }

  // Columns: vertical elements
  for (let f = 0; f < p.nFloors; f++) {
    for (let c = 0; c <= p.nBays; c++) {
      addElement(b, nodeGrid[f][c], nodeGrid[f + 1][c]);
    }
  }

  // Beams: horizontal elements per floor (above base)
  for (let f = 1; f <= p.nFloors; f++) {
    for (let c = 0; c < p.nBays; c++) {
      const eid = addElement(b, nodeGrid[f][c], nodeGrid[f][c + 1]);
      if (p.qBeam !== 0) addDistributedLoad(b, eid, p.qBeam);
    }
  }

  // Fixed supports at base
  for (let c = 0; c <= p.nBays; c++) {
    addSupport(b, nodeGrid[0][c], 'fixed');
  }

  // Lateral loads at each floor (leftmost node)
  if (p.Hlateral !== 0) {
    for (let f = 1; f <= p.nFloors; f++) {
      addNodalLoad(b, nodeGrid[f][0], p.Hlateral, 0);
    }
  }

  return toSnapshot(b);
}

// -------------------------------------------------------------------
// 6. Pratt truss
// -------------------------------------------------------------------

export interface TrussParams {
  span: number;       // Total span (m)
  height: number;     // Truss height (m)
  nPanels: number;    // Number of panels
}

export function generatePrattTruss(p: TrussParams): ModelSnapshot {
  const b = newBuilder();

  // Add truss section
  b.sections.push([2, { ...TRUSS_SECTION }]);

  const dx = p.span / p.nPanels;

  // Bottom chord nodes
  const bottom: number[] = [];
  for (let i = 0; i <= p.nPanels; i++) {
    bottom.push(addNode(b, i * dx, 0));
  }

  // Top chord nodes
  const top: number[] = [];
  for (let i = 0; i <= p.nPanels; i++) {
    top.push(addNode(b, i * dx, p.height));
  }

  // Bottom chord elements
  for (let i = 0; i < p.nPanels; i++) {
    addElement(b, bottom[i], bottom[i + 1], 'truss', 2);
  }

  // Top chord elements
  for (let i = 0; i < p.nPanels; i++) {
    addElement(b, top[i], top[i + 1], 'truss', 2);
  }

  // Verticals
  for (let i = 0; i <= p.nPanels; i++) {
    addElement(b, bottom[i], top[i], 'truss', 2);
  }

  // Diagonals (Pratt pattern: \ on left half, / on right half)
  const mid = Math.floor(p.nPanels / 2);
  for (let i = 0; i < p.nPanels; i++) {
    if (i < mid) {
      // Left half: diagonal from top[i] to bottom[i+1]
      addElement(b, top[i], bottom[i + 1], 'truss', 2);
    } else {
      // Right half: diagonal from bottom[i] to top[i+1]
      addElement(b, bottom[i], top[i + 1], 'truss', 2);
    }
  }

  // Supports
  addSupport(b, bottom[0], 'pinned');
  addSupport(b, bottom[p.nPanels], 'rollerX');

  // Downward load at each top node (except supports)
  for (let i = 0; i <= p.nPanels; i++) {
    addNodalLoad(b, top[i], 0, -10);
  }

  return toSnapshot(b);
}

// -------------------------------------------------------------------
// 7. Warren truss
// -------------------------------------------------------------------

export function generateWarrenTruss(p: TrussParams): ModelSnapshot {
  const b = newBuilder();

  // Add truss section
  b.sections.push([2, { ...TRUSS_SECTION }]);

  const dx = p.span / p.nPanels;

  // Bottom chord nodes
  const bottom: number[] = [];
  for (let i = 0; i <= p.nPanels; i++) {
    bottom.push(addNode(b, i * dx, 0));
  }

  // Top chord nodes (between bottom nodes)
  const top: number[] = [];
  for (let i = 0; i < p.nPanels; i++) {
    top.push(addNode(b, (i + 0.5) * dx, p.height));
  }

  // Bottom chord
  for (let i = 0; i < p.nPanels; i++) {
    addElement(b, bottom[i], bottom[i + 1], 'truss', 2);
  }

  // Top chord
  for (let i = 0; i < p.nPanels - 1; i++) {
    addElement(b, top[i], top[i + 1], 'truss', 2);
  }

  // Diagonals (Warren: alternating V pattern)
  for (let i = 0; i < p.nPanels; i++) {
    addElement(b, bottom[i], top[i], 'truss', 2);       // /
    addElement(b, top[i], bottom[i + 1], 'truss', 2);   // \
  }

  // Supports
  addSupport(b, bottom[0], 'pinned');
  addSupport(b, bottom[p.nPanels], 'rollerX');

  // Load at top nodes
  for (let i = 0; i < p.nPanels; i++) {
    addNodalLoad(b, top[i], 0, -10);
  }

  return toSnapshot(b);
}

// -------------------------------------------------------------------
// Template catalog
// -------------------------------------------------------------------

export type TemplateName =
  | 'simpleBeam'
  | 'cantilever'
  | 'continuousBeam'
  | 'portalFrame'
  | 'multiStory'
  | 'prattTruss'
  | 'warrenTruss';

export interface TemplateInfo {
  id: TemplateName;
  name: string;
  category: string;
  params: TemplateParam[];
}

export interface TemplateParam {
  key: string;
  label: string;
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
}

export function getTemplateCatalog(): TemplateInfo[] {
  return [
    {
      id: 'simpleBeam', name: t('tmpl.simpleBeam'), category: t('tmpl.catBeams'),
      params: [
        { key: 'L', label: t('tmpl.span'), unit: 'm', default: 6, min: 1, max: 50, step: 0.5 },
        { key: 'q', label: t('tmpl.load'), unit: 'kN/m', default: -10, min: -100, max: 100, step: 1 },
        { key: 'nDiv', label: t('tmpl.divisions'), unit: '', default: 4, min: 1, max: 20, step: 1, integer: true },
      ],
    },
    {
      id: 'cantilever', name: t('tmpl.cantilever'), category: t('tmpl.catBeams'),
      params: [
        { key: 'L', label: t('tmpl.length'), unit: 'm', default: 3, min: 1, max: 30, step: 0.5 },
        { key: 'P', label: t('tmpl.pointLoad'), unit: 'kN', default: -15, min: -200, max: 200, step: 1 },
        { key: 'nDiv', label: t('tmpl.divisions'), unit: '', default: 3, min: 1, max: 20, step: 1, integer: true },
      ],
    },
    {
      id: 'continuousBeam', name: t('tmpl.continuousBeam'), category: t('tmpl.catBeams'),
      params: [
        { key: 'nSpans', label: t('tmpl.spans'), unit: '', default: 3, min: 2, max: 10, step: 1, integer: true },
        { key: 'spanLength', label: t('tmpl.spanLength'), unit: 'm', default: 5, min: 1, max: 30, step: 0.5 },
        { key: 'q', label: t('tmpl.load'), unit: 'kN/m', default: -10, min: -100, max: 100, step: 1 },
        { key: 'nDivPerSpan', label: t('tmpl.divPerSpan'), unit: '', default: 4, min: 1, max: 10, step: 1, integer: true },
      ],
    },
    {
      id: 'portalFrame', name: t('tmpl.portalFrame'), category: t('tmpl.catFrames'),
      params: [
        { key: 'width', label: t('tmpl.width'), unit: 'm', default: 6, min: 2, max: 30, step: 0.5 },
        { key: 'height', label: t('tmpl.height'), unit: 'm', default: 4, min: 2, max: 20, step: 0.5 },
        { key: 'qBeam', label: t('tmpl.beamLoad'), unit: 'kN/m', default: -15, min: -100, max: 100, step: 1 },
        { key: 'Hlateral', label: t('tmpl.lateralLoad'), unit: 'kN', default: 10, min: -100, max: 100, step: 1 },
      ],
    },
    {
      id: 'multiStory', name: t('tmpl.multiStory'), category: t('tmpl.catFrames'),
      params: [
        { key: 'nBays', label: t('tmpl.bays'), unit: '', default: 2, min: 1, max: 6, step: 1, integer: true },
        { key: 'nFloors', label: t('tmpl.floors'), unit: '', default: 3, min: 1, max: 10, step: 1, integer: true },
        { key: 'bayWidth', label: t('tmpl.bayWidth'), unit: 'm', default: 5, min: 2, max: 15, step: 0.5 },
        { key: 'floorHeight', label: t('tmpl.floorHeight'), unit: 'm', default: 3, min: 2, max: 6, step: 0.5 },
        { key: 'qBeam', label: t('tmpl.beamLoad'), unit: 'kN/m', default: -20, min: -100, max: 100, step: 1 },
        { key: 'Hlateral', label: t('tmpl.lateralPerFloor'), unit: 'kN', default: 10, min: -100, max: 100, step: 1 },
      ],
    },
    {
      id: 'prattTruss', name: t('tmpl.prattTruss'), category: t('tmpl.catTrusses'),
      params: [
        { key: 'span', label: t('tmpl.span'), unit: 'm', default: 12, min: 4, max: 60, step: 1 },
        { key: 'height', label: t('tmpl.height'), unit: 'm', default: 2, min: 0.5, max: 10, step: 0.5 },
        { key: 'nPanels', label: t('tmpl.panels'), unit: '', default: 6, min: 4, max: 20, step: 2, integer: true },
      ],
    },
    {
      id: 'warrenTruss', name: t('tmpl.warrenTruss'), category: t('tmpl.catTrusses'),
      params: [
        { key: 'span', label: t('tmpl.span'), unit: 'm', default: 12, min: 4, max: 60, step: 1 },
        { key: 'height', label: t('tmpl.height'), unit: 'm', default: 2, min: 0.5, max: 10, step: 0.5 },
        { key: 'nPanels', label: t('tmpl.panels'), unit: '', default: 6, min: 4, max: 20, step: 2, integer: true },
      ],
    },
  ];
}

/** @deprecated Use getTemplateCatalog() instead */
export const TEMPLATE_CATALOG: TemplateInfo[] = [
  {
    id: 'simpleBeam', name: 'Viga biarticulada', category: 'Vigas',
    params: [
      { key: 'L', label: 'Luz', unit: 'm', default: 6, min: 1, max: 50, step: 0.5 },
      { key: 'q', label: 'Carga', unit: 'kN/m', default: -10, min: -100, max: 100, step: 1 },
      { key: 'nDiv', label: 'Divisiones', unit: '', default: 4, min: 1, max: 20, step: 1, integer: true },
    ],
  },
  {
    id: 'cantilever', name: 'Voladizo', category: 'Vigas',
    params: [
      { key: 'L', label: 'Longitud', unit: 'm', default: 3, min: 1, max: 30, step: 0.5 },
      { key: 'P', label: 'Carga puntual', unit: 'kN', default: -15, min: -200, max: 200, step: 1 },
      { key: 'nDiv', label: 'Divisiones', unit: '', default: 3, min: 1, max: 20, step: 1, integer: true },
    ],
  },
  {
    id: 'continuousBeam', name: 'Viga continua', category: 'Vigas',
    params: [
      { key: 'nSpans', label: 'Tramos', unit: '', default: 3, min: 2, max: 10, step: 1, integer: true },
      { key: 'spanLength', label: 'Luz tramo', unit: 'm', default: 5, min: 1, max: 30, step: 0.5 },
      { key: 'q', label: 'Carga', unit: 'kN/m', default: -10, min: -100, max: 100, step: 1 },
      { key: 'nDivPerSpan', label: 'Div/tramo', unit: '', default: 4, min: 1, max: 10, step: 1, integer: true },
    ],
  },
  {
    id: 'portalFrame', name: 'Pórtico simple', category: 'Pórticos',
    params: [
      { key: 'width', label: 'Ancho', unit: 'm', default: 6, min: 2, max: 30, step: 0.5 },
      { key: 'height', label: 'Alto', unit: 'm', default: 4, min: 2, max: 20, step: 0.5 },
      { key: 'qBeam', label: 'Carga viga', unit: 'kN/m', default: -15, min: -100, max: 100, step: 1 },
      { key: 'Hlateral', label: 'Carga lateral', unit: 'kN', default: 10, min: -100, max: 100, step: 1 },
    ],
  },
  {
    id: 'multiStory', name: 'Pórtico multi-piso', category: 'Pórticos',
    params: [
      { key: 'nBays', label: 'Vanos', unit: '', default: 2, min: 1, max: 6, step: 1, integer: true },
      { key: 'nFloors', label: 'Pisos', unit: '', default: 3, min: 1, max: 10, step: 1, integer: true },
      { key: 'bayWidth', label: 'Ancho vano', unit: 'm', default: 5, min: 2, max: 15, step: 0.5 },
      { key: 'floorHeight', label: 'Alto piso', unit: 'm', default: 3, min: 2, max: 6, step: 0.5 },
      { key: 'qBeam', label: 'Carga viga', unit: 'kN/m', default: -20, min: -100, max: 100, step: 1 },
      { key: 'Hlateral', label: 'Lateral/piso', unit: 'kN', default: 10, min: -100, max: 100, step: 1 },
    ],
  },
  {
    id: 'prattTruss', name: 'Reticulado Pratt', category: 'Reticulados',
    params: [
      { key: 'span', label: 'Luz', unit: 'm', default: 12, min: 4, max: 60, step: 1 },
      { key: 'height', label: 'Alto', unit: 'm', default: 2, min: 0.5, max: 10, step: 0.5 },
      { key: 'nPanels', label: 'Paneles', unit: '', default: 6, min: 4, max: 20, step: 2, integer: true },
    ],
  },
  {
    id: 'warrenTruss', name: 'Reticulado Warren', category: 'Reticulados',
    params: [
      { key: 'span', label: 'Luz', unit: 'm', default: 12, min: 4, max: 60, step: 1 },
      { key: 'height', label: 'Alto', unit: 'm', default: 2, min: 0.5, max: 10, step: 0.5 },
      { key: 'nPanels', label: 'Paneles', unit: '', default: 6, min: 4, max: 20, step: 2, integer: true },
    ],
  },
];

/**
 * Generate a model snapshot from a template name and parameter values.
 */
export function generateFromTemplate(name: TemplateName, params: Record<string, number>): ModelSnapshot {
  switch (name) {
    case 'simpleBeam':
      return generateSimpleBeam(params as unknown as SimpleBeamParams);
    case 'cantilever':
      return generateCantilever(params as unknown as CantileverParams);
    case 'continuousBeam':
      return generateContinuousBeam(params as unknown as ContinuousBeamParams);
    case 'portalFrame':
      return generatePortalFrame(params as unknown as PortalFrameParams);
    case 'multiStory':
      return generateMultiStory(params as unknown as MultiStoryParams);
    case 'prattTruss':
      return generatePrattTruss(params as unknown as TrussParams);
    case 'warrenTruss':
      return generateWarrenTruss(params as unknown as TrussParams);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3D Template Generators
// These operate directly on the modelStore instance (imperative style)
// ═══════════════════════════════════════════════════════════════════

import { modelStore } from '../store';

type ModelStore = typeof modelStore;

// -------------------------------------------------------------------
// 1. Space Frame 3D — Portal frame grid with columns and beams
// -------------------------------------------------------------------

export interface SpaceFrame3DParams {
  nBaysX: number;     // bays in X direction
  nBaysY: number;     // bays in Z direction (depth)
  nFloors: number;    // number of floors
  bayWidth: number;   // bay width in metres
  storyHeight: number; // storey height in metres
  q: number;          // distributed load on top-floor beams (kN/m, negative = downward)
}

export function generateSpaceFrame3D(store: ModelStore, p: SpaceFrame3DParams): void {
  store.clear();
  store.model.name = 'Pórtico Espacial 3D';

  store.batch(() => {
    // Node grid: nodeGrid[floor][iz][ix]
    // floor 0 = base (Y=0), floor nFloors = top
    const nodeGrid: number[][][] = [];

    for (let f = 0; f <= p.nFloors; f++) {
      nodeGrid[f] = [];
      const y = f * p.storyHeight;
      for (let iz = 0; iz <= p.nBaysY; iz++) {
        nodeGrid[f][iz] = [];
        for (let ix = 0; ix <= p.nBaysX; ix++) {
          nodeGrid[f][iz][ix] = store.addNode(ix * p.bayWidth, y, iz * p.bayWidth);
        }
      }
    }

    // Columns: vertical elements connecting consecutive floors
    for (let f = 0; f < p.nFloors; f++) {
      for (let iz = 0; iz <= p.nBaysY; iz++) {
        for (let ix = 0; ix <= p.nBaysX; ix++) {
          store.addElement(nodeGrid[f][iz][ix], nodeGrid[f + 1][iz][ix], 'frame');
        }
      }
    }

    // Beams in X direction at every floor above base
    for (let f = 1; f <= p.nFloors; f++) {
      for (let iz = 0; iz <= p.nBaysY; iz++) {
        for (let ix = 0; ix < p.nBaysX; ix++) {
          const eid = store.addElement(nodeGrid[f][iz][ix], nodeGrid[f][iz][ix + 1], 'frame');
          // Distributed load on top floor beams only
          // UBA: gravity → local Z (ez=(0,-1,0) for horizontal bars, so qZ = -p.q)
          if (f === p.nFloors && p.q !== 0) {
            store.addDistributedLoad3D(eid, 0, 0, -p.q, -p.q);
          }
        }
      }
    }

    // Beams in Z direction at every floor above base
    for (let f = 1; f <= p.nFloors; f++) {
      for (let ix = 0; ix <= p.nBaysX; ix++) {
        for (let iz = 0; iz < p.nBaysY; iz++) {
          const eid = store.addElement(nodeGrid[f][iz][ix], nodeGrid[f][iz + 1][ix], 'frame');
          // Distributed load on top floor beams only
          // UBA: gravity → local Z (ez=(0,-1,0) for horizontal bars, so qZ = -p.q)
          if (f === p.nFloors && p.q !== 0) {
            store.addDistributedLoad3D(eid, 0, 0, -p.q, -p.q);
          }
        }
      }
    }

    // Fixed supports at base
    for (let iz = 0; iz <= p.nBaysY; iz++) {
      for (let ix = 0; ix <= p.nBaysX; ix++) {
        store.addSupport(nodeGrid[0][iz][ix], 'fixed3d');
      }
    }
  });
}

// -------------------------------------------------------------------
// 2. Grid Beams (Emparrillado) — Beam grid in XZ plane
// -------------------------------------------------------------------

export interface GridBeamsParams {
  Lx: number;    // total length in X (m)
  Lz: number;    // total length in Z (m)
  nDivX: number; // number of divisions in X
  nDivZ: number; // number of divisions in Z
  q: number;     // uniform load at interior nodes (kN, negative = downward)
}

export function generateGridBeams(store: ModelStore, p: GridBeamsParams): void {
  store.clear();
  store.model.name = 'Emparrillado';

  store.batch(() => {
    const dx = p.Lx / p.nDivX;
    const dz = p.Lz / p.nDivZ;

    // Create node grid at Y=0
    const nodes: number[][] = []; // nodes[iz][ix]
    for (let iz = 0; iz <= p.nDivZ; iz++) {
      nodes[iz] = [];
      for (let ix = 0; ix <= p.nDivX; ix++) {
        nodes[iz][ix] = store.addNode(ix * dx, 0, iz * dz);
      }
    }

    // Beams in X direction
    for (let iz = 0; iz <= p.nDivZ; iz++) {
      for (let ix = 0; ix < p.nDivX; ix++) {
        store.addElement(nodes[iz][ix], nodes[iz][ix + 1], 'frame');
      }
    }

    // Beams in Z direction
    for (let ix = 0; ix <= p.nDivX; ix++) {
      for (let iz = 0; iz < p.nDivZ; iz++) {
        store.addElement(nodes[iz][ix], nodes[iz + 1][ix], 'frame');
      }
    }

    // Simply supported on all edge nodes
    for (let iz = 0; iz <= p.nDivZ; iz++) {
      for (let ix = 0; ix <= p.nDivX; ix++) {
        const isEdge = ix === 0 || ix === p.nDivX || iz === 0 || iz === p.nDivZ;
        if (isEdge) {
          store.addSupport(nodes[iz][ix], 'pinned3d');
        }
      }
    }

    // Uniform downward load at interior nodes
    if (p.q !== 0) {
      for (let iz = 1; iz < p.nDivZ; iz++) {
        for (let ix = 1; ix < p.nDivX; ix++) {
          store.addNodalLoad3D(nodes[iz][ix], 0, p.q, 0, 0, 0, 0);
        }
      }
    }
  });
}

// -------------------------------------------------------------------
// 3. Tower 3D — 4 columns with bracing and multiple levels
// -------------------------------------------------------------------

export interface Tower3DParams {
  H: number;           // total height (m)
  nLevels: number;     // number of levels (horizontal planes above base)
  baseWidth: number;   // width at base (m)
  topWidth: number;    // width at top (m), allows tapering
  withBracing: boolean; // add X-bracing on each face
  lateralLoad: number; // lateral point load per top node (kN)
}

export function generateTower3D(store: ModelStore, p: Tower3DParams): void {
  store.clear();
  store.model.name = 'Torre 3D';

  store.batch(() => {
    const levelH = p.H / p.nLevels;

    // Corner nodes at each level: corners[level][corner 0-3]
    // Corner order: 0=(0,0), 1=(w,0), 2=(w,w), 3=(0,w)
    const corners: number[][] = [];

    for (let lev = 0; lev <= p.nLevels; lev++) {
      corners[lev] = [];
      const y = lev * levelH;
      const t = lev / p.nLevels; // 0 at base, 1 at top
      const w = p.baseWidth + t * (p.topWidth - p.baseWidth);
      const offset = (p.baseWidth - w) / 2; // centre the plan
      corners[lev][0] = store.addNode(offset, y, offset);
      corners[lev][1] = store.addNode(offset + w, y, offset);
      corners[lev][2] = store.addNode(offset + w, y, offset + w);
      corners[lev][3] = store.addNode(offset, y, offset + w);
    }

    // Columns (vertical): connect each corner between consecutive levels
    for (let lev = 0; lev < p.nLevels; lev++) {
      for (let c = 0; c < 4; c++) {
        store.addElement(corners[lev][c], corners[lev + 1][c], 'frame');
      }
    }

    // Horizontal beams at each level above base
    for (let lev = 1; lev <= p.nLevels; lev++) {
      store.addElement(corners[lev][0], corners[lev][1], 'frame');
      store.addElement(corners[lev][1], corners[lev][2], 'frame');
      store.addElement(corners[lev][2], corners[lev][3], 'frame');
      store.addElement(corners[lev][3], corners[lev][0], 'frame');
    }

    // X-bracing on each face (truss elements)
    if (p.withBracing) {
      // Face pairs: [cornerA, cornerB] for each of the 4 faces
      const faces: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]];
      for (const [a, b] of faces) {
        for (let lev = 0; lev < p.nLevels; lev++) {
          // X-brace: two diagonals per face per level
          store.addElement(corners[lev][a], corners[lev + 1][b], 'truss');
          store.addElement(corners[lev][b], corners[lev + 1][a], 'truss');
        }
      }
    }

    // Fixed supports at base
    for (let c = 0; c < 4; c++) {
      store.addSupport(corners[0][c], 'fixed3d');
    }

    // Lateral point loads at top level nodes
    if (p.lateralLoad !== 0) {
      for (let c = 0; c < 4; c++) {
        store.addNodalLoad3D(corners[p.nLevels][c], p.lateralLoad, 0, p.lateralLoad / 2, 0, 0, 0);
      }
    }

    // Gravity loads at top corners
    for (let c = 0; c < 4; c++) {
      store.addNodalLoad3D(corners[p.nLevels][c], 0, -15, 0, 0, 0, 0);
    }
  });
}

// -------------------------------------------------------------------
// 4. 3D Hinged Arch — Parabolic arch in XY plane
// -------------------------------------------------------------------

export interface HingedArch3DParams {
  span: number;       // arch span in X (m)
  rise: number;       // arch rise (m)
  nSegments: number;  // number of segments
  q: number;          // distributed load (kN/m, negative = downward)
}

export function generate3DHingedArch(store: ModelStore, p: HingedArch3DParams): void {
  store.clear();
  store.model.name = 'Arco Articulado 3D';

  store.batch(() => {
    const dx = p.span / p.nSegments;

    // Parabolic y(x) = 4*rise*x*(span-x)/span^2
    const nodeIds: number[] = [];
    for (let i = 0; i <= p.nSegments; i++) {
      const x = i * dx;
      const y = 4 * p.rise * x * (p.span - x) / (p.span * p.span);
      nodeIds.push(store.addNode(x, y, 0));
    }

    // Create elements along the arch
    const elemIds: number[] = [];
    for (let i = 0; i < p.nSegments; i++) {
      const eid = store.addElement(nodeIds[i], nodeIds[i + 1], 'frame');
      elemIds.push(eid);
      // Distributed load: project gravity onto local axes per inclined segment (UBA convention)
      if (p.q !== 0) {
        const nI = store.model.nodes.get(nodeIds[i])!;
        const nJ = store.model.nodes.get(nodeIds[i + 1])!;
        const axes = computeLocalAxes3D(
          { id: 0, x: nI.x, y: nI.y, z: nI.z ?? 0 },
          { id: 1, x: nJ.x, y: nJ.y, z: nJ.z ?? 0 },
        );
        // gravity = (0, p.q, 0), project onto local Y and Z
        const qY = axes.ey[1] * p.q;
        const qZ = axes.ez[1] * p.q;
        store.addDistributedLoad3D(eid, qY, qY, qZ, qZ);
      }
    }

    // Hinges at quarter points
    const quarterIdx = Math.round(p.nSegments / 4);
    const threeQuarterIdx = Math.round(3 * p.nSegments / 4);

    // Hinge at quarter point: end of element (quarterIdx-1), start of element (quarterIdx)
    if (quarterIdx > 0 && quarterIdx < p.nSegments) {
      store.toggleHinge(elemIds[quarterIdx - 1], 'end');
      store.toggleHinge(elemIds[quarterIdx], 'start');
    }

    // Hinge at three-quarter point
    if (threeQuarterIdx > 0 && threeQuarterIdx < p.nSegments) {
      store.toggleHinge(elemIds[threeQuarterIdx - 1], 'end');
      store.toggleHinge(elemIds[threeQuarterIdx], 'start');
    }

    // Fixed supports at both ends (needed for out-of-plane stability in 3D coplanar arch)
    store.addSupport(nodeIds[0], 'fixed3d');
    store.addSupport(nodeIds[p.nSegments], 'fixed3d');
  });
}

// -------------------------------------------------------------------
// 3D Template catalog (for UI registration)
// -------------------------------------------------------------------

export type TemplateName3D =
  | 'spaceFrame3D'
  | 'gridBeams'
  | 'tower3D_2'
  | 'tower3D_4'
  | 'hingedArch3D';

export interface TemplateInfo3D {
  id: TemplateName3D;
  name: string;
  desc: string;
  params?: TemplateParam[];
  generate: (store: ModelStore, paramValues?: Record<string, number>) => void;
}

export function getTemplateCatalog3D(): TemplateInfo3D[] {
  return [
    {
      id: 'hingedArch3D',
      name: t('tmpl3d.hingedArch'),
      desc: t('tmpl3d.hingedArchDesc'),
      params: [
        { key: 'span', label: t('tmpl.span'), unit: 'm', default: 12, min: 4, max: 60, step: 1 },
        { key: 'rise', label: t('tmpl.rise'), unit: 'm', default: 4, min: 0.5, max: 15, step: 0.5 },
        { key: 'nSegments', label: t('tmpl.segments'), unit: '', default: 12, min: 4, max: 40, step: 2, integer: true },
        { key: 'q', label: t('tmpl.load'), unit: 'kN/m', default: -8, min: -100, max: 100, step: 1 },
      ],
    generate: (s, p) => generate3DHingedArch(s, {
      span: p?.span ?? 12, rise: p?.rise ?? 4, nSegments: p?.nSegments ?? 12, q: p?.q ?? -8,
    }),
  },
    {
      id: 'gridBeams',
      name: t('tmpl3d.gridBeams'),
      desc: t('tmpl3d.gridBeamsDesc'),
      params: [
        { key: 'Lx', label: t('tmpl.lengthX'), unit: 'm', default: 8, min: 2, max: 30, step: 0.5 },
        { key: 'Lz', label: t('tmpl.lengthZ'), unit: 'm', default: 8, min: 2, max: 30, step: 0.5 },
        { key: 'nDivX', label: t('tmpl.divisionsX'), unit: '', default: 4, min: 2, max: 10, step: 1, integer: true },
        { key: 'nDivZ', label: t('tmpl.divisionsZ'), unit: '', default: 4, min: 2, max: 10, step: 1, integer: true },
        { key: 'q', label: t('tmpl.nodeLoad'), unit: 'kN', default: -20, min: -100, max: 100, step: 1 },
      ],
      generate: (s, p) => generateGridBeams(s, {
        Lx: p?.Lx ?? 8, Lz: p?.Lz ?? 8, nDivX: p?.nDivX ?? 4, nDivZ: p?.nDivZ ?? 4, q: p?.q ?? -20,
      }),
    },
    {
      id: 'spaceFrame3D',
      name: t('tmpl3d.spaceFrame'),
      desc: t('tmpl3d.spaceFrameDesc'),
      params: [
        { key: 'nBaysX', label: t('tmpl.baysX'), unit: '', default: 2, min: 1, max: 6, step: 1, integer: true },
        { key: 'nBaysY', label: t('tmpl.baysZ'), unit: '', default: 2, min: 1, max: 6, step: 1, integer: true },
        { key: 'nFloors', label: t('tmpl.floors'), unit: '', default: 2, min: 1, max: 10, step: 1, integer: true },
        { key: 'bayWidth', label: t('tmpl.bayWidth'), unit: 'm', default: 5, min: 2, max: 15, step: 0.5 },
        { key: 'storyHeight', label: t('tmpl.floorHeight'), unit: 'm', default: 3, min: 2, max: 6, step: 0.5 },
        { key: 'q', label: t('tmpl.beamLoad'), unit: 'kN/m', default: -10, min: -100, max: 100, step: 1 },
      ],
      generate: (s, p) => generateSpaceFrame3D(s, {
        nBaysX: p?.nBaysX ?? 2, nBaysY: p?.nBaysY ?? 2, nFloors: p?.nFloors ?? 2,
        bayWidth: p?.bayWidth ?? 5, storyHeight: p?.storyHeight ?? 3, q: p?.q ?? -10,
      }),
    },
    {
      id: 'tower3D_2',
      name: t('tmpl3d.tower2'),
      desc: t('tmpl3d.tower2Desc'),
      params: [
        { key: 'H', label: t('tmpl.totalHeight'), unit: 'm', default: 6, min: 3, max: 30, step: 0.5 },
        { key: 'nLevels', label: t('tmpl.levels'), unit: '', default: 2, min: 1, max: 10, step: 1, integer: true },
        { key: 'baseWidth', label: t('tmpl.baseWidth'), unit: 'm', default: 3, min: 1, max: 10, step: 0.5 },
        { key: 'topWidth', label: t('tmpl.topWidth'), unit: 'm', default: 2.5, min: 0.5, max: 10, step: 0.5 },
        { key: 'lateralLoad', label: t('tmpl.lateralLoad'), unit: 'kN', default: 10, min: 0, max: 100, step: 1 },
      ],
      generate: (s, p) => generateTower3D(s, {
        H: p?.H ?? 6, nLevels: p?.nLevels ?? 2, baseWidth: p?.baseWidth ?? 3,
        topWidth: p?.topWidth ?? 2.5, withBracing: true, lateralLoad: p?.lateralLoad ?? 10,
      }),
    },
    {
      id: 'tower3D_4',
      name: t('tmpl3d.tower4'),
      desc: t('tmpl3d.tower4Desc'),
      params: [
        { key: 'H', label: t('tmpl.totalHeight'), unit: 'm', default: 12, min: 4, max: 40, step: 0.5 },
        { key: 'nLevels', label: t('tmpl.levels'), unit: '', default: 4, min: 2, max: 10, step: 1, integer: true },
        { key: 'baseWidth', label: t('tmpl.baseWidth'), unit: 'm', default: 3, min: 1, max: 10, step: 0.5 },
        { key: 'topWidth', label: t('tmpl.topWidth'), unit: 'm', default: 2, min: 0.5, max: 10, step: 0.5 },
        { key: 'lateralLoad', label: t('tmpl.lateralLoad'), unit: 'kN', default: 10, min: 0, max: 100, step: 1 },
      ],
      generate: (s, p) => generateTower3D(s, {
        H: p?.H ?? 12, nLevels: p?.nLevels ?? 4, baseWidth: p?.baseWidth ?? 3,
        topWidth: p?.topWidth ?? 2, withBracing: true, lateralLoad: p?.lateralLoad ?? 10,
      }),
    },
  ];
}

/** @deprecated Use getTemplateCatalog3D() instead */
export const TEMPLATE_CATALOG_3D = getTemplateCatalog3D();
