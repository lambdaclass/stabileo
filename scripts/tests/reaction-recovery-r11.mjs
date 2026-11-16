import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/reaction-recovery-r11.json', import.meta.url)));
const replay = [];
let failed = false;
for (const c of cases) {
  for (const padding of c.kind === 'staged' ? [0, 8, 9, 10, 19, 20, 21, 22] : [0]) {
  for (const motion of c.kind === 'staged' ? [null, -0.0013, 0, 0.0013] : [null]) {
  try {
    const m = structuredClone(c.model), dim = c.dim;
    if (motion !== null) {
      m.loads = [];
      for (const stage of m.stages) stage.loadIndices = [];
      m.supports[0].dx = motion;
    }
    let unavailable = motion === null ? c.unavailable : !c.name.endsWith('unchanged') && motion !== 0;
    for (let i = 0; i < padding; i++) {
      const id = 100+i;
      m.nodes[id] = {id,x:4+i,z:0,...(dim === 3 ? {y:0} : {})};
      m.elements[id] = {...m.elements[1],id,nodeI:i === 0 ? 0 : id-1,nodeJ:id};
      m.stages[0].elementsAdded.push(id);
    }
    let output;
    if (c.kind === 'pdelta') {
      for (const released of [false, true]) {
        for (const sign of [-1, 0, 1]) {
          const control = structuredClone(m);
          for (const e of Object.values(control.elements)) e[dim === 2 ? 'hingeEnd' : 'releaseMyEnd'] = released;
          for (const l of control.loads) l.data.my *= sign;
          if (released && sign !== 0) {
            assert.throws(() => engine[`solve_${dim}d`](control), /Nodal moment/);
            assert.throws(() => engine[`solve_pdelta_${dim}d`](JSON.stringify(control), 40, 1e-9), /Nodal moment/);
            continue;
          }
          const r = JSON.parse(engine[`solve_pdelta_${dim}d`](JSON.stringify(control), 40, 1e-9)).results;
          assert.equal(r.equilibrium.residualOk, true);
          assert.equal(r.elementForces.length, 2);
          for (const f of r.elementForces) assert.ok(Math.abs(f[dim === 2 ? 'mStart' : 'myStart'] + control.loads.find(l => l.data.nodeId === control.elements[f.elementId].nodeJ).data.my) < 1e-9);
          assert.equal(engine[`solve_${dim}d`](control).elementForces.length, 2);
        }
      }
    } else {
      const prefix = structuredClone(m);
      prefix.stages = prefix.stages.slice(0, 1);
      const first = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(prefix)));
      const removed = m.stages[1].elementsRemoved ?? [];
      const removesLoaded = first.finalResults.elementForces.some(f => removed.includes(f.elementId) && Object.entries(f).some(([key, value]) => (key.endsWith('Start') || key.endsWith('End')) && typeof value === 'number' && value !== 0));
      if (removesLoaded) {
        assert.throws(() => engine[`solve_staged_${dim}d`](JSON.stringify(m)), /#1996/);
        console.log(`PASS ${c.name} padding=${padding} motion=${motion}: #1996 refusal`);
        continue;
      }
      if (removed.length) unavailable = false;
      output = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m)));
      if (!padding && motion === null) replay.push({name:c.name, dim, kind:c.kind, model:m, output});
      for (const r of [output.stages[1].results, output.stages[2].results, output.finalResults]) {
        if (unavailable) {
          for (const phase of ['reactions', 'elementForces', 'constraintForces', 'stageResults', ...(dim === 3 ? ['plateStresses', 'quadStresses', 'quadNodalStresses'] : [])]) assert.ok((r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable' && d.phase === phase && d.severity === 'warning'), `${c.name}: ${phase}`);
          assert.deepEqual(r.reactions, []);
          assert.deepEqual(r.elementForces, []);
          assert.deepEqual(r.constraintForces ?? [], []);
          if (dim === 3) for (const field of ['plateStresses', 'quadStresses', 'quadNodalStresses']) assert.deepEqual(r[field] ?? [], []);
        } else {
          assert.ok(!(r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable'));
          assert.equal(r.reactions.length, Object.keys(m.supports).length);
          assert.equal(r.elementForces.length, padding + (c.name.endsWith('removed') ? 1 : 2));
          assert.ok(Math.abs(r.reactions[0][dim === 2 ? 'rz' : 'fz'] - (motion === null ? 10 : 0)) < 1e-9);
        }
      }
      assert.equal(output.stages[0].results.reactions.length, Object.keys(m.supports).length);
    }
    console.log(`PASS ${c.name} padding=${padding} motion=${motion}`);
  } catch (e) { failed = true; console.error(`FAIL ${c.name}: ${e}`); }
}
}
}
if (process.env.STABILEO_R11_REPLAY) writeFileSync(process.env.STABILEO_R11_REPLAY, JSON.stringify(replay, null, 2) + '\n');
if (failed) process.exitCode = 1;
