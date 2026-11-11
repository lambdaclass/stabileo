import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initSync, solve_3d, solve_pdelta_3d, solve_buckling_3d, solve_modal_3d,
} from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/1753-frozen-shell-refusals.json', import.meta.url)));
assert.equal(cases.length, 7);
const maximum = (values) => Math.max(...values.map(Math.abs));
const physical = (displacements) => displacements.flatMap((d) => [d.ux, d.uy, d.uz, d.rx, d.ry]);

for (const { model, input, before_displacements: before } of cases) {
  const pin = Object.values(input.supports).find((s) => s.rx && s.ry);
  const pivot = Object.values(input.nodes).find((n) => n.id === pin.nodeId);
  const corner = Object.values(input.nodes).filter((n) => n.y === pivot.y).sort((a, b) => b.x - a.x)[0];
  const refusal = (run) => {
    let error;
    try { run(); } catch (caught) { error = String(caught); }
    assert.ok(error, `${model}: must refuse physical rotation about the corner pin`);
    return error;
  };
  const reason = refusal(() => solve_3d(input));
  assert.match(reason, /mechanism/);
  const loaded = structuredClone(input);
  loaded.loads.push({ type: 'nodal', data: { nodeId: pivot.id, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 1 } });
  assert.equal(refusal(() => solve_3d(loaded)), reason);
  assert.equal(refusal(() => solve_pdelta_3d(JSON.stringify(input), 2, 1e-6)), reason);
  assert.equal(refusal(() => solve_buckling_3d(JSON.stringify(input), 1)), reason);
  const densities = Object.fromEntries(Object.values(input.materials).map((m) => [String(m.id), 1]));
  const modal = refusal(() => solve_modal_3d(JSON.stringify({ solver: input, densities }), 1));
  const modalReason = modal.startsWith('MODAL-MECHANISM:') ? 'MODAL-MECHANISM'
    : JSON.parse(modal).structuredDiagnostics.find((d) => d.code === 'eigen_decomposition_failed')?.code;
  assert.ok(modalReason, modal);
  const roller = structuredClone(input);
  roller.supports['audit-roller'] = { ...pin, nodeId: corner.id, rx: false };
  const drilling = structuredClone(input);
  for (const node of Object.values(input.nodes)) {
    drilling.supports[`audit-drilling-${node.id}`] = { ...pin, nodeId: node.id, rx: false, ry: false, rz: false, rrz: true };
  }
  const turn = before.find((d) => d.nodeId === corner.id).uy / (corner.x - pivot.x);
  const reference = physical(before.map((d) => {
    const node = Object.values(input.nodes).find((n) => n.id === d.nodeId);
    return { ...d, ux: d.ux - turn * (pivot.y - node.y), uy: d.uy - turn * (node.x - pivot.x) };
  }));
  const scale = maximum(reference);
  assert.ok(scale > 0);
  const errors = [roller, drilling].map((control) => {
    const result = solve_3d(control);
    assert.deepEqual(result.displacements.map((d) => d.nodeId), before.map((d) => d.nodeId));
    const values = physical(result.displacements);
    const error = maximum(reference.map((value, i) => (value - values[i]) / scale));
    assert.ok(error < 1e-6, `${model}: reference displacement error ${error}`);
    return error;
  });
  console.log(`${model}: WASM linear, loaded, P-delta, buckling, modal refuse (${modalReason}); roller/drilling control errors ${errors}`);
}
