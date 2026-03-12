/**
 * Pre-solve model diagnostics — analyzes model data for quality issues
 * without running the solver. Returns SolverDiagnostic[] with source 'model'.
 */
import type { SolverDiagnostic } from './types';
import type { Node, Element, Section, Material, Support, Plate, Quad } from '../store/model.svelte';

interface LoadEntry {
  type: string;
  data: { id: number; caseId?: number; elementId?: number; nodeId?: number; [k: string]: unknown };
}

interface LoadCase {
  id: number;
  name: string;
  type: string;
}

interface ModelData {
  nodes: Map<number, Node>;
  elements: Map<number, Element>;
  materials: Map<number, Material>;
  sections: Map<number, Section>;
  supports: Map<number, Support>;
  loads: LoadEntry[];
  loadCases: LoadCase[];
  plates?: Map<number, Plate>;
  quads?: Map<number, Quad>;
}

function diag(
  severity: SolverDiagnostic['severity'],
  code: string,
  message: string,
  opts?: { elementIds?: number[]; nodeIds?: number[]; details?: Record<string, unknown> },
): SolverDiagnostic {
  return { severity, code, message, source: 'model' as any, ...opts };
}

/** Run all pre-solve model checks */
export function checkModel(m: ModelData): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];

  // ─── Minimum structure ─────────────────────────
  if (m.nodes.size < 2) {
    out.push(diag('error', 'MODEL_FEW_NODES', 'diag.model.fewNodes'));
  }
  const hasShells = (m.plates?.size ?? 0) + (m.quads?.size ?? 0) > 0;
  if (m.elements.size === 0 && !hasShells) {
    out.push(diag('error', 'MODEL_NO_ELEMENTS', 'diag.model.noElements'));
  }
  if (m.supports.size === 0) {
    out.push(diag('error', 'MODEL_NO_SUPPORTS', 'diag.model.noSupports'));
  }

  // ─── Coincident nodes ──────────────────────────
  const nodeArr = [...m.nodes.values()];
  for (let i = 0; i < nodeArr.length; i++) {
    for (let j = i + 1; j < nodeArr.length; j++) {
      const a = nodeArr[i], b = nodeArr[j];
      const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
      if (dx * dx + dy * dy + dz * dz < 1e-6) {
        out.push(diag('warning', 'MODEL_COINCIDENT_NODES', 'diag.model.coincidentNodes', {
          nodeIds: [a.id, b.id],
          details: { x: a.x, y: a.y, z: a.z ?? 0 },
        }));
      }
    }
  }

  // ─── Disconnected nodes ────────────────────────
  const connectedNodes = new Set<number>();
  for (const [, el] of m.elements) {
    connectedNodes.add(el.nodeI);
    connectedNodes.add(el.nodeJ);
  }
  // Also count nodes connected to shell elements (plates/quads)
  if (m.plates) {
    for (const [, p] of m.plates) {
      for (const nid of p.nodes) connectedNodes.add(nid);
    }
  }
  if (m.quads) {
    for (const [, q] of m.quads) {
      for (const nid of q.nodes) connectedNodes.add(nid);
    }
  }
  for (const [id] of m.nodes) {
    if (!connectedNodes.has(id)) {
      // Skip if it has a support (reaction point)
      const hasSupport = [...m.supports.values()].some(s => s.nodeId === id);
      if (!hasSupport) {
        out.push(diag('warning', 'MODEL_DISCONNECTED_NODE', 'diag.model.disconnectedNode', {
          nodeIds: [id],
        }));
      }
    }
  }

  // ─── Element checks ───────────────────────────
  const edgeSet = new Set<string>();
  for (const [, el] of m.elements) {
    const nI = m.nodes.get(el.nodeI);
    const nJ = m.nodes.get(el.nodeJ);

    // Missing nodes
    if (!nI || !nJ) {
      out.push(diag('error', 'MODEL_MISSING_NODE', 'diag.model.missingNode', {
        elementIds: [el.id],
        details: { nodeI: el.nodeI, nodeJ: el.nodeJ },
      }));
      continue;
    }

    // Zero-length
    const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-4) {
      out.push(diag('error', 'MODEL_ZERO_LENGTH', 'diag.model.zeroLength', {
        elementIds: [el.id],
      }));
    } else if (L < 0.05) {
      out.push(diag('warning', 'MODEL_SHORT_ELEMENT', 'diag.model.shortElement', {
        elementIds: [el.id],
        details: { L: L },
      }));
    }

    // Duplicate elements (same node pair)
    const edgeKey = el.nodeI < el.nodeJ
      ? `${el.nodeI}-${el.nodeJ}`
      : `${el.nodeJ}-${el.nodeI}`;
    if (edgeSet.has(edgeKey)) {
      out.push(diag('warning', 'MODEL_DUPLICATE_ELEMENT', 'diag.model.duplicateElement', {
        elementIds: [el.id],
        nodeIds: [el.nodeI, el.nodeJ],
      }));
    }
    edgeSet.add(edgeKey);

    // Missing / invalid section
    const sec = m.sections.get(el.sectionId);
    if (!sec) {
      out.push(diag('error', 'MODEL_MISSING_SECTION', 'diag.model.missingSection', {
        elementIds: [el.id],
        details: { sectionId: el.sectionId },
      }));
    } else {
      if (sec.a <= 0) {
        out.push(diag('error', 'MODEL_ZERO_AREA', 'diag.model.zeroArea', {
          elementIds: [el.id],
          details: { section: sec.name, A: sec.a },
        }));
      }
      if (el.type === 'frame' && sec.iz <= 0) {
        out.push(diag('error', 'MODEL_ZERO_INERTIA', 'diag.model.zeroInertia', {
          elementIds: [el.id],
          details: { section: sec.name, Iz: sec.iz },
        }));
      }
    }

    // Missing / invalid material
    const mat = m.materials.get(el.materialId);
    if (!mat) {
      out.push(diag('error', 'MODEL_MISSING_MATERIAL', 'diag.model.missingMaterial', {
        elementIds: [el.id],
        details: { materialId: el.materialId },
      }));
    } else {
      if (mat.e <= 0) {
        out.push(diag('error', 'MODEL_ZERO_MODULUS', 'diag.model.zeroModulus', {
          elementIds: [el.id],
          details: { material: mat.name, E: mat.e },
        }));
      }
    }

    // Double-hinged frame (mechanism unless laterally supported)
    if (el.type === 'frame' && el.hingeStart && el.hingeEnd) {
      out.push(diag('warning', 'MODEL_DOUBLE_HINGE', 'diag.model.doubleHinge', {
        elementIds: [el.id],
      }));
    }
  }

  // ─── Support on non-existent node ──────────────
  for (const [, sup] of m.supports) {
    if (!m.nodes.has(sup.nodeId)) {
      out.push(diag('error', 'MODEL_SUPPORT_ORPHAN', 'diag.model.supportOrphan', {
        nodeIds: [sup.nodeId],
      }));
    }
  }

  // ─── Load checks ──────────────────────────────
  if (m.loads.length === 0 && m.elements.size > 0) {
    out.push(diag('info', 'MODEL_NO_LOADS', 'diag.model.noLoads'));
  }

  // Empty load cases (have cases but no loads in them)
  const casesWithLoads = new Set(m.loads.map(l => l.data.caseId ?? 1));
  for (const lc of m.loadCases) {
    if (!casesWithLoads.has(lc.id)) {
      out.push(diag('info', 'MODEL_EMPTY_CASE', 'diag.model.emptyCase', {
        details: { caseName: lc.name, caseId: lc.id },
      }));
    }
  }

  // Loads referencing non-existent elements/nodes
  for (const load of m.loads) {
    if ('elementId' in load.data && load.data.elementId != null) {
      if (!m.elements.has(load.data.elementId as number)) {
        out.push(diag('error', 'MODEL_LOAD_ORPHAN_ELEM', 'diag.model.loadOrphanElem', {
          details: { loadId: load.data.id, elementId: load.data.elementId },
        }));
      }
    }
    if ('nodeId' in load.data && load.data.nodeId != null) {
      if (!m.nodes.has(load.data.nodeId as number)) {
        out.push(diag('error', 'MODEL_LOAD_ORPHAN_NODE', 'diag.model.loadOrphanNode', {
          details: { loadId: load.data.id, nodeId: load.data.nodeId },
        }));
      }
    }
  }

  return out;
}
