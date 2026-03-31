/**
 * Z-up field name regression tests.
 *
 * Bug 1: Canvas draw-deformed.ts / draw-modes.ts read `uy` and `rz` from 2D
 * Displacement objects, but after the Z-up migration those fields are `uz` and
 * `ry`. This causes deformed shapes and mode shapes to render as flat lines.
 *
 * Bug 2: 3D self-weight loads in solver-shells.ts and solver-service.ts apply
 * gravity to `fy` instead of `fz`, causing buildings to deflect sideways.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { solve, solve3D } from '../wasm-solver';
import type { SolverInput, SolverLoad } from '../types';
import type {
  SolverInput3D, SolverNode3D, SolverSection3D, SolverElement3D,
  SolverSupport3D, AnalysisResults3D,
} from '../types-3d';
import type { SolverMaterial } from '../types';
import { buildSolverInput3D } from '../solver-service';
import { plateSelfWeightLoads, quadSelfWeightLoads, convertSurfaceLoad } from '../solver-shells';

// ─── Bug 1: 2D Displacement field names ────────────────────────

describe('Bug 1: 2D Displacement uses uz/ry (not uy/rz)', () => {
  const E = 200_000;
  const A = 0.01;
  const Iz = 1e-4;

  function makeCantilever(): SolverInput {
    return {
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 5, y: 0 }]]),
      materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: A, iz: Iz }]]),
      elements: new Map([[1, {
        id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
      }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as any }]]),
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: -10, my: 0 } }] as SolverLoad[],
    };
  }

  it('solver returns uz and ry fields on Displacement', () => {
    const results = solve(makeCantilever());
    const tipDisp = results.displacements.find(d => d.nodeId === 2)!;

    // Z-up fields must exist and be non-zero for a loaded cantilever
    expect(tipDisp).toHaveProperty('uz');
    expect(tipDisp).toHaveProperty('ry');
    expect(Math.abs(tipDisp.uz)).toBeGreaterThan(1e-10);
    expect(Math.abs(tipDisp.ry)).toBeGreaterThan(1e-10);

    // Legacy uy/rz aliases must NOT exist
    expect(tipDisp).not.toHaveProperty('uy');
    expect(tipDisp).not.toHaveProperty('rz');
  });

  it('draw-deformed dispMap type must use uz/ry', () => {
    // Verify the contract: canvas code must read uz/ry, not uy/rz.
    // If draw-deformed.ts reads .uy it gets undefined → zero displacement.
    const results = solve(makeCantilever());
    const tipDisp = results.displacements.find(d => d.nodeId === 2)!;

    const asAny = tipDisp as any;
    expect(asAny.uy).toBeUndefined();
    expect(asAny.rz).toBeUndefined();
    expect(Math.abs(tipDisp.uz)).toBeGreaterThan(1e-6);
    expect(Math.abs(tipDisp.ry)).toBeGreaterThan(1e-6);
  });

  it('2D canvas renderers must not read legacy uy/rz fields', () => {
    const drawDeformed = readFileSync(new URL('../../canvas/draw-deformed.ts', import.meta.url), 'utf8');
    const drawModes = readFileSync(new URL('../../canvas/draw-modes.ts', import.meta.url), 'utf8');

    for (const [label, text] of [['draw-deformed.ts', drawDeformed], ['draw-modes.ts', drawModes]] as const) {
      expect(text, `${label} should not read legacy .uy`).not.toMatch(/\.uy\b/);
      expect(text, `${label} should not read legacy .rz`).not.toMatch(/\.rz\b/);
      expect(text, `${label} should read canonical .uz`).toMatch(/\.uz\b/);
    }

    expect(drawDeformed, 'draw-deformed.ts should read canonical .ry').toMatch(/\.ry\b/);
  });

  it('2D load UI should label the global vertical direction as Z', () => {
    const toolLoadOptions = readFileSync(new URL('../../../components/floating-tools/ToolLoadOptions.svelte', import.meta.url), 'utf8');
    const selectedEntityPanel = readFileSync(new URL('../../../components/floating-tools/SelectedEntityPanel.svelte', import.meta.url), 'utf8');

    expect(toolLoadOptions).toMatch(/float\.loadForceYGlobal/);
    expect(toolLoadOptions).toContain('>Z</button>');
    expect(toolLoadOptions).not.toContain('title={t(\'float.loadGlobalYDir\')}>Y</button>');

    expect(selectedEntityPanel).toContain('>Z</button>');
    expect(selectedEntityPanel).not.toContain('title={t(\'float.loadGlobalYDir\')}>Y</button>');
  });

  it('2D load editors and summaries should use canonical fz/my helpers, not raw fy/mz aliases', () => {
    const selectedEntityPanel = readFileSync(new URL('../../../components/floating-tools/SelectedEntityPanel.svelte', import.meta.url), 'utf8');
    const nodeDetails = readFileSync(new URL('../../../components/property/NodeDetails.svelte', import.meta.url), 'utf8');
    const loadsTable = readFileSync(new URL('../../../components/tables/LoadsTable.svelte', import.meta.url), 'utf8');
    const whatIfPanel = readFileSync(new URL('../../../components/WhatIfPanel.svelte', import.meta.url), 'utf8');
    const proPanel = readFileSync(new URL('../../../components/pro/ProPanel.svelte', import.meta.url), 'utf8');
    const drawLoads = readFileSync(new URL('../../canvas/draw-loads.ts', import.meta.url), 'utf8');
    const sceneSync = readFileSync(new URL('../../viewport3d/scene-sync.ts', import.meta.url), 'utf8');

    for (const [label, text] of [
      ['SelectedEntityPanel.svelte', selectedEntityPanel],
      ['NodeDetails.svelte', nodeDetails],
      ['LoadsTable.svelte', loadsTable],
      ['WhatIfPanel.svelte', whatIfPanel],
      ['ProPanel.svelte', proPanel],
      ['scene-sync.ts', sceneSync],
    ] as const) {
      expect(text, `${label} should use shared 2D nodal-load vertical helper`).toContain('get2DDisplayNodalLoadVertical');
      expect(text, `${label} should use shared 2D nodal-load moment helper`).toContain('get2DDisplayNodalLoadMoment');
    }

    expect(drawLoads, 'draw-loads.ts should accept canonical 2D point moments as my').toContain('load.my ?? load.mz');
    expect(drawLoads, 'draw-loads.ts should label 2D point moments as My').toContain('My=');
  });

  it('manual solve buttons should validate 2D results via shared Z-up helpers', () => {
    const toolbarResults = readFileSync(new URL('../../../components/toolbar/ToolbarResults.svelte', import.meta.url), 'utf8');
    const toolbar = readFileSync(new URL('../../../components/Toolbar.svelte', import.meta.url), 'utf8');
    const coordSystem = readFileSync(new URL('../../geometry/coordinate-system.ts', import.meta.url), 'utf8');

    // Validation must use the shared hasInvalid2DDisplacements helper (which reads uz/ry via fallback)
    for (const [label, text] of [['ToolbarResults.svelte', toolbarResults], ['Toolbar.svelte', toolbar]] as const) {
      expect(text, `${label} should use shared hasInvalid2DDisplacements`).toContain('hasInvalid2DDisplacements');
      expect(text, `${label} should not validate 2D solves with legacy inline uy`).not.toContain('!isFinite(d.uy)');
      expect(text, `${label} should not validate 2D solves with legacy inline rz`).not.toContain('!isFinite(d.rz)');
    }

    // The shared helper must use get2DDisplayDisplacementVertical (uz ?? uy fallback)
    expect(coordSystem, 'hasInvalid2DDisplacements should use get2DDisplayDisplacementVertical').toContain('get2DDisplayDisplacementVertical');
  });

  it('shared displacement helpers should prefer Z-up fields with Y-up fallback', () => {
    const coordSystem = readFileSync(new URL('../../geometry/coordinate-system.ts', import.meta.url), 'utf8');
    const resultsStore = readFileSync(new URL('../../store/results.svelte.ts', import.meta.url), 'utf8');

    // Z-up fallback helpers
    expect(coordSystem, 'get2DDisplayDisplacementVertical should prefer uz').toContain('disp.uz ?? disp.uy');
    expect(coordSystem, 'get2DDisplayRotation should prefer ry').toContain('disp.ry ?? disp.rz');
    expect(resultsStore, 'results store maxDisplacement should use the shared 2D vertical helper').toContain('get2DDisplayDisplacementVertical(d)');
    expect(resultsStore, 'results store maxDisplacement should not use stale 2D uy magnitude').not.toContain('Math.sqrt(d.ux ** 2 + d.uy ** 2)');
  });

  it('3D nodal load updates should keep fy/fz and my/mz on their own axes', () => {
    const modelStore = readFileSync(new URL('../../store/model.svelte.ts', import.meta.url), 'utf8');
    const nodal3dBranch = modelStore.match(
      /else if \(load\.type === 'nodal3d'\) \{[\s\S]*?\n      \} else if \(load\.type === 'distributed3d'\)/,
    )?.[0];

    expect(nodal3dBranch, 'model.svelte.ts should have a dedicated nodal3d update branch').toBeTruthy();

    expect(nodal3dBranch, 'nodal3d updates should write fy to d.fy').toContain("if (data.fy !== undefined) d.fy = data.fy as number;");
    expect(nodal3dBranch, 'nodal3d updates should write fz to d.fz').toContain("if (data.fz !== undefined) d.fz = data.fz as number;");
    expect(nodal3dBranch, 'nodal3d updates should write my to d.my').toContain("if (data.my !== undefined) d.my = data.my as number;");
    expect(nodal3dBranch, 'nodal3d updates should write mz to d.mz').toContain("if (data.mz !== undefined) d.mz = data.mz as number;");
    expect(nodal3dBranch, 'nodal3d updates must not alias fy into fz').not.toContain("if (data.fz !== undefined || data.fy !== undefined) d.fz = (data.fz ?? data.fy) as number;");
  });

  it('AI artifact builder should use 2D reaction field names (rx/rz), not fy/fz', () => {
    const aiClient = readFileSync(new URL('../../ai/client.ts', import.meta.url), 'utf8');

    // maxReact must handle 2D reactions (rx/rz) — not just 3D (fx/fz)
    expect(aiClient, 'ai/client.ts should read rx for horizontal reaction').toContain('r.rx ?? r.fx');
    expect(aiClient, 'ai/client.ts should read rz for vertical reaction').toContain('r.rz ?? r.fz');
    // maxDisp should use uz directly, not fall back through uy
    expect(aiClient, 'ai/client.ts should not use stale d.uy fallback').not.toContain('d.uz ?? d.uy');
  });
});

// ─── Bug 2: 3D self-weight loads use wrong axis ────────────────

describe('Bug 2: 3D self-weight must apply gravity to fz (not fy)', () => {
  it('plateSelfWeightLoads produces fz loads, not fy', () => {
    const plates = new Map([[1, {
      id: 1, nodes: [1, 2, 3] as [number, number, number],
      materialId: 1, thickness: 0.2,
    }]]);
    const nodes = new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 0, y: 1, z: 0 }],
    ]);
    const materials = new Map([[1, {
      id: 1, e: 200000, nu: 0.3, rho: 78.5, fy: 250,
    }]]);

    const loads = plateSelfWeightLoads(plates, nodes, materials as any);

    expect(loads.length).toBe(3);
    for (const load of loads) {
      expect(load.type).toBe('nodal');
      // Gravity must be in fz (downward = negative Z in Z-up)
      expect(load.data.fz).toBeLessThan(0);
      // fy must be zero — gravity does NOT act sideways
      expect(load.data.fy).toBe(0);
    }
  });

  it('quadSelfWeightLoads produces fz loads, not fy', () => {
    const quads = new Map([[1, {
      id: 1, nodes: [1, 2, 3, 4] as [number, number, number, number],
      materialId: 1, thickness: 0.2,
    }]]);
    const nodes = new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 1, y: 1, z: 0 }],
      [4, { id: 4, x: 0, y: 1, z: 0 }],
    ]);
    const materials = new Map([[1, {
      id: 1, e: 200000, nu: 0.3, rho: 78.5, fy: 250,
    }]]);

    const loads = quadSelfWeightLoads(quads, nodes, materials as any);

    expect(loads.length).toBe(4);
    for (const load of loads) {
      expect(load.data.fz).toBeLessThan(0);
      expect(load.data.fy).toBe(0);
    }
  });

  it('convertSurfaceLoad should use fz not fy', () => {
    const quads = new Map([[1, {
      id: 1, nodes: [1, 2, 3, 4] as [number, number, number, number],
      materialId: 1, thickness: 0.2,
    }]]);
    const nodes = new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 1, y: 1, z: 0 }],
      [4, { id: 4, x: 0, y: 1, z: 0 }],
    ]);

    const surfaceLoad = { quadId: 1, q: 10 };
    const loads = convertSurfaceLoad(surfaceLoad as any, quads, nodes as any);

    expect(loads.length).toBe(4);
    for (const load of loads) {
      // Pressure on horizontal surface acts in Z
      expect(load.data.fz).not.toBe(0);
      expect(load.data.fy).toBe(0);
    }
  });

  it('3D cantilever with self-weight deflects in Z, not Y', () => {
    // Horizontal cantilever along X axis with self-weight
    // If gravity is correctly applied to fz, the beam deflects in Z (downward)
    // If buggy (applied to fy), it deflects in Y (sideways)
    const steelMat: SolverMaterial = { id: 1, e: 200000, nu: 0.3 };
    const section: SolverSection3D = { id: 1, a: 0.01, iz: 8.33e-6, iy: 4.16e-6, j: 1e-5 };

    const input: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 5, y: 0, z: 0 }],
      ]),
      materials: new Map([[1, steelMat]]),
      sections: new Map([[1, section]]),
      elements: new Map([[1, {
        id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
      }]]),
      supports: new Map([[0, {
        nodeId: 1,
        rx: true, ry: true, rz: true,
        rrx: true, rry: true, rrz: true,
      }]]),
      // Apply gravity as nodal loads in fz (simulating what buildSolverLoads3D should produce)
      // Weight = rho * A * L = 78.5 * 0.01 * 5 = 3.925 kN
      loads: [
        { type: 'nodal', data: { nodeId: 1, fx: 0, fy: 0, fz: -1.9625, mx: 0, my: 0, mz: 0 } },
        { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -1.9625, mx: 0, my: 0, mz: 0 } },
      ],
    };

    const result = solve3D(input);
    if (typeof result === 'string') throw new Error(result);

    const tipDisp = result.displacements.find(d => d.nodeId === 2)!;
    // Gravity in Z → deflection in Z, not Y
    expect(Math.abs(tipDisp.uz)).toBeGreaterThan(1e-6);
    expect(Math.abs(tipDisp.uy)).toBeLessThan(1e-10);
  });

  it('buildSolverInput3D(includeSelfWeight=true) emits self-weight in fz, not fy', () => {
    const model = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 5, y: 0, z: 0 }],
      ]),
      elements: new Map([[1, {
        id: 1,
        type: 'frame' as const,
        nodeI: 1,
        nodeJ: 2,
        materialId: 1,
        sectionId: 1,
        hingeStart: false,
        hingeEnd: false,
      }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed3d' as const }]]),
      loads: [],
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 8.33e-6, iz: 4.16e-6, j: 1e-5, b: 0.2, h: 0.3 }]]),
    };

    const input = buildSolverInput3D(model as any, true, false);
    expect(input).not.toBeNull();

    const nodalLoads = input!.loads.filter(
      (load): load is Extract<SolverInput3D['loads'][number], { type: 'nodal' }> => load.type === 'nodal',
    );

    expect(nodalLoads).toHaveLength(2);
    for (const load of nodalLoads) {
      expect(load.data.fy).toBe(0);
      expect(load.data.fz).toBeLessThan(0);
    }
  });

  it('flat 2D models must embed into the 3D solver on XZ with Z-up loads and Y bending', () => {
    const model = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0 }],
        [2, { id: 2, x: 5, y: 3 }],
      ]),
      elements: new Map([[1, {
        id: 1,
        type: 'frame' as const,
        nodeI: 1,
        nodeJ: 2,
        materialId: 1,
        sectionId: 1,
        hingeStart: false,
        hingeEnd: false,
      }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' as const }]]),
      loads: [
        { type: 'nodal' as const, data: { id: 1, nodeId: 2, fx: 4, fz: -10, my: 6 } },
      ],
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 4.16e-6, iy: 8.33e-6, j: 1e-5, b: 0.2, h: 0.3 }]]),
    };

    const input = buildSolverInput3D(model as any, false, false);
    expect(input).not.toBeNull();

    const tip = input!.nodes.get(2)!;
    expect(tip).toMatchObject({ x: 5, y: 0, z: 3 });

    const load = input!.loads.find(
      (item): item is Extract<SolverInput3D['loads'][number], { type: 'nodal' }> => item.type === 'nodal',
    )!;
    expect(load.data.fx).toBe(4);
    expect(load.data.fy).toBe(0);
    expect(load.data.fz).toBe(-10);
    expect(load.data.my).toBe(6);
    expect(load.data.mz).toBe(0);

    const support = input!.supports.get(1)!;
    expect(support.rx).toBe(true);
    expect(support.ry).toBe(true);
    expect(support.rz).toBe(true);
    expect(support.rrx).toBe(true);
    expect(support.rry).toBe(false);
    expect(support.rrz).toBe(true);
  });

  it('all 3D solve entry points must ensure WASM is ready before calling solve3D', () => {
    const toolbarResults = readFileSync(new URL('../../../components/toolbar/ToolbarResults.svelte', import.meta.url), 'utf8');
    const toolbar = readFileSync(new URL('../../../components/Toolbar.svelte', import.meta.url), 'utf8');

    // Both toolbar solve buttons must await WASM initialization before solve3D
    for (const [label, text] of [['ToolbarResults.svelte', toolbarResults], ['Toolbar.svelte', toolbar]] as const) {
      expect(text, `${label} must call ensureWasmReady or initSolver before solve3D`).toMatch(/ensureWasmReady|initSolver/);
      expect(text, `${label} handleSolve3D must be async`).toMatch(/async\s+function\s+handleSolve3D|handleSolve3D\s*=\s*async/);
    }
  });

  it('3D viewport should keep projected 2D result overlays in the same XZ plane as the model', () => {
    const resultsSync = readFileSync(new URL('../../viewport3d/results-sync.ts', import.meta.url), 'utf8');

    // Architecture: projection is done per-node via projectNodeToScene/shouldProjectModelToXZ
    // in results-sync, NOT via resultsParent.rotation (which is now identity).
    expect(resultsSync, 'results-sync labels should use shared scene projection helpers').toContain('projectNodeToScene');
    expect(resultsSync, 'results-sync labels should use the flat-model projection contract').toContain('shouldProjectModelToXZ');
  });
});
