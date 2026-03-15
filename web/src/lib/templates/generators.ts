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
// 5. Landmark Tower — Eiffel-inspired tapered lattice tower
// -------------------------------------------------------------------

export interface LandmarkTower3DParams {
  H: number;
  nLevels: number;
  baseWidth: number;
  topWidth: number;
  lateralLoad: number;
}

export function generateLandmarkTower3D(store: ModelStore, p: LandmarkTower3DParams): void {
  store.clear();
  store.model.name = t('ex.landmarkTower3D');

  store.batch(() => {
    const levelH = p.H / p.nLevels;
    const ring: number[][] = [];
    const centerline = p.baseWidth / 2;

    for (let lev = 0; lev <= p.nLevels; lev++) {
      const y = lev * levelH;
      const alpha = lev / p.nLevels;
      const w = p.baseWidth + alpha * (p.topWidth - p.baseWidth);
      const o = (p.baseWidth - w) / 2;
      ring[lev] = [
        store.addNode(o, y, o),
        store.addNode(o + w, y, o),
        store.addNode(o + w, y, o + w),
        store.addNode(o, y, o + w),
      ];
    }

    for (let lev = 0; lev < p.nLevels; lev++) {
      for (let c = 0; c < 4; c++) {
        store.addElement(ring[lev][c], ring[lev + 1][c], 'frame');
      }
    }

    for (let lev = 1; lev <= p.nLevels; lev++) {
      for (let c = 0; c < 4; c++) {
        store.addElement(ring[lev][c], ring[lev][(c + 1) % 4], 'frame');
      }
      if (lev < p.nLevels) {
        store.addElement(ring[lev][0], ring[lev][2], 'truss');
        store.addElement(ring[lev][1], ring[lev][3], 'truss');
      }
    }

    for (let lev = 0; lev < p.nLevels; lev++) {
      const flip = lev % 2 === 0;
      for (let face = 0; face < 4; face++) {
        const a = face;
        const b = (face + 1) % 4;
        if (flip) {
          store.addElement(ring[lev][a], ring[lev + 1][b], 'truss');
          store.addElement(ring[lev][b], ring[lev + 1][a], 'truss');
        } else {
          store.addElement(ring[lev][a], ring[lev + 1][a], 'truss');
          store.addElement(ring[lev][b], ring[lev + 1][b], 'truss');
        }
      }
    }

    const deckLevel = Math.max(2, Math.floor(p.nLevels * 0.65));
    const deck = ring[deckLevel];
    const deckCenter = store.addNode(centerline, deckLevel * levelH, centerline);
    for (const nid of deck) {
      store.addElement(nid, deckCenter, 'frame');
    }

    const crownBase = ring[p.nLevels];
    const topY = p.H + levelH * 0.6;
    const crown = store.addNode(centerline, topY, centerline);
    for (const nid of crownBase) {
      store.addElement(nid, crown, 'frame');
    }

    const mastTop = store.addNode(centerline, topY + levelH * 0.8, centerline);
    store.addElement(crown, mastTop, 'frame');
    for (const nid of crownBase) {
      store.addElement(nid, mastTop, 'truss');
    }

    for (const nid of ring[0]) {
      store.addSupport(nid, 'fixed3d');
    }

    for (const nid of crownBase) {
      store.addNodalLoad3D(nid, p.lateralLoad, -10, p.lateralLoad * 0.35, 0, 0, 0);
    }
    store.addNodalLoad3D(crown, p.lateralLoad * 0.5, -20, 0, 0, 0, 0);
  });
}

// -------------------------------------------------------------------
// 6. XL Diagrid Tower — high-node-count perimeter diagrid tower
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
    const levelH = p.H / p.nLevels;
    const perimeter: number[][] = [];
    const core: number[][] = [];
    const coreWidthX = Math.max(10, p.baseRadiusX * 0.32);
    const coreWidthZ = Math.max(10, p.baseRadiusZ * 0.32);

    for (let lev = 0; lev <= p.nLevels; lev++) {
      const y = lev * levelH;
      const alpha = lev / p.nLevels;
      const rx = p.baseRadiusX + alpha * (p.topRadiusX - p.baseRadiusX);
      const rz = p.baseRadiusZ + alpha * (p.topRadiusZ - p.baseRadiusZ);

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
      for (let i = 0; i < p.nSides; i++) {
        const next = (i + 1) % p.nSides;
        store.addElement(perimeter[lev][i], perimeter[lev + 1][i], 'frame');
        store.addElement(perimeter[lev][i], perimeter[lev + 1][next], 'truss');
        store.addElement(perimeter[lev][next], perimeter[lev + 1][i], 'truss');
      }

      for (let c = 0; c < 4; c++) {
        store.addElement(core[lev][c], core[lev + 1][c], 'frame');
      }
    }

    for (let lev = 1; lev <= p.nLevels; lev++) {
      for (let i = 0; i < p.nSides; i++) {
        store.addElement(perimeter[lev][i], perimeter[lev][(i + 1) % p.nSides], 'frame');
      }
      for (let c = 0; c < 4; c++) {
        store.addElement(core[lev][c], core[lev][(c + 1) % 4], 'frame');
      }

      // Radial floor framing from core to perimeter, using eight anchors for legibility.
      for (let face = 0; face < 4; face++) {
        const sideIdx = Math.round((face * p.nSides) / 4) % p.nSides;
        const sideIdx2 = Math.round(((face * p.nSides) / 4) + p.nSides / 8) % p.nSides;
        store.addElement(core[lev][face], perimeter[lev][sideIdx], 'frame');
        store.addElement(core[lev][face], perimeter[lev][sideIdx2], 'frame');
      }

      if (lev % 8 === 0 && lev < p.nLevels) {
        // Outrigger levels tie the core to multiple perimeter nodes.
        for (let face = 0; face < 4; face++) {
          const sideIdx = Math.round((face * p.nSides) / 4) % p.nSides;
          const sideIdxPrev = (sideIdx - 1 + p.nSides) % p.nSides;
          const sideIdxNext = (sideIdx + 1) % p.nSides;
          store.addElement(core[lev][face], perimeter[lev][sideIdx], 'frame');
          store.addElement(core[lev][face], perimeter[lev][sideIdxPrev], 'truss');
          store.addElement(core[lev][face], perimeter[lev][sideIdxNext], 'truss');
        }
      }
    }

    // Crown ring and mast.
    const crownCenter = store.addNode(0, p.H + levelH * 0.7, 0);
    const mastTop = store.addNode(0, p.H + levelH * 1.6, 0);
    store.addElement(crownCenter, mastTop, 'frame');
    for (let i = 0; i < p.nSides; i += 2) {
      store.addElement(perimeter[p.nLevels][i], crownCenter, 'frame');
      store.addElement(perimeter[p.nLevels][i], mastTop, 'truss');
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
// 7. Cable-stayed bridge — dual H-pylon with semi-fan cables
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
    for (let i = 0; i < n; i++) {
      const eL = store.addElement(left[i], left[i + 1], 'frame');
      const eR = store.addElement(right[i], right[i + 1], 'frame');
      if (p.deckLoad !== 0) {
        store.addDistributedLoad3D(eL, 0, p.deckLoad, 0, p.deckLoad);
        store.addDistributedLoad3D(eR, 0, p.deckLoad, 0, p.deckLoad);
      }
    }
    for (let i = 0; i <= n; i++) {
      store.addElement(left[i], right[i], 'frame');
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
      // Cables from anchors to deck
      store.addElement(anchL, left[deckIdx], 'truss');
      store.addElement(anchR, right[deckIdx], 'truss');
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

    const addRingFrames = (nodes: number[], type: 'frame' | 'truss' = 'frame') => {
      for (let i = 0; i < n; i++) {
        store.addElement(nodes[i], nodes[(i + 1) % n], type);
      }
    };

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
    addRingFrames(roofLowerInner);
    addRingFrames(roofLowerOuter);
    addRingFrames(roofUpperInner);
    addRingFrames(roofUpperOuter);
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

      // ── Roof space truss ──
      // Verticals: lower chord → upper chord
      store.addElement(roofLowerInner[i], roofUpperInner[i], 'frame');
      store.addElement(roofLowerOuter[i], roofUpperOuter[i], 'frame');
      // Radial chords (inner → outer)
      store.addElement(roofLowerInner[i], roofLowerOuter[i], 'frame');
      store.addElement(roofUpperInner[i], roofUpperOuter[i], 'frame');
      // Diagonals within truss depth (Warren pattern)
      store.addElement(roofLowerInner[i], roofUpperOuter[i], 'truss');
      store.addElement(roofUpperInner[i], roofLowerOuter[i], 'truss');
      // Cross-bay diagonals on upper chord for lateral stiffness
      store.addElement(roofUpperInner[i], roofUpperOuter[next], 'truss');
      // Connect concourse to lower chord
      store.addElement(concourse[i], roofLowerInner[i], 'frame');
      // Roof loads on upper chord rings
      if (p.roofLoad !== 0) {
        const ringA = store.addElement(roofUpperInner[i], roofUpperInner[next], 'frame');
        const ringB = store.addElement(roofUpperOuter[i], roofUpperOuter[next], 'frame');
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
