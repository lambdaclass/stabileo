/**
 * Fixture generator — builds canonical + random models, solves with TS solver,
 * writes JSON fixtures to engine/tests/fixtures/ for Rust parity testing.
 *
 * Run: cd web && npx vitest run generate-fixtures
 */

import { describe, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { solve } from '../wasm-solver';
import { solve3D } from '../wasm-solver';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';
import type { SolverInput3D } from '../types-3d';
import { combineResults, computeEnvelope } from './combinations-legacy';
import { makeRandomModel2D, makeRandomModel3D } from './diff-fuzz-helpers';
import { createMockAPI } from './example-api-mock';
import { buildSolverInput2D, buildSolverInput3D } from '../solver-service';
import type { LoadCase } from '../../../lib/store/model.svelte';

// Mock uiStore so truss examples don't hit Svelte runtime
vi.mock('../../../lib/store/index', () => ({
  uiStore: { analysisMode: '2d' },
}));

import { load2DExample } from '../../../lib/store/model-examples-2d';
import { load3DExample } from '../../../lib/store/model-examples-3d';

// ─── Helpers ──────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(__dirname, '../../../../../engine/tests/fixtures');

/** Convert Map<number, T> to Record<string, T> for Rust-compatible JSON. */
function mapToObj<T>(map: Map<number, T>): Record<string, T> {
  const obj: Record<string, T> = {};
  for (const [k, v] of map) {
    obj[String(k)] = v;
  }
  return obj;
}

/** Serialize SolverInput to plain object (Maps → objects with string keys). */
function serializeInput(input: SolverInput) {
  return {
    nodes: mapToObj(input.nodes),
    materials: mapToObj(input.materials),
    sections: mapToObj(input.sections),
    elements: mapToObj(input.elements),
    supports: mapToObj(input.supports),
    loads: input.loads,
  };
}

/** Serialize SolverInput3D to plain object. */
function serializeInput3D(input: SolverInput3D) {
  return {
    nodes: mapToObj(input.nodes),
    materials: mapToObj(input.materials),
    sections: mapToObj(input.sections),
    elements: mapToObj(input.elements),
    supports: mapToObj(input.supports),
    loads: input.loads,
    leftHand: (input as any).leftHand,
  };
}

/** Write a fixture JSON file. */
function writeFixture(name: string, data: unknown) {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/** Build a 2D SolverInput from compact spec. */
function makeInput(opts: {
  nodes: Array<{ id: number; x: number; y: number }>;
  elements: Array<{ id: number; nodeI: number; nodeJ: number }>;
  supports: Array<{ id: number; nodeId: number; type: string }>;
  loads: SolverLoad[];
  e?: number; a?: number; iz?: number;
}): SolverInput {
  const e = opts.e ?? 200e3;
  const a = opts.a ?? 0.01;
  const iz = opts.iz ?? 0.0001;
  return {
    nodes: new Map(opts.nodes.map(n => [n.id, n])),
    materials: new Map([[1, { id: 1, e, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a, iz }]]),
    elements: new Map(opts.elements.map(el => [el.id, {
      id: el.id, type: 'frame' as const, nodeI: el.nodeI, nodeJ: el.nodeJ,
      materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
    }])),
    supports: new Map(opts.supports.map(s => [s.id, {
      id: s.id, nodeId: s.nodeId, type: s.type as any,
    }])),
    loads: opts.loads,
  };
}

/** Solve and write input+results fixture pair. Returns the results. */
function solveAndWrite2D(name: string, input: SolverInput): AnalysisResults {
  const results = solve(input);
  writeFixture(`${name}-input`, serializeInput(input));
  writeFixture(`${name}-results`, results);
  return results;
}

// ─── Test suite ───────────────────────────────────────────────────

describe('Generate fixtures for Rust parity testing', () => {
  // Ensure fixtures directory exists
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  // ─── 1. Simply supported beam with UDL ──────────────────────

  it('generates ss-beam fixture', () => {
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 6, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [
        { id: 1, nodeId: 1, type: 'pinned' },
        { id: 2, nodeId: 2, type: 'rollerX' },
      ],
      loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
    });
    solveAndWrite2D('ss-beam', input);
  });

  // ─── 2. Cantilever with point load ──────────────────────────

  it('generates cantilever fixture', () => {
    const input = makeInput({
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 }],
      elements: [{ id: 1, nodeI: 1, nodeJ: 2 }],
      supports: [{ id: 1, nodeId: 1, type: 'fixed' }],
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: -50, mz: 0 } }],
    });
    solveAndWrite2D('cantilever', input);
  });

  // ─── 3. Portal frame with D + L + W ────────────────────────

  it('generates portal-frame fixtures (per-case + combo + envelope)', () => {
    const baseNodes = [
      { id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 4 },
      { id: 3, x: 6, y: 4 }, { id: 4, x: 6, y: 0 },
    ];
    const baseElements = [
      { id: 1, nodeI: 1, nodeJ: 2 },
      { id: 2, nodeI: 2, nodeJ: 3 },
      { id: 3, nodeI: 3, nodeJ: 4 },
    ];
    const baseSupports = [
      { id: 1, nodeId: 1, type: 'fixed' },
      { id: 2, nodeId: 4, type: 'fixed' },
    ];

    // Dead load: UDL on beam
    const inputD = makeInput({
      nodes: baseNodes, elements: baseElements, supports: baseSupports,
      loads: [{ type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } }],
    });
    const resultD = solveAndWrite2D('portal-d', inputD);

    // Live load: UDL on beam
    const inputL = makeInput({
      nodes: baseNodes, elements: baseElements, supports: baseSupports,
      loads: [{ type: 'distributed', data: { elementId: 2, qI: -5, qJ: -5 } }],
    });
    const resultL = solveAndWrite2D('portal-l', inputL);

    // Wind: horizontal at node 2
    const inputW = makeInput({
      nodes: baseNodes, elements: baseElements, supports: baseSupports,
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 10, fy: 0, mz: 0 } }],
    });
    const resultW = solveAndWrite2D('portal-w', inputW);

    // Combinations
    const perCase = new Map<number, AnalysisResults>([
      [1, resultD], [2, resultL], [3, resultW],
    ]);

    // 1.2D + 1.6L
    const combo1 = combineResults(
      [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }],
      perCase,
    )!;
    writeFixture('portal-combo-12d-16l', {
      factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }],
      results: combo1,
    });

    // 1.2D + L + 1.6W
    const combo2 = combineResults(
      [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }],
      perCase,
    )!;
    writeFixture('portal-combo-12d-l-16w', {
      factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.0 }, { caseId: 3, factor: 1.6 }],
      results: combo2,
    });

    // 0.9D + 1.6W
    const combo3 = combineResults(
      [{ caseId: 1, factor: 0.9 }, { caseId: 3, factor: 1.6 }],
      perCase,
    )!;
    writeFixture('portal-combo-09d-16w', {
      factors: [{ caseId: 1, factor: 0.9 }, { caseId: 3, factor: 1.6 }],
      results: combo3,
    });

    // Envelope of 3 combos
    const envelope = computeEnvelope([combo1, combo2, combo3])!;
    writeFixture('portal-envelope', envelope);
  });

  // ─── 4. 3D cantilever ──────────────────────────────────────

  it('generates cantilever-3d fixture', () => {
    const input: SolverInput3D = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 6, y: 0, z: 0 }],
      ]),
      materials: new Map([[1, { id: 1, e: 200e3, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iy: 0.0001, iz: 0.0001, j: 0.0002 }]]),
      elements: new Map([[1, {
        id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2,
        materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false,
      }]]),
      supports: new Map([[1, {
        nodeId: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
      }]]),
      loads: [
        { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -10, fz: -5, mx: 0, my: 0, mz: 0 } },
      ],
    };

    const results = solve3D(input);
    writeFixture('cantilever-3d-input', serializeInput3D(input));
    writeFixture('cantilever-3d-results', results);
  });

  // ─── 5. Random seeded models (2D) ────────────────────────────

  for (let seed = 1; seed <= 50; seed++) {
    it(`generates random-${seed} fixture`, () => {
      const input = makeRandomModel2D(seed);
      try {
        const results = solve(input);
        // Only write fixture if solver succeeded (skip mechanisms)
        writeFixture(`random-${seed}-input`, serializeInput(input));
        writeFixture(`random-${seed}-results`, results);
      } catch {
        // Model is a mechanism or otherwise unsolvable — skip silently
        // Write a sentinel so Rust knows to skip
        writeFixture(`random-${seed}-skip`, { reason: 'mechanism or solver error' });
      }
    });
  }

  // ─── 6. Random seeded 3D models ────────────────────────────

  for (let seed = 1; seed <= 20; seed++) {
    it(`generates random3d-${seed} fixture`, () => {
      const input = makeRandomModel3D(seed);
      try {
        const results = solve3D(input);
        writeFixture(`random3d-${seed}-input`, serializeInput3D(input));
        writeFixture(`random3d-${seed}-results`, results);
      } catch {
        // Model is a mechanism or otherwise unsolvable — skip silently
        writeFixture(`random3d-${seed}-skip`, { reason: 'mechanism or solver error' });
      }
    });
  }
});

// ─── Example model fixtures ─────────────────────────────────────────
// Uses the real example loaders + buildSolverInput2D/3D to produce
// fixtures through the same code path the app takes.

/** Solve per load case for multi-case 2D models. */
function solvePerCase2D(
  api: ReturnType<typeof createMockAPI>,
  loadCases: LoadCase[],
) {
  const modelData = api.getModelData();
  const perCase = new Map<number, AnalysisResults>();
  for (const lc of loadCases) {
    const caseModel = {
      ...modelData,
      loads: modelData.loads.filter(l => (l.data as any).caseId === lc.id || ((l.data as any).caseId === undefined && lc.id === 1)),
    };
    const input = buildSolverInput2D(caseModel);
    if (!input) continue;
    perCase.set(lc.id, solve(input));
  }
  return perCase;
}

/** Solve per load case for multi-case 3D models. */
function solvePerCase3D(
  api: ReturnType<typeof createMockAPI>,
  loadCases: LoadCase[],
) {
  const modelData = api.getModelData();
  const perCase = new Map<number, { input: SolverInput3D; results: ReturnType<typeof solve3D> }>();
  for (const lc of loadCases) {
    const caseModel = {
      ...modelData,
      loads: modelData.loads.filter(l => (l.data as any).caseId === lc.id || ((l.data as any).caseId === undefined && lc.id === 1)),
    };
    const input = buildSolverInput3D(caseModel);
    if (!input) continue;
    perCase.set(lc.id, { input, results: solve3D(input) });
  }
  return perCase;
}

/** Write multi-case fixtures: per-case input+results, combos, envelope. */
function writeMultiCase2D(
  prefix: string,
  api: ReturnType<typeof createMockAPI>,
) {
  const { loadCases, combinations } = api.model;
  const modelData = api.getModelData();

  // Solve per case
  const perCase = solvePerCase2D(api, loadCases);
  const caseNames = new Map<number, string>();

  for (const lc of loadCases) {
    const caseName = `${prefix}-case${lc.id}`;
    caseNames.set(lc.id, caseName);
    const caseModel = {
      ...modelData,
      loads: modelData.loads.filter(l => (l.data as any).caseId === lc.id || ((l.data as any).caseId === undefined && lc.id === 1)),
    };
    const input = buildSolverInput2D(caseModel);
    if (!input || !perCase.has(lc.id)) continue;
    writeFixture(`${caseName}-input`, serializeInput(input));
    writeFixture(`${caseName}-results`, perCase.get(lc.id));
  }

  // Combos
  const comboResults: AnalysisResults[] = [];
  for (const combo of combinations) {
    const result = combineResults(combo.factors, perCase);
    if (!result) continue;
    comboResults.push(result);
    const comboName = `${prefix}-combo${combo.id}`;
    writeFixture(comboName, {
      factors: combo.factors,
      results: result,
    });
  }

  // Envelope
  if (comboResults.length > 0) {
    const envelope = computeEnvelope(comboResults);
    if (envelope) writeFixture(`${prefix}-envelope`, envelope);
  }

  // Write metadata for Rust tests to know which cases/combos exist
  writeFixture(`${prefix}-meta`, {
    loadCases: loadCases.map(lc => ({ id: lc.id, name: caseNames.get(lc.id) })),
    combinations: combinations.map(c => ({ id: c.id, name: c.name, factors: c.factors })),
  });
}

describe('Generate example model fixtures', () => {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  // ─── 2D single-case examples ──────────────────────────────────

  const singleCase2D = [
    'simply-supported', 'cantilever', 'portal-frame', 'continuous-beam',
    'two-story-frame', 'spring-support', 'point-loads', 'thermal',
    'settlement', 'cantilever-point', 'gerber-beam', 'multi-section-frame',
    'three-hinge-arch', 'color-map-demo', 'bridge-moving-load', 'bridge-highway',
    // Trusses (uiStore mocked to '2d' so they work)
    'truss', 'warren-truss', 'howe-truss',
  ];

  for (const name of singleCase2D) {
    it(`generates ex-${name} fixture`, () => {
      const api = createMockAPI();
      const found = load2DExample(name, api);
      if (!found) throw new Error(`Example '${name}' not found`);
      const modelData = api.getModelData();
      const input = buildSolverInput2D(modelData);
      if (!input) throw new Error(`buildSolverInput2D returned null for '${name}'`);
      const results = solve(input);
      writeFixture(`ex-${name}-input`, serializeInput(input));
      writeFixture(`ex-${name}-results`, results);
    });
  }

  // ─── 2D multi-case examples ───────────────────────────────────

  const multiCase2D = ['frame-cirsoc-dl', 'building-3story-dlw', 'frame-seismic'];

  for (const name of multiCase2D) {
    it(`generates ex-${name} multi-case fixtures`, () => {
      const api = createMockAPI();
      const found = load2DExample(name, api);
      if (!found) throw new Error(`Example '${name}' not found`);
      writeMultiCase2D(`ex-${name}`, api);
    });
  }

  // ─── 3D single-case examples ──────────────────────────────────

  const singleCase3D = [
    '3d-portal-frame', '3d-space-truss', '3d-cantilever-load',
    '3d-grid-slab', '3d-tower', '3d-torsion-beam', '3d-nave-industrial',
  ];

  for (const name of singleCase3D) {
    it(`generates ex-${name} fixture`, () => {
      const api = createMockAPI();
      const found = load3DExample(name, api);
      if (!found) throw new Error(`Example '${name}' not found`);
      const modelData = api.getModelData();
      const input = buildSolverInput3D(modelData);
      if (!input) throw new Error(`buildSolverInput3D returned null for '${name}'`);
      const results = solve3D(input);
      writeFixture(`ex-${name}-input`, serializeInput3D(input));
      writeFixture(`ex-${name}-results`, results);
    });
  }

  // ─── 3D multi-case example (3d-building) ──────────────────────

  it('generates ex-3d-building multi-case fixtures', () => {
    const api = createMockAPI();
    const found = load3DExample('3d-building', api);
    if (!found) throw new Error("Example '3d-building' not found");

    const { loadCases, combinations } = api.model;

    // Solve per case
    const perCase3D = solvePerCase3D(api, loadCases);
    const caseNames = new Map<number, string>();

    for (const lc of loadCases) {
      const caseName = `ex-3d-building-case${lc.id}`;
      caseNames.set(lc.id, caseName);
      const entry = perCase3D.get(lc.id);
      if (!entry) continue;
      writeFixture(`${caseName}-input`, serializeInput3D(entry.input));
      writeFixture(`${caseName}-results`, entry.results);
    }

    // Write metadata
    writeFixture('ex-3d-building-meta', {
      loadCases: loadCases.map(lc => ({ id: lc.id, name: caseNames.get(lc.id) })),
      combinations: combinations.map(c => ({ id: c.id, name: c.name, factors: c.factors })),
    });
  });
});
