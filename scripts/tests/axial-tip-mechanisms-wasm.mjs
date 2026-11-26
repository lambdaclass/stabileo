import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(cases.length, 37);
for (const [index, { dimension, solver, api, control }] of cases.entries()) {
  const suffix = dimension + 'd';
  const calls = {
    linear: () => engine['solve_' + suffix](solver),
    ssi: () => JSON.parse(engine['solve_ssi_' + suffix](JSON.stringify({
      solver, soilSprings: [], maxIter: 50, tolerance: 1e-10,
    }))).results,
    contact: () => JSON.parse(engine['solve_contact_' + suffix](JSON.stringify({ solver }))).results,
    corotational: () => JSON.parse(engine['solve_corotational_' + suffix](JSON.stringify(solver), 100, 1e-10, 4)).results,
    fiber_nonlinear: () => JSON.parse(engine['solve_fiber_nonlinear_' + suffix](JSON.stringify({
      solver, fiberSections: {}, nIntegrationPoints: 5, maxIter: 60, tolerance: 1e-10, nIncrements: 2,
    }))).results,
    arc_length: () => engine.solve_arc_length(JSON.stringify({ solver, maxSteps: 1 })),
  };
  const label = suffix + ' ' + api + ' ' + index;
  if (control) {
    assert.ok(calls[api]().displacements.some(d => d.ux !== 0), label);
  } else {
    assert.throws(calls[api], error => /the structure is a mechanism/.test(String(error)), label);
  }
}
