/**
 * Fixture generator — builds canonical + random models, solves with TS solver,
 * writes JSON fixtures to engine/tests/fixtures/ for Rust parity testing.
 *
 * Run: cd web && npx vitest run generate-fixtures
 */

import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { solve } from '../solver-js';
import { solve3D } from '../solver-3d';
import type { SolverInput, SolverLoad, AnalysisResults } from '../types';
import type { SolverInput3D } from '../types-3d';
import { combineResults, computeEnvelope } from './combinations-legacy';
import { makeRandomModel2D } from './diff-fuzz-helpers';

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

  // ─── 5. Random seeded models ────────────────────────────────

  for (let seed = 1; seed <= 20; seed++) {
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
});
