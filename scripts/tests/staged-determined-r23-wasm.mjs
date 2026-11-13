import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
test('constraint-determined stages retain physical answers', { skip: process.env.RUN_KNOWN_WRONG ? false : 'known wrong result: #1952' }, () => {
  for (const base of JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-determined-r23.json', import.meta.url)))) {
    for (const tie of ['rigidLink', 'equalDOF', 'partial']) {
      for (const padding of [0, 22]) {
        for (const sign of [-1, 0, 1]) {
          for (const motion of [-0.0013, 0, 0.0013]) {
            const { dim } = base, m = structuredClone(base.model);
            m.loads[0].data.fz = -10 * sign;
            m.supports[0].dx = motion;
            m.constraints[0].type = tie === 'partial' ? 'equalDOF' : tie;
            if (tie === 'partial') m.constraints[0].dofs = m.constraints[0].dofs.filter(i => i !== (dim === 2 ? 1 : 2));
            for (let i = 0; i < padding; i++) {
              const id = 100 + i;
              m.nodes[id] = { id, x: 4 + i, z: 0, ...(dim === 3 ? { y: 0 } : {}) };
              m.supports[id] = { ...m.supports[0], nodeId: id, dx: 0 };
              m.stages[0].supportsAdded.push(id);
            }
            let r;
            try { r = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m))); }
            catch (error) { if (tie !== 'partial') throw error; continue; }
            if (tie === 'partial') {
              assert.ok(r.finalResults.structuredDiagnostics.some(d => d.code === 'result_quantity_unavailable'));
              assert.deepEqual(r.finalResults.reactions, []);
              continue;
            }
            for (const result of [...r.stages.map(s => s.results), r.finalResults]) {
              assert.ok(!(result.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable'), JSON.stringify({dim,tie,padding,sign,motion,result}));
              const root = result.reactions.find(r => r.nodeId === 0);
              assert.ok(Math.abs(root[dim === 2 ? 'rz' : 'fz'] - 10 * sign) < 1e-12);
              assert.ok(Math.abs(root.my - (tie === 'rigidLink' ? (dim === 2 ? 30 : -30) * sign : 0)) < 1e-12);
              for (const u of result.displacements.filter(u => u.nodeId === 0 || u.nodeId === 1)) {
                assert.equal(u.ux, motion);
                assert.ok(u.uz === 0);
              }
            }
          }
        }
      }
    }
  }
});
