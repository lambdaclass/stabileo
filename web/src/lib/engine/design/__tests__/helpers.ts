/**
 * Shared helpers for the PR15 design test suites.
 *
 * These run against the REAL WASM solver (vitest.setup.ts calls initSolver), never
 * the Vite stub — `assertRealSolver()` fails loudly if the stub is in play, because
 * a stubbed solver would make every design assertion pass vacuously.
 */

import { expect } from 'vitest';
import { isSolverReady } from '../../wasm-solver';
import { solveCombinations3D, validateAndSolve3D } from '../../solver-service';
import { computeStationDemands } from '../../verification-service';
import {
  buildAllMemberContexts, buildCriticalSectionMap,
  type ContextModelData, type MemberContext,
} from '../member-context';
import { runOrientationDiagnostic } from '../orientation-diagnostic';
import type { AnalysisResults3D } from '../../types-3d';

/** A stubbed WASM solver makes design tests meaningless — fail loudly. */
export function assertRealSolver(): void {
  expect(isSolverReady(), 'real WASM solver must be initialised (not the Vite stub)').toBe(true);
}

const toMap = (arr: any[]) => new Map(arr.map((e: any) => (Array.isArray(e) ? [e[0], e[1]] : [e.id, e])));

export interface FixtureModel {
  model: any;
  data: ContextModelData;
}

/** Build a live model object from a fixture JSON. */
export function modelFromFixture(fixture: any): FixtureModel {
  const model = {
    name: fixture.name,
    nodes: toMap(fixture.nodes),
    elements: toMap(fixture.elements),
    materials: toMap(fixture.materials),
    sections: toMap(fixture.sections),
    supports: toMap(fixture.supports),
    loads: JSON.parse(JSON.stringify(fixture.loads)),
    plates: new Map(), quads: new Map(), constraints: [], connectors: new Map(),
    loadCases: fixture.loadCases ?? [],
    combinations: fixture.combinations ?? [],
  } as any;
  return {
    model,
    data: {
      nodes: model.nodes, elements: model.elements, sections: model.sections,
      materials: model.materials, supports: model.supports,
    },
  };
}

export interface SolvedFixture extends FixtureModel {
  results3D: AnalysisResults3D;
  perCombo: Map<number, AnalysisResults3D>;
  contexts: Map<number, MemberContext>;
  orientationSuspect: Set<number>;
  orientationIssues: ReturnType<typeof runOrientationDiagnostic>['issues'];
}

/** Solve + build contexts, exactly as the app's `computeDemands` command does. */
export function solveFixture(fixture: any, opts: { selfWeight?: boolean } = {}): SolvedFixture {
  assertRealSolver();
  const fm = modelFromFixture(fixture);
  const sw = opts.selfWeight ?? true;
  const combo = solveCombinations3D(fm.model, fm.model.loadCases, fm.model.combinations, sw, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solveCombinations3D: ${combo}`);
  const res = validateAndSolve3D(fm.model, sw, false);
  if (typeof res === 'string' || !res) throw new Error(`validateAndSolve3D: ${res}`);
  const sd = computeStationDemands(combo.perCombo, fm.model.combinations, fm.data as never);
  const orient = runOrientationDiagnostic(fm.data, sd.demands, fm.model.loads);
  const contexts = buildAllMemberContexts(fm.data, {
    demands: sd.demands, stations: sd.stations,
    criticalSections: buildCriticalSectionMap(fm.data),
    orientationSuspect: orient.suspect,
    analysisRevision: 1, demandRevision: 1,
  });
  return {
    ...fm, results3D: res, perCombo: combo.perCombo, contexts,
    orientationSuspect: orient.suspect, orientationIssues: orient.issues,
  };
}

/** Classify a member by geometry, for per-direction assertions. */
export function directionOf(data: ContextModelData, id: number): 'COL' | 'BEAM-X' | 'BEAM-Y' {
  const el = data.elements.get(id)!;
  const a = data.nodes.get(el.nodeI)!;
  const b = data.nodes.get(el.nodeJ)!;
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), dz = Math.abs((b.z ?? 0) - (a.z ?? 0));
  if (dz > Math.hypot(dx, dy)) return 'COL';
  return dx > dy ? 'BEAM-X' : 'BEAM-Y';
}

/** A minimal synthetic beam context, for pure-function tests without a solve. */
export function syntheticBeamContext(over: Partial<MemberContext> = {}): MemberContext {
  const nodes = new Map<number, any>([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 6, y: 0, z: 3 }]]);
  const elements = new Map<number, any>([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]);
  const sections = new Map<number, any>([[1, { id: 1, name: '300×600', b: 0.3, h: 0.6 }]]);
  const materials = new Map<number, any>([[1, { id: 1, name: 'H30', fy: 30 }]]);
  const supports = new Map<number, any>();
  return {
    elementId: 1, elementType: 'beam', L: 6,
    section: { id: 1, name: '300×600', b: 0.3, h: 0.6 },
    material: { fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 },
    demands: undefined, stations: undefined, criticalSections: undefined,
    axes: {
      flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
      bFlex: 0.3, hFlex: 0.6, biaxial: false,
      sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
    },
    slenderDeltaNs: 1, orientationSuspect: false,
    analysisRevision: 1, demandRevision: 1, blocking: [],
    modelData: { nodes, elements, sections, materials, supports },
    ...over,
  };
}
