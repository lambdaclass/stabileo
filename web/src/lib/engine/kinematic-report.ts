// Didactic Kinematic Analysis Report Generator
//
// Generates a structured step-by-step report explaining the kinematic
// stability of a 2D structure. Used by KinematicPanel.svelte.
//
// Reuses computeStaticDegree() and analyzeKinematics() from kinematic-2d.ts,
// then adds didactic context: per-support DOF breakdown, per-node hinge
// condition explanation, mechanism root-cause analysis, and fix suggestions.

import type { SolverInput } from './types';
import { computeStaticDegree, analyzeKinematics } from './kinematic-2d';
import { t } from '../i18n';

// ─── Public interfaces ─────────────────────────────────────────

export interface SupportDetail {
  nodeId: number;
  type: string;           // Spanish label: "Empotramiento", "Articulación fija", etc.
  dofs: number;           // restrained DOF count
  restrainedDofs: string; // "ux, uy, θz"
}

export interface HingeDetail {
  nodeId: number;
  elements: Array<{ elemId: number; end: 'I' | 'J' }>;
  nFrames: number;        // frame elements converging at this node
  hasRotRestraint: boolean;
  ci: number;             // computed internal condition
  explanation: string;    // e.g. "Elem. 3 (J) + Elem. 5 (I) → c = min(2, 2−1) = 1"
}

export interface UnconstrainedDofDetail {
  nodeId: number;
  dof: 'ux' | 'uy' | 'rz';
  dofName: string;        // "desplazamiento horizontal"
  explanation: string;    // root-cause explanation
}

export interface NodeConstraintInfo {
  nodeId: number;
  support: SupportDetail | null;
  connectedElems: Array<{
    elemId: number;
    type: 'frame' | 'truss';
    hingedAtNode: boolean;    // hinge on the connected element's end touching this node
    reachesSupport: boolean;  // does this element lead to a support independently?
  }>;
  isHingedEnd: boolean;     // THIS element has a hinge at this end
  constraintDescription: string;
}

// ─── Per-DOF breakdown interfaces ────────────────────────────────

export type DofLabel = 'ux' | 'uy' | 'θz';

/** Single constraint source for a specific DOF */
export interface DofConstraintSource {
  fromNodeId: number;         // element node where this constraint arrives
  label: string;              // "Empotramiento en Nodo 1"
  viaElems: number[];         // [3, 2] → "vía Barra 3 → Barra 2". Empty = direct.
  implicit?: boolean;         // true for θz from force couple
}

/** One DOF line in the breakdown */
export interface DofLine {
  dof: DofLabel;
  sources: DofConstraintSource[];
  displayText: string;        // renderable text after the arrow
}

/** Complete per-DOF breakdown for one element */
export interface DofBreakdown {
  lines: DofLine[];           // 3 for frame (ux, uy, θz), 2 for truss (ux, uy)
  totalConstraints: number;   // effective constraint count (from countEffectiveConstraints)
  needed: number;             // 3 for frame, 2 for truss
  summary: string;            // "3 restricciones para 3 GDL — isostática."
}

// ─── Per-element analysis interface ──────────────────────────────

export interface ElementConstraintAnalysis {
  elemId: number;
  type: 'frame' | 'truss';
  nodeIInfo: NodeConstraintInfo;
  nodeJInfo: NodeConstraintInfo;
  status: 'isostatic' | 'hyperstatic' | 'mechanism';
  explanation: string;
  dofBreakdown: DofBreakdown;
}

export interface KinematicReport {
  // Step 1: Structure summary
  nNodes: number;
  nFrames: number;
  nTrusses: number;
  supportDetails: SupportDetail[];
  totalR: number;
  hingeDetails: HingeDetail[];
  totalC: number;

  // Step 2: Degree formula
  isPureTruss: boolean;
  formula: string;
  substitution: string;
  degree: number;
  classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  classificationText: string;

  // Step 3: Rank verification
  nFreeDofs: number;       // Kff dimension
  hasHiddenMechanism: boolean;
  mechanismModes: number;
  mechanismNodes: number[];
  unconstrainedDofs: UnconstrainedDofDetail[];

  // Step 3b: Per-element analysis
  elementAnalysis: ElementConstraintAnalysis[];

  // Step 4: Suggestions
  suggestions: string[];
  isSolvable: boolean;
}

// ─── Support type labels ────────────────────────────────────────

function getSupportLabels(): Record<string, { label: string; dofs: number; restrained: string }> {
  return {
    fixed:    { label: t('kin.supFixed'), dofs: 3, restrained: 'ux, uy, θz' },
    pinned:   { label: t('kin.supPinned'), dofs: 2, restrained: 'ux, uy' },
    rollerX:  { label: t('kin.supRollerX'), dofs: 1, restrained: 'uy' },
    rollerY:  { label: t('kin.supRollerY'), dofs: 1, restrained: 'ux' },
    inclinedRoller: { label: t('kin.supInclinedRoller'), dofs: 1, restrained: 'u_n' },
  };
}

function getDofNames(): Record<string, string> {
  return {
    ux: t('kin.dofHorizontal'),
    uy: t('kin.dofVertical'),
    rz: t('kin.dofRotation'),
  };
}

// ─── Per-DOF support mapping ────────────────────────────────────

function getSupportDofs(): Record<string, ReadonlySet<DofLabel>> {
  return {
    [t('kin.supFixed')]:          new Set<DofLabel>(['ux', 'uy', 'θz']),
    [t('kin.supPinned')]:         new Set<DofLabel>(['ux', 'uy']),
    [t('kin.supRollerX')]:        new Set<DofLabel>(['uy']),
    [t('kin.supRollerY')]:        new Set<DofLabel>(['ux']),
    [t('kin.supInclinedRoller')]: new Set<DofLabel>(['uy']),   // simplification: u_n ≈ uy
  };
}

/** Parse a SupportDetail into the set of DofLabels it constrains */
function parseSupportDofs(sup: SupportDetail): Set<DofLabel> {
  const supportDofs = getSupportDofs();
  const preset = supportDofs[sup.type];
  if (preset) return new Set(preset);
  // Spring or unknown: parse from restrainedDofs string
  const dofs = new Set<DofLabel>();
  const s = sup.restrainedDofs;
  if (s.includes('ux')) dofs.add('ux');
  if (s.includes('uy')) dofs.add('uy');
  if (s.includes('θz') || s.includes('\u03b8z')) dofs.add('θz');
  return dofs;
}

/** Set intersection helper */
function intersectDofs(a: Set<DofLabel>, b: ReadonlySet<DofLabel>): Set<DofLabel> {
  const result = new Set<DofLabel>();
  for (const d of a) if (b.has(d)) result.add(d);
  return result;
}

// ─── Main export ────────────────────────────────────────────────

export function generateKinematicReport(input: SolverInput): KinematicReport | null {
  if (input.nodes.size < 2 || input.elements.size < 1) return null;

  // ── Step 1: Structure summary ──

  let nFrames = 0, nTrusses = 0;
  for (const e of input.elements.values()) {
    if (e.type === 'frame') nFrames++;
    else nTrusses++;
  }
  const nNodes = input.nodes.size;
  const isPureTruss = nFrames === 0;

  // Support details
  const supportDetails: SupportDetail[] = [];
  let totalR = 0;
  const supLabels = getSupportLabels();
  for (const sup of input.supports.values()) {
    const st = sup.type as string;
    const preset = supLabels[st];
    if (preset) {
      supportDetails.push({
        nodeId: sup.nodeId,
        type: preset.label,
        dofs: preset.dofs,
        restrainedDofs: preset.restrained,
      });
      totalR += preset.dofs;
    } else if (st === 'spring') {
      const parts: string[] = [];
      let d = 0;
      if (sup.kx && sup.kx > 0) { parts.push('ux'); d++; }
      if (sup.ky && sup.ky > 0) { parts.push('uy'); d++; }
      if (sup.kz && sup.kz > 0) { parts.push('θz'); d++; }
      supportDetails.push({
        nodeId: sup.nodeId,
        type: t('kin.supSpring'),
        dofs: d,
        restrainedDofs: parts.join(', ') || t('kin.noStiffness'),
      });
      totalR += d;
    }
  }

  // Hinge details — replicate logic from computeStaticDegree but keep element info
  const nodeHingeElems = new Map<number, Array<{ elemId: number; end: 'I' | 'J' }>>();
  const nodeFrameCount = new Map<number, number>();
  for (const elem of input.elements.values()) {
    if (elem.type !== 'frame') continue;
    nodeFrameCount.set(elem.nodeI, (nodeFrameCount.get(elem.nodeI) ?? 0) + 1);
    nodeFrameCount.set(elem.nodeJ, (nodeFrameCount.get(elem.nodeJ) ?? 0) + 1);
    if (elem.hingeStart) {
      if (!nodeHingeElems.has(elem.nodeI)) nodeHingeElems.set(elem.nodeI, []);
      nodeHingeElems.get(elem.nodeI)!.push({ elemId: elem.id, end: 'I' });
    }
    if (elem.hingeEnd) {
      if (!nodeHingeElems.has(elem.nodeJ)) nodeHingeElems.set(elem.nodeJ, []);
      nodeHingeElems.get(elem.nodeJ)!.push({ elemId: elem.id, end: 'J' });
    }
  }

  // Rot-restrained nodes (for hinge counting)
  const rotRestrained = new Set<number>();
  for (const sup of input.supports.values()) {
    if (sup.type === 'fixed') rotRestrained.add(sup.nodeId);
    if (sup.type === 'spring' && sup.kz && sup.kz > 0) rotRestrained.add(sup.nodeId);
  }

  const hingeDetails: HingeDetail[] = [];
  let totalC = 0;
  for (const [nodeId, elems] of nodeHingeElems) {
    const j = elems.length;
    const k = nodeFrameCount.get(nodeId) ?? 0;
    const hasRot = rotRestrained.has(nodeId);
    let ci: number;
    let explanation: string;
    const elemList = elems.map(e => `Elem. ${e.elemId} (${e.end})`).join(' + ');

    if (k <= 1) {
      ci = 0;
      explanation = `${elemList} — ${t('kin.hingeFreeEnd')}`;
    } else if (hasRot) {
      ci = j;
      explanation = `${elemList} — ${t('kin.hingeRotRestraint').replace('{c}', String(j))}`;
    } else {
      ci = Math.min(j, k - 1);
      explanation = `${elemList} — ${t('kin.hingeFormula').replace('{k}', String(k)).replace('{j}', String(j)).replace('{ci}', String(ci))}`;
    }

    if (j > 0) {
      hingeDetails.push({ nodeId, elements: elems, nFrames: k, hasRotRestraint: hasRot, ci, explanation });
    }
    totalC += ci;
  }
  // Sort by nodeId for consistent display
  hingeDetails.sort((a, b) => a.nodeId - b.nodeId);

  // ── Step 2: Degree formula ──

  const { degree } = computeStaticDegree(input);

  let formula: string;
  let substitution: string;
  if (isPureTruss) {
    // Pure truss: g = m + r − 2·n
    formula = 'g = m + r − 2·n';
    const m = input.elements.size;
    substitution = `g = ${m} + ${totalR} − 2×${nNodes} = ${degree}`;
  } else if (nTrusses > 0) {
    // Mixed: frames + trusses
    formula = totalC > 0
      ? 'g = 3·m_p + m_r + r − 3·n − c'
      : 'g = 3·m_p + m_r + r − 3·n';
    const parts = [`3×${nFrames} + ${nTrusses} + ${totalR}`];
    const minus = totalC > 0 ? `3×${nNodes} + ${totalC}` : `3×${nNodes}`;
    substitution = `g = ${parts[0]} − ${minus} = ${degree}`;
  } else {
    // Pure frame
    formula = totalC > 0
      ? 'g = 3·m + r − 3·n − c'
      : 'g = 3·m + r − 3·n';
    const plus = `3×${nFrames} + ${totalR}`;
    const minus = totalC > 0 ? `3×${nNodes} + ${totalC}` : `3×${nNodes}`;
    substitution = `g = ${plus} − ${minus} = ${degree}`;
  }

  // ── Step 3: Rank verification ── (computed before classification so we can adjust it)

  const kinResult = analyzeKinematics(input);
  const mechanismModes = kinResult.mechanismModes;
  const mechanismNodes = kinResult.mechanismNodes;
  const hasHiddenMechanism = degree >= 0 && mechanismModes > 0;
  const nFreeDofs = computeFreeDofs(input);

  // ── Step 2 (cont.): Classification — now informed by rank analysis ──

  let classification: 'hyperstatic' | 'isostatic' | 'hypostatic';
  let classificationText: string;
  if (degree < 0) {
    classification = 'hypostatic';
    classificationText = t('kin.classHypostatic').replace('{n}', String(Math.abs(degree))).replace('{s}', Math.abs(degree) > 1 ? t('kin.plural_s') : '');
  } else if (hasHiddenMechanism) {
    // g ≥ 0 but rank analysis reveals mechanism → override classification
    classification = 'hypostatic';
    if (degree === 0) {
      classificationText = t('kin.classHiddenMechZero').replace('{modes}', String(mechanismModes)).replace('{s}', mechanismModes > 1 ? t('kin.plural_s') : '');
    } else {
      classificationText = t('kin.classHiddenMechPos').replace('{degree}', String(degree)).replace('{modes}', String(mechanismModes)).replace('{s}', mechanismModes > 1 ? t('kin.plural_s') : '');
    }
  } else if (degree === 0) {
    classification = 'isostatic';
    classificationText = t('kin.classIsostatic');
  } else {
    classification = 'hyperstatic';
    classificationText = t('kin.classHyperstatic').replace('{degree}', String(degree)).replace('{s}', degree > 1 ? t('kin.plural_s') : '');
  }

  // Build detailed unconstrained DOF explanations
  const dofNames = getDofNames();
  const unconstrainedDofs: UnconstrainedDofDetail[] = [];
  for (const ud of kinResult.unconstrainedDofs) {
    unconstrainedDofs.push({
      nodeId: ud.nodeId,
      dof: ud.dof,
      dofName: dofNames[ud.dof] ?? ud.dof,
      explanation: explainUnconstrainedDof(ud.nodeId, ud.dof, input),
    });
  }

  // ── Step 3b: Per-element analysis ──

  const elementAnalysis = generatePerElementAnalysis(
    input, classification, mechanismNodes, unconstrainedDofs,
  );

  // ── Step 4: Suggestions ──

  const suggestions = generateSuggestions(unconstrainedDofs, input);

  return {
    nNodes, nFrames, nTrusses,
    supportDetails, totalR,
    hingeDetails, totalC,
    isPureTruss, formula, substitution,
    degree, classification, classificationText,
    nFreeDofs, hasHiddenMechanism, mechanismModes, mechanismNodes, unconstrainedDofs,
    elementAnalysis,
    suggestions,
    isSolvable: kinResult.isSolvable,
  };
}

// ─── Per-element analysis ────────────────────────────────────────

/**
 * BFS: check if connected element `connElemId` (sharing `sharedNode` with
 * the element under analysis `excludeElemId`) reaches a supported node
 * WITHOUT traversing through `excludeElemId`.
 *
 * This distinguishes "upstream" elements (that bring constraint from a
 * support) from "downstream" elements (that depend on the current element
 * for their own stability).
 */
function elemReachesSupportWithout(
  connElemId: number,
  sharedNode: number,
  excludeElemId: number,
  nodeElems: Map<number, Array<{ elemId: number; nodeI: number; nodeJ: number }>>,
  supportedNodes: Set<number>,
): boolean {
  // Start from the far end of the connected element
  const ceEntries = nodeElems.get(sharedNode)?.find(e => e.elemId === connElemId);
  if (!ceEntries) return false;
  const startNode = ceEntries.nodeI === sharedNode ? ceEntries.nodeJ : ceEntries.nodeI;

  if (supportedNodes.has(startNode)) return true;

  const visited = new Set<number>([startNode]);
  const queue = [startNode];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of (nodeElems.get(current) ?? [])) {
      if (e.elemId === excludeElemId) continue;
      const neighbor = e.nodeI === current ? e.nodeJ : e.nodeI;
      if (!visited.has(neighbor)) {
        if (supportedNodes.has(neighbor)) return true;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

/**
 * Find the closest support node reachable from `connElemId` without using `excludeElemId`.
 * Returns the support detail or null.
 */
function findReachableSupport(
  connElemId: number,
  sharedNode: number,
  excludeElemId: number,
  nodeElems: Map<number, Array<{ elemId: number; nodeI: number; nodeJ: number }>>,
  supportByNode: Map<number, SupportDetail>,
): SupportDetail | null {
  const ceEntry = nodeElems.get(sharedNode)?.find(e => e.elemId === connElemId);
  if (!ceEntry) return null;
  const startNode = ceEntry.nodeI === sharedNode ? ceEntry.nodeJ : ceEntry.nodeI;

  const sup = supportByNode.get(startNode);
  if (sup) return sup;

  const visited = new Set<number>([startNode]);
  const queue = [startNode];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of (nodeElems.get(current) ?? [])) {
      if (e.elemId === excludeElemId) continue;
      const neighbor = e.nodeI === current ? e.nodeJ : e.nodeI;
      if (!visited.has(neighbor)) {
        const s = supportByNode.get(neighbor);
        if (s) return s;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return null;
}

// ─── DOF-aware BFS ──────────────────────────────────────────────

interface DofSourceResult {
  support: SupportDetail;
  effectiveDofs: Set<DofLabel>;
  chain: number[];            // element IDs traversed
}

type ElemConnInfo = { elemId: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number; hingeStart: boolean; hingeEnd: boolean };

/**
 * Determine which DOFs can transfer through a connection at a shared node.
 * A rigid frame passes all 3 DOFs; a hinge or truss blocks θz.
 */
function connectionDofFilter(
  connType: 'frame' | 'truss',
  hingedAtSharedNode: boolean,
): Set<DofLabel> {
  if (connType === 'truss' || hingedAtSharedNode) {
    return new Set<DofLabel>(['ux', 'uy']);
  }
  return new Set<DofLabel>(['ux', 'uy', 'θz']);
}

/**
 * DOF-aware BFS: starting from a connected element at `sharedNode`,
 * find all reachable supports and track which DOFs survive the chain.
 *
 * At each hop, the surviving DOF set is intersected with the connection
 * filters (hinges block θz, trusses block θz). When a support is found,
 * the surviving DOFs are intersected with the support's restrained DOFs.
 */
function findDofSourcesViaChain(
  connElemId: number,
  sharedNode: number,
  excludeElemId: number,
  exitDofs: Set<DofLabel>,      // DOFs that can exit the analyzed element at this node
  nodeElems: Map<number, ElemConnInfo[]>,
  supportByNode: Map<number, SupportDetail>,
): DofSourceResult[] {
  const startEntry = nodeElems.get(sharedNode)?.find(e => e.elemId === connElemId);
  if (!startEntry) return [];

  // DOFs entering the first connected element
  const connHinged = (startEntry.nodeI === sharedNode && startEntry.hingeStart)
                  || (startEntry.nodeJ === sharedNode && startEntry.hingeEnd);
  const firstFilter = connectionDofFilter(startEntry.type, connHinged);
  const entryDofs = intersectDofs(exitDofs, firstFilter);
  if (entryDofs.size === 0) return [];

  const farNode = startEntry.nodeI === sharedNode ? startEntry.nodeJ : startEntry.nodeI;

  // BFS state
  interface BfsState {
    node: number;
    dofs: Set<DofLabel>;
    chain: number[];
    lastElemId: number;
  }

  const results: DofSourceResult[] = [];
  const visitedDofs = new Map<number, Set<DofLabel>>();
  visitedDofs.set(sharedNode, new Set<DofLabel>()); // don't revisit entry side
  visitedDofs.set(farNode, new Set(entryDofs));

  const queue: BfsState[] = [{
    node: farNode,
    dofs: entryDofs,
    chain: [connElemId],
    lastElemId: connElemId,
  }];

  while (queue.length > 0) {
    const state = queue.shift()!;

    // Check for support at this node
    const sup = supportByNode.get(state.node);
    if (sup) {
      const supDofs = parseSupportDofs(sup);
      // For translational DOFs (ux, uy): the support must specifically provide them.
      // For θz: ANY support provides θz through a rigid chain (moment arm effect).
      // A rigid frame chain converts rotational displacement at the near end into
      // translational displacement at the far end. Any translational reaction at
      // the support resists this displacement, effectively constraining θz.
      const effective = new Set<DofLabel>();
      for (const d of state.dofs) {
        if (d === 'θz') {
          // θz survived the chain (no hinges/trusses blocked it) →
          // any support provides rotational restraint through bending stiffness
          effective.add('θz');
        } else if (supDofs.has(d)) {
          effective.add(d);
        }
      }
      if (effective.size > 0) {
        results.push({ support: sup, effectiveDofs: effective, chain: [...state.chain] });
      }
      // Don't continue past a supported node — the support is the terminal source
      continue;
    }

    // Explore neighbors
    for (const e of (nodeElems.get(state.node) ?? [])) {
      if (e.elemId === excludeElemId || e.elemId === state.lastElemId) continue;

      const neighbor = e.nodeI === state.node ? e.nodeJ : e.nodeI;

      // DOF filter: hinge at the entry end of this element (state.node side)
      const hingeAtEntry = (e.nodeI === state.node && e.hingeStart)
                        || (e.nodeJ === state.node && e.hingeEnd);
      // DOF filter: hinge at the exit end of this element (neighbor side)
      const hingeAtExit = (e.nodeI === neighbor && e.hingeStart)
                       || (e.nodeJ === neighbor && e.hingeEnd);

      const filterEntry = connectionDofFilter(e.type, hingeAtEntry);
      const filterExit = connectionDofFilter(e.type, hingeAtExit);
      let newDofs = intersectDofs(state.dofs, filterEntry);
      newDofs = intersectDofs(newDofs, filterExit);
      if (newDofs.size === 0) continue;

      // Pruning: skip if we already visited this node with a superset of DOFs
      const prev = visitedDofs.get(neighbor);
      if (prev) {
        let allSeen = true;
        for (const d of newDofs) { if (!prev.has(d)) { allSeen = false; break; } }
        if (allSeen) continue;
        // Merge
        for (const d of newDofs) prev.add(d);
      } else {
        visitedDofs.set(neighbor, new Set(newDofs));
      }

      queue.push({
        node: neighbor,
        dofs: newDofs,
        chain: [...state.chain, e.elemId],
        lastElemId: e.elemId,
      });
    }
  }

  return results;
}

// ─── Build per-DOF breakdown ────────────────────────────────────

function buildDofBreakdown(
  elemId: number,
  elemType: 'frame' | 'truss',
  nodeI: number,
  nodeJ: number,
  hingeStart: boolean,
  hingeEnd: boolean,
  nodeIInfo: NodeConstraintInfo,
  nodeJInfo: NodeConstraintInfo,
  nodeElems: Map<number, ElemConnInfo[]>,
  supportByNode: Map<number, SupportDetail>,
  status: 'isostatic' | 'hyperstatic' | 'mechanism',
): DofBreakdown {
  const isFrame = elemType === 'frame';
  const dofLabels: DofLabel[] = isFrame ? ['ux', 'uy', 'θz'] : ['ux', 'uy'];
  const needed = isFrame ? 3 : 2;

  // Accumulate sources per DOF, per node
  const sourcesI: Record<DofLabel, DofConstraintSource[]> = { 'ux': [], 'uy': [], 'θz': [] };
  const sourcesJ: Record<DofLabel, DofConstraintSource[]> = { 'ux': [], 'uy': [], 'θz': [] };

  // Process each end
  const ends: Array<{ nId: number; isHinged: boolean; info: NodeConstraintInfo; acc: Record<DofLabel, DofConstraintSource[]> }> = [
    { nId: nodeI, isHinged: hingeStart, info: nodeIInfo, acc: sourcesI },
    { nId: nodeJ, isHinged: hingeEnd,   info: nodeJInfo, acc: sourcesJ },
  ];

  for (const end of ends) {
    // DOFs that can exit the element at this node
    const exitDofs: Set<DofLabel> = isFrame
      ? (end.isHinged ? new Set<DofLabel>(['ux', 'uy']) : new Set<DofLabel>(['ux', 'uy', 'θz']))
      : new Set<DofLabel>(['ux', 'uy']);

    // 1. Direct support
    if (end.info.support) {
      const supDofs = parseSupportDofs(end.info.support);
      const effective = intersectDofs(exitDofs, supDofs);
      for (const dof of effective) {
        end.acc[dof].push({
          fromNodeId: end.nId,
          label: `${end.info.support.type} ${t('kin.atNode')} ${end.nId}`,
          viaElems: [],
        });
      }
    }

    // 2. Virtual support from upstream elements
    for (const ce of end.info.connectedElems) {
      if (!ce.reachesSupport) continue;
      const results = findDofSourcesViaChain(
        ce.elemId, end.nId, elemId, exitDofs, nodeElems, supportByNode,
      );
      for (const res of results) {
        for (const dof of res.effectiveDofs) {
          end.acc[dof].push({
            fromNodeId: end.nId,
            label: `${res.support.type} ${t('kin.atNode')} ${res.support.nodeId}`,
            viaElems: res.chain,
          });
        }
      }
    }
  }

  // Combine per DOF from both nodes + deduplicate by (supportNodeId, dof)
  const combined: Record<DofLabel, DofConstraintSource[]> = { 'ux': [], 'uy': [], 'θz': [] };
  for (const dof of dofLabels) {
    const seen = new Set<string>();
    for (const src of [...sourcesI[dof], ...sourcesJ[dof]]) {
      // Extract support node from label for dedup
      const key = `${src.label}:${dof}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined[dof].push(src);
    }
  }

  // ── Helpers for θz couple (cupla) explanation ──
  // Format a source as text (label + chain path)
  const fmtSrc = (s: DofConstraintSource): string => {
    const via = s.viaElems.length > 0
      ? ` (${t('kin.via')} ${s.viaElems.map(id => `${t('kin.member')} ${id}`).join(' → ')})`
      : '';
    return s.label + via;
  };

  // Check if a source label corresponds to a support that directly provides θz.
  // Only Empotramiento (and Resorte with kz) directly restrain rotation.
  // All other supports (pin, rollers) only provide translational restraint;
  // their θz contribution comes from the moment arm (couple) effect.
  const isDirectThzLabel = (label: string): boolean =>
    label.startsWith(t('kin.supFixed')) || label.startsWith(t('kin.supSpring'));

  // Build a "cupla" explanation: θz is constrained by the force couple formed
  // between translational reactions at both ends of the element (or chain).
  // A single translational support can't prevent rotation on its own — it takes
  // two reaction forces at different locations to create the couple/moment.
  const buildCoupleText = (): string => {
    const allTransI = [...sourcesI['ux'], ...sourcesI['uy']];
    const allTransJ = [...sourcesJ['ux'], ...sourcesJ['uy']];
    const dedup = (srcs: DofConstraintSource[]): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const s of srcs) {
        if (!seen.has(s.label)) { seen.add(s.label); out.push(fmtSrc(s)); }
      }
      return out;
    };
    const descsI = dedup(allTransI);
    const descsJ = dedup(allTransJ);
    if (descsI.length > 0 && descsJ.length > 0) {
      return `${t('kin.couple')}: ${descsI.join(', ')} ↔ ${descsJ.join(', ')}`;
    }
    // Fallback: only one end has translational sources
    const available = descsI.length > 0 ? descsI : descsJ;
    if (available.length > 0) return `${available.join(', ')} (${t('kin.leverArm')})`;
    return t('kin.momentEquilibrium');
  };

  // θz implicit: if frame, no direct/virtual θz sources, but both nodes have translational restraint
  if (isFrame && combined['θz'].length === 0) {
    const nodeIHasUy = sourcesI['uy'].length > 0;
    const nodeJHasUy = sourcesJ['uy'].length > 0;
    const nodeIHasUx = sourcesI['ux'].length > 0;
    const nodeJHasUx = sourcesJ['ux'].length > 0;
    // θz is implicitly constrained if both nodes have at least one translational restraint
    // (the force couple from reactions at different nodes prevents rotation)
    if ((nodeIHasUy && nodeJHasUy) || (nodeIHasUx && nodeJHasUx)) {
      combined['θz'].push({
        fromNodeId: -1,
        label: buildCoupleText(),
        viaElems: [],
        implicit: true,
      });
    }
  }

  // Build display lines
  const lines: DofLine[] = dofLabels.map(dof => {
    const sources = combined[dof];
    let displayText: string;
    if (sources.length === 0) {
      displayText = '⚠ ' + t('kin.noConstraint');
    } else if (dof === 'θz') {
      // θz display: distinguish direct θz (from fixed/spring that directly restrains rotation)
      // from moment arm θz (from translational supports forming a couple).
      // A translational support alone cannot prevent rotation; it takes the PAIR of
      // translational reactions at different locations to form the couple.
      const directSources = sources.filter(s => !s.implicit && isDirectThzLabel(s.label));
      const momentArmSources = sources.filter(s => !s.implicit && !isDirectThzLabel(s.label));
      const implicitSources = sources.filter(s => s.implicit);
      const parts: string[] = [];
      if (directSources.length > 0) {
        // Direct θz from fixed support / rotational spring — show normally
        parts.push(...directSources.map(fmtSrc));
      }
      if (momentArmSources.length > 0 && directSources.length === 0) {
        // Only moment arm θz (no direct θz available) — show couple explanation
        parts.push(buildCoupleText());
      }
      if (implicitSources.length > 0) {
        // Implicit already carries the couple text from buildCoupleText()
        parts.push(...implicitSources.map(s => s.label));
      }
      displayText = parts.length > 0 ? parts.join(' · ') : '⚠ ' + t('kin.noConstraint');
    } else {
      displayText = sources.map(fmtSrc).join(' · ');
    }
    return { dof, sources, displayText };
  });

  // Keep countEffectiveConstraints for backward-compatible totalConstraints field
  const effectiveI = countEffectiveConstraints(nodeIInfo, elemType);
  const effectiveJ = countEffectiveConstraints(nodeJInfo, elemType);
  const totalConstraints = effectiveI + effectiveJ;

  // Summary derived from the element's classification status (consistent with badge).
  // Using status instead of raw constraint counts avoids inconsistencies between
  // the per-DOF display and the aggregate count from countEffectiveConstraints().
  const freeDofs = lines.filter(l => l.sources.length === 0).map(l => l.dof);
  let summary: string;
  if (status === 'mechanism') {
    if (freeDofs.length > 0) {
      summary = t('kin.summMechMissing').replace('{dofs}', freeDofs.join(', '));
    } else {
      summary = t('kin.summMech');
    }
  } else if (status === 'hyperstatic') {
    const overDofs = lines.filter(l => l.sources.length > 1 && !l.sources.every(s => s.implicit)).map(l => l.dof);
    if (overDofs.length > 0) {
      summary = t('kin.summHyperOver').replace('{dofs}', overDofs.join(', '));
    } else {
      summary = t('kin.summHyper');
    }
  } else {
    summary = t('kin.summIso');
  }

  return { lines, totalConstraints, needed, summary };
}

function generatePerElementAnalysis(
  input: SolverInput,
  globalClassification: 'hyperstatic' | 'isostatic' | 'hypostatic',
  mechanismNodes: number[],
  unconstrainedDofs: UnconstrainedDofDetail[],
): ElementConstraintAnalysis[] {
  const mechNodeSet = new Set(mechanismNodes);
  const unconstrainedByNode = new Map<number, string[]>();
  for (const ud of unconstrainedDofs) {
    if (!unconstrainedByNode.has(ud.nodeId)) unconstrainedByNode.set(ud.nodeId, []);
    unconstrainedByNode.get(ud.nodeId)!.push(ud.dofName);
  }

  // Pre-build support lookup by nodeId
  const supportByNode = new Map<number, SupportDetail>();
  const supportedNodes = new Set<number>();
  const supLabels2 = getSupportLabels();
  for (const sup of input.supports.values()) {
    const st = sup.type as string;
    const preset = supLabels2[st];
    if (preset) {
      supportByNode.set(sup.nodeId, {
        nodeId: sup.nodeId, type: preset.label, dofs: preset.dofs, restrainedDofs: preset.restrained,
      });
      supportedNodes.add(sup.nodeId);
    } else if (st === 'spring') {
      const parts: string[] = [];
      let d = 0;
      if (sup.kx && sup.kx > 0) { parts.push('ux'); d++; }
      if (sup.ky && sup.ky > 0) { parts.push('uy'); d++; }
      if (sup.kz && sup.kz > 0) { parts.push('\u03b8z'); d++; }
      if (d > 0) {
        supportByNode.set(sup.nodeId, {
          nodeId: sup.nodeId, type: t('kin.supSpring'), dofs: d, restrainedDofs: parts.join(', '),
        });
        supportedNodes.add(sup.nodeId);
      }
    }
  }

  // Pre-build element connectivity: for each node, list of elements connected
  const nodeElems = new Map<number, Array<{ elemId: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number; hingeStart: boolean; hingeEnd: boolean }>>();
  for (const elem of input.elements.values()) {
    const info = { elemId: elem.id, type: elem.type as 'frame' | 'truss', nodeI: elem.nodeI, nodeJ: elem.nodeJ, hingeStart: elem.hingeStart, hingeEnd: elem.hingeEnd };
    if (!nodeElems.has(elem.nodeI)) nodeElems.set(elem.nodeI, []);
    nodeElems.get(elem.nodeI)!.push(info);
    if (!nodeElems.has(elem.nodeJ)) nodeElems.set(elem.nodeJ, []);
    nodeElems.get(elem.nodeJ)!.push(info);
  }

  const results: ElementConstraintAnalysis[] = [];

  for (const elem of input.elements.values()) {
    const eType = elem.type as 'frame' | 'truss';
    const nodeIInfo = buildNodeConstraintInfo(
      elem.id, elem.nodeI, elem.hingeStart, eType,
      supportByNode, supportedNodes, nodeElems,
    );
    const nodeJInfo = buildNodeConstraintInfo(
      elem.id, elem.nodeJ, elem.hingeEnd, eType,
      supportByNode, supportedNodes, nodeElems,
    );

    // Classify element
    const nodeIMech = mechNodeSet.has(elem.nodeI);
    const nodeJMech = mechNodeSet.has(elem.nodeJ);
    const isMechanism = nodeIMech || nodeJMech;

    let status: 'isostatic' | 'hyperstatic' | 'mechanism';
    let explanation: string;

    if (isMechanism) {
      status = 'mechanism';
      const mechNodeIds: number[] = [];
      if (nodeIMech) mechNodeIds.push(elem.nodeI);
      if (nodeJMech) mechNodeIds.push(elem.nodeJ);
      const dofDetails = mechNodeIds.map(nid => {
        const dofs = unconstrainedByNode.get(nid);
        return dofs ? `${t('kin.node')} ${nid}: ${dofs.join(', ')} ${t('kin.unconstrained')}` : `${t('kin.node')} ${nid}: ${t('kin.unstable')}`;
      }).join('. ');
      explanation = `${dofDetails}.`;
    } else if (globalClassification === 'isostatic') {
      status = 'isostatic';
      explanation = buildElementExplanation(eType, nodeIInfo, nodeJInfo, 'isostatic');
    } else if (globalClassification === 'hyperstatic') {
      // Heuristic: count effective constraint sources (only from upstream elements)
      const effectiveI = countEffectiveConstraints(nodeIInfo, eType);
      const effectiveJ = countEffectiveConstraints(nodeJInfo, eType);
      const totalEffective = effectiveI + effectiveJ;
      const needed = eType === 'frame' ? 3 : 2;

      if (totalEffective > needed) {
        status = 'hyperstatic';
        explanation = buildElementExplanation(eType, nodeIInfo, nodeJInfo, 'hyperstatic');
      } else {
        status = 'isostatic';
        explanation = buildElementExplanation(eType, nodeIInfo, nodeJInfo, 'isostatic');
      }
    } else {
      // hypostatic but this particular element is not in mechanism zone
      status = 'isostatic';
      explanation = buildElementExplanation(eType, nodeIInfo, nodeJInfo, 'isostatic');
    }

    // Build per-DOF breakdown
    const dofBreakdown = buildDofBreakdown(
      elem.id, eType, elem.nodeI, elem.nodeJ,
      elem.hingeStart, elem.hingeEnd,
      nodeIInfo, nodeJInfo, nodeElems, supportByNode,
      status,
    );

    results.push({
      elemId: elem.id,
      type: eType,
      nodeIInfo,
      nodeJInfo,
      status,
      explanation,
      dofBreakdown,
    });
  }

  // Sort by elemId for consistent display
  results.sort((a, b) => a.elemId - b.elemId);
  return results;
}

function buildNodeConstraintInfo(
  thisElemId: number,
  nodeId: number,
  isHingedEnd: boolean,
  elemType: 'frame' | 'truss',
  supportByNode: Map<number, SupportDetail>,
  supportedNodes: Set<number>,
  nodeElems: Map<number, Array<{ elemId: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number; hingeStart: boolean; hingeEnd: boolean }>>,
): NodeConstraintInfo {
  const support = supportByNode.get(nodeId) ?? null;

  // Find other elements at this node + check if they reach a support independently
  const allAtNode = nodeElems.get(nodeId) ?? [];
  const connectedElems: NodeConstraintInfo['connectedElems'] = [];
  for (const e of allAtNode) {
    if (e.elemId === thisElemId) continue;
    const hingedHere = (e.nodeI === nodeId && e.hingeStart) || (e.nodeJ === nodeId && e.hingeEnd);
    const reaches = elemReachesSupportWithout(e.elemId, nodeId, thisElemId, nodeElems, supportedNodes);
    connectedElems.push({ elemId: e.elemId, type: e.type, hingedAtNode: hingedHere, reachesSupport: reaches });
  }

  // Build description
  const desc = buildConstraintDescription(nodeId, support, connectedElems, isHingedEnd, elemType,
    thisElemId, nodeElems, supportByNode);

  return {
    nodeId,
    support,
    connectedElems,
    isHingedEnd,
    constraintDescription: desc,
  };
}

/**
 * Build a didactic description of a node's constraints, distinguishing
 * upstream elements (that bring constraint) from downstream ones.
 */
function buildConstraintDescription(
  nodeId: number,
  support: SupportDetail | null,
  connectedElems: NodeConstraintInfo['connectedElems'],
  isHingedEnd: boolean,
  elemType: 'frame' | 'truss',
  thisElemId: number,
  nodeElems: Map<number, Array<{ elemId: number; nodeI: number; nodeJ: number }>>,
  supportByNode: Map<number, SupportDetail>,
): string {
  const parts: string[] = [];

  // Direct support
  if (support) {
    parts.push(`${support.type} (${support.restrainedDofs})`);
  }

  // Classify connected elements into upstream (reach support) and downstream (don't)
  const upstream = connectedElems.filter(ce => ce.reachesSupport);
  const downstream = connectedElems.filter(ce => !ce.reachesSupport);

  // Describe upstream elements (those that bring constraint)
  if (upstream.length > 0) {
    const upDescs = upstream.map(ce => {
      // Find which support this element chain reaches
      const reachedSup = findReachableSupport(ce.elemId, nodeId, thisElemId, nodeElems, supportByNode);
      const typeLabel = ce.type === 'frame' ? t('kin.connRigid') : t('kin.connHinged');
      const hingeNote = ce.hingedAtNode ? ', ' + t('kin.withHinge') : '';
      const supNote = reachedSup ? ` \u2192 ${t('kin.reachesSupport').replace('{type}', reachedSup.type.toLowerCase()).replace('{node}', String(reachedSup.nodeId))}` : '';
      return `${t('kin.member')} ${ce.elemId} (${typeLabel}${hingeNote})${supNote}`;
    });
    if (support) {
      parts.push(`+ ${t('kin.constraintFrom')} ${upDescs.join('; ')}`);
    } else {
      parts.push(`${t('kin.virtualConstraint')} ${upDescs.join('; ')}`);
    }
  }

  // Describe downstream elements (they depend on this bar, not the other way around)
  if (downstream.length > 0) {
    const downIds = downstream.map(ce => `${t('kin.member')} ${ce.elemId}`).join(', ');
    if (support || upstream.length > 0) {
      parts.push(`(${downIds} ${t('kin.dependsOnChain').replace('{s}', downstream.length > 1 ? t('kin.plural_n') : '')})`);
    }
    // If there's nothing else, these downstream elements don't help
  }

  // No support and no upstream connections
  if (!support && upstream.length === 0 && downstream.length === 0) {
    parts.push(t('kin.freeEnd'));
  } else if (!support && upstream.length === 0 && downstream.length > 0) {
    const downIds = downstream.map(ce => `${t('kin.member')} ${ce.elemId}`).join(', ');
    parts.push(`${t('kin.noOwnSupport')} ${downIds} ${t('kin.connectedNoSupport').replace('{s}', downstream.length > 1 ? t('kin.plural_s') : '')}`);
  }

  // Hinge note
  if (isHingedEnd && elemType === 'frame') {
    parts.push('\u2014 ' + t('kin.hingeReleasesMoment'));
  }

  return parts.join(' ');
}

/**
 * Count effective constraint sources at a node for heuristic classification.
 * Only counts direct supports and UPSTREAM connected elements (those that
 * actually reach a support independently).
 */
function countEffectiveConstraints(
  nodeInfo: NodeConstraintInfo,
  elemType: 'frame' | 'truss',
): number {
  let count = 0;

  // Direct support DOFs
  if (nodeInfo.support) {
    count += nodeInfo.support.dofs;
  }

  // Only count upstream connected elements (those that reach a support)
  for (const ce of nodeInfo.connectedElems) {
    if (!ce.reachesSupport) continue;
    if (ce.type === 'frame') {
      count += ce.hingedAtNode ? 2 : 3;
    } else {
      count += 1;
    }
  }

  // If this end is hinged, reduce by 1 (moment can't transfer)
  if (nodeInfo.isHingedEnd && elemType === 'frame') {
    count = Math.max(0, count - 1);
  }

  return count;
}

/**
 * Build explanation text that clearly distinguishes isostatic vs hyperstatic.
 */
function buildElementExplanation(
  elemType: 'frame' | 'truss',
  nodeIInfo: NodeConstraintInfo,
  nodeJInfo: NodeConstraintInfo,
  status: 'isostatic' | 'hyperstatic',
): string {
  const needed = elemType === 'frame' ? 3 : 2;

  // Count real constraint sources per node
  const countNode = (info: NodeConstraintInfo): number => {
    let c = 0;
    if (info.support) c += info.support.dofs;
    for (const ce of info.connectedElems) {
      if (!ce.reachesSupport) continue;
      if (ce.type === 'frame') c += ce.hingedAtNode ? 2 : 3;
      else c += 1;
    }
    if (info.isHingedEnd && elemType === 'frame') c = Math.max(0, c - 1);
    return c;
  };

  const cI = countNode(nodeIInfo);
  const cJ = countNode(nodeJInfo);
  const total = cI + cJ;

  // Build per-node summary
  const descNode = (info: NodeConstraintInfo, c: number): string => {
    if (info.support && info.connectedElems.some(ce => ce.reachesSupport)) {
      return `${info.support.type.toLowerCase()} + ${t('kin.constraintFromMembers')}`;
    }
    if (info.support) {
      return `${info.support.type.toLowerCase()} (${info.support.dofs} ${t('kin.reactions')})`;
    }
    const upstreams = info.connectedElems.filter(ce => ce.reachesSupport);
    if (upstreams.length > 0) {
      return `${t('kin.virtualConstraintShort')} (${c} ${t('kin.effectiveRestr')})`;
    }
    return t('kin.noDirectConstraints');
  };

  const nI = descNode(nodeIInfo, cI);
  const nJ = descNode(nodeJInfo, cJ);

  if (status === 'hyperstatic') {
    const excess = total - needed;
    return `${t('kin.node')} ${nodeIInfo.nodeId}: ${nI}. ${t('kin.node')} ${nodeJInfo.nodeId}: ${nJ}. ${t('kin.totalEffective').replace('{total}', String(total)).replace('{needed}', String(needed)).replace('{excess}', String(excess))}`;
  }

  // isostatic
  return `${t('kin.node')} ${nodeIInfo.nodeId}: ${nI}. ${t('kin.node')} ${nodeJInfo.nodeId}: ${nJ}. ${t('kin.justRight').replace('{needed}', String(needed))}`;
}

// ─── Helpers ────────────────────────────────────────────────────

function computeFreeDofs(input: SolverInput): number {
  const hasFrames = Array.from(input.elements.values()).some(e => e.type === 'frame');
  const dofsPerNode = hasFrames ? 3 : 2;
  let constrained = 0;
  for (const sup of input.supports.values()) {
    const t = sup.type as string;
    if (t === 'fixed') constrained += dofsPerNode;
    else if (t === 'pinned') constrained += 2;
    else if (t === 'rollerX' || t === 'rollerY' || t === 'inclinedRoller') constrained += 1;
    else if (t === 'spring') {
      if (sup.kx && sup.kx > 0) constrained++;
      if (sup.ky && sup.ky > 0) constrained++;
      if (hasFrames && sup.kz && sup.kz > 0) constrained++;
    }
  }
  return input.nodes.size * dofsPerNode - constrained;
}

/**
 * Explain WHY a specific DOF at a node is unconstrained.
 * Analyzes connectivity, hinges, supports, and element geometry.
 */
function explainUnconstrainedDof(nodeId: number, dof: string, input: SolverInput): string {
  const node = input.nodes.get(nodeId);
  if (!node) return '';

  // Find all elements connected to this node
  const connectedElems: Array<{ id: number; otherNodeId: number; hingedHere: boolean; hingedOther: boolean; type: string }> = [];
  for (const elem of input.elements.values()) {
    if (elem.nodeI === nodeId) {
      connectedElems.push({
        id: elem.id,
        otherNodeId: elem.nodeJ,
        hingedHere: elem.hingeStart,
        hingedOther: elem.hingeEnd,
        type: elem.type,
      });
    } else if (elem.nodeJ === nodeId) {
      connectedElems.push({
        id: elem.id,
        otherNodeId: elem.nodeI,
        hingedHere: elem.hingeEnd,
        hingedOther: elem.hingeStart,
        type: elem.type,
      });
    }
  }

  // Check if node has a support
  const support = Array.from(input.supports.values()).find(s => s.nodeId === nodeId);
  const supportedNodes = new Set(Array.from(input.supports.values()).map(s => s.nodeId));

  if (connectedElems.length === 0) {
    return t('kin.nodeNotConnected').replace('{node}', String(nodeId));
  }

  // Check if all elements at node are hinged
  const frameElems = connectedElems.filter(e => e.type === 'frame');
  const allHinged = frameElems.length > 0 && frameElems.every(e => e.hingedHere);
  const biArticulated = connectedElems.filter(e => e.hingedHere && e.hingedOther);

  // Rotation DOF unconstrained
  if (dof === 'rz') {
    if (allHinged && !support) {
      return t('kin.allHingedNoMoment').replace('{node}', String(nodeId)).replace('{elems}', frameElems.map(e => `Elem. ${e.id}`).join(', '));
    }
    if (allHinged && support && support.type !== 'fixed') {
      const supLabel = getSupportLabels()[support.type as string]?.label ?? support.type;
      return t('kin.allHingedSupportNoRot').replace('{node}', String(nodeId)).replace('{support}', supLabel);
    }
    return t('kin.insufficientRotConstraint').replace('{node}', String(nodeId));
  }

  // Translation DOF (ux or uy) unconstrained
  const direction = dof === 'ux' ? t('kin.dirHorizontal') : t('kin.dirVertical');

  if (!support && connectedElems.length === 1) {
    return t('kin.nodeFreeEnd').replace('{node}', String(nodeId)).replace('{elem}', String(connectedElems[0].id));
  }

  // Check for bi-articulated elements (only transmit axial)
  if (biArticulated.length > 0) {
    const biArtIds = biArticulated.map(e => `Elem. ${e.id}`).join(', ');
    // Check if all bi-articulated elements are in a direction that can't restrain this DOF
    const biArtVertical = biArticulated.filter(e => {
      const other = input.nodes.get(e.otherNodeId);
      if (!other) return false;
      const dx = Math.abs(other.x - node.x);
      const dy = Math.abs(other.y - node.y);
      return dy > dx * 5; // essentially vertical
    });
    const biArtHorizontal = biArticulated.filter(e => {
      const other = input.nodes.get(e.otherNodeId);
      if (!other) return false;
      const dx = Math.abs(other.x - node.x);
      const dy = Math.abs(other.y - node.y);
      return dx > dy * 5; // essentially horizontal
    });

    if (dof === 'ux' && biArtVertical.length === biArticulated.length && biArticulated.length === connectedElems.length) {
      return t('kin.biArtVertical').replace('{node}', String(nodeId)).replace('{elems}', biArtIds).replace('{dir}', direction);
    }
    if (dof === 'uy' && biArtHorizontal.length === biArticulated.length && biArticulated.length === connectedElems.length) {
      return t('kin.biArtHorizontal').replace('{node}', String(nodeId)).replace('{elems}', biArtIds).replace('{dir}', direction);
    }
  }

  // Check collinear all-hinged
  if (allHinged && frameElems.length >= 2) {
    const angles: number[] = [];
    for (const e of connectedElems) {
      const other = input.nodes.get(e.otherNodeId);
      if (other) angles.push(Math.atan2(other.y - node.y, other.x - node.x));
    }
    let allCollinear = true;
    if (angles.length >= 2) {
      const ref = angles[0];
      for (let i = 1; i < angles.length; i++) {
        let diff = Math.abs(angles[i] - ref) % Math.PI;
        if (diff > Math.PI / 2) diff = Math.PI - diff;
        if (diff > 0.1) { allCollinear = false; break; }
      }
    }
    if (allCollinear) {
      return t('kin.collinearHinged').replace('{node}', String(nodeId));
    }
  }

  // No support at all
  if (!support) {
    // Check if connecting elements provide stiffness in this direction
    // through their supported end
    const hasPathToSupport = connectedElems.some(e => {
      const otherSupported = supportedNodes.has(e.otherNodeId);
      return otherSupported && !e.hingedHere; // rigid connection means stiffness transfer
    });

    if (!hasPathToSupport && allHinged) {
      return t('kin.noSupportAllHinged').replace('{node}', String(nodeId)).replace('{dir}', direction);
    }
    if (!hasPathToSupport) {
      return t('kin.insufficientDirConstraint').replace('{node}', String(nodeId)).replace('{dir}', direction);
    }
  }

  // Generic fallback
  return t('kin.genericUnconstrained').replace('{node}', String(nodeId)).replace('{dof}', getDofNames()[dof] ?? dof);
}

/**
 * Generate actionable fix suggestions for detected mechanisms.
 */
function generateSuggestions(
  unconstrained: UnconstrainedDofDetail[],
  input: SolverInput,
): string[] {
  if (unconstrained.length === 0) return [];

  const suggestions: string[] = [];
  const supportedNodes = new Set(Array.from(input.supports.values()).map(s => s.nodeId));
  const seen = new Set<string>();

  for (const ud of unconstrained) {
    // Suggest adding support
    if (!supportedNodes.has(ud.nodeId)) {
      const key = `add-support-${ud.nodeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (ud.dof === 'rz') {
          suggestions.push(t('kin.sugAddFixed').replace('{node}', String(ud.nodeId)));
        } else if (ud.dof === 'ux') {
          suggestions.push(t('kin.sugAddHorizSupport').replace('{node}', String(ud.nodeId)));
        } else {
          suggestions.push(t('kin.sugAddVertSupport').replace('{node}', String(ud.nodeId)));
        }
      }
    }

    // Check if upgrading a support would help
    const sup = Array.from(input.supports.values()).find(s => s.nodeId === ud.nodeId);
    if (sup) {
      if (ud.dof === 'rz' && sup.type !== 'fixed') {
        const key = `upgrade-${ud.nodeId}`;
        if (!seen.has(key)) {
          seen.add(key);
          suggestions.push(t('kin.sugUpgradeSupport').replace('{node}', String(ud.nodeId)).replace('{type}', getSupportLabels()[sup.type as string]?.label ?? sup.type));
        }
      }
    }

    // Check for hinges that could be removed
    const hingesHere: Array<{ elemId: number; end: string }> = [];
    for (const elem of input.elements.values()) {
      if (elem.nodeI === ud.nodeId && elem.hingeStart) hingesHere.push({ elemId: elem.id, end: 'I' });
      if (elem.nodeJ === ud.nodeId && elem.hingeEnd) hingesHere.push({ elemId: elem.id, end: 'J' });
    }
    if (hingesHere.length > 0 && ud.dof === 'rz') {
      const key = `remove-hinge-${ud.nodeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push(t('kin.sugRemoveHinge').replace('{elem}', String(hingesHere[0].elemId)).replace('{end}', hingesHere[0].end).replace('{node}', String(ud.nodeId)));
      }
    }
  }

  // Check for global horizontal instability — only suggest if NO support in the
  // entire structure restrains horizontal displacement (ux).
  // A pinned, fixed, rollerY or spring-with-kx support provides ux restriction.
  const uxNodes = unconstrained.filter(u => u.dof === 'ux');
  if (uxNodes.length > 1) {
    const hasAnyHorizontalRestraint = Array.from(input.supports.values()).some(s => {
      const t = s.type as string;
      return t === 'fixed' || t === 'pinned' || t === 'rollerY' || (t === 'spring' && (s.kx ?? 0) > 0);
    });
    if (!hasAnyHorizontalRestraint) {
      const key = 'global-horizontal';
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push(t('kin.sugGlobalHorizontal'));
      }
    }
  }

  // If no specific suggestions yet, add a generic one
  if (suggestions.length === 0) {
    suggestions.push(t('kin.sugGeneric'));
  }

  return suggestions;
}
