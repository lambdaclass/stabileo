/**
 * Generate JSON fixture files for all example models.
 *
 * Usage: npx vitest run src/lib/templates/generate-fixtures.ts
 *
 * This script runs each generator/example loader with a recording mock,
 * then writes the resulting model data to JSON files in fixtures/.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── Generator imports ───────────────────────────────────────────
import {
  generateIrregularSetbackTower3D,
  generateRcDesignFrame3D,
  generatePipeRack3D,
  generateMatFoundation3D,
  generateSuspensionBridge3D,
  generateCableStayedBridge3D,
  generateFullStadium3D,
  generateXLDiagridTower3D,
  generateGeodesicDome3D,
  generateSpaceFrame3D,
  generateGridBeams,
  generateTower3D,
  generate3DHingedArch,
  generateStadiumCanopy3D,
} from './generators';
import { load2DExample } from '../store/model-examples-2d';
import { load3DExample } from '../store/model-examples-3d';

// ─── JSON model format ──────────────────────────────────────────

interface JSONModel {
  name: string;
  materials: Array<{ id: number; [k: string]: unknown }>;
  sections: Array<{ id: number; [k: string]: unknown }>;
  nodes: Array<{ id: number; x: number; y: number; z: number }>;
  elements: Array<{
    id: number;
    type: 'frame' | 'truss';
    nodeI: number;
    nodeJ: number;
    materialId: number;
    sectionId: number;
    hingeStart: boolean;
    hingeEnd: boolean;
  }>;
  supports: Array<{ id: number; nodeId: number; type: string; [k: string]: unknown }>;
  loads: Array<{ type: string; data: Record<string, unknown> }>;
  plates: Array<{ id: number; nodes: number[]; materialId: number; thickness: number }>;
  quads: Array<{ id: number; nodes: number[]; materialId: number; thickness: number }>;
  constraints: Array<Record<string, unknown>>;
  loadCases: Array<{ id: number; type: string; name: string }>;
  combinations: Array<{ id: number; name: string; factors: Array<{ caseId: number; factor: number }> }>;
}

function uniqueSorted(values: number[], tol = 1e-6): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const unique: number[] = [];
  for (const value of sorted) {
    if (unique.length === 0 || Math.abs(value - unique[unique.length - 1]) > tol) unique.push(value);
  }
  return unique;
}

// ─── Recording mock ─────────────────────────────────────────────

function createRecordingMock(): { api: any; toJSON: () => JSONModel } {
  let nextNode = 1;
  let nextElem = 1;
  let nextSupport = 1;
  let nextLoad = 1;
  let nextMat = 2; // 1 is default
  let nextSec = 2; // 1 is default
  let nextPlate = 1;
  let nextQuad = 1;

  const nodes = new Map<number, any>();
  const elements = new Map<number, any>();
  const supports = new Map<number, any>();
  const materials = new Map<number, any>([
    [1, { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }],
  ]);
  const sections = new Map<number, any>([
    [1, { id: 1, name: 'IPN 300', a: 0.00690, iy: 0.00009800, iz: 0.00000451, j: 0.0000001, b: 0.125, h: 0.300 }],
  ]);
  const loads: any[] = [];
  const plates: any[] = [];
  const quads: any[] = [];
  const constraints: any[] = [];

  const model = {
    name: '',
    loadCases: [
      { id: 1, type: 'D' as const, name: 'Dead Load' },
      { id: 2, type: 'L' as const, name: 'Live Load' },
      { id: 3, type: 'W' as const, name: 'Wind' },
      { id: 4, type: 'E' as const, name: 'Earthquake' },
    ],
    combinations: [] as any[],
  };
  const nextId = { loadCase: 5, combination: 1 };

  const api = {
    model,
    nextId,
    // Node
    addNode(x: number, y: number, z?: number) {
      const id = nextNode++;
      nodes.set(id, { id, x, y, z: z ?? 0 });
      return id;
    },
    // Element
    addElement(nI: number, nJ: number, type: 'frame' | 'truss' = 'frame') {
      const id = nextElem++;
      elements.set(id, {
        id, type, nodeI: nI, nodeJ: nJ,
        materialId: 1, sectionId: type === 'truss' ? 2 : 1,
        hingeStart: false, hingeEnd: false,
      });
      return id;
    },
    // Support
    addSupport(nodeId: number, type: string, springK?: any, opts?: any) {
      const id = nextSupport++;
      supports.set(id, { id, nodeId, type, ...springK, ...opts });
      return id;
    },
    updateSupport(id: number, data: any) {
      const s = supports.get(id);
      if (s) Object.assign(s, data);
    },
    // Materials
    addMaterial(data: any) {
      const id = nextMat++;
      materials.set(id, { id, ...data });
      return id;
    },
    updateMaterial(id: number, data: any) {
      const existing = materials.get(id) ?? { id };
      materials.set(id, { ...existing, ...data, id });
    },
    // Sections
    addSection(data: any) {
      const id = nextSec++;
      sections.set(id, { id, ...data });
      return id;
    },
    updateSection(id: number, data: any) {
      const existing = sections.get(id) ?? { id };
      sections.set(id, { ...existing, ...data, id });
    },
    updateElementMaterial(elemId: number, matId: number) {
      const e = elements.get(elemId);
      if (e) e.materialId = matId;
    },
    updateElementSection(elemId: number, secId: number) {
      const e = elements.get(elemId);
      if (e) e.sectionId = secId;
    },
    // 2D loads
    addDistributedLoad(elemId: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number) {
      const id = nextLoad++;
      loads.push({ type: 'distributed', data: { id, elementId: elemId, qI, qJ: qJ ?? qI, angle, isGlobal, caseId } });
      return id;
    },
    addNodalLoad(nodeId: number, fx: number, fy: number, mz?: number, caseId?: number) {
      const id = nextLoad++;
      loads.push({ type: 'nodal', data: { id, nodeId, fx, fy, mz: mz ?? 0, caseId } });
      return id;
    },
    addPointLoadOnElement(elementId: number, a: number, p: number, opts?: any) {
      const id = nextLoad++;
      loads.push({ type: 'pointOnElement', data: { id, elementId, a, p, ...(opts ?? {}) } });
      return id;
    },
    addThermalLoad(elemId: number, dtUniform: number, dtGradient: number) {
      const id = nextLoad++;
      loads.push({ type: 'thermal', data: { id, elementId: elemId, dtUniform, dtGradient } });
      return id;
    },
    toggleHinge(elemId: number, end: 'start' | 'end') {
      const e = elements.get(elemId);
      if (e) {
        if (end === 'start') e.hingeStart = !e.hingeStart;
        else e.hingeEnd = !e.hingeEnd;
      }
    },
    // 3D loads
    addDistributedLoad3D(elemId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number) {
      const id = nextLoad++;
      loads.push({ type: 'distributed3d', data: { id, elementId: elemId, qYI, qYJ, qZI, qZJ, a, b, caseId } });
      return id;
    },
    addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number) {
      const id = nextLoad++;
      loads.push({ type: 'nodal3d', data: { id, nodeId, fx, fy, fz, mx, my, mz, caseId } });
      return id;
    },
    addSurfaceLoad3D(quadId: number, q: number, caseId?: number) {
      const id = nextLoad++;
      loads.push({ type: 'surface3d', data: { id, quadId, q, caseId } });
      return id;
    },
    // Shell elements
    addPlate(plateNodes: number[], materialId: number, thickness: number) {
      const id = nextPlate++;
      plates.push({ id, nodes: plateNodes, materialId, thickness });
      return id;
    },
    addQuad(quadNodes: number[], materialId: number, thickness: number) {
      const id = nextQuad++;
      quads.push({ id, nodes: quadNodes, materialId, thickness });
      return id;
    },
    // Constraints
    addConstraint(c: any) {
      constraints.push(c);
    },
    // Store-like methods used by generators
    clear() {
      nodes.clear();
      elements.clear();
      supports.clear();
      loads.length = 0;
      plates.length = 0;
      quads.length = 0;
      constraints.length = 0;
      model.name = '';
      // Reset counters
      nextNode = 1;
      nextElem = 1;
      nextSupport = 1;
      nextLoad = 1;
      nextPlate = 1;
      nextQuad = 1;
    },
    batch(fn: () => void) { fn(); },
    // Some generators access store.model.nodes directly
    get nodes() { return nodes; },
  };
  // Expose nodes on api.model too (hinged arch accesses store.model.nodes)
  (api.model as any).nodes = nodes;

  function toJSON(): JSONModel {
    return {
      name: model.name,
      materials: [...materials.values()],
      sections: [...sections.values()],
      nodes: [...nodes.values()],
      elements: [...elements.values()],
      supports: [...supports.values()],
      loads,
      plates,
      quads,
      constraints,
      loadCases: model.loadCases,
      combinations: model.combinations,
    };
  }

  return { api, toJSON };
}

// ─── Output directory ───────────────────────────────────────────

const FIXTURES_DIR = join(__dirname, 'fixtures');

function writeFixture(name: string, data: JSONModel) {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const path = join(FIXTURES_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ✓ ${name}.json — ${data.nodes.length} nodes, ${data.elements.length} elements`);
}

// ─── Generate all fixtures ──────────────────────────────────────

describe('Generate JSON fixtures', () => {
  // PRO generators (from generators.ts, called via ProPanel.svelte)
  it('torre-irregular-con-retiros', () => {
    const { api, toJSON } = createRecordingMock();
    generateIrregularSetbackTower3D(api as any, { storyH: 3.8, levels: 18, baysX: 6, baysZ: 5, bayX: 8, bayZ: 7, setbackAt: [8, 13], windLoad: 18 });
    writeFixture('torre-irregular-con-retiros', toJSON());
  });

  it('rc-design-frame', () => {
    const { api, toJSON } = createRecordingMock();
    generateRcDesignFrame3D(api as any, { baysX: 4, baysZ: 3, bayX: 7.5, bayZ: 6.5, stories: 8, storyH: 3.4, windLoad: 12 });
    writeFixture('rc-design-frame', toJSON());
  });

  it('pipe-rack', () => {
    const { api, toJSON } = createRecordingMock();
    generatePipeRack3D(api as any, { bays: 7, bayLength: 9, width: 10, levels: 3, levelHeight: 4.5, lateralLoad: 9 });
    writeFixture('pipe-rack', toJSON());
  });

  it('mat-foundation', () => {
    const { api, toJSON } = createRecordingMock();
    generateMatFoundation3D(api as any, { Lx: 36, Lz: 28, nX: 8, nZ: 7, subgradeKy: 90000 });
    writeFixture('mat-foundation', toJSON());
  });

  it('suspension-bridge', () => {
    const { api, toJSON } = createRecordingMock();
    generateSuspensionBridge3D(api as any, { mainSpan: 480, sideSpan: 120, deckWidth: 22, towerHeight: 90, sag: 45, nPanelsMain: 40, nPanelsSide: 10, trussDepth: 8, deckLoad: -32 });
    writeFixture('suspension-bridge', toJSON());
  });

  it('cable-stayed-bridge', () => {
    const { api, toJSON } = createRecordingMock();
    generateCableStayedBridge3D(api as any, { span: 160, deckWidth: 18, pylonHeight: 56, nPanels: 20, deckLoad: -26 });
    writeFixture('cable-stayed-bridge', toJSON());
  });

  it('full-stadium', () => {
    const { api, toJSON } = createRecordingMock();
    generateFullStadium3D(api as any, { majorRadius: 78, minorRadius: 54, innerMajorRadius: 42, innerMinorRadius: 26, roofRise: 24, nFrames: 24, roofLoad: -12 });
    writeFixture('full-stadium', toJSON());
  });

  it('xl-diagrid-tower', () => {
    const { api, toJSON } = createRecordingMock();
    generateXLDiagridTower3D(api as any, { H: 228, nLevels: 42, nSides: 20, baseRadiusX: 38, baseRadiusZ: 28, topRadiusX: 22, topRadiusZ: 16, lateralLoad: 18 });
    writeFixture('xl-diagrid-tower', toJSON());
  });

  it('geodesic-dome', () => {
    const { api, toJSON } = createRecordingMock();
    generateGeodesicDome3D(api as any, { radius: 40, frequency: 8, hemisphere: true, selfWeightLoad: -5 });
    writeFixture('geodesic-dome', toJSON());
  });

  // Basic 3D examples (from model-examples-3d.ts)
  const basic3D = [
    '3d-portal-frame', '3d-space-truss', '3d-cantilever-load',
    '3d-grid-slab', '3d-tower', '3d-torsion-beam',
    '3d-nave-industrial', '3d-building', 'pro-edificio-7p',
  ];
  for (const name of basic3D) {
    it(name, () => {
      const { api, toJSON } = createRecordingMock();
      load3DExample(name, api);
      writeFixture(name, toJSON());
    });
  }

  it('keeps major 3D examples on Z-up elevation levels', () => {
    for (const name of ['3d-nave-industrial', '3d-building', 'pro-edificio-7p']) {
      const { api, toJSON } = createRecordingMock();
      load3DExample(name, api);
      const model = toJSON();
      const nodesById = new Map(model.nodes.map((node) => [node.id, node]));
      const zLevels = uniqueSorted(model.nodes.map((node) => node.z));
      const verticalMembers = model.elements.filter((element) => {
        const nodeI = nodesById.get(element.nodeI);
        const nodeJ = nodesById.get(element.nodeJ);
        if (!nodeI || !nodeJ) return false;
        return Math.abs(nodeI.x - nodeJ.x) < 1e-6
          && Math.abs(nodeI.y - nodeJ.y) < 1e-6
          && Math.abs(nodeI.z - nodeJ.z) > 1e-6;
      });

      expect(zLevels.length, `${name} should span multiple z elevations`).toBeGreaterThan(2);
      expect(verticalMembers.length, `${name} should contain vertical Z-up members`).toBeGreaterThan(0);
    }
  });

  // ─── Z-up gravity-direction contract ────────────────────────────
  // For pure-gravity generators (no wind/seismic), assert that dead-load
  // forces are overwhelmingly in fz/qZ, not accidentally in fy/qY.
  // This catches the class of bug where a Y-up→Z-up migration moves
  // gravity loads to the wrong axis.

  describe('gravity loads point in Z, not Y', () => {
    /** Generators whose only loads are gravity (dead + live). */
    const gravityOnlyGenerators: Array<{ name: string; gen: () => JSONModel }> = [
      { name: 'space-frame', gen: () => { const m = createRecordingMock(); generateSpaceFrame3D(m.api as any, { nBaysX: 2, nBaysY: 2, nFloors: 2, bayWidth: 6, storyHeight: 3.6, q: -16 }); return m.toJSON(); } },
      { name: 'grid-beams', gen: () => { const m = createRecordingMock(); generateGridBeams(m.api as any, { Lx: 8, Lz: 8, nDivX: 4, nDivZ: 4, q: -20 }); return m.toJSON(); } },
      { name: 'hinged-arch-3d', gen: () => { const m = createRecordingMock(); generate3DHingedArch(m.api as any, { span: 12, rise: 4, nSegments: 12, q: -8 }); return m.toJSON(); } },
      { name: 'geodesic-dome', gen: () => { const m = createRecordingMock(); generateGeodesicDome3D(m.api as any, { radius: 20, frequency: 4, hemisphere: true, selfWeightLoad: -5 }); return m.toJSON(); } },
      { name: 'mat-foundation', gen: () => { const m = createRecordingMock(); generateMatFoundation3D(m.api as any, { Lx: 18, Lz: 14, nX: 4, nZ: 3, subgradeKy: 90000 }); return m.toJSON(); } },
    ];

    /** Generators that have gravity + lateral loads in separate cases. Check dead load case only. */
    const multiCaseGenerators: Array<{ name: string; gen: () => JSONModel }> = [
      { name: 'torre-irregular', gen: () => { const m = createRecordingMock(); generateIrregularSetbackTower3D(m.api as any, { storyH: 3.8, levels: 6, baysX: 4, baysZ: 3, bayX: 8, bayZ: 7, setbackAt: [4], windLoad: 18 }); return m.toJSON(); } },
      { name: 'rc-design-frame', gen: () => { const m = createRecordingMock(); generateRcDesignFrame3D(m.api as any, { baysX: 2, baysZ: 2, bayX: 7.5, bayZ: 6.5, stories: 3, storyH: 3.4, windLoad: 12 }); return m.toJSON(); } },
      { name: 'pipe-rack', gen: () => { const m = createRecordingMock(); generatePipeRack3D(m.api as any, { bays: 3, bayLength: 9, width: 10, levels: 2, levelHeight: 4.5, lateralLoad: 9 }); return m.toJSON(); } },
    ];

    for (const { name, gen } of gravityOnlyGenerators) {
      it(`${name}: nodal loads have |ΣFy| ≪ |ΣFz|`, () => {
        const model = gen();
        const nodalLoads = model.loads.filter(l => l.type === 'nodal3d');
        let sumFy = 0, sumFz = 0;
        for (const l of nodalLoads) {
          sumFy += Math.abs(l.data.fy as number);
          sumFz += Math.abs(l.data.fz as number);
        }
        if (sumFz > 0) {
          expect(sumFy / sumFz, `${name}: |ΣFy|/|ΣFz| should be < 0.01`).toBeLessThan(0.01);
        }
      });

      it(`${name}: distributed loads have |ΣqY| ≪ |ΣqZ|`, () => {
        const model = gen();
        const distLoads = model.loads.filter(l => l.type === 'distributed3d');
        let sumQy = 0, sumQz = 0;
        for (const l of distLoads) {
          sumQy += Math.abs(l.data.qYI as number) + Math.abs(l.data.qYJ as number);
          sumQz += Math.abs(l.data.qZI as number) + Math.abs(l.data.qZJ as number);
        }
        if (sumQz > 0) {
          expect(sumQy / sumQz, `${name}: |ΣqY|/|ΣqZ| should be < 0.05`).toBeLessThan(0.05);
        }
      });
    }

    for (const { name, gen } of multiCaseGenerators) {
      it(`${name}: dead-load case (1) distributed loads have |ΣqY| ≪ |ΣqZ|`, () => {
        const model = gen();
        const deadDistLoads = model.loads.filter(l =>
          l.type === 'distributed3d' && (l.data.caseId === 1 || l.data.caseId === undefined),
        );
        let sumQy = 0, sumQz = 0;
        for (const l of deadDistLoads) {
          sumQy += Math.abs(l.data.qYI as number) + Math.abs(l.data.qYJ as number);
          sumQz += Math.abs(l.data.qZI as number) + Math.abs(l.data.qZJ as number);
        }
        if (sumQz > 0) {
          expect(sumQy / sumQz, `${name}: dead-load |ΣqY|/|ΣqZ| should be < 0.01`).toBeLessThan(0.01);
        }
      });
    }
  });

  // Template catalog 3D (with default params from getTemplateCatalog3D)
  it('space-frame', () => {
    const { api, toJSON } = createRecordingMock();
    generateSpaceFrame3D(api as any, { nBaysX: 4, nBaysY: 4, nFloors: 4, bayWidth: 6, storyHeight: 3.6, q: -16 });
    writeFixture('space-frame', toJSON());
  });

  it('grid-beams', () => {
    const { api, toJSON } = createRecordingMock();
    generateGridBeams(api as any, { Lx: 8, Lz: 8, nDivX: 4, nDivZ: 4, q: -20 });
    writeFixture('grid-beams', toJSON());
  });

  it('tower-3d-2', () => {
    const { api, toJSON } = createRecordingMock();
    generateTower3D(api as any, { H: 6, nLevels: 2, baseWidth: 3, topWidth: 2.5, withBracing: true, lateralLoad: 10 });
    writeFixture('tower-3d-2', toJSON());
  });

  it('tower-3d-4', () => {
    const { api, toJSON } = createRecordingMock();
    generateTower3D(api as any, { H: 24, nLevels: 6, baseWidth: 6, topWidth: 3.5, withBracing: true, lateralLoad: 18 });
    writeFixture('tower-3d-4', toJSON());
  });

  it('hinged-arch-3d', () => {
    const { api, toJSON } = createRecordingMock();
    generate3DHingedArch(api as any, { span: 12, rise: 4, nSegments: 12, q: -8 });
    writeFixture('hinged-arch-3d', toJSON());
  });

  // Additional examples referenced in ToolbarExamples PRO section
  it('cable-stayed-bridge-small', () => {
    const { api, toJSON } = createRecordingMock();
    generateCableStayedBridge3D(api as any, { span: 72, deckWidth: 10, pylonHeight: 26, nPanels: 12, deckLoad: -18 });
    writeFixture('cable-stayed-bridge-small', toJSON());
  });

  it('stadium-canopy', () => {
    const { api, toJSON } = createRecordingMock();
    generateStadiumCanopy3D(api as any, { span: 54, depth: 18, nFrames: 9, roofLoad: -10, columnHeight: 14 });
    writeFixture('stadium-canopy', toJSON());
  });

  // 2D examples (from model-examples-2d.ts)
  const basic2D = [
    'simply-supported', 'cantilever', 'cantilever-point', 'continuous-beam',
    'portal-frame', 'two-story-frame', 'multi-section-frame', 'color-map-demo',
    'truss', 'warren-truss', 'howe-truss',
    'point-loads', 'spring-support', 'thermal', 'settlement',
    'three-hinge-arch', 'gerber-beam',
    'bridge-moving-load', 'bridge-highway',
    'frame-cirsoc-dl', 'building-3story-dlw', 'frame-seismic',
  ];
  for (const name of basic2D) {
    it(name, () => {
      const { api, toJSON } = createRecordingMock();
      load2DExample(name, api);
      writeFixture(name, toJSON());
    });
  }
});
