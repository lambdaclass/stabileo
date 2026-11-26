/**
 * constraint-connectivity.ts — JS-side helpers for treating constraint pairs
 * as legitimate node-to-node connectivity edges.
 *
 * The Rust solver accepts such models (its constraint transform couples the
 * DOFs), but note: its own pre-solve isolated-node gate
 * (engine/src/solver/pre_solve_gates.rs) counts elements and connectors,
 * NOT constraints — a constraint-only-coupled node still produces a
 * warning-level 'Node X is isolated' StructuredDiagnostic in the results
 * payload. Aligning that gate with this rule is engine-side follow-up work.
 * The JS preflight (`solver-service.ts`) and the live model diagnostics
 * (`model-diagnostics.ts`) both run an orphan-node check + a
 * single-component graph BFS over `model.elements` only, which incorrectly
 * flags nodes that are coupled solely through a constraint (rigidLink,
 * equalDOF, eccentricConnection, diaphragm, linearMPC) as disconnected —
 * even though the solver itself accepts the model.
 *
 * Decision: ALL five existing constraint kinds count as connectivity.
 *   - rigidLink:           master ↔ slave
 *   - equalDOF:            master ↔ slave
 *   - eccentricConnection: master ↔ slave
 *   - diaphragm:           master ↔ each slaveNodes[i]
 *   - linearMPC:           every term[i].nodeId ↔ every term[j].nodeId
 *                          within the term set (an MPC is one equation
 *                          coupling all its participants).
 *
 * No constraint kind is intentionally excluded. If a future constraint
 * type is added that is NOT supposed to provide connectivity, it must be
 * deliberately skipped here AND documented.
 */

import type { Constraint3D } from './types-3d';

/** Add every node referenced by any constraint to the connected-nodes set. */
export function addConstraintConnectivity(
  connectedNodes: Set<number>,
  constraints?: Constraint3D[],
): void {
  if (!constraints) return;
  for (const c of constraints) {
    switch (c.type) {
      case 'rigidLink':
      case 'equalDOF':
      case 'eccentricConnection':
        connectedNodes.add(c.masterNode);
        connectedNodes.add(c.slaveNode);
        break;
      case 'diaphragm':
        connectedNodes.add(c.masterNode);
        for (const s of c.slaveNodes) connectedNodes.add(s);
        break;
      case 'linearMPC':
        for (const term of c.terms) connectedNodes.add(term.nodeId);
        break;
    }
  }
}

/** Add every node-to-node edge implied by constraints to a graph adjacency map. */
export function addConstraintAdjacency(
  adj: Map<number, Set<number>>,
  constraints?: Constraint3D[],
): void {
  if (!constraints) return;
  const link = (a: number, b: number) => {
    if (a === b) return;
    adj.get(a)?.add(b);
    adj.get(b)?.add(a);
  };
  for (const c of constraints) {
    switch (c.type) {
      case 'rigidLink':
      case 'equalDOF':
      case 'eccentricConnection':
        link(c.masterNode, c.slaveNode);
        break;
      case 'diaphragm':
        for (const s of c.slaveNodes) link(c.masterNode, s);
        break;
      case 'linearMPC': {
        // An MPC equation couples every participating node with every other.
        const ids = c.terms.map(t => t.nodeId);
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            link(ids[i], ids[j]);
          }
        }
        break;
      }
    }
  }
}
