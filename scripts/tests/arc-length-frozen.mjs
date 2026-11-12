import assert from 'node:assert/strict';
import { checkStoredEvidence } from './arc-evidence-equilibrium.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';
import { compareFrozen, freezeValues } from '../../web/scripts/results-snapshot/frozen.mjs';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
for (const suffix of ['0015ab84c3baa36f', '022317310499426d']) {
  const name = `solve_arc_length-${suffix}.json`;
  const input = JSON.parse(readFileSync(new URL(`../../engine/tests/fixtures/${name}`, import.meta.url)));
  const r = JSON.parse(engine.solve_arc_length(JSON.stringify(input)));
  assert.equal(r.converged, true);
  assert.equal(r.results.reactions.length, Object.keys(input.solver.supports).length);
  const sum = [0, 0, 0];
  function add(id, fx, fz, my) {
    const n = input.solver.nodes[id];
    const d = r.results.displacements.find(d => d.nodeId === id);
    sum[0] += fx;
    sum[1] += fz;
    sum[2] += (n.x + d.ux) * fz - (n.z + d.uz) * fx + my;
  }
  for (const { data: l } of input.solver.loads) add(l.nodeId, l.fx * r.finalLoadFactor, l.fz * r.finalLoadFactor, l.my * r.finalLoadFactor);
  for (const a of r.results.reactions) add(a.nodeId, a.rx, a.rz, a.my);
  sum.forEach((v, i) => assert.ok(Math.abs(v) < 1e-6, `${name} equilibrium component ${i}: ${v}`));
  for (const f of r.results.elementForces) {
    const e = Object.values(input.solver.elements).find(e => e.id === f.elementId);
    const at = id => {
      const n = input.solver.nodes[id], d = r.results.displacements.find(d => d.nodeId === id);
      return [n.x + d.ux, n.z + d.uz];
    };
    const a = at(e.nodeI), b = at(e.nodeJ), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    assert.ok(Math.abs(f.length - length) < 1e-12);
    assert.ok(Math.abs(f.vStart - f.vEnd) < 1e-9);
    assert.ok(Math.abs(f.mEnd - f.mStart + f.vStart * length) < 1e-9, `${name} member ${f.elementId}: ${JSON.stringify(f)}`);
  }
  const snapshot = { format: 1, features: ['plane2D', 'members', 'analysis:nonlinear', 'pathAnalysis'], values: freezeValues(r, 'nonlinear') };
  const file = new URL(`../../web/results-frozen/${name}`, import.meta.url);
  if (process.argv.includes('--update')) {
    mkdirSync(new URL('../../web/results-frozen/', import.meta.url), { recursive: true });
    writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
  }
  assert.deepEqual(JSON.parse(readFileSync(file)), snapshot);
  assert.equal(compareFrozen(snapshot.values, freezeValues(r, 'nonlinear')).differs, false);
  console.log(`PASS ${name}: reactions and every serialized field`);
}

checkStoredEvidence();
