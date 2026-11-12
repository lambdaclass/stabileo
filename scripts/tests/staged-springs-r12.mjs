import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-springs-r12.json', import.meta.url)));
const replay = [];
let checks = 0, failures = 0;

function answer(r, m, dim, beam, u, load) {
  const key = dim === 2 ? 'rz' : 'fz', tol = 1e-9 * Math.max(Math.abs(load), 1e-12);
  const root = r.reactions.find(s => s.nodeId === 0)[key];
  assert.ok(Math.abs(root + beam * u) < tol, `hand beam reaction expected ${-beam * u}, got ${root}`);
  const total = r.reactions.reduce((s, r) => s + r[key], 0);
  assert.ok(Math.abs(total + load) < tol, `hand total reaction expected ${-load}, got ${total}`);
  const f = r.elementForces.find(f => f.elementId === 1), length = m.nodes[1].x;
  assert.ok(Math.abs(Math.abs(f[dim === 2 ? 'vStart' : 'vzStart']) - Math.abs(beam * u / 2)) < tol);
  assert.ok(Math.abs(Math.abs(f[dim === 2 ? 'mStart' : 'myStart']) - Math.abs(beam * u * length / 2)) < tol * length);
}

for (const c of cases) {
  for (const padding of [0, 8, 9, 10, 19, 20, 21, 22]) {
    for (const scale of [-1, -1e-12, 0, 1e-12, 1]) {
      for (const prior of [true, false]) {
        const m = structuredClone(c.model), dim = c.dim;
        for (let i = 0; i < padding; i++) {
          const id = 100 + i;
          m.nodes[id] = {id, x: 4 + i, z: 0, ...(dim === 3 ? {y: 0} : {})};
          m.elements[id] = {...m.elements[1], id, nodeI: i === 0 ? 0 : id - 1, nodeJ: id};
          m.stages[0].elementsAdded.push(id);
        }
        const load = m.loads[0].data.fz *= scale;
        if (!prior) { m.stages[0].loadIndices = []; m.stages[1].loadIndices = [0]; }
        try {
          const output = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m)));
          if (!padding && scale === 1 && prior) replay.push({...c, model: m, output});
          const beam = 2 * 3 * m.materials[1].e * 1000 * m.sections[1][dim === 2 ? 'iz' : 'iy'] / m.nodes[1].x ** 3;
          const weak = m.supports[1][dim === 2 ? 'ky' : 'kz'], strong = m.supports[2][dim === 2 ? 'ky' : 'kz'];
          const before = c.change === 'added' ? 0 : weak, after = c.change === 'removed' ? 0 : c.change === 'changed' ? strong : weak;
          const firstLoad = prior ? load : 0;
          answer(output.stages[0].results, m, dim, beam, firstLoad / (beam + before), firstLoad);
          const u = !prior ? load / (beam + after) : c.change === 'added' || c.change === 'removed' ? load / beam : c.change === 'changed' ? load / (beam + before) + before * load / ((beam + before) * (beam + after)) : load / (beam + after);
          const unavailable = c.change !== 'unchanged' && prior && load !== 0;
          for (const r of [output.stages[1].results, output.stages[2].results, output.finalResults]) {
            if (r.reactions.length) answer(r, m, dim, beam, u, load);
            if (unavailable) {
              for (const phase of ['stageResults', 'reactions', 'elementForces', 'constraintForces', ...(dim === 3 ? ['plateStresses', 'quadStresses', 'quadNodalStresses'] : [])]) {
                assert.ok((r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable' && d.phase === phase && d.severity === 'warning'), `${phase}: ${JSON.stringify(r)}`);
              }
              for (const key of ['reactions', 'elementForces', 'constraintForces', 'plateStresses', 'quadStresses', 'quadNodalStresses']) assert.deepEqual(r[key] ?? [], []);
            } else {
              assert.ok(!(r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable'));
              assert.ok(r.reactions.length > 0);
              assert.equal(r.elementForces.length, padding + 2);
            }
          }
          checks++;
        } catch (e) {
          failures++;
          if (!padding) console.error(`FAIL ${c.name} scale=${scale} prior=${prior}: ${e}`);
        }
      }
    }
  }
}
if (process.env.STABILEO_R12_REPLAY) writeFileSync(process.env.STABILEO_R12_REPLAY, JSON.stringify(replay, null, 2) + '\n');
console.log(`${checks} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
