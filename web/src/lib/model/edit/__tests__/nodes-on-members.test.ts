/**
 * A first model often ends in pieces: each post drawn as one member, and the ledgers ending on
 * nodes that sit on the posts without cutting them. The solve says the structure is
 * disconnected; it now also says why, and the one command that joins it.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import { validateAndSolve3D } from '../../../engine/solver-service';
import * as wasmSolver from '../../../engine/wasm-solver';
import { nodesOnMembers } from '../../../engine/nodes-on-members';
import { splitAllAtNodes } from '../cut-members';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  quads: modelStore.quads, plates: modelStore.plates, constraints: modelStore.constraints, connectors: modelStore.connectors,
});

/** Two posts of one member each, and a ledger between nodes that sit on them. */
function frame() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 2);
  const c = modelStore.addNode(3, 0, 0), d = modelStore.addNode(3, 0, 2);
  modelStore.addElement(a, b, 'frame');
  modelStore.addElement(c, d, 'frame');
  const m1 = modelStore.addNode(0, 0, 1.5), m2 = modelStore.addNode(3, 0, 1.5);
  const ledger = modelStore.addElement(m1, m2, 'frame');
  for (const n of [a, c]) modelStore.addSupport(n, 'fixed3d');
  modelStore.addDistributedLoad3D(ledger, 0, 0, -2, -2);
  historyStore.clear();
  return { m1, m2 };
}

describe('nodes on members', () => {
  it('finds the nodes a member passes without being cut there', () => {
    const { m1, m2 } = frame();
    expect(nodesOnMembers(modelStore.nodes, modelStore.elements.values()).map((h) => h.nodeId).sort()).toEqual([m1, m2].sort());
  });

  it('the disconnected message says why and names the command', () => {
    frame();
    const r = validateAndSolve3D(md() as never, false, false);
    expect(typeof r).toBe('string');
    expect(r as string).toMatch(/2 node\(s\) sit on members/);
  });

  it('one command joins them, as one undo step, and the model solves', () => {
    frame();
    const { report } = splitAllAtNodes();
    expect(report.cut.length).toBe(2);
    expect(nodesOnMembers(modelStore.nodes, modelStore.elements.values())).toEqual([]);
    const r = validateAndSolve3D(md() as never, false, false);
    expect(typeof r).not.toBe('string');
    expect(historyStore.undoCount).toBe(1);
  });
});
