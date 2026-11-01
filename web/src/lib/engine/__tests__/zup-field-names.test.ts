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
  SolverInput3D, SolverNode3D, SolverSection3D,
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
    // The PRO report's load table. F5 moved `serializeLoads` out of `ProPanel.svelte` and into
    // `pro-report-inputs.ts`; the requirement — a report never prints a raw `fy`/`mz` alias —
    // follows the code rather than the filename.
    const proReportInputs = readFileSync(new URL('../pro-report-inputs.ts', import.meta.url), 'utf8');
    const drawLoads = readFileSync(new URL('../../canvas/draw-loads.ts', import.meta.url), 'utf8');
    const sceneSync = readFileSync(new URL('../../viewport3d/scene-sync.ts', import.meta.url), 'utf8');

    for (const [label, text] of [
      ['SelectedEntityPanel.svelte', selectedEntityPanel],
      ['NodeDetails.svelte', nodeDetails],
      ['LoadsTable.svelte', loadsTable],
      ['WhatIfPanel.svelte', whatIfPanel],
      ['pro-report-inputs.ts', proReportInputs],
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
    const solveAction = readFileSync(new URL('../../actions/solve.ts', import.meta.url), 'utf8');
    // Validation must use the shared hasInvalid2DDisplacements helper (which
    // reads uz/ry via fallback). ToolbarResults is the only solve button left
    // in the toolbars — the mobile Toolbar's own copy was unreachable and was
    // deleted — and the validation itself lives in the action it delegates to.
    for (const [label, text] of [['ToolbarResults.svelte', toolbarResults], ['actions/solve.ts', solveAction]] as const) {
      expect(text, `${label} should use shared hasInvalid2DDisplacements`).toContain('hasInvalid2DDisplacements');
      expect(text, `${label} should not validate 2D solves with legacy inline uy`).not.toContain('!isFinite(d.uy)');
      expect(text, `${label} should not validate 2D solves with legacy inline rz`).not.toContain('!isFinite(d.rz)');
    }

    // What the shared helper answers (uz first, uy as a fallback) is `zup-behaviour.test.ts`'s.
  });

  it('PRO UI seams should treat pro mode as a 3D result/modeling path', () => {
    const aiDrawer = readFileSync(new URL('../../../components/AiDrawer.svelte', import.meta.url), 'utf8');
    // Copy/paste moved out of Toolbar with the rest of the keyboard layer:
    // Toolbar is mounted on mobile only, so every shortcut it owned did nothing
    // on desktop. These guarantees follow the code to its new home.
    const toolbar = readFileSync(new URL('../../../components/KeyboardShortcuts.svelte', import.meta.url), 'utf8');
    const oldToolbar = readFileSync(new URL('../../../components/Toolbar.svelte', import.meta.url), 'utf8');

    // Whether each of these treats PRO as a space workspace is `utils/__tests__/workspace-gate.test.ts`'s:
    // every such check goes through `is3DWorkspace`.
    expect(aiDrawer, 'AiDrawer.svelte should send canonical 3D mode to the AI backend').toContain("const aiAnalysisMode = $derived(is3DMode ? '3d' : '2d');");
    // Basic copies and pastes through PRO's clipboard, whose fragment carries every member field
    // (the 3D frame included) and goes in through the edit layer; `node-welds.test.ts` and
    // `basic-clipboard.test.ts` pin the result.
    expect(toolbar, 'KeyboardShortcuts.svelte should use the shared model clipboard').toContain("from '../lib/store/model-clipboard'");
    expect(oldToolbar, 'the keyboard layer should live in ONE place, not two')
      .not.toContain('function handleKeydown');
  });

  it('3D viewport presentation should be explicit rather than a boolean projection hint', () => {
    // A save and reload keeping the presentation is `zup-behaviour.test.ts`'s. What stays here:
    // the old boolean hint is gone, and the tab switch and the autosave restore it (component and
    // tab wiring, with no unit-level entry point).
    const coordinateSystem = readFileSync(new URL('../../geometry/coordinate-system.ts', import.meta.url), 'utf8');
    const tabsStore = readFileSync(new URL('../../store/tabs.svelte.ts', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../../../App.svelte', import.meta.url), 'utf8');
    expect(coordinateSystem, 'coordinate-system.ts should not use the old boolean hint anymore').not.toContain('preferProjectFlat2DIn3D');
    expect(tabsStore, 'tabs.svelte.ts should restore viewportPresentation3D after analysisMode').toContain('viewportPresentation3D ?? ');
    expect(app, 'App.svelte should restore viewportPresentation3D from autosave').toContain('autosaveData.viewportPresentation3D');
  });
  // The report's per-combination Mu summary fed only its retired design section and went with it;
  // the memoria reads the design's own rows (`engine/design/check-rows.ts`).
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
        materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
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

  it('buildSolverInput3D(includeSelfWeight=true) emits self-weight along global -Z, not along Y', () => {
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
        releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false,
      }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed3d' as const }]]),
      loads: [],
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 8.33e-6, iz: 4.16e-6, j: 1e-5, b: 0.2, h: 0.3 }]]),
    };

    const input = buildSolverInput3D(model as any, true, false);
    expect(input).not.toBeNull();

    // Self-weight is a member load along the member now (wL²/8 at midspan), no longer lumped at
    // the nodes. Put back into global axes it must point down Z and have nothing along Y.
    const member = input!.loads.filter(
      (load): load is Extract<SolverInput3D['loads'][number], { type: 'distributed' }> => load.type === 'distributed',
    );
    expect(member).toHaveLength(1);
    const w = 78.5 * 0.01;
    const { qYI, qYJ, qZI, qZJ } = member[0]!.data;
    // A horizontal member along X: local z is up and local y horizontal.
    expect(qYI).toBeCloseTo(0, 12);
    expect(qYJ).toBeCloseTo(0, 12);
    expect(qZI).toBeCloseTo(-w, 12);
    expect(qZJ).toBeCloseTo(-w, 12);
    expect(input!.loads.some((l) => l.type === 'nodal' && Math.abs(l.data.fy) > 0)).toBe(false);
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
        releaseMyStart: false, releaseMyEnd: false,
        releaseMzStart: false, releaseMzEnd: false,
        releaseTStart: false, releaseTEnd: false,
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
    // Standing in X–Z the plane is reflected, (x, y) → (x, 0, y): a counter-clockwise couple as
    // drawn is about −Y (embedded-plane-point-loads.test.ts; the reactions' My turns sign too).
    expect(load.data.my).toBe(-6);
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
    /*
     * The 3D solve path moved out of ToolbarResults into lib/actions/solve.ts
     * so the ribbon could solve without opening a panel first. The guard is
     * unchanged in intent — WASM must be initialised before solve3D — and it
     * has exactly one place to check: the mobile toolbar used to keep its own
     * copy of the pipeline, but that copy was unreachable (its solve button
     * has always gone through ToolbarResults → runSolve), so it was deleted
     * rather than kept in sync forever.
     */
    const solveAction = readFileSync(new URL('../../actions/solve.ts', import.meta.url), 'utf8');
    const manualSolve = readFileSync(new URL('../live-calc.ts', import.meta.url), 'utf8');

    // The action's 3D arm is the manual solve, `runGlobalSolve`, which readies WASM first.
    expect(solveAction, 'actions/solve.ts must solve 3D through runGlobalSolve').toMatch(/runGlobalSolve\(/);
    expect(manualSolve, 'runGlobalSolve must call ensureWasmReady before solve3D').toMatch(/await ensureWasmReady\(/);

    // And nothing may call solve3D without going through it: ToolbarResults is
    // the button every toolbar (desktop or mobile) renders, and it delegates.
    const results = readFileSync(new URL('../../../components/toolbar/ToolbarResults.svelte', import.meta.url), 'utf8');
    expect(results, 'ToolbarResults must delegate rather than re-implement solving')
      .toMatch(/runSolve/);
  });

  it('3D viewport should keep projected 2D result overlays in the same XZ plane as the model', () => {
    const resultsSync = readFileSync(new URL('../../viewport3d/results-sync.ts', import.meta.url), 'utf8');

    // Architecture: projection is done per-node via projectNodeToScene/shouldProjectModelToXZ
    // in results-sync, NOT via resultsParent.rotation (which is now identity).
    expect(resultsSync, 'results-sync labels should use shared scene projection helpers').toContain('projectNodeToScene');
    expect(resultsSync, 'results-sync labels should use the flat-model projection contract').toContain('shouldProjectModelToXZ');
  });
});
