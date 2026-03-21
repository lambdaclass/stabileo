/**
 * Lightweight structural connectivity graph for PRO RC detailing.
 *
 * Pre-computes node connectivity, beam-column joints, and frame-line
 * primitives from model topology. Replaces ad-hoc per-call scanning
 * in ProVerificationTab.
 */

import { classifyElement } from './codes/argentina/cirsoc201';

// ─── Input types (loosely coupled to model store) ────────────

export interface GraphNode {
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface GraphElement {
  id: number;
  nodeI: number;
  nodeJ: number;
  sectionId: number;
  type: string;
}

export interface GraphSection {
  id: number;
  b?: number;
  h?: number;
}

export interface GraphSupport {
  nodeId: number;
  type: string;
}

// ─── Output types ────────────────────────────────────────────

export interface NodeConnectivity {
  beams: number[];     // element IDs of beams connecting here
  columns: number[];   // element IDs of columns/walls connecting here
  support?: string;    // support type if any ('fixed', 'pinned', etc.)
}

export interface JointInfo {
  nodeId: number;
  beamIds: number[];
  columnIds: number[];
}

export interface FrameLine {
  elementIds: number[];
  nodeIds: number[];
  direction: 'horizontal' | 'vertical';
}

export interface StructuralGraph {
  nodes: Map<number, NodeConnectivity>;
  joints: JointInfo[];
  frameLines: FrameLine[];
}

// ─── Builder ─────────────────────────────────────────────────

export function buildStructuralGraph(
  nodes: Map<number, GraphNode>,
  elements: Map<number, GraphElement>,
  sections: Map<number, GraphSection>,
  supports: Map<number, GraphSupport>,
): StructuralGraph {
  // 1. Classify all elements and build node connectivity
  const nodeConn = new Map<number, NodeConnectivity>();
  const elemClass = new Map<number, 'beam' | 'column' | 'wall'>();

  const ensureNode = (nid: number): NodeConnectivity => {
    let conn = nodeConn.get(nid);
    if (!conn) {
      conn = { beams: [], columns: [] };
      nodeConn.set(nid, conn);
    }
    return conn;
  };

  for (const [id, elem] of elements) {
    const nI = nodes.get(elem.nodeI);
    const nJ = nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;
    const sec = sections.get(elem.sectionId);
    const cls = classifyElement(nI.x, nI.y, nI.z, nJ.x, nJ.y, nJ.z, sec?.b, sec?.h);
    elemClass.set(id, cls);

    const connI = ensureNode(elem.nodeI);
    const connJ = ensureNode(elem.nodeJ);
    if (cls === 'beam') {
      connI.beams.push(id);
      connJ.beams.push(id);
    } else {
      connI.columns.push(id);
      connJ.columns.push(id);
    }
  }

  // Add support info
  for (const [, sup] of supports) {
    const conn = nodeConn.get(sup.nodeId);
    if (conn) conn.support = sup.type;
  }

  // 2. Discover beam-column joints (nodes where both beams and columns meet)
  const joints: JointInfo[] = [];
  for (const [nodeId, conn] of nodeConn) {
    if (conn.beams.length > 0 && conn.columns.length > 0) {
      joints.push({ nodeId, beamIds: [...conn.beams], columnIds: [...conn.columns] });
    }
  }

  // 3. Build frame lines (sequences of same-direction elements sharing nodes)
  const frameLines: FrameLine[] = [];
  const visited = new Set<number>();

  // Helper: trace a chain of elements in one direction from a starting element
  const traceChain = (startId: number, direction: 'horizontal' | 'vertical'): FrameLine | null => {
    if (visited.has(startId)) return null;

    const chain: number[] = [startId];
    visited.add(startId);

    const startElem = elements.get(startId)!;
    const orderedNodes: number[] = [startElem.nodeI, startElem.nodeJ];

    // Extend forward (from nodeJ)
    let currentNode = startElem.nodeJ;
    while (true) {
      const conn = nodeConn.get(currentNode);
      if (!conn) break;
      const candidates = direction === 'horizontal' ? conn.beams : conn.columns;
      const next = candidates.find(id => !visited.has(id));
      if (!next) break;
      visited.add(next);
      chain.push(next);
      const nextElem = elements.get(next)!;
      const otherNode = nextElem.nodeI === currentNode ? nextElem.nodeJ : nextElem.nodeI;
      orderedNodes.push(otherNode);
      currentNode = otherNode;
    }

    // Extend backward (from nodeI)
    currentNode = startElem.nodeI;
    while (true) {
      const conn = nodeConn.get(currentNode);
      if (!conn) break;
      const candidates = direction === 'horizontal' ? conn.beams : conn.columns;
      const next = candidates.find(id => !visited.has(id));
      if (!next) break;
      visited.add(next);
      chain.unshift(next);
      const nextElem = elements.get(next)!;
      const otherNode = nextElem.nodeI === currentNode ? nextElem.nodeJ : nextElem.nodeI;
      orderedNodes.unshift(otherNode);
      currentNode = otherNode;
    }

    if (chain.length < 1) return null;
    return { elementIds: chain, nodeIds: orderedNodes, direction };
  };

  // Trace all beam frame lines
  for (const [id, cls] of elemClass) {
    if (cls === 'beam' && !visited.has(id)) {
      const line = traceChain(id, 'horizontal');
      if (line) frameLines.push(line);
    }
  }

  // Trace all column frame lines
  visited.clear();
  for (const [id, cls] of elemClass) {
    if ((cls === 'column' || cls === 'wall') && !visited.has(id)) {
      const line = traceChain(id, 'vertical');
      if (line) frameLines.push(line);
    }
  }

  return { nodes: nodeConn, joints, frameLines };
}

// ─── Query helpers ───────────────────────────────────────────

/** Get framing context for a specific element (replaces ad-hoc getFramingContext). */
export function getElementFramingContext(
  graph: StructuralGraph,
  elementId: number,
  elements: Map<number, GraphElement>,
): { startMembers: Array<'column' | 'beam'>; endMembers: Array<'column' | 'beam'> } | undefined {
  const elem = elements.get(elementId);
  if (!elem) return undefined;

  const classify = (nodeId: number): Array<'column' | 'beam'> => {
    const conn = graph.nodes.get(nodeId);
    if (!conn) return [];
    const types: Array<'column' | 'beam'> = [];
    if (conn.columns.some(id => id !== elementId)) types.push('column');
    if (conn.beams.some(id => id !== elementId)) types.push('beam');
    return types;
  };

  const startMembers = classify(elem.nodeI);
  const endMembers = classify(elem.nodeJ);
  if (startMembers.length === 0 && endMembers.length === 0) return undefined;
  return { startMembers, endMembers };
}
