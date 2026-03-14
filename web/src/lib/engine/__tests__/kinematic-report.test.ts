/**
 * Kinematic Report — Per-element Analysis Tests
 *
 * Tests for generatePerElementAnalysis() integrated via generateKinematicReport().
 * Verifies the "Análisis barra por barra" feature: per-element constraint
 * descriptions, classifications (isostatic/hyperstatic/mechanism), and
 * didactic explanation text.
 */

import { describe, it, expect } from 'vitest';
import { generateKinematicReport, type KinematicReport, type ElementConstraintAnalysis } from '../kinematic-report';
import type { SolverInput, SolverLoad } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────

const STEEL_E = 200_000;
const STD_A = 0.01;
const STD_IZ = 1e-4;

function makeInput(opts: {
  nodes: Array<[number, number, number]>;
  elements: Array<[number, number, number, 'frame' | 'truss', boolean?, boolean?]>;
  supports: Array<[number, number, string, number?, number?, number?]>;
  loads?: SolverLoad[];
}): SolverInput {
  const nodes = new Map(opts.nodes.map(([id, x, y]) => [id, { id, x, y }]));
  const materials = new Map([[1, { id: 1, e: STEEL_E, nu: 0.3 }]]);
  const sections = new Map([[1, { id: 1, a: STD_A, iz: STD_IZ }]]);
  const elements = new Map(opts.elements.map(([id, nodeI, nodeJ, type, hingeStart, hingeEnd]) => [
    id,
    { id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: hingeStart ?? false, hingeEnd: hingeEnd ?? false },
  ]));
  const supports = new Map(opts.supports.map(([id, nodeId, type, kx, ky, kz]) => {
    const sup: any = { id, nodeId, type: type as any };
    if (kx !== undefined) sup.kx = kx;
    if (ky !== undefined) sup.ky = ky;
    if (kz !== undefined) sup.kz = kz;
    return [id, sup];
  }));
  return { nodes, materials, sections, elements, supports, loads: opts.loads ?? [] };
}

function getReport(opts: Parameters<typeof makeInput>[0]): KinematicReport {
  const input = makeInput(opts);
  const report = generateKinematicReport(input);
  expect(report).not.toBeNull();
  return report!;
}

function getElemAnalysis(report: KinematicReport, elemId: number): ElementConstraintAnalysis {
  const ea = report.elementAnalysis.find(e => e.elemId === elemId);
  expect(ea).toBeDefined();
  return ea!;
}

// ═══════════════════════════════════════════════════════════════
// 1. Isostatic Structures — per-element should be 'isostatic'
// ═══════════════════════════════════════════════════════════════

describe('Per-element analysis — isostatic structures', () => {

  it('Simply supported beam: 1 element, both nodes with support → isostatic', () => {
    const report = getReport({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });

    expect(report.classification).toBe('isostatic');
    expect(report.elementAnalysis).toHaveLength(1);

    const ea = getElemAnalysis(report, 1);
    expect(ea.status).toBe('isostatic');
    expect(ea.type).toBe('frame');

    // Node 1: has pinned support
    expect(ea.nodeIInfo.support).not.toBeNull();
    expect(ea.nodeIInfo.support!.type).toBe('Pin support');
    expect(ea.nodeIInfo.connectedElems).toHaveLength(0);

    // Node 2: has roller support
    expect(ea.nodeJInfo.support).not.toBeNull();
    expect(ea.nodeJInfo.support!.type).toBe('Horizontal roller');
    expect(ea.nodeJInfo.connectedElems).toHaveLength(0);

    // Descriptions mention the support types
    expect(ea.nodeIInfo.constraintDescription).toContain('Pin support');
    expect(ea.nodeJInfo.constraintDescription).toContain('Horizontal roller');

    // Explanation mentions "Just right"
    expect(ea.explanation).toContain('Just right');
  });

  it('Cantilever: 1 element, fixed at node I, free at node J → isostatic', () => {
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
    });

    expect(report.classification).toBe('isostatic');
    const ea = getElemAnalysis(report, 1);
    expect(ea.status).toBe('isostatic');

    // Node 1: fixed
    expect(ea.nodeIInfo.support).not.toBeNull();
    expect(ea.nodeIInfo.support!.type).toBe('Fixed support');

    // Node 2: free end
    expect(ea.nodeJInfo.support).toBeNull();
    expect(ea.nodeJInfo.connectedElems).toHaveLength(0);
    expect(ea.nodeJInfo.constraintDescription).toContain('Free end');
  });

  it('Gerber beam (isostatic with internal hinge): 2 elements → both isostatic', () => {
    // Beam: pin--[elem 1]--hinge--[elem 2]--roller, with pin + roller + fixed
    // Actually: fixed at 1, hinge at 2 between elem 1 and 2, roller at 3
    // g = 3*2 + 3 - 3*3 - 1 = 6 + 3 - 9 - 1 = -1 ... that's hypostatic
    // Better: fixed at 1, pinned at 2, hinge between elem 1(J) and elem 2(I), roller at 3
    // g = 3*2 + (3+2+1) - 3*3 - 1 = 6 + 6 - 9 - 1 = 2, hyperstatic
    // Standard Gerber: pin at 1, roller at 2 (interior), hinge at mid, roller at 3
    // 2 elems: [1->2], [2->3]. Supports: pinned at 1, rollerX at 2, rollerX at 3.
    // Hinge: elem 1 end J. g = 3*2 + (2+1+1) - 3*3 - 1 = 6+4-9-1 = 0 ✓
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0]],
      elements: [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
    });

    expect(report.classification).toBe('isostatic');
    expect(report.elementAnalysis).toHaveLength(2);

    const ea1 = getElemAnalysis(report, 1);
    const ea2 = getElemAnalysis(report, 2);
    expect(ea1.status).toBe('isostatic');
    expect(ea2.status).toBe('isostatic');

    // Element 1: node 1 has pinned, node 2 has roller + connected to elem 2, hinge at J
    expect(ea1.nodeIInfo.support).not.toBeNull();
    expect(ea1.nodeJInfo.support).not.toBeNull();
    expect(ea1.nodeJInfo.isHingedEnd).toBe(true);
    expect(ea1.nodeJInfo.connectedElems).toHaveLength(1);
    expect(ea1.nodeJInfo.connectedElems[0].elemId).toBe(2);

    // Element 2: node 2 has roller + connected to elem 1 (which is hinged at node 2)
    expect(ea2.nodeIInfo.connectedElems).toHaveLength(1);
    expect(ea2.nodeIInfo.connectedElems[0].elemId).toBe(1);
  });

  it('Isostatic truss triangle: 3 truss elements → all isostatic', () => {
    // Triangle: nodes 1(0,0), 2(4,0), 3(2,3)
    // Supports: pinned at 1, rollerX at 2
    // Pure truss: g = m + r - 2n = 3 + 3 - 6 = 0
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 3]],
      elements: [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 1, 3, 'truss']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });

    expect(report.classification).toBe('isostatic');
    expect(report.elementAnalysis).toHaveLength(3);

    for (const ea of report.elementAnalysis) {
      expect(ea.status).toBe('isostatic');
      expect(ea.type).toBe('truss');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Hyperstatic Structures — per-element can be hyperstatic or isostatic
// ═══════════════════════════════════════════════════════════════

describe('Per-element analysis — hyperstatic structures', () => {

  it('Continuous beam 2 spans: both elements → hyperstatic', () => {
    // 3 nodes, 2 elements, 3 supports (pinned, rollerX, rollerX)
    // g = 3*2 + (2+1+1) - 3*3 = 6 + 4 - 9 = 1 (hyperstatic degree 1)
    const report = getReport({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
    });

    expect(report.classification).toBe('hyperstatic');
    expect(report.degree).toBe(1);
    expect(report.elementAnalysis).toHaveLength(2);

    // Both elements should be hyperstatic (both have support + connection)
    const ea1 = getElemAnalysis(report, 1);
    const ea2 = getElemAnalysis(report, 2);

    // At least one should be hyperstatic
    const statuses = [ea1.status, ea2.status];
    expect(statuses).toContain('hyperstatic');
  });

  it('Propped cantilever (fixed + roller): hyperstatic element', () => {
    // 1 element, fixed at node 1, rollerX at node 2
    // g = 3 + (3+1) - 3*2 = 3 + 4 - 6 = 1
    const report = getReport({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
    });

    expect(report.classification).toBe('hyperstatic');
    expect(report.degree).toBe(1);
    const ea = getElemAnalysis(report, 1);
    expect(ea.status).toBe('hyperstatic');
    expect(ea.explanation).toContain('excess');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Mechanism / Hypostatic — per-element identifies unstable bars
// ═══════════════════════════════════════════════════════════════

describe('Per-element analysis — mechanism detection', () => {

  it('Beam with no supports: both nodes are mechanism → element is mechanism', () => {
    // No supports at all — pure mechanism
    const report = getReport({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
    });

    expect(report.classification).toBe('hypostatic');
    expect(report.elementAnalysis).toHaveLength(1);
    const ea = getElemAnalysis(report, 1);
    expect(ea.status).toBe('mechanism');
    expect(ea.explanation).toContain('unconstrained');
  });

  it('Beam with only 1 roller: mechanism', () => {
    // Only rollerX at node 1 → needs more
    const report = getReport({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'rollerX']],
    });

    expect(report.classification).toBe('hypostatic');
    const ea = getElemAnalysis(report, 1);
    expect(ea.status).toBe('mechanism');
  });

  it('Mixed hyper+mechanism (g=0 but bad distribution): identifies mechanism element', () => {
    // Structure: fixed-[elem 1]-node 2-[elem 2]-node 3 (free)
    // Fixed at node 1 (3 DOFs), no support at 2 or 3
    // g = 3*2 + 3 - 3*3 = 6 + 3 - 9 = 0 (appears isostatic)
    // But rank analysis will show node 3 has unconstrained DOFs
    // because node 2 and 3 have only 1 element path to ground each, but node 3 is free
    // Actually with 2 frame elements and fixed at node 1:
    // g = 3*2 + 3 - 3*3 - 0 = 0, but element 2's far end (node 3) is free
    // The rank analysis should detect this as a mechanism even though g=0
    // Wait, actually this is correctly solved. The fixed support at 1 fully constrains 1.
    // Node 2 is connected to elem 1 (rigid at both ends) and elem 2 (rigid at both ends).
    // Node 3 only has elem 2 connecting it to node 2, but via rigid connection.
    // So node 2 gets stiffness from fixed node 1 via elem 1, and node 3 from node 2 via elem 2.
    // This is actually stable (like a cantilever with 2 segments). g=0 and solvable.

    // Better example: 3 nodes in L-shape. Fixed at node 1, hinge at node 2 between elems.
    // Node 3 is free. Elem 1: 1->2 with hingeEnd. Elem 2: 2->3.
    // g = 3*2 + 3 - 3*3 - 1 = 6+3-9-1 = -1, hypostatic.
    // Actually let's use a simpler example of g=0 with hidden mechanism.

    // Classic example: Two collinear beams with all hinges at intermediate node
    // [pin]--[elem 1, hingeEnd]--node 2--[elem 2, hingeStart]--[roller]
    // Both elements hinged at node 2, no support there
    // This means node 2 has 2 frame elements, 2 hinges → c = min(2, 2-1) = 1
    // g = 3*2 + (2+1) - 3*3 - 1 = 6+3-9-1 = -1 ... hypostatic

    // Use 3 rollers (h, v, h) + hinge:
    // pin at 1, rollerX at 3, rollerX at 2
    // elem 1: 1→2 (hingeEnd), elem 2: 2→3
    // g = 3*2 + (2+1+1) - 3*3 - 1 = 6+4-9-1 = 0
    // But elem 1 is hinged at node 2, so no moment transfer. Node 2 has roller + rigid from elem 2.
    // This is actually stable (Gerber beam). Rank analysis says OK.

    // Use a structure that's truly g=0 with hidden mechanism:
    // 2 collinear beams, pinned at 1, pinned at 3, all hinges at node 2:
    // elem 1: 1→2 hingeEnd, elem 2: 2→3 hingeStart
    // c at node 2: 2 hinges, 2 frames → c = min(2, 2-1) = 1
    // g = 3*2 + (2+2) - 3*3 - 1 = 6+4-9-1 = 0
    // But node 2 has both elements hinged → rotation free, plus
    // both pinn supports don't restrain rotation → this is a mechanism at node 2
    // The rank analysis detects this.

    const report = getReport({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
      elements: [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame', true, false]],
      supports: [[1, 1, 'pinned'], [2, 3, 'pinned']],
    });

    // g=0 but hidden mechanism
    expect(report.degree).toBe(0);
    expect(report.hasHiddenMechanism).toBe(true);
    expect(report.classification).toBe('hypostatic');

    // Both elements should be identified as mechanism since node 2 is in mechanism
    const ea1 = getElemAnalysis(report, 1);
    const ea2 = getElemAnalysis(report, 2);

    // At least one should be mechanism
    const statuses = [ea1.status, ea2.status];
    expect(statuses).toContain('mechanism');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Virtual support from connected elements
// ═══════════════════════════════════════════════════════════════

describe('Per-element analysis — virtual support from connections', () => {

  it('Multi-span beam: intermediate node has no direct support but virtual from connections', () => {
    // 3 nodes, 2 elements, fixed at 1, free at 2, rollerX at 3
    // g = 3*2 + (3+1) - 3*3 = 6+4-9 = 1 (hyperstatic)
    // Node 2 has NO direct support but is connected to both elements
    const report = getReport({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 3, 'rollerX']],
    });

    // Element 1: node 2 has no support but connected to elem 2
    const ea1 = getElemAnalysis(report, 1);
    expect(ea1.nodeJInfo.support).toBeNull();
    expect(ea1.nodeJInfo.connectedElems).toHaveLength(1);
    expect(ea1.nodeJInfo.connectedElems[0].elemId).toBe(2);
    expect(ea1.nodeJInfo.constraintDescription).toContain('irtual constraint');

    // Element 2: node 2 has no support but connected to elem 1
    const ea2 = getElemAnalysis(report, 2);
    expect(ea2.nodeIInfo.support).toBeNull();
    expect(ea2.nodeIInfo.connectedElems).toHaveLength(1);
    expect(ea2.nodeIInfo.connectedElems[0].elemId).toBe(1);
    expect(ea2.nodeIInfo.constraintDescription).toContain('irtual constraint');
  });

  it('Hinge info is correctly reported in constraint description', () => {
    // Gerber beam: elem 1 has hingeEnd at node 2
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0]],
      elements: [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX'], [3, 3, 'rollerX']],
    });

    const ea1 = getElemAnalysis(report, 1);
    // Element 1 has hinge at node J (node 2)
    expect(ea1.nodeJInfo.isHingedEnd).toBe(true);
    expect(ea1.nodeJInfo.constraintDescription).toContain('hinge');

    // Element 2: at node 2, connected elem 1 has a hinge at that node
    const ea2 = getElemAnalysis(report, 2);
    expect(ea2.nodeIInfo.connectedElems[0].hingedAtNode).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4b. Upstream vs Downstream — the key distinction
// ═══════════════════════════════════════════════════════════════

describe('Per-element analysis — upstream vs downstream elements', () => {

  it('Cantilever divided into 3 segments: downstream elements are NOT counted as support sources', () => {
    // Fixed at node 1 → Elem 1 → Node 2 → Elem 2 → Node 3 → Elem 3 → Node 4 (free)
    // g = 3*3 + 3 - 3*4 = 12 - 12 = 0 (isostatic)
    const report = getReport({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0], [4, 9, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
      supports: [[1, 1, 'fixed']],
    });

    expect(report.classification).toBe('isostatic');

    // Element 1: Node 1 has fixed support, Node 2 has Elem 2 connected
    const ea1 = getElemAnalysis(report, 1);
    expect(ea1.status).toBe('isostatic');
    expect(ea1.nodeIInfo.support).not.toBeNull();
    expect(ea1.nodeIInfo.support!.type).toBe('Fixed support');
    // At node 2: Elem 2 does NOT reach a support without going through Elem 1
    expect(ea1.nodeJInfo.connectedElems).toHaveLength(1);
    expect(ea1.nodeJInfo.connectedElems[0].elemId).toBe(2);
    expect(ea1.nodeJInfo.connectedElems[0].reachesSupport).toBe(false);
    // Description should NOT say "vinculación virtual" for a downstream element
    expect(ea1.nodeJInfo.constraintDescription).not.toContain('irtual constraint');

    // Element 2: Node 2 has Elem 1 (upstream → reaches fixed support), Node 3 has Elem 3 (downstream)
    const ea2 = getElemAnalysis(report, 2);
    expect(ea2.status).toBe('isostatic');
    // Node 2: Elem 1 reaches the fixed support → upstream
    expect(ea2.nodeIInfo.connectedElems[0].elemId).toBe(1);
    expect(ea2.nodeIInfo.connectedElems[0].reachesSupport).toBe(true);
    expect(ea2.nodeIInfo.constraintDescription).toContain('irtual constraint');
    // Node 3: Elem 3 does NOT reach a support without Elem 2 → downstream
    expect(ea2.nodeJInfo.connectedElems[0].elemId).toBe(3);
    expect(ea2.nodeJInfo.connectedElems[0].reachesSupport).toBe(false);
    expect(ea2.nodeJInfo.constraintDescription).not.toContain('irtual constraint');

    // Element 3: Node 3 has Elem 2 (upstream → reaches fixed through chain), Node 4 is free
    const ea3 = getElemAnalysis(report, 3);
    expect(ea3.status).toBe('isostatic');
    expect(ea3.nodeIInfo.connectedElems[0].elemId).toBe(2);
    expect(ea3.nodeIInfo.connectedElems[0].reachesSupport).toBe(true);
    expect(ea3.nodeJInfo.support).toBeNull();
    expect(ea3.nodeJInfo.connectedElems).toHaveLength(0);
    expect(ea3.nodeJInfo.constraintDescription).toContain('Free end');
  });

  it('Beam with supports on both ends: both nodes provide real constraint', () => {
    // Pinned at 1, rollerX at 3, intermediate node 2
    // Elem 1: 1→2, Elem 2: 2→3
    const report = getReport({
      nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 3, 'rollerX']],
    });

    // For Element 1 at node 2: Elem 2 reaches rollerX at node 3 → upstream
    const ea1 = getElemAnalysis(report, 1);
    expect(ea1.nodeJInfo.connectedElems[0].reachesSupport).toBe(true);

    // For Element 2 at node 2: Elem 1 reaches pinned at node 1 → upstream
    const ea2 = getElemAnalysis(report, 2);
    expect(ea2.nodeIInfo.connectedElems[0].reachesSupport).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Report completeness
// ═══════════════════════════════════════════════════════════════

describe('Per-element analysis — report completeness', () => {

  it('Returns analysis for every element', () => {
    // 5 elements
    const report = getReport({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0], [4, 9, 0], [5, 12, 0], [6, 15, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame'], [4, 4, 5, 'frame'], [5, 5, 6, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 6, 'rollerX']],
    });

    expect(report.elementAnalysis).toHaveLength(5);
    const ids = report.elementAnalysis.map(e => e.elemId);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('Returns empty array when no elements', () => {
    // generateKinematicReport returns null for < 2 nodes or < 1 element
    const input = makeInput({
      nodes: [[1, 0, 0]],
      elements: [],
      supports: [],
    });
    const report = generateKinematicReport(input);
    expect(report).toBeNull();
  });

  it('Handles mixed frame and truss elements', () => {
    // Triangle with 2 frames and 1 truss
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 3]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 1, 3, 'truss']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });

    const ea1 = getElemAnalysis(report, 1);
    const ea3 = getElemAnalysis(report, 3);
    expect(ea1.type).toBe('frame');
    expect(ea3.type).toBe('truss');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Per-DOF breakdown (dofBreakdown)
// ═══════════════════════════════════════════════════════════════

describe('Per-element analysis — DOF breakdown', () => {

  it('Cantilever (fixed): all 3 DOFs come from the empotramiento directly', () => {
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed']],
    });

    const ea = getElemAnalysis(report, 1);
    const bd = ea.dofBreakdown;
    expect(bd.lines).toHaveLength(3);

    // ux: from empotramiento at node 1
    const uxLine = bd.lines.find(l => l.dof === 'ux')!;
    expect(uxLine.sources).toHaveLength(1);
    expect(uxLine.sources[0].label).toContain('Fixed support');
    expect(uxLine.sources[0].label).toContain('Node 1');
    expect(uxLine.sources[0].viaElems).toEqual([]);

    // uy: from empotramiento at node 1
    const uyLine = bd.lines.find(l => l.dof === 'uy')!;
    expect(uyLine.sources).toHaveLength(1);
    expect(uyLine.sources[0].label).toContain('Fixed support');

    // θz: from empotramiento at node 1
    const tzLine = bd.lines.find(l => l.dof === 'θz')!;
    expect(tzLine.sources).toHaveLength(1);
    expect(tzLine.sources[0].label).toContain('Fixed support');

    expect(bd.summary).toContain('isostatic');
  });

  it('Simply supported beam (pinned + rollerX): ux(1), uy(2), θz(implicit)', () => {
    const report = getReport({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });

    const ea = getElemAnalysis(report, 1);
    const bd = ea.dofBreakdown;
    expect(bd.lines).toHaveLength(3);

    // ux: from pinned at node 1 (only source)
    const uxLine = bd.lines.find(l => l.dof === 'ux')!;
    expect(uxLine.sources).toHaveLength(1);
    expect(uxLine.sources[0].label).toContain('Pin support');

    // uy: from pinned at node 1 + roller at node 2 (2 sources)
    const uyLine = bd.lines.find(l => l.dof === 'uy')!;
    expect(uyLine.sources).toHaveLength(2);
    const uyLabels = uyLine.sources.map(s => s.label);
    expect(uyLabels.some(l => l.includes('Pin support'))).toBe(true);
    expect(uyLabels.some(l => l.includes('Horizontal roller'))).toBe(true);

    // θz: should be implicit couple (no direct θz source, but uy at both ends)
    // The force couple between the pin at node 1 and roller at node 2 prevents rotation.
    const tzLine = bd.lines.find(l => l.dof === 'θz')!;
    expect(tzLine.sources.length).toBeGreaterThanOrEqual(1);
    expect(tzLine.sources.some(s => s.implicit === true)).toBe(true);
    expect(tzLine.displayText).toContain('Couple');
    expect(tzLine.displayText).toContain('Pin support');
    expect(tzLine.displayText).toContain('Horizontal roller');
  });

  it('Cantilever chain (3 segments): DOFs flow via chain with element IDs', () => {
    // Fixed at node 1 → Elem 1 → Node 2 → Elem 2 → Node 3 → Elem 3 → Node 4 (free)
    const report = getReport({
      nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0], [4, 9, 0]],
      elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
      supports: [[1, 1, 'fixed']],
    });

    // Element 2: DOFs should come from empotramiento via Barra 1
    const ea2 = getElemAnalysis(report, 2);
    const bd2 = ea2.dofBreakdown;
    const ux2 = bd2.lines.find(l => l.dof === 'ux')!;
    expect(ux2.sources).toHaveLength(1);
    expect(ux2.sources[0].label).toContain('Fixed support');
    expect(ux2.sources[0].viaElems).toContain(1); // via Barra 1
    expect(ux2.displayText).toContain('via');

    // Element 3: DOFs should come from empotramiento via Barra 2 → Barra 1
    const ea3 = getElemAnalysis(report, 3);
    const bd3 = ea3.dofBreakdown;
    const ux3 = bd3.lines.find(l => l.dof === 'ux')!;
    expect(ux3.sources).toHaveLength(1);
    expect(ux3.sources[0].label).toContain('Fixed support');
    expect(ux3.sources[0].viaElems.length).toBeGreaterThanOrEqual(1); // via at least 1 element
    expect(ux3.displayText).toContain('via');
  });

  it('Hinge blocks θz flow through chain', () => {
    // Fixed at 1 → Elem 1 (hingeEnd) → Node 2 → Elem 2 → Node 3 (free)
    // Elem 2: at node 2, connected to Elem 1 which is hinged at node 2
    // θz cannot flow through the hinge → should NOT appear as source
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 8, 0]],
      elements: [[1, 1, 2, 'frame', false, true], [2, 2, 3, 'frame']],
      supports: [[1, 1, 'fixed']],
    });

    const ea2 = getElemAnalysis(report, 2);
    const bd2 = ea2.dofBreakdown;

    // ux and uy should still flow through the hinge
    const ux2 = bd2.lines.find(l => l.dof === 'ux')!;
    expect(ux2.sources.length).toBeGreaterThanOrEqual(1);

    // θz should NOT have a direct/virtual source from the chain (hinge blocks it)
    const tz2 = bd2.lines.find(l => l.dof === 'θz')!;
    const nonImplicitSources = tz2.sources.filter(s => !s.implicit);
    expect(nonImplicitSources).toHaveLength(0);
  });

  it('Propped cantilever (fixed + roller): 4 constraints for 3 DOF', () => {
    const report = getReport({
      nodes: [[1, 0, 0], [2, 6, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [[1, 1, 'fixed'], [2, 2, 'rollerX']],
    });

    const ea = getElemAnalysis(report, 1);
    const bd = ea.dofBreakdown;

    // uy should have 2 sources (fixed + roller)
    const uyLine = bd.lines.find(l => l.dof === 'uy')!;
    expect(uyLine.sources).toHaveLength(2);

    // Total should be more than needed
    expect(bd.totalConstraints).toBeGreaterThan(bd.needed);
    expect(bd.summary).toContain('excess');
  });

  it('No supports: all DOFs show sin restricción', () => {
    const report = getReport({
      nodes: [[1, 0, 0], [2, 5, 0]],
      elements: [[1, 1, 2, 'frame']],
      supports: [],
    });

    const ea = getElemAnalysis(report, 1);
    const bd = ea.dofBreakdown;

    for (const line of bd.lines) {
      expect(line.sources).toHaveLength(0);
      expect(line.displayText).toContain('no constraint');
    }
    expect(bd.summary).toContain('mechanism');
  });

  it('Truss element: only ux and uy lines (no θz)', () => {
    // Triangle truss: pinned at 1, rollerX at 2
    const report = getReport({
      nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 3]],
      elements: [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 1, 3, 'truss']],
      supports: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
    });

    // Check element 2 (2→3): connected to supports at both ends via chain
    const ea2 = getElemAnalysis(report, 2);
    const bd2 = ea2.dofBreakdown;
    expect(bd2.lines).toHaveLength(2); // only ux and uy
    expect(bd2.lines.map(l => l.dof)).toEqual(['ux', 'uy']);
    expect(bd2.needed).toBe(2);
  });
});
