/**
 * The design for other programs: section profiles as IFC names them, the forces of each physical
 * member element by element, the project workbook with its design sheets, and the project as IFC
 * input (members, footings, the design state as properties, steel never «satisfies»).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { physicalForceRows, physicalMembers, designSheets } from '../design-exchange';
import { currentWorkbookSheets } from '../project-workbook';
import { profileOfSection, projectIfcInput } from '../ifc-export';

const tr = (k: string) => k;

describe('profiles', () => {
  it('names the profile a section is, and falls back to b × h or the square of its area', () => {
    expect(profileOfSection({ shape: 'rect', a: 0.06, b: 0.2, h: 0.3 })).toEqual({ kind: 'rect', b: 0.2, h: 0.3 });
    expect(profileOfSection({ shape: 'I', a: 0.0028, b: 0.1, h: 0.2, tw: 0.0056, tf: 0.0085 })).toEqual({ kind: 'I', b: 0.1, h: 0.2, tw: 0.0056, tf: 0.0085 });
    expect(profileOfSection({ shape: 'CHS', a: 0.001, h: 0.1, t: 0.004 })).toEqual({ kind: 'hollowCircle', r: 0.05, t: 0.004 });
    expect(profileOfSection({ shape: 'RHS', a: 0.002, b: 0.1, h: 0.15, t: 0.005 })).toEqual({ kind: 'hollowRect', b: 0.1, h: 0.15, t: 0.005 });
    const sq = profileOfSection({ a: 0.04 });
    expect(sq.kind === 'rect' && sq.b).toBeCloseTo(0.2, 12);
  });
});

describe('a solved frame', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; });

  function frame() {
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(4, 0, 0);
    const col1 = modelStore.addElement(a, b, 'frame'), beam = modelStore.addElement(b, c, 'frame'), col2 = modelStore.addElement(d, c, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
    modelStore.addNodalLoad3D(b, 10, 0, -20, 0, 0, 0);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    return { col1, beam, col2 };
  }

  it('each bar is a member of its own without physical groups, with its forces at both ends', () => {
    const { beam } = frame();
    const pm = physicalMembers();
    expect(pm).toHaveLength(3);
    expect(pm.find((p) => p.elements[0]!.id === beam)!.elements[0]!.length).toBeCloseTo(4, 9);
    const rows = physicalForceRows();
    expect(rows[0]).toEqual(expect.arrayContaining(['member', 'element', 'N i (kN)', 'Mz j (kN·m)']));
    // One source (the single solve), three elements.
    expect(rows.length).toBe(1 + 3);
    const f = resultsStore.results3D!.elementForces.find((e) => e.elementId === beam)!;
    const row = rows.find((r) => r[2] === beam)!;
    expect(row[7]).toBeCloseTo(f.nStart, 3);
    expect(row[18]).toBeCloseTo(f.mzEnd, 3);
  });

  it('the workbook carries the design sheets and the forces by physical member', () => {
    frame();
    const names = currentWorkbookSheets(5).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Design elements', 'Design checks', 'Physical member forces']));
    expect(designSheets(tr, 'en')[0]!.rows[0]).toEqual(['element', 'family', 'level', 'governing check', 'clause', 'worst local utilization', 'member state', 'checks', 'held by']);
    expect(currentWorkbookSheets(5, { design: false }).map((s) => s.name)).not.toContain('Design elements');
  });

  it('as IFC input: columns, a beam, a footing, and the design state of each as properties', () => {
    const { col1, beam } = frame();
    const node = modelStore.elements.get(col1)!.nodeI;
    modelStore.model.footings = new Map([[1, { id: 1, nodeId: node, kind: 'isolated', B: 1.5, L: 1.5, thickness: 0.5, rotationDeg: 0, eccentricityB: 0, eccentricityL: 0, cover: 0.05, foundingElevation: -1.5 } as never]]);
    const i = projectIfcInput(tr, 'en', 'Test');
    expect(i.members.filter((m) => m.kind === 'column')).toHaveLength(2);
    expect(i.members.find((m) => m.id === String(beam))!.kind).toBe('beam');
    expect(i.footings[0]).toMatchObject({ B: 1.5, L: 1.5, thickness: 0.5, centre: [0, 0, -1.5] });
    expect(i.storeys.some((s) => s.z === 0)).toBe(true);
    for (const m of i.members) {
      expect(m.props!.DesignState).toBeDefined();
      expect(String(m.props!.DesignState)).not.toMatch(/verified/i);
    }
  });
});
