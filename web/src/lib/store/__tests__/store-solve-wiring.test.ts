/**
 * Regression pin: connectors and constraints must flow from the modelStore
 * into the solver through the PRODUCTION entry points (solve3D /
 * solveCombinations3D / buildSolverInput3D / the 2D remap path) — not only
 * when callers hand-build a ModelData, which is what the engine-level wire
 * tests do.
 *
 * Background: PR #51 review found that every store solve wrapper omitted
 * `connectors` (and remapModelForPlane omitted `constraints`), making the
 * feature inert in the app while engine-level tests stayed green.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { initSolver } from '../../engine/wasm-solver';

/** Two supported nodes + frame, plus node 3 attached ONLY via a connector. */
function buildConnectorOnlyNodeModel() {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0, 0);
  const n2 = modelStore.addNode(5, 0, 0);
  const n3 = modelStore.addNode(5, 0, 1); // coupled only through the connector
  modelStore.addElement(n1, n2, 'frame');
  modelStore.addSupport(n1, 'fixed3d');
  modelStore.addSupport(n3, 'fixed3d');
  modelStore.addNodalLoad3D(n2, 0, 0, -10, 0, 0, 0);
  modelStore.addConnector({
    nodeI: n2, nodeJ: n3,
    kAxial: 1e6, kShear: 1e6, kMoment: 1e3,
    kShearZ: 1e6, kBendY: 1e3, kBendZ: 1e3,
  });
  return { n1, n2, n3 };
}

describe('store → solver wiring for connectors/constraints', () => {
  beforeEach(async () => {
    await initSolver();
  });

  it('solve3D forwards connectors: a connector-only-coupled node solves instead of erroring', () => {
    buildConnectorOnlyNodeModel();
    const result = modelStore.solve3D(false, false, true);
    // Without the wiring fix this is the preflight string error
    // ('disconnected node') because the wrapper dropped `connectors`.
    expect(typeof result).not.toBe('string');
    expect(result).toBeTruthy();
    expect((result as any).displacements?.length).toBeGreaterThan(0);
  });

  it('solveCombinations3D forwards connectors through the combo path', () => {
    buildConnectorOnlyNodeModel();
    const result = modelStore.solveCombinations3D(false, false, true);
    expect(typeof result).not.toBe('string');
    expect(result).toBeTruthy();
    expect((result as any).perCase?.size).toBeGreaterThan(0);
  });

  it('buildSolverInput3D includes connectors and constraints on the wire input', () => {
    buildConnectorOnlyNodeModel();
    modelStore.addConstraint({
      type: 'equalDOF',
      masterNode: 2,
      slaveNode: 3,
      dofs: [0],
    });
    const input = modelStore.buildSolverInput3D(false, false);
    expect(input).toBeTruthy();
    expect(input!.connectors?.size).toBe(1);
    expect((input as any).constraints?.length).toBe(1);
  });

  it('the 2D remap path carries constraints (PRO planar analyses route through it)', () => {
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0);
    const n2 = modelStore.addNode(5, 0);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed');
    modelStore.addSupport(n2, 'pinned');
    modelStore.addNodalLoad(n2, 0, -10);
    modelStore.addConstraint({
      type: 'equalDOF',
      masterNode: n1,
      slaveNode: n2,
      dofs: [0],
    });
    const input = modelStore.buildSolverInput();
    // buildSolverInput goes through remapModelForPlane('xy') →
    // buildSolverInput2D; before the fix constraints were dropped there.
    expect(input).toBeTruthy();
    expect((input as any).constraints?.length).toBe(1);
  });
});

describe('removeNode cascade for connectors/constraints', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  it('deleting a node removes connectors referencing it', () => {
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    modelStore.addConnector({
      nodeI: n1, nodeJ: n2,
      kAxial: 1e6, kShear: 1e6, kMoment: 1e3,
      kShearZ: 1e6, kBendY: 1e3, kBendZ: 1e3,
    });
    modelStore.removeNode(n2);
    expect(modelStore.model.connectors.size).toBe(0);
  });

  it('deleting a node removes/prunes constraints referencing it', () => {
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    const n3 = modelStore.addNode(10, 0, 0);
    modelStore.addConstraint({ type: 'equalDOF', masterNode: n1, slaveNode: n2, dofs: [0] });
    modelStore.addConstraint({ type: 'diaphragm', masterNode: n1, slaveNodes: [n2, n3] });
    modelStore.addConstraint({
      type: 'linearMPC',
      terms: [{ nodeId: n2, dof: 0, coefficient: 1 }, { nodeId: n3, dof: 0, coefficient: -1 }],
    });
    modelStore.removeNode(n2);
    // equalDOF (slave n2) dropped; diaphragm pruned to [n3]; linearMPC dropped whole
    expect(modelStore.model.constraints.length).toBe(1);
    const dia = modelStore.model.constraints[0] as any;
    expect(dia.type).toBe('diaphragm');
    expect(dia.slaveNodes).toEqual([n3]);
  });

  it('clear() resets the connector id counter like every other entity', () => {
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    modelStore.addConnector({
      nodeI: n1, nodeJ: n2,
      kAxial: 1, kShear: 1, kMoment: 1, kShearZ: 1, kBendY: 1, kBendZ: 1,
    });
    modelStore.clear();
    const n3 = modelStore.addNode(0, 0, 0);
    const n4 = modelStore.addNode(1, 0, 0);
    const newId = modelStore.addConnector({
      nodeI: n3, nodeJ: n4,
      kAxial: 1, kShear: 1, kMoment: 1, kShearZ: 1, kBendY: 1, kBendZ: 1,
    });
    expect(newId).toBe(1);
  });
});

describe('legacy constraint read-migration on restore()', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  function snapshotWithConstraints(constraints: unknown[]) {
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(5, 0, 0);
    const snap = modelStore.snapshot() as any;
    snap.constraints = constraints;
    return snap;
  }

  it("migrates 'equalDof' + string dofs to 'equalDOF' + integer indices", () => {
    const snap = snapshotWithConstraints([
      { type: 'equalDof', masterNode: 1, slaveNode: 2, dofs: ['ux', 'uz'] },
    ]);
    modelStore.restore(snap);
    expect(modelStore.model.constraints).toEqual([
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0, 2] },
    ]);
  });

  it("migrates 'linearMpc' to 'linearMPC' (string term dofs included)", () => {
    const snap = snapshotWithConstraints([
      { type: 'linearMpc', terms: [{ nodeId: 1, dof: 'uy', coefficient: 1 }, { nodeId: 2, dof: 2, coefficient: -1 }] },
    ]);
    modelStore.restore(snap);
    expect(modelStore.model.constraints).toEqual([
      { type: 'linearMPC', terms: [{ nodeId: 1, dof: 1, coefficient: 1 }, { nodeId: 2, dof: 2, coefficient: -1 }] },
    ]);
  });

  it('migrates rigidLink string dofs and passes new-shape constraints through untouched', () => {
    const snap = snapshotWithConstraints([
      { type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: ['ux', 'uy'] },
      { type: 'eccentricConnection', masterNode: 1, slaveNode: 2, offsetX: 0, offsetY: 0.5, offsetZ: 0, releases: [true, false, false, false, false, false] },
    ]);
    modelStore.restore(snap);
    expect(modelStore.model.constraints[0]).toEqual({ type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [0, 1] });
    expect((modelStore.model.constraints[1] as any).offsetY).toBe(0.5);
  });

  it('drops unknown constraint kinds instead of shipping them to the solver', () => {
    const snap = snapshotWithConstraints([
      { type: 'somethingElse', foo: 1 },
      { type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] },
    ]);
    modelStore.restore(snap);
    expect(modelStore.model.constraints.length).toBe(1);
    expect((modelStore.model.constraints[0] as any).type).toBe('equalDOF');
  });
});
