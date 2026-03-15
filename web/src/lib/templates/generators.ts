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
          if (p.q !== 0) {
            store.addDistributedLoad3D(eid, 0, p.q, 0, p.q);
          }
        }
      }
    }

    // Beams in Z direction at every floor above base
    for (let f = 1; f <= p.nFloors; f++) {
      for (let ix = 0; ix <= p.nBaysX; ix++) {
        for (let iz = 0; iz < p.nBaysY; iz++) {
          const eid = store.addElement(nodeGrid[f][iz][ix], nodeGrid[f][iz + 1][ix], 'frame');
          if (p.q !== 0) {
            store.addDistributedLoad3D(eid, 0, p.q, 0, p.q);
          }
        }
      }
    }

    // X-bracing on perimeter faces for lateral stiffness
    for (let f = 0; f < p.nFloors; f++) {
      // Front face (iz=0) and back face (iz=nBaysY)
      for (const iz of [0, p.nBaysY]) {
        for (let ix = 0; ix < p.nBaysX; ix++) {
          store.addElement(nodeGrid[f][iz][ix], nodeGrid[f + 1][iz][ix + 1], 'truss');
          store.addElement(nodeGrid[f][iz][ix + 1], nodeGrid[f + 1][iz][ix], 'truss');
        }
      }
      // Left face (ix=0) and right face (ix=nBaysX)
      for (const ix of [0, p.nBaysX]) {
        for (let iz = 0; iz < p.nBaysY; iz++) {
          store.addElement(nodeGrid[f][iz][ix], nodeGrid[f + 1][iz + 1][ix], 'truss');
          store.addElement(nodeGrid[f][iz + 1][ix], nodeGrid[f + 1][iz][ix], 'truss');
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
// 5. Irregular setback tower — torsion / drift / outrigger showcase
// -------------------------------------------------------------------

export interface IrregularSetbackTower3DParams {
  storyH: number;
  levels: number;
  baysX: number;
  baysZ: number;
  bayX: number;
  bayZ: number;
  setbackAt: number[];
  windLoad: number;
}

export function generateIrregularSetbackTower3D(store: ModelStore, p: IrregularSetbackTower3DParams): void {
  store.clear();
  store.model.name = t('ex.irregularSetbackTower3D');

  store.batch(() => {
    // Realistic sections for a multi-story steel building
    // Section 1 (default) is IPN 300 — replace it with HEB 400 for columns
    store.updateSection(1, {
      name: 'HEB 400',
      a: 0.01978,         // 197.8 cm²
      iy: 0.000576800,    // 57680 cm⁴ (strong axis)
      iz: 0.000108200,    // 10820 cm⁴ (weak axis)
      j: 0.000003560,     // 356 cm⁴
      h: 0.400,
      b: 0.300,
      shape: 'I',
      tw: 0.0135,
      tf: 0.024,
    });
    // Section 2: IPE 360 for beams
    const beamSecId = store.addSection({
      name: 'IPE 360',
      a: 0.00727,         // 72.7 cm²
      iy: 0.000162700,    // 16270 cm⁴ (strong axis)
      iz: 0.000010430,    // 1043 cm⁴ (weak axis)
      j: 0.000000373,     // 37.3 cm⁴
      h: 0.360,
      b: 0.170,
      shape: 'I',
      tw: 0.008,
      tf: 0.0127,
    });
    // Section 3: L 100x100x10 for bracing
    const braceSecId = store.addSection({
      name: 'L 100x10',
      a: 0.001920,        // 19.2 cm²
      iy: 0.000001770,    // 177 cm⁴
      iz: 0.000001770,    // 177 cm⁴
      j: 0.000000064,     // 6.4 cm⁴
      h: 0.100,
      b: 0.100,
    });

    const floors: number[][][] = []; // floors[level][iz][ix]

    const insetAt = (lev: number) => {
      let inset = 0;
      for (const trigger of p.setbackAt) {
        if (lev >= trigger) inset += 1;
      }
      return Math.min(inset, Math.floor(Math.min(p.baysX, p.baysZ) / 3));
    };

    for (let lev = 0; lev <= p.levels; lev++) {
      const inset = insetAt(lev);
      const y = lev * p.storyH;
      floors[lev] = [];
      for (let iz = inset; iz <= p.baysZ - inset; iz++) {
        const row: number[] = [];
        for (let ix = inset; ix <= p.baysX - inset; ix++) {
          const skew = lev > p.levels * 0.45 ? (lev - p.levels * 0.45) * 0.07 : 0;
          row.push(store.addNode(ix * p.bayX + skew * (iz / Math.max(1, p.baysZ)), y, iz * p.bayZ));
        }
        floors[lev].push(row);
      }
    }

    const levelInset = (lev: number) => insetAt(lev);
    const nodeAt = (lev: number, ix: number, iz: number) => {
      const inset = levelInset(lev);
      if (ix < inset || ix > p.baysX - inset || iz < inset || iz > p.baysZ - inset) return null;
      return floors[lev][iz - inset]?.[ix - inset] ?? null;
    };

    for (let lev = 0; lev < p.levels; lev++) {
      const inset = levelInset(lev);
      const nextInset = levelInset(lev + 1);

      // Columns (section 1 = HEB 400)
      for (let iz = inset; iz <= p.baysZ - inset; iz++) {
        for (let ix = inset; ix <= p.baysX - inset; ix++) {
          const a = nodeAt(lev, ix, iz);
          const b = nodeAt(lev + 1, ix, iz);
          if (a && b) store.addElement(a, b, 'frame'); // uses default section 1 (HEB 400)
        }
      }

      // Beams in X direction (section 2 = IPE 360)
      for (let iz = nextInset; iz <= p.baysZ - nextInset; iz++) {
        for (let ix = nextInset; ix < p.baysX - nextInset; ix++) {
          const a = nodeAt(lev + 1, ix, iz);
          const b = nodeAt(lev + 1, ix + 1, iz);
          if (a && b) {
            const eid = store.addElement(a, b, 'frame');
            store.updateElementSection(eid, beamSecId);
            store.addDistributedLoad3D(eid, 0, 0, -18, -18, undefined, undefined, 1);
            store.addDistributedLoad3D(eid, 0, 0, -10, -10, undefined, undefined, 2);
          }
        }
      }
      // Beams in Z direction (section 2 = IPE 360)
      for (let ix = nextInset; ix <= p.baysX - nextInset; ix++) {
        for (let iz = nextInset; iz < p.baysZ - nextInset; iz++) {
          const a = nodeAt(lev + 1, ix, iz);
          const b = nodeAt(lev + 1, ix, iz + 1);
          if (a && b) {
            const eid = store.addElement(a, b, 'frame');
            store.updateElementSection(eid, beamSecId);
            store.addDistributedLoad3D(eid, 0, 0, -16, -16, undefined, undefined, 1);
            store.addDistributedLoad3D(eid, 0, 0, -8, -8, undefined, undefined, 2);
          }
        }
      }

      // Facade bracing (section 3 = L 100x10)
      const facadeInset = Math.max(inset, nextInset);
      for (let iz = facadeInset; iz < p.baysZ - facadeInset; iz++) {
        const leftA = nodeAt(lev, facadeInset, iz);
        const leftB = nodeAt(lev + 1, facadeInset, iz + 1);
        const rightA = nodeAt(lev, p.baysX - facadeInset, iz);
        const rightB = nodeAt(lev + 1, p.baysX - facadeInset, iz + 1);
        if (leftA && leftB && (lev + iz) % 2 === 0) {
          const eid = store.addElement(leftA, leftB, 'truss');
          store.updateElementSection(eid, braceSecId);
        }
        if (rightA && rightB && (lev + iz) % 2 === 1) {
          const eid = store.addElement(rightA, rightB, 'truss');
          store.updateElementSection(eid, braceSecId);
        }
      }

      // Outrigger trusses (section 3 = L 100x10)
      if ((lev + 1) % 6 === 0) {
        const cx0 = Math.floor((p.baysX + facadeInset) / 2);
        const cz0 = Math.floor((p.baysZ + facadeInset) / 2);
        const anchorPairs: Array<[number, number]> = [
          [facadeInset, cz0],
          [p.baysX - facadeInset, cz0],
          [cx0, facadeInset],
          [cx0, p.baysZ - facadeInset],
        ];
        for (const [ix, iz] of anchorPairs) {
          const core = nodeAt(lev + 1, cx0, cz0);
          const edge = nodeAt(lev + 1, ix, iz);
          if (core && edge && core !== edge) {
            const eid = store.addElement(core, edge, 'truss');
            store.updateElementSection(eid, braceSecId);
          }
        }
      }
    }

    for (let iz = 0; iz < floors[0].length; iz++) {
      for (let ix = 0; ix < floors[0][iz].length; ix++) {
        store.addSupport(floors[0][iz][ix], 'fixed3d');
      }
    }

    const roof = floors[p.levels];
    for (let iz = 0; iz < roof.length; iz++) {
      for (let ix = 0; ix < roof[iz].length; ix++) {
        const node = roof[iz][ix];
        const torsionFactor = ix < roof[iz].length / 2 ? 1.15 : 0.85;
        store.addNodalLoad3D(node, p.windLoad * torsionFactor, 0, p.windLoad * 0.28, 0, 0, 0, 3);
      }
    }
  });
}

// -------------------------------------------------------------------
// 6. Mat foundation grillage — soil / foundation showcase
// -------------------------------------------------------------------

export interface MatFoundation3DParams {
  Lx: number;
  Lz: number;
  nX: number;
  nZ: number;
  subgradeKy: number;
}

export function generateMatFoundation3D(store: ModelStore, p: MatFoundation3DParams): void {
  store.clear();
  store.model.name = t('ex.matFoundation3D');

  store.batch(() => {
    // Concrete material
    store.updateMaterial(1, { name: 'H25', e: 25000, nu: 0.2, rho: 25, fy: 25 });
    // Section 1: RC rib 200×600
    store.updateSection(1, {
      name: 'RC Rib 200×600',
      a: 0.12,
      iy: 0.0036,
      iz: 0.0004,
      j: 0.00254,
      h: 0.6,
      b: 0.2,
      shape: 'rect',
    });

    const dx = p.Lx / p.nX;
    const dz = p.Lz / p.nZ;
    const nodes: number[][] = [];

    for (let iz = 0; iz <= p.nZ; iz++) {
      nodes[iz] = [];
      for (let ix = 0; ix <= p.nX; ix++) {
        const nid = store.addNode(ix * dx, 0, iz * dz);
        nodes[iz][ix] = nid;
        store.addSupport(nid, 'spring3d', {
          kx: p.subgradeKy * 0.08,
          ky: p.subgradeKy,
          kz: p.subgradeKy * 0.08,
          krx: p.subgradeKy * 0.02,
          kry: p.subgradeKy * 0.02,
          krz: p.subgradeKy * 0.02,
        });
      }
    }

    for (let iz = 0; iz <= p.nZ; iz++) {
      for (let ix = 0; ix < p.nX; ix++) {
        store.addElement(nodes[iz][ix], nodes[iz][ix + 1], 'frame');
      }
    }
    for (let ix = 0; ix <= p.nX; ix++) {
      for (let iz = 0; iz < p.nZ; iz++) {
        store.addElement(nodes[iz][ix], nodes[iz + 1][ix], 'frame');
      }
    }

    for (let iz = 0; iz < p.nZ; iz++) {
      for (let ix = 0; ix < p.nX; ix++) {
        store.addQuad([nodes[iz][ix], nodes[iz][ix + 1], nodes[iz + 1][ix + 1], nodes[iz + 1][ix]], 1, 0.55);
      }
    }

    const pedestalLoads: Array<[number, number, number]> = [
      [2, 2, -1800],
      [p.nX - 2, 2, -1500],
      [2, p.nZ - 2, -1500],
      [p.nX - 2, p.nZ - 2, -1800],
      [Math.floor(p.nX / 2), Math.floor(p.nZ / 2), -2400],
    ];
    for (const [ix, iz, fy] of pedestalLoads) {
      store.addNodalLoad3D(nodes[iz][ix], 0, fy, 0, 0, 0, 0, 1);
    }
  });
}

// -------------------------------------------------------------------
// 7. Pipe rack — industrial repetitive frame / bracing showcase
// -------------------------------------------------------------------

export interface PipeRack3DParams {
  bays: number;
  bayLength: number;
  width: number;
  levels: number;
  levelHeight: number;
  lateralLoad: number;
}

export function generatePipeRack3D(store: ModelStore, p: PipeRack3DParams): void {
  store.clear();
  store.model.name = t('ex.pipeRack3D');

  store.batch(() => {
    // Section 1: HEB 200 columns
    store.updateSection(1, {
      name: 'HEB 200',
      a: 0.00781,
      iy: 0.00005696,
      iz: 0.00002003,
      j: 0.000000594,
      h: 0.2,
      b: 0.2,
      shape: 'I',
      tw: 0.009,
      tf: 0.015,
    });
    // Section 2: IPE 240 beams
    const beamSecId = store.addSection({
      name: 'IPE 240',
      a: 0.00391,
      iy: 0.00003892,
      iz: 0.00000284,
      j: 0.000000129,
      h: 0.24,
      b: 0.12,
      shape: 'I',
      tw: 0.0062,
      tf: 0.0098,
    });

    const frames: number[][][] = []; // bay station -> level -> side
    for (let bay = 0; bay <= p.bays; bay++) {
      frames[bay] = [];
      const x = bay * p.bayLength;
      for (let lev = 0; lev <= p.levels; lev++) {
        const y = lev * p.levelHeight;
        frames[bay][lev] = [
          store.addNode(x, y, 0),
          store.addNode(x, y, p.width),
        ];
      }
    }

    // Columns (section 1 = HEB 200)
    for (let bay = 0; bay <= p.bays; bay++) {
      for (let lev = 0; lev < p.levels; lev++) {
        store.addElement(frames[bay][lev][0], frames[bay][lev + 1][0], 'frame');
        store.addElement(frames[bay][lev][1], frames[bay][lev + 1][1], 'frame');
      }
      store.addSupport(frames[bay][0][0], 'fixed3d');
      store.addSupport(frames[bay][0][1], 'fixed3d');
    }

    // Beams and bracing
    for (let bay = 0; bay < p.bays; bay++) {
      for (let lev = 1; lev <= p.levels; lev++) {
        // Longitudinal beams (section 2 = IPE 240)
        const left = store.addElement(frames[bay][lev][0], frames[bay + 1][lev][0], 'frame');
        store.updateElementSection(left, beamSecId);
        const right = store.addElement(frames[bay][lev][1], frames[bay + 1][lev][1], 'frame');
        store.updateElementSection(right, beamSecId);
        // Transverse beams (section 2 = IPE 240)
        const crossA = store.addElement(frames[bay][lev][0], frames[bay][lev][1], 'frame');
        store.updateElementSection(crossA, beamSecId);
        const crossB = store.addElement(frames[bay + 1][lev][0], frames[bay + 1][lev][1], 'frame');
        store.updateElementSection(crossB, beamSecId);
        store.addDistributedLoad3D(left, 0, 0, -10, -10, undefined, undefined, 1);
        store.addDistributedLoad3D(right, 0, 0, -10, -10, undefined, undefined, 1);
      }

      if (bay % 2 === 0) {
        for (let lev = 0; lev < p.levels; lev++) {
          store.addElement(frames[bay][lev][0], frames[bay + 1][lev + 1][0], 'truss');
          store.addElement(frames[bay][lev][1], frames[bay + 1][lev + 1][1], 'truss');
        }
      }
    }

    for (let bay = 0; bay <= p.bays; bay++) {
      for (let lev = 1; lev <= p.levels; lev++) {
        const left = frames[bay][lev][0];
        const right = frames[bay][lev][1];
        store.addNodalLoad3D(left, p.lateralLoad, 0, 0, 0, 0, 0, 3);
        store.addNodalLoad3D(right, p.lateralLoad, 0, 0, 0, 0, 0, 3);
      }
    }
  });
}

// -------------------------------------------------------------------
// 8. RC design frame — regular frame prepared for design extraction
// -------------------------------------------------------------------

export interface RcDesignFrame3DParams {
  baysX: number;
  baysZ: number;
  bayX: number;
  bayZ: number;
  stories: number;
  storyH: number;
  windLoad: number;
}

export function generateRcDesignFrame3D(store: ModelStore, p: RcDesignFrame3DParams): void {
  store.clear();
  store.model.name = t('ex.rcDesignFrame3D');

  store.batch(() => {
    // Concrete material
    store.updateMaterial(1, { name: 'H30', e: 30000, nu: 0.2, rho: 25, fy: 30 });
    // Section 1: RC Column 400×400
    store.updateSection(1, {
      name: 'RC Col 400×400',
      a: 0.16,
      iy: 0.002133,
      iz: 0.002133,
      j: 0.003605,
      h: 0.4,
      b: 0.4,
      shape: 'rect',
    });
    // Section 2: RC Beam 300×600
    const beamSecId = store.addSection({
      name: 'RC Beam 300×600',
      a: 0.18,
      iy: 0.0054,
      iz: 0.00135,
      j: 0.00478,
      h: 0.6,
      b: 0.3,
      shape: 'rect',
    });

    const grid: number[][][] = [];
    for (let lev = 0; lev <= p.stories; lev++) {
      grid[lev] = [];
      for (let iz = 0; iz <= p.baysZ; iz++) {
        const row: number[] = [];
        for (let ix = 0; ix <= p.baysX; ix++) {
          row.push(store.addNode(ix * p.bayX, lev * p.storyH, iz * p.bayZ));
        }
        grid[lev].push(row);
      }
    }

    // Columns (section 1 = RC Column 400×400)
    for (let lev = 0; lev < p.stories; lev++) {
      for (let iz = 0; iz <= p.baysZ; iz++) {
        for (let ix = 0; ix <= p.baysX; ix++) {
          store.addElement(grid[lev][iz][ix], grid[lev + 1][iz][ix], 'frame');
        }
      }
    }

    // Beams (section 2 = RC Beam 300×600)
    for (let lev = 1; lev <= p.stories; lev++) {
      for (let iz = 0; iz <= p.baysZ; iz++) {
        for (let ix = 0; ix < p.baysX; ix++) {
          const eid = store.addElement(grid[lev][iz][ix], grid[lev][iz][ix + 1], 'frame');
          store.updateElementSection(eid, beamSecId);
          store.addDistributedLoad3D(eid, 0, 0, -14, -14, undefined, undefined, 1);
          store.addDistributedLoad3D(eid, 0, 0, -8, -8, undefined, undefined, 2);
        }
      }
      for (let ix = 0; ix <= p.baysX; ix++) {
        for (let iz = 0; iz < p.baysZ; iz++) {
          const eid = store.addElement(grid[lev][iz][ix], grid[lev][iz + 1][ix], 'frame');
          store.updateElementSection(eid, beamSecId);
          store.addDistributedLoad3D(eid, 0, 0, -12, -12, undefined, undefined, 1);
          store.addDistributedLoad3D(eid, 0, 0, -6, -6, undefined, undefined, 2);
        }
      }
    }

    for (let iz = 0; iz <= p.baysZ; iz++) {
      for (let ix = 0; ix <= p.baysX; ix++) {
        store.addSupport(grid[0][iz][ix], 'fixed3d');
      }
    }

    for (let lev = 1; lev <= p.stories; lev++) {
      for (let iz = 0; iz <= p.baysZ; iz++) {
        for (let ix = 0; ix <= p.baysX; ix++) {
          const torsion = iz < p.baysZ / 2 ? 1.15 : 0.85;
          store.addNodalLoad3D(grid[lev][iz][ix], p.windLoad * torsion, 0, 0, 0, 0, 0, 3);
        }
      }
    }
  });
}

// -------------------------------------------------------------------
// 9. XL Diagrid Tower — high-node-count perimeter diagrid tower
// -------------------------------------------------------------------

export interface XLDiagridTower3DParams {
  H: number;
  nLevels: number;
  nSides: number;
  baseRadiusX: number;
  baseRadiusZ: number;
  topRadiusX: number;
  topRadiusZ: number;
  lateralLoad: number;
}

export function generateXLDiagridTower3D(store: ModelStore, p: XLDiagridTower3DParams): void {
  store.clear();
  store.model.name = t('ex.xlDiagridTower3D');

  store.batch(() => {
    // Section 1: Core column HEB 450
    store.updateSection(1, {
      name: 'HEB 450',
      a: 0.02181,
      iy: 0.00079890,
      iz: 0.00011720,
      j: 0.000004305,
      h: 0.45,
      b: 0.3,
      shape: 'I',
      tw: 0.014,
      tf: 0.026,
    });
    // Section 2: Diagrid CHS 244x10 (perimeter diagonals + rings)
    const diagridSecId = store.addSection({
      name: 'CHS 244×10',
      a: 0.00736,
      iy: 0.00001920,
      iz: 0.00001920,
      j: 0.00003840,
      h: 0.244,
      b: 0.244,
    });
    // Section 3: Core beam IPE 300
    const coreBeamSecId = store.addSection({
      name: 'IPE 300',
      a: 0.00538,
      iy: 0.00008356,
      iz: 0.00000604,
      j: 0.000000201,
      h: 0.3,
      b: 0.15,
      shape: 'I',
      tw: 0.0071,
      tf: 0.0107,
    });

    const levelH = p.H / p.nLevels;
    const perimeter: number[][] = [];
    const core: number[][] = [];
    const coreWidthX = Math.max(10, p.baseRadiusX * 0.32);
    const coreWidthZ = Math.max(10, p.baseRadiusZ * 0.32);

    // Gherkin-like profile: subtle swell at ~25% height, smooth taper to crown
    const radiusAt = (base: number, top: number, alpha: number) => {
      // Sinusoidal swell: peaks at ~25% height, 6% wider than base
      const swell = 1 + 0.06 * Math.sin(Math.PI * Math.min(alpha / 0.5, 1));
      // Smooth taper envelope from base to top
      const smooth = alpha * alpha * (3 - 2 * alpha); // smoothstep
      const envelope = base + smooth * (top - base);
      // Sharper pinch in the top 10%
      const pinch = alpha > 0.90 ? 1 - 0.25 * ((alpha - 0.90) / 0.10) : 1;
      return envelope * swell * pinch;
    };

    for (let lev = 0; lev <= p.nLevels; lev++) {
      const y = lev * levelH;
      const alpha = lev / p.nLevels;
      const rx = radiusAt(p.baseRadiusX, p.topRadiusX, alpha);
      const rz = radiusAt(p.baseRadiusZ, p.topRadiusZ, alpha);

      perimeter[lev] = [];
      for (let i = 0; i < p.nSides; i++) {
        const theta = (2 * Math.PI * i) / p.nSides;
        perimeter[lev].push(store.addNode(rx * Math.cos(theta), y, rz * Math.sin(theta)));
      }

      const cx = coreWidthX * (1 - 0.18 * alpha);
      const cz = coreWidthZ * (1 - 0.18 * alpha);
      core[lev] = [
        store.addNode(-cx / 2, y, -cz / 2),
        store.addNode(cx / 2, y, -cz / 2),
        store.addNode(cx / 2, y, cz / 2),
        store.addNode(-cx / 2, y, cz / 2),
      ];
    }

    for (let lev = 0; lev < p.nLevels; lev++) {
      // Perimeter verticals + diagonals (section 2 = CHS 244×10)
      for (let i = 0; i < p.nSides; i++) {
        const next = (i + 1) % p.nSides;
        store.updateElementSection(store.addElement(perimeter[lev][i], perimeter[lev + 1][i], 'frame'), diagridSecId);
        if ((lev + i) % 2 === 0) {
          store.updateElementSection(store.addElement(perimeter[lev][i], perimeter[lev + 1][next], 'truss'), diagridSecId);
        } else {
          store.updateElementSection(store.addElement(perimeter[lev][next], perimeter[lev + 1][i], 'truss'), diagridSecId);
        }
      }

      // Core columns (section 1 = HEB 450, default)
      for (let c = 0; c < 4; c++) {
        store.addElement(core[lev][c], core[lev + 1][c], 'frame');
      }
    }

    for (let lev = 1; lev <= p.nLevels; lev++) {
      // Perimeter rings (section 2 = CHS 244×10)
      for (let i = 0; i < p.nSides; i++) {
        store.updateElementSection(store.addElement(perimeter[lev][i], perimeter[lev][(i + 1) % p.nSides], 'frame'), diagridSecId);
      }
      // Core beams (section 3 = IPE 300)
      for (let c = 0; c < 4; c++) {
        store.updateElementSection(store.addElement(core[lev][c], core[lev][(c + 1) % 4], 'frame'), coreBeamSecId);
      }

      // Radial floor framing from core to perimeter (section 3 = IPE 300)
      for (let face = 0; face < 4; face++) {
        const sideIdx = Math.round((face * p.nSides) / 4) % p.nSides;
        const sideIdx2 = Math.round(((face * p.nSides) / 4) + p.nSides / 8) % p.nSides;
        store.updateElementSection(store.addElement(core[lev][face], perimeter[lev][sideIdx], 'frame'), coreBeamSecId);
        store.updateElementSection(store.addElement(core[lev][face], perimeter[lev][sideIdx2], 'frame'), coreBeamSecId);
      }

      if (lev % 8 === 0 && lev < p.nLevels) {
        // Outrigger levels tie the core to multiple perimeter nodes.
        for (let face = 0; face < 4; face++) {
          const sideIdx = Math.round((face * p.nSides) / 4) % p.nSides;
          const sideIdxPrev = (sideIdx - 1 + p.nSides) % p.nSides;
          const sideIdxNext = (sideIdx + 1) % p.nSides;
          store.updateElementSection(store.addElement(core[lev][face], perimeter[lev][sideIdx], 'frame'), coreBeamSecId);
          store.updateElementSection(store.addElement(core[lev][face], perimeter[lev][sideIdxPrev], 'truss'), diagridSecId);
          store.updateElementSection(store.addElement(core[lev][face], perimeter[lev][sideIdxNext], 'truss'), diagridSecId);
        }
      }
    }

    // Crown dome: smooth transition from top perimeter to apex
    // Use the actual top perimeter radius (after profile pinch) as reference
    const crownLevel = p.nLevels;
    const topRx = radiusAt(p.baseRadiusX, p.topRadiusX, 1.0);
    const topRz = radiusAt(p.baseRadiusZ, p.topRadiusZ, 1.0);
    const crownRings: number[][] = [];
    // 4 dome rings: 75%, 50%, 30%, 12% of top perimeter radius
    const domeScales = [0.75, 0.50, 0.30, 0.12];
    const domeHeights = [0.35, 0.65, 0.90, 1.10]; // × levelH above H
    const domeSides = [p.nSides, p.nSides, Math.max(6, Math.floor(p.nSides / 2)), Math.max(4, Math.floor(p.nSides / 3))];

    for (let ring = 0; ring < domeScales.length; ring++) {
      const scale = domeScales[ring];
      const crownY = p.H + levelH * domeHeights[ring];
      const nPts = domeSides[ring];
      const ringNodes: number[] = [];
      for (let i = 0; i < nPts; i++) {
        const theta = (2 * Math.PI * i) / nPts;
        ringNodes.push(store.addNode(topRx * scale * Math.cos(theta), crownY, topRz * scale * Math.sin(theta)));
      }
      for (let i = 0; i < nPts; i++) {
        store.updateElementSection(store.addElement(ringNodes[i], ringNodes[(i + 1) % nPts], 'frame'), diagridSecId);
      }
      // Connect to previous ring or top perimeter
      const prev = ring === 0 ? perimeter[crownLevel] : crownRings[ring - 1];
      for (let i = 0; i < nPts; i++) {
        const pIdx = Math.round((i * prev.length) / nPts) % prev.length;
        store.updateElementSection(store.addElement(prev[pIdx], ringNodes[i], 'frame'), diagridSecId);
        // Triangulation diagonal
        const pIdx2 = (pIdx + 1) % prev.length;
        store.updateElementSection(store.addElement(prev[pIdx2], ringNodes[i], 'truss'), diagridSecId);
      }
      crownRings.push(ringNodes);
    }

    // Apex + spire (section 2 = CHS 244×10)
    const crownCenter = store.addNode(0, p.H + levelH * 1.25, 0);
    const mastTop = store.addNode(0, p.H + levelH * 2.2, 0);
    store.updateElementSection(store.addElement(crownCenter, mastTop, 'frame'), diagridSecId);
    const innerRing = crownRings[crownRings.length - 1];
    for (const nid of innerRing) store.updateElementSection(store.addElement(nid, crownCenter, 'frame'), diagridSecId);
    // Spire stays from second ring for visual drama
    const stayRing = crownRings[1];
    for (let i = 0; i < stayRing.length; i += 3) {
      store.updateElementSection(store.addElement(stayRing[i], mastTop, 'truss'), diagridSecId);
    }

    for (const nid of perimeter[0]) {
      store.addSupport(nid, 'fixed3d');
    }
    for (const nid of core[0]) {
      store.addSupport(nid, 'fixed3d');
    }

    for (let i = 0; i < p.nSides; i++) {
      const topNode = perimeter[p.nLevels][i];
      store.addNodalLoad3D(topNode, p.lateralLoad, -16, p.lateralLoad * 0.28, 0, 0, 0);
    }
    store.addNodalLoad3D(crownCenter, p.lateralLoad * 0.8, -40, 0, 0, 0, 0);
  });
}

// -------------------------------------------------------------------
// 6b. Geodesic dome — icosahedral subdivision, Buckminster Fuller style
// -------------------------------------------------------------------

export interface GeodesicDome3DParams {
  radius: number;        // dome radius (m)
  frequency: number;     // subdivision frequency (4-12, higher = more nodes)
  hemisphere: boolean;    // true = half sphere, false = full sphere
  selfWeightLoad: number; // nodal gravity load (kN, negative = down)
}

export function generateGeodesicDome3D(store: ModelStore, p: GeodesicDome3DParams): void {
  store.clear();
  store.model.name = t('ex.geodesicDome3D');

  store.batch(() => {
    // Section 1: CHS 114x5 (uniform geodesic dome)
    store.updateSection(1, {
      name: 'CHS 114×5',
      a: 0.00171,
      iy: 0.000002470,
      iz: 0.000002470,
      j: 0.000004940,
      h: 0.114,
      b: 0.114,
    });

    const R = p.radius;
    const freq = Math.max(2, Math.round(p.frequency));
    // Hemisphere cut: only keep vertices with Y >= cutY
    const cutY = p.hemisphere ? -R * 0.05 : -R * 1.1;

    // ── Icosahedron base vertices ──
    const phi = (1 + Math.sqrt(5)) / 2;
    const icoNorm = Math.sqrt(1 + phi * phi);
    const rawVerts: [number, number, number][] = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
    ];
    const icoVerts = rawVerts.map(([x, y, z]) => [x / icoNorm, y / icoNorm, z / icoNorm] as [number, number, number]);

    const icoFaces: [number, number, number][] = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];

    // Dedup map: rounded unit-sphere coords → node ID
    const vertMap = new Map<string, number>();
    const nodeCoords = new Map<number, { x: number; y: number; z: number }>();
    const edges = new Set<string>();

    const vertKey = (nx: number, ny: number, nz: number): string =>
      `${nx.toFixed(8)},${ny.toFixed(8)},${nz.toFixed(8)}`;

    // Returns node ID or -1 if below cut
    const getOrCreateNode = (x: number, y: number, z: number): number => {
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len, ny = y / len, nz = z / len;
      const sy = ny * R;
      if (sy < cutY) return -1; // below hemisphere cut
      const key = vertKey(nx, ny, nz);
      if (vertMap.has(key)) return vertMap.get(key)!;
      const sx = nx * R, sz = nz * R;
      const nodeId = store.addNode(sx, sy, sz);
      vertMap.set(key, nodeId);
      nodeCoords.set(nodeId, { x: sx, y: sy, z: sz });
      return nodeId;
    };

    const addEdge = (a: number, b: number) => {
      if (a < 0 || b < 0) return; // one end was cut
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const key = `${lo}-${hi}`;
      if (edges.has(key)) return;
      edges.add(key);
      store.addElement(a, b, 'frame');
    };

    // Subdivide each icosahedron face
    for (const [ia, ib, ic] of icoFaces) {
      const va = icoVerts[ia], vb = icoVerts[ib], vc = icoVerts[ic];

      const faceNodes: number[][] = [];
      for (let row = 0; row <= freq; row++) {
        faceNodes[row] = [];
        for (let col = 0; col <= freq - row; col++) {
          const u = row / freq;
          const v = col / freq;
          const w = 1 - u - v;
          faceNodes[row][col] = getOrCreateNode(
            w * va[0] + u * vb[0] + v * vc[0],
            w * va[1] + u * vb[1] + v * vc[1],
            w * va[2] + u * vb[2] + v * vc[2],
          );
        }
      }

      for (let row = 0; row <= freq; row++) {
        for (let col = 0; col <= freq - row; col++) {
          const n = faceNodes[row][col];
          if (col < freq - row) addEdge(n, faceNodes[row][col + 1]);
          if (row < freq) addEdge(n, faceNodes[row + 1][col]);
          if (row < freq && col > 0) addEdge(n, faceNodes[row + 1][col - 1]);
        }
      }
    }

    // ── Base ring + supports ──
    // Collect all created nodes, find the lowest band
    const allNodes = [...nodeCoords.entries()].map(([id, c]) => ({ id, ...c }));
    const minY = Math.min(...allNodes.map(n => n.y));
    const ringThreshold = minY + R * 0.12;
    const ringNodes = allNodes
      .filter(n => n.y <= ringThreshold)
      .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

    // Connect base ring circumferentially and pin
    for (let i = 0; i < ringNodes.length; i++) {
      const next = (i + 1) % ringNodes.length;
      addEdge(ringNodes[i].id, ringNodes[next].id);
      store.addSupport(ringNodes[i].id, 'pinned3d');
    }

    // Gravity loads on non-base nodes
    if (p.selfWeightLoad !== 0) {
      const ringSet = new Set(ringNodes.map(n => n.id));
      for (const n of allNodes) {
        if (!ringSet.has(n.id)) {
          store.addNodalLoad3D(n.id, 0, p.selfWeightLoad, 0, 0, 0, 0);
        }
      }
    }
  });
}

// -------------------------------------------------------------------
// 7a. Suspension bridge — parabolic cables, portal towers, stiffening truss
// -------------------------------------------------------------------

export interface SuspensionBridge3DParams {
  mainSpan: number;       // main span between towers (m)
  sideSpan: number;       // each approach span (m)
  deckWidth: number;      // total width (m)
  towerHeight: number;    // height above deck (m)
  sag: number;            // cable sag at midspan (m)
  nPanelsMain: number;    // panels in main span
  nPanelsSide: number;    // panels per side span
  trussDepth: number;     // stiffening truss depth (m)
  deckLoad: number;       // distributed load (kN/m, negative = down)
}

export function generateSuspensionBridge3D(store: ModelStore, p: SuspensionBridge3DParams): void {
  store.clear();
  store.model.name = t('ex.suspensionBridge3D');

  store.batch(() => {
    // Section 1: Main cable (big cable bundle)
    store.updateSection(1, {
      name: 'Main Cable',
      a: 0.020,
      iy: 0.0000318,
      iz: 0.0000318,
      j: 0.0000637,
      h: 0.16,
      b: 0.16,
    });
    // Section 2: Deck chord IPE 450
    const deckSecId = store.addSection({
      name: 'IPE 450',
      a: 0.00988,
      iy: 0.00033740,
      iz: 0.00001676,
      j: 0.000000669,
      h: 0.45,
      b: 0.19,
      shape: 'I',
      tw: 0.0094,
      tf: 0.0146,
    });
    // Section 3: Hanger/lateral L 80x80x8
    const hangerSecId = store.addSection({
      name: 'L 80×80×8',
      a: 0.00123,
      iy: 0.0000008,
      iz: 0.0000008,
      j: 0.00000002,
      h: 0.08,
      b: 0.08,
    });

    const hw = p.deckWidth / 2;
    const nMain = p.nPanelsMain;
    const nSide = p.nPanelsSide;
    const dxMain = p.mainSpan / nMain;
    const dxSide = p.sideSpan / nSide;
    const deckY = 0;
    const towerX1 = p.sideSpan;           // left tower x
    const towerX2 = p.sideSpan + p.mainSpan; // right tower x
    const totalLen = 2 * p.sideSpan + p.mainSpan;

    // Cable profile: parabola y(x) = towerHeight - sag * (2x/L - 1)^2
    // where x is measured from tower1, L = mainSpan
    // At towers (x=0, x=L): y = towerHeight - sag*(1) = towerHeight - sag  ... no
    // Better: y(x) = towerHeight - 4*sag*(x/L)*(1 - x/L)
    // At x=0 and x=L: y = towerHeight. At x=L/2: y = towerHeight - sag.
    const cableY = (xFromTower1: number): number => {
      const t = xFromTower1 / p.mainSpan;
      return deckY + p.towerHeight - 4 * p.sag * t * (1 - t);
    };

    // Side span cable: linear from anchorage (ground level) to tower top
    const towerTopY = deckY + p.towerHeight;
    const anchorY = deckY - 4; // anchorages slightly below deck

    // ── Upper deck (stiffening truss top chord) ──
    // Laid out as left-side-span | main-span | right-side-span
    const allX: number[] = [];
    // Left side span
    for (let i = 0; i <= nSide; i++) allX.push(i * dxSide);
    // Main span (skip tower1 position, already added)
    for (let i = 1; i <= nMain; i++) allX.push(towerX1 + i * dxMain);
    // Right side span (skip tower2 position, already added)
    for (let i = 1; i <= nSide; i++) allX.push(towerX2 + i * dxSide);

    const totalPanels = allX.length - 1;
    const towerIdx1 = nSide;             // index in allX for tower1
    const towerIdx2 = nSide + nMain;     // index in allX for tower2

    // Deck nodes: upper chord (deck level) and lower chord (truss bottom)
    const upperL: number[] = []; // upper left
    const upperR: number[] = []; // upper right
    const lowerL: number[] = []; // lower left
    const lowerR: number[] = []; // lower right

    for (let i = 0; i < allX.length; i++) {
      const x = allX[i];
      upperL.push(store.addNode(x, deckY, -hw));
      upperR.push(store.addNode(x, deckY, hw));
      lowerL.push(store.addNode(x, deckY - p.trussDepth, -hw));
      lowerR.push(store.addNode(x, deckY - p.trussDepth, hw));
    }

    // Longitudinal chords + loads (section 2 = IPE 450)
    for (let i = 0; i < totalPanels; i++) {
      const eUL = store.addElement(upperL[i], upperL[i + 1], 'frame');
      store.updateElementSection(eUL, deckSecId);
      const eUR = store.addElement(upperR[i], upperR[i + 1], 'frame');
      store.updateElementSection(eUR, deckSecId);
      const eLL = store.addElement(lowerL[i], lowerL[i + 1], 'frame');
      store.updateElementSection(eLL, deckSecId);
      const eLR = store.addElement(lowerR[i], lowerR[i + 1], 'frame');
      store.updateElementSection(eLR, deckSecId);
      if (p.deckLoad !== 0) {
        store.addDistributedLoad3D(eUL, 0, p.deckLoad, 0, p.deckLoad);
        store.addDistributedLoad3D(eUR, 0, p.deckLoad, 0, p.deckLoad);
      }
    }

    // Cross beams + verticals + diagonals at every panel point (section 3 = L 80×80×8)
    for (let i = 0; i < allX.length; i++) {
      // Cross beams at deck and lower chord
      const cb1 = store.addElement(upperL[i], upperR[i], 'frame');
      store.updateElementSection(cb1, hangerSecId);
      const cb2 = store.addElement(lowerL[i], lowerR[i], 'frame');
      store.updateElementSection(cb2, hangerSecId);
      // Verticals connecting upper to lower chord
      const v1 = store.addElement(upperL[i], lowerL[i], 'frame');
      store.updateElementSection(v1, hangerSecId);
      const v2 = store.addElement(upperR[i], lowerR[i], 'frame');
      store.updateElementSection(v2, hangerSecId);
    }

    // Warren diagonals in stiffening truss (both sides) (section 3 = L 80×80×8)
    for (let i = 0; i < totalPanels; i++) {
      if (i % 2 === 0) {
        const d1 = store.addElement(upperL[i], lowerL[i + 1], 'truss');
        store.updateElementSection(d1, hangerSecId);
        const d2 = store.addElement(upperR[i], lowerR[i + 1], 'truss');
        store.updateElementSection(d2, hangerSecId);
      } else {
        const d1 = store.addElement(lowerL[i], upperL[i + 1], 'truss');
        store.updateElementSection(d1, hangerSecId);
        const d2 = store.addElement(lowerR[i], upperR[i + 1], 'truss');
        store.updateElementSection(d2, hangerSecId);
      }
    }

    // Horizontal wind bracing on lower chord plane (section 3 = L 80×80×8)
    for (let i = 0; i < totalPanels; i++) {
      if (i % 2 === 0) {
        const wb = store.addElement(lowerL[i], lowerR[i + 1], 'truss');
        store.updateElementSection(wb, hangerSecId);
      } else {
        const wb = store.addElement(lowerR[i], lowerL[i + 1], 'truss');
        store.updateElementSection(wb, hangerSecId);
      }
    }

    // ── Portal towers ──
    const buildTower = (deckIdx: number) => {
      const x = allX[deckIdx];
      const legInset = hw * 0.15; // legs slightly inside deck edges
      const topY = towerTopY;
      const midY = topY * 0.55;
      const portalY = topY * 0.80; // portal cross-beam

      // Tower legs (4 nodes: base inner-left, inner-right, outer-left, outer-right)
      const baseLZ = -hw + legInset;
      const baseRZ = hw - legInset;

      // Base (at deck level, connected to deck)
      const bL = store.addNode(x, deckY, baseLZ);
      const bR = store.addNode(x, deckY, baseRZ);
      // Mid height
      const mL = store.addNode(x, midY, baseLZ);
      const mR = store.addNode(x, midY, baseRZ);
      // Portal beam height
      const pL = store.addNode(x, portalY, baseLZ);
      const pR = store.addNode(x, portalY, baseRZ);
      // Top (saddle points for main cable)
      const tL = store.addNode(x, topY, baseLZ);
      const tR = store.addNode(x, topY, baseRZ);

      // Legs (section 2 = IPE 450)
      store.updateElementSection(store.addElement(bL, mL, 'frame'), deckSecId);
      store.updateElementSection(store.addElement(mL, pL, 'frame'), deckSecId);
      store.updateElementSection(store.addElement(pL, tL, 'frame'), deckSecId);
      store.updateElementSection(store.addElement(bR, mR, 'frame'), deckSecId);
      store.updateElementSection(store.addElement(mR, pR, 'frame'), deckSecId);
      store.updateElementSection(store.addElement(pR, tR, 'frame'), deckSecId);

      // Cross beams (section 3 = L 80×80×8)
      store.updateElementSection(store.addElement(mL, mR, 'frame'), hangerSecId);
      store.updateElementSection(store.addElement(pL, pR, 'frame'), hangerSecId);
      store.updateElementSection(store.addElement(tL, tR, 'frame'), hangerSecId);

      // K-bracing between cross beams for stiffness (section 3 = L 80×80×8)
      store.updateElementSection(store.addElement(mL, pR, 'truss'), hangerSecId);
      store.updateElementSection(store.addElement(mR, pL, 'truss'), hangerSecId);
      store.updateElementSection(store.addElement(pL, tR, 'truss'), hangerSecId);
      store.updateElementSection(store.addElement(pR, tL, 'truss'), hangerSecId);

      // Connect tower base to deck (section 2 = IPE 450)
      store.updateElementSection(store.addElement(bL, upperL[deckIdx], 'frame'), deckSecId);
      store.updateElementSection(store.addElement(bR, upperR[deckIdx], 'frame'), deckSecId);
      store.updateElementSection(store.addElement(bL, lowerL[deckIdx], 'frame'), deckSecId);
      store.updateElementSection(store.addElement(bR, lowerR[deckIdx], 'frame'), deckSecId);

      // Fixed supports at tower base
      store.addSupport(bL, 'fixed3d');
      store.addSupport(bR, 'fixed3d');

      return { topL: tL, topR: tR, baseL: bL, baseR: bR, baseLZ, baseRZ };
    };

    const tower1 = buildTower(towerIdx1);
    const tower2 = buildTower(towerIdx2);

    // ── Main cables (parabolic) + hangers ──
    const mainCableL: number[] = [];
    const mainCableR: number[] = [];

    // Cable nodes at every main-span panel point
    for (let i = 0; i <= nMain; i++) {
      const x = towerX1 + i * dxMain;
      const y = cableY(i * dxMain);
      if (i === 0) {
        // At tower — reuse tower top nodes
        mainCableL.push(tower1.topL);
        mainCableR.push(tower1.topR);
      } else if (i === nMain) {
        mainCableL.push(tower2.topL);
        mainCableR.push(tower2.topR);
      } else {
        mainCableL.push(store.addNode(x, y, tower1.baseLZ));
        mainCableR.push(store.addNode(x, y, tower1.baseRZ));
      }
    }

    // Cable longitudinal elements
    for (let i = 0; i < nMain; i++) {
      store.addElement(mainCableL[i], mainCableL[i + 1], 'truss');
      store.addElement(mainCableR[i], mainCableR[i + 1], 'truss');
    }

    // Vertical hangers from cable to deck (skip tower positions) (section 3 = L 80×80×8)
    for (let i = 1; i < nMain; i++) {
      const deckIdx = towerIdx1 + i;
      store.updateElementSection(store.addElement(mainCableL[i], upperL[deckIdx], 'truss'), hangerSecId);
      store.updateElementSection(store.addElement(mainCableR[i], upperR[deckIdx], 'truss'), hangerSecId);
    }

    // ── Side span cables (straight from tower top to anchorage) ──
    // Left side: from anchor (x=0) to tower1 top
    const anchorLL = store.addNode(0, anchorY, tower1.baseLZ);
    const anchorLR = store.addNode(0, anchorY, tower1.baseRZ);
    store.addSupport(anchorLL, 'fixed3d');
    store.addSupport(anchorLR, 'fixed3d');

    // Intermediate cable nodes on left side span
    const sideCableNodesL_L: number[] = [anchorLL];
    const sideCableNodesL_R: number[] = [anchorLR];
    for (let i = 1; i < nSide; i++) {
      const x = i * dxSide;
      const frac = i / nSide;
      const y = anchorY + frac * (towerTopY - anchorY);
      sideCableNodesL_L.push(store.addNode(x, y, tower1.baseLZ));
      sideCableNodesL_R.push(store.addNode(x, y, tower1.baseRZ));
    }
    sideCableNodesL_L.push(tower1.topL);
    sideCableNodesL_R.push(tower1.topR);

    for (let i = 0; i < nSide; i++) {
      store.addElement(sideCableNodesL_L[i], sideCableNodesL_L[i + 1], 'truss');
      store.addElement(sideCableNodesL_R[i], sideCableNodesL_R[i + 1], 'truss');
    }
    // Hangers on left side span (section 3 = L 80×80×8)
    for (let i = 1; i < nSide; i++) {
      store.updateElementSection(store.addElement(sideCableNodesL_L[i], upperL[i], 'truss'), hangerSecId);
      store.updateElementSection(store.addElement(sideCableNodesL_R[i], upperR[i], 'truss'), hangerSecId);
    }

    // Right side: from tower2 top to anchor (x=totalLen)
    const anchorRL = store.addNode(totalLen, anchorY, tower2.baseLZ);
    const anchorRR = store.addNode(totalLen, anchorY, tower2.baseRZ);
    store.addSupport(anchorRL, 'fixed3d');
    store.addSupport(anchorRR, 'fixed3d');

    const sideCableNodesR_L: number[] = [tower2.topL];
    const sideCableNodesR_R: number[] = [tower2.topR];
    for (let i = 1; i < nSide; i++) {
      const x = towerX2 + i * dxSide;
      const frac = i / nSide;
      const y = towerTopY + frac * (anchorY - towerTopY);
      sideCableNodesR_L.push(store.addNode(x, y, tower2.baseLZ));
      sideCableNodesR_R.push(store.addNode(x, y, tower2.baseRZ));
    }
    sideCableNodesR_L.push(anchorRL);
    sideCableNodesR_R.push(anchorRR);

    for (let i = 0; i < nSide; i++) {
      store.addElement(sideCableNodesR_L[i], sideCableNodesR_L[i + 1], 'truss');
      store.addElement(sideCableNodesR_R[i], sideCableNodesR_R[i + 1], 'truss');
    }
    // Hangers on right side span (section 3 = L 80×80×8)
    for (let i = 1; i < nSide; i++) {
      const deckIdx = towerIdx2 + i;
      store.updateElementSection(store.addElement(sideCableNodesR_L[i], upperL[deckIdx], 'truss'), hangerSecId);
      store.updateElementSection(store.addElement(sideCableNodesR_R[i], upperR[deckIdx], 'truss'), hangerSecId);
    }

    // ── Abutment supports (pinned — allow thermal expansion) ──
    store.addSupport(upperL[0], 'pinned3d');
    store.addSupport(upperR[0], 'pinned3d');
    store.addSupport(upperL[allX.length - 1], 'pinned3d');
    store.addSupport(upperR[allX.length - 1], 'pinned3d');
    store.addSupport(lowerL[0], 'pinned3d');
    store.addSupport(lowerR[0], 'pinned3d');
    store.addSupport(lowerL[allX.length - 1], 'pinned3d');
    store.addSupport(lowerR[allX.length - 1], 'pinned3d');
  });
}

// -------------------------------------------------------------------
// 7b. Cable-stayed bridge — dual H-pylon with semi-fan cables
// -------------------------------------------------------------------

export interface CableStayedBridge3DParams {
  span: number;
  deckWidth: number;
  pylonHeight: number;
  nPanels: number;
  deckLoad: number;
}

export function generateCableStayedBridge3D(store: ModelStore, p: CableStayedBridge3DParams): void {
  store.clear();
  store.model.name = t('ex.cableStayedBridge3D');

  store.batch(() => {
    // Section 1: Pylon HEB 500
    store.updateSection(1, {
      name: 'HEB 500',
      a: 0.02386,
      iy: 0.00107200,
      iz: 0.00012620,
      j: 0.000004917,
      h: 0.5,
      b: 0.3,
      shape: 'I',
      tw: 0.0145,
      tf: 0.028,
    });
    // Section 2: Deck IPE 400
    const deckSecId = store.addSection({
      name: 'IPE 400',
      a: 0.00845,
      iy: 0.00023130,
      iz: 0.00001318,
      j: 0.000000510,
      h: 0.4,
      b: 0.18,
      shape: 'I',
      tw: 0.0086,
      tf: 0.0135,
    });
    // Section 3: Stay cable
    const cableSecId = store.addSection({
      name: 'Stay Cable',
      a: 0.005,
      iy: 0.000002,
      iz: 0.000002,
      j: 0.000004,
      h: 0.08,
      b: 0.08,
    });

    const n = p.nPanels;
    const dx = p.span / n;
    const hw = p.deckWidth / 2; // half-width
    const deckY = 0;

    // ── Deck: two edge girders + cross beams ──
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i <= n; i++) {
      left.push(store.addNode(i * dx, deckY, -hw));
      right.push(store.addNode(i * dx, deckY, hw));
    }
    // Deck longitudinal girders (section 2 = IPE 400)
    for (let i = 0; i < n; i++) {
      const eL = store.addElement(left[i], left[i + 1], 'frame');
      store.updateElementSection(eL, deckSecId);
      const eR = store.addElement(right[i], right[i + 1], 'frame');
      store.updateElementSection(eR, deckSecId);
      if (p.deckLoad !== 0) {
        store.addDistributedLoad3D(eL, 0, p.deckLoad, 0, p.deckLoad);
        store.addDistributedLoad3D(eR, 0, p.deckLoad, 0, p.deckLoad);
      }
    }
    // Cross beams (section 2 = IPE 400)
    for (let i = 0; i <= n; i++) {
      const cb = store.addElement(left[i], right[i], 'frame');
      store.updateElementSection(cb, deckSecId);
    }

    // ── H-pylons at ~1/4 and ~3/4 of span ──
    const pIdx1 = Math.round(n * 0.25); // deck panel index for pylon 1
    const pIdx2 = Math.round(n * 0.75); // deck panel index for pylon 2
    const pH = p.pylonHeight;

    const buildHPylon = (deckIdx: number) => {
      const x = deckIdx * dx;
      // Two vertical legs at deck edges, rising to full height
      const legL = store.addNode(x, pH, -hw);
      const legR = store.addNode(x, pH, hw);
      store.addElement(left[deckIdx], legL, 'frame'); // left leg
      store.addElement(right[deckIdx], legR, 'frame'); // right leg
      // Cross-beam at top
      store.addElement(legL, legR, 'frame');
      // Cross-beam at 2/3 height for stiffness
      const midL = store.addNode(x, pH * 0.65, -hw);
      const midR = store.addNode(x, pH * 0.65, hw);
      store.addElement(left[deckIdx], midL, 'frame');
      store.addElement(right[deckIdx], midR, 'frame');
      store.addElement(midL, midR, 'frame');
      store.addElement(midL, legL, 'frame');
      store.addElement(midR, legR, 'frame');
      // Supports at deck level under pylon
      store.addSupport(left[deckIdx], 'fixed3d');
      store.addSupport(right[deckIdx], 'fixed3d');
      return { topL: legL, topR: legR };
    };

    const pylon1 = buildHPylon(pIdx1);
    const pylon2 = buildHPylon(pIdx2);

    // ── Semi-fan cables ──
    // Each pylon has cables fanning from near its top to deck points
    // on both sides (toward midspan and toward abutment)
    const nCables = Math.min(6, Math.floor((pIdx2 - pIdx1) / 2) - 1);
    const hTop = pH * 0.95;
    const hBot = pH * 0.70;

    const addCablePair = (
      pylonTopL: number, pylonTopR: number,
      pylonX: number, cableH: number,
      deckIdx: number,
    ) => {
      // Cable anchor nodes on pylon at cableH
      const anchL = store.addNode(pylonX, cableH, -hw);
      const anchR = store.addNode(pylonX, cableH, hw);
      // Connect anchors into pylon shaft
      store.addElement(anchL, pylonTopL, 'frame');
      store.addElement(anchR, pylonTopR, 'frame');
      // Cables from anchors to deck (section 3 = Stay Cable)
      store.updateElementSection(store.addElement(anchL, left[deckIdx], 'truss'), cableSecId);
      store.updateElementSection(store.addElement(anchR, right[deckIdx], 'truss'), cableSecId);
    };

    for (let c = 1; c <= nCables; c++) {
      const hFrac = c / (nCables + 1);
      const h = hBot + hFrac * (hTop - hBot);

      // Pylon 1: cables toward midspan (right) and toward abutment (left)
      const toMid1 = pIdx1 + c * 2;
      const toEnd1 = pIdx1 - c * 2;
      if (toMid1 < pIdx2) addCablePair(pylon1.topL, pylon1.topR, pIdx1 * dx, h, toMid1);
      if (toEnd1 >= 0) addCablePair(pylon1.topL, pylon1.topR, pIdx1 * dx, h, toEnd1);

      // Pylon 2: cables toward midspan (left) and toward abutment (right)
      const toMid2 = pIdx2 - c * 2;
      const toEnd2 = pIdx2 + c * 2;
      if (toMid2 > pIdx1) addCablePair(pylon2.topL, pylon2.topR, pIdx2 * dx, h, toMid2);
      if (toEnd2 <= n) addCablePair(pylon2.topL, pylon2.topR, pIdx2 * dx, h, toEnd2);
    }

    // ── Abutment supports ──
    store.addSupport(left[0], 'pinned3d');
    store.addSupport(right[0], 'pinned3d');
    store.addSupport(left[n], 'pinned3d');
    store.addSupport(right[n], 'pinned3d');
  });
}

// -------------------------------------------------------------------
// 7. Stadium canopy — cantilever roof with back columns
// -------------------------------------------------------------------

export interface StadiumCanopy3DParams {
  span: number;
  depth: number;
  nFrames: number;
  roofLoad: number;
  columnHeight: number;
}

export function generateStadiumCanopy3D(store: ModelStore, p: StadiumCanopy3DParams): void {
  store.clear();
  store.model.name = t('ex.stadiumCanopy3D');

  store.batch(() => {
    const dx = p.span / p.nFrames;
    const base: number[] = [];
    const backTop: number[] = [];
    const backMid: number[] = [];
    const frontTop: number[] = [];
    const frontMid: number[] = [];
    const roofSlope = -0.08; // slight downward slope for drainage

    for (let i = 0; i <= p.nFrames; i++) {
      const x = i * dx;
      const frontY = p.columnHeight + p.depth * roofSlope;
      base.push(store.addNode(x, 0, 0));
      backTop.push(store.addNode(x, p.columnHeight, 0));
      backMid.push(store.addNode(x, p.columnHeight * 0.6, 0));
      frontTop.push(store.addNode(x, frontY, p.depth));
      frontMid.push(store.addNode(x, frontY - 2.5, p.depth));
    }

    // Columns with mid-height bracing node
    for (let i = 0; i <= p.nFrames; i++) {
      store.addElement(base[i], backMid[i], 'frame');
      store.addElement(backMid[i], backTop[i], 'frame');
      // Cantilever rafters (upper + lower chord for truss depth)
      store.addElement(backTop[i], frontTop[i], 'frame');
      store.addElement(backMid[i], frontMid[i], 'frame');
      // Verticals at front tip
      store.addElement(frontMid[i], frontTop[i], 'frame');
      store.addSupport(base[i], 'fixed3d');
    }

    for (let i = 0; i < p.nFrames; i++) {
      // Longitudinal beams
      store.addElement(backTop[i], backTop[i + 1], 'frame');
      store.addElement(backMid[i], backMid[i + 1], 'frame');
      const eTop = store.addElement(frontTop[i], frontTop[i + 1], 'frame');
      store.addElement(frontMid[i], frontMid[i + 1], 'frame');
      if (p.roofLoad !== 0) {
        store.addDistributedLoad3D(eTop, 0, p.roofLoad, 0, p.roofLoad);
      }
      // Roof plane X-bracing (upper chord)
      store.addElement(backTop[i], frontTop[i + 1], 'truss');
      store.addElement(frontTop[i], backTop[i + 1], 'truss');
      // Warren diagonals between upper and lower chords
      store.addElement(backTop[i], frontMid[i], 'truss');
      store.addElement(frontTop[i], backMid[i], 'truss');
    }
  });
}

// -------------------------------------------------------------------
// 8. Full stadium — bowl + perimeter roof ring
// -------------------------------------------------------------------

export interface FullStadium3DParams {
  majorRadius: number;
  minorRadius: number;
  innerMajorRadius: number;
  innerMinorRadius: number;
  roofRise: number;
  nFrames: number;
  roofLoad: number;
}

export function generateFullStadium3D(store: ModelStore, p: FullStadium3DParams): void {
  store.clear();
  store.model.name = t('ex.fullStadium3D');

  store.batch(() => {
    // Section 1: Main ring beam IPE 300
    store.updateSection(1, {
      name: 'IPE 300',
      a: 0.00538,
      iy: 0.00008356,
      iz: 0.00000604,
      j: 0.000000201,
      h: 0.3,
      b: 0.15,
      shape: 'I',
      tw: 0.0071,
      tf: 0.0107,
    });
    // Section 2: Roof truss CHS 168x6
    const roofSecId = store.addSection({
      name: 'CHS 168×6',
      a: 0.00305,
      iy: 0.000003880,
      iz: 0.000003880,
      j: 0.000007760,
      h: 0.168,
      b: 0.168,
    });

    const fieldLength = 105;
    const fieldWidth = 68;
    const fieldHalfX = fieldLength / 2;
    const fieldHalfZ = fieldWidth / 2;
    const n = p.nFrames;

    const ovalRing = (rx: number, rz: number, y: number, crown = 0, bias = 0) => {
      const ids: number[] = [];
      for (let i = 0; i < n; i++) {
        const theta = (2 * Math.PI * i) / n;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const crownLift = Math.max(0, Math.cos(theta * 2)) * crown;
        const mainStandBias = Math.max(0, s) * bias;
        ids.push(store.addNode(rx * c, y + crownLift + mainStandBias, rz * s));
      }
      return ids;
    };

    const fieldEdge = ovalRing(fieldHalfX + 7, fieldHalfZ + 6, 0.8);
    const lowerFront = ovalRing(fieldHalfX + 14, fieldHalfZ + 11, 5.5);
    const lowerMid = ovalRing(fieldHalfX + 24, fieldHalfZ + 18, 11.5);
    const lowerBack = ovalRing(fieldHalfX + 34, fieldHalfZ + 27, 16.5, 0, 1.5);
    const upperFront = ovalRing(fieldHalfX + 39, fieldHalfZ + 31, 20.5, 0, 2.5);
    const upperMid = ovalRing(fieldHalfX + 50, fieldHalfZ + 39, 27.5, 1, 4.5);
    const upperBack = ovalRing(fieldHalfX + 62, fieldHalfZ + 49, 35, 2, 6.5);
    const concourse = ovalRing(fieldHalfX + 71, fieldHalfZ + 57, 38, 1, 4);
    // Roof truss: upper chord (high) + lower chord (at concourse height) = depth
    const roofLowerInner = ovalRing(fieldHalfX + 76, fieldHalfZ + 61, 40, 0, 3);
    const roofLowerOuter = ovalRing(fieldHalfX + 93, fieldHalfZ + 74, 39, 0, 2);
    const roofUpperInner = ovalRing(fieldHalfX + 76, fieldHalfZ + 61, 47, 2, 4);
    const roofUpperOuter = ovalRing(fieldHalfX + 93, fieldHalfZ + 74, p.roofRise + 18, 4, 5);
    const baseInner = ovalRing(fieldHalfX + 40, fieldHalfZ + 31, 0);
    const baseOuter = ovalRing(fieldHalfX + 73, fieldHalfZ + 58, 0);
    const facadeTop = ovalRing(fieldHalfX + 73, fieldHalfZ + 58, 12);

    const addRingFrames = (nodes: number[], type: 'frame' | 'truss' = 'frame', secId?: number) => {
      for (let i = 0; i < n; i++) {
        const eid = store.addElement(nodes[i], nodes[(i + 1) % n], type);
        if (secId !== undefined) store.updateElementSection(eid, secId);
      }
    };

    // Ring/raker/tier elements = section 1 (IPE 300, default)
    addRingFrames(baseInner);
    addRingFrames(baseOuter);
    addRingFrames(fieldEdge);
    addRingFrames(lowerFront);
    addRingFrames(lowerMid);
    addRingFrames(lowerBack);
    addRingFrames(upperFront);
    addRingFrames(upperMid);
    addRingFrames(upperBack);
    addRingFrames(concourse);
    // Roof truss rings = section 2 (CHS 168×6)
    addRingFrames(roofLowerInner, 'frame', roofSecId);
    addRingFrames(roofLowerOuter, 'frame', roofSecId);
    addRingFrames(roofUpperInner, 'frame', roofSecId);
    addRingFrames(roofUpperOuter, 'frame', roofSecId);
    addRingFrames(facadeTop);

    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;

      // Tier shells for a readable bowl
      store.addQuad([fieldEdge[i], fieldEdge[next], lowerFront[next], lowerFront[i]], 1, 0.18);
      store.addQuad([lowerFront[i], lowerFront[next], lowerMid[next], lowerMid[i]], 1, 0.18);
      store.addQuad([lowerMid[i], lowerMid[next], lowerBack[next], lowerBack[i]], 1, 0.18);
      store.addQuad([lowerBack[i], lowerBack[next], upperFront[next], upperFront[i]], 1, 0.16);
      store.addQuad([upperFront[i], upperFront[next], upperMid[next], upperMid[i]], 1, 0.16);
      store.addQuad([upperMid[i], upperMid[next], upperBack[next], upperBack[i]], 1, 0.16);

      // Bowl framing kept regular and legible
      store.addElement(fieldEdge[i], lowerFront[i], 'frame');
      store.addElement(lowerFront[i], lowerMid[i], 'frame');
      store.addElement(lowerMid[i], lowerBack[i], 'frame');
      store.addElement(lowerBack[i], upperFront[i], 'frame');
      store.addElement(upperFront[i], upperMid[i], 'frame');
      store.addElement(upperMid[i], upperBack[i], 'frame');
      store.addElement(upperBack[i], concourse[i], 'frame');

      if (i % 4 === 0) {
        store.addElement(fieldEdge[i], lowerMid[next], 'truss');
        store.addElement(lowerBack[i], upperMid[next], 'truss');
      }

      // ── Roof space truss (section 2 = CHS 168×6) ──
      // Verticals: lower chord → upper chord
      store.updateElementSection(store.addElement(roofLowerInner[i], roofUpperInner[i], 'frame'), roofSecId);
      store.updateElementSection(store.addElement(roofLowerOuter[i], roofUpperOuter[i], 'frame'), roofSecId);
      // Radial chords (inner → outer)
      store.updateElementSection(store.addElement(roofLowerInner[i], roofLowerOuter[i], 'frame'), roofSecId);
      store.updateElementSection(store.addElement(roofUpperInner[i], roofUpperOuter[i], 'frame'), roofSecId);
      // Diagonals within truss depth (Warren pattern)
      store.updateElementSection(store.addElement(roofLowerInner[i], roofUpperOuter[i], 'truss'), roofSecId);
      store.updateElementSection(store.addElement(roofUpperInner[i], roofLowerOuter[i], 'truss'), roofSecId);
      // Cross-bay diagonals on upper chord for lateral stiffness
      store.updateElementSection(store.addElement(roofUpperInner[i], roofUpperOuter[next], 'truss'), roofSecId);
      // Connect concourse to lower chord
      store.updateElementSection(store.addElement(concourse[i], roofLowerInner[i], 'frame'), roofSecId);
      // Roof loads on upper chord rings
      if (p.roofLoad !== 0) {
        const ringA = store.addElement(roofUpperInner[i], roofUpperInner[next], 'frame');
        store.updateElementSection(ringA, roofSecId);
        const ringB = store.addElement(roofUpperOuter[i], roofUpperOuter[next], 'frame');
        store.updateElementSection(ringB, roofSecId);
        store.addDistributedLoad3D(ringA, 0, p.roofLoad, 0, p.roofLoad);
        store.addDistributedLoad3D(ringB, 0, p.roofLoad, 0, p.roofLoad);
      }

      // Facade and support structure
      store.addElement(baseInner[i], lowerBack[i], 'frame');
      store.addElement(baseOuter[i], facadeTop[i], 'frame');
      store.addElement(facadeTop[i], concourse[i], 'frame');
      if (i % 2 === 0) {
        store.addElement(baseOuter[i], concourse[i], 'frame');
      }
      // Roof support masts every 4th bay
      if (i % 4 === 0) {
        store.addElement(baseOuter[i], roofLowerOuter[i], 'frame');
        store.addElement(facadeTop[i], roofLowerInner[i], 'truss');
      }

      store.addSupport(baseInner[i], 'fixed3d');
      store.addSupport(baseOuter[i], 'fixed3d');
    }
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
        { key: 'nBaysX', label: t('tmpl.baysX'), unit: '', default: 4, min: 1, max: 6, step: 1, integer: true },
        { key: 'nBaysY', label: t('tmpl.baysZ'), unit: '', default: 4, min: 1, max: 6, step: 1, integer: true },
        { key: 'nFloors', label: t('tmpl.floors'), unit: '', default: 4, min: 1, max: 10, step: 1, integer: true },
        { key: 'bayWidth', label: t('tmpl.bayWidth'), unit: 'm', default: 6, min: 2, max: 15, step: 0.5 },
        { key: 'storyHeight', label: t('tmpl.floorHeight'), unit: 'm', default: 3.6, min: 2, max: 6, step: 0.5 },
        { key: 'q', label: t('tmpl.beamLoad'), unit: 'kN/m', default: -16, min: -100, max: 100, step: 1 },
      ],
      generate: (s, p) => generateSpaceFrame3D(s, {
        nBaysX: p?.nBaysX ?? 4, nBaysY: p?.nBaysY ?? 4, nFloors: p?.nFloors ?? 4,
        bayWidth: p?.bayWidth ?? 6, storyHeight: p?.storyHeight ?? 3.6, q: p?.q ?? -16,
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
        { key: 'H', label: t('tmpl.totalHeight'), unit: 'm', default: 24, min: 4, max: 40, step: 0.5 },
        { key: 'nLevels', label: t('tmpl.levels'), unit: '', default: 6, min: 2, max: 10, step: 1, integer: true },
        { key: 'baseWidth', label: t('tmpl.baseWidth'), unit: 'm', default: 6, min: 1, max: 10, step: 0.5 },
        { key: 'topWidth', label: t('tmpl.topWidth'), unit: 'm', default: 3.5, min: 0.5, max: 10, step: 0.5 },
        { key: 'lateralLoad', label: t('tmpl.lateralLoad'), unit: 'kN', default: 18, min: 0, max: 100, step: 1 },
      ],
      generate: (s, p) => generateTower3D(s, {
        H: p?.H ?? 24, nLevels: p?.nLevels ?? 6, baseWidth: p?.baseWidth ?? 6,
        topWidth: p?.topWidth ?? 3.5, withBracing: true, lateralLoad: p?.lateralLoad ?? 18,
      }),
    },
  ];
}

/** @deprecated Use getTemplateCatalog3D() instead */
export const TEMPLATE_CATALOG_3D = getTemplateCatalog3D();
