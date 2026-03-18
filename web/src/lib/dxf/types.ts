// Shared types for the DXF import/export pipeline

export type DxfUnit = 'm' | 'cm' | 'mm';

export function unitScale(unit: DxfUnit): number {
  switch (unit) {
    case 'm': return 1;
    case 'cm': return 0.01;
    case 'mm': return 0.001;
  }
}

// ─── Parsed intermediate representation ────────────────────────

export interface DxfPoint { x: number; y: number; }

export interface DxfParsedLine {
  layer: string;
  start: DxfPoint;
  end: DxfPoint;
}

export interface DxfParsedPoint {
  layer: string;
  position: DxfPoint;
}

export interface DxfParsedInsert {
  layer: string;
  position: DxfPoint;
  blockName: string;
}

export interface DxfParsedText {
  layer: string;
  position: DxfPoint;
  value: string;
}

export interface DxfParsedCircle {
  layer: string;
  center: DxfPoint;
  radius: number;
}

export interface DxfParseResult {
  lines: DxfParsedLine[];
  points: DxfParsedPoint[];
  inserts: DxfParsedInsert[];
  texts: DxfParsedText[];
  circles: DxfParsedCircle[];
  layers: string[];
}

// ─── Mapped intermediate model ─────────────────────────────────

export interface MappedNode {
  id: number;
  x: number;
  y: number;
}

export interface MappedElement {
  nodeI: number;
  nodeJ: number;
  type: 'frame' | 'truss';
}

export interface MappedSupport {
  nodeId: number;
  type: 'fixed' | 'pinned' | 'rollerX' | 'rollerZ';
}

export interface MappedNodalLoad {
  nodeId: number;
  fx: number;
  fz: number;
  my: number;
}

export interface MappedDistributedLoad {
  elementIndex: number;
  q: number;
}

export interface MappedPointLoad {
  elementIndex: number;
  a: number;
  p: number;
}

export interface MappedHinge {
  elementIndex: number;
  end: 'start' | 'end';
}

export interface DxfMappingResult {
  nodes: MappedNode[];
  elements: MappedElement[];
  supports: MappedSupport[];
  nodalLoads: MappedNodalLoad[];
  distributedLoads: MappedDistributedLoad[];
  pointLoads: MappedPointLoad[];
  hinges: MappedHinge[];
  sectionName: string | null;
  materialName: string | null;
  warnings: string[];
}

// ─── Export options ─────────────────────────────────────────────

export interface DxfExportOptions {
  includeResults: boolean;
  diagramScale: number;
  deformedScale: number;
  includeValues: boolean;
  includeSummary: boolean;
}

/** ACI color indices for DXF export layers */
export const DXF_COLORS = {
  ESTRUCTURA: 7,    // white
  APOYOS_OUT: 1,    // red
  MOMENTOS: 5,      // blue
  CORTANTES: 3,     // green
  AXILES: 6,        // magenta
  DEFORMADA: 4,     // cyan
  REACCIONES: 2,    // yellow
  RESULTADOS: 7,    // white
} as const;
