import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';
engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/prescribed-master-2008.json', import.meta.url)));
const zero = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/prescribed-master-2008-wasm-zero.json', import.meta.url)));
function numericBits(value) {
  let hash = 14695981039346656037n;
  const walk = v => {
    if (typeof v === 'number') {
      const bytes = Buffer.alloc(8);
      bytes.writeDoubleLE(v);
      for (const byte of bytes) hash = BigInt.asUintN(64,(hash ^ BigInt(byte))*1099511628211n);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.keys(v).sort().forEach(k => walk(v[k]));
  };
  walk(value);
  return hash.toString();
}
function assertArcProgress(motion, factor) {
  if (motion !== 0) assert.ok(Number.isFinite(factor) && factor > 0 && Math.abs(motion*factor) > 1000*1e-11,`insufficient arc progress: load factor ${factor}, motion ${motion*factor}`);
}
for (const motion of [-1,1]) {
  for (const factor of [0,Number.MIN_VALUE,0.5*1000*1e-11,-1]) assert.throws(() => assertArcProgress(motion,factor),/insufficient arc progress/);
  assertArcProgress(motion,2*1000*1e-11);
}
assertArcProgress(0,0);
const failures = [];
const replay = [];
for (const [index, c] of cases.entries()) {
  const wrapper = { solver:c.model, foundationSprings:[], materialModels:{}, sectionCapacities:{}, nIncrements:3, tolerance:1e-10, maxIter:50, maxSteps:3, initialDs:0.001, minDs:1e-8, maxDs:0.001 };
  for (const path of ['linear','staged','winkler','contact','material',...(c.dim === 2 ? ['corotational','arc'] : [])]) {
    let result;
    try {
      const name = {linear:'solve',staged:'solve_staged',winkler:'solve_winkler',contact:'solve_contact',material:'solve_nonlinear_material',corotational:'solve_corotational'}[path];
      if (path === 'linear') result = engine[`solve_${c.dim}d`](c.model);
      else if (path === 'arc') result = JSON.parse(engine.solve_arc_length(JSON.stringify(wrapper)));
      else if (path === 'corotational') result = JSON.parse(engine[`${name}_${c.dim}d`](JSON.stringify(c.model),50,1e-10,3));
      else result = JSON.parse(engine[`${name}_${c.dim}d`](JSON.stringify(path === 'staged' ? c.model : wrapper)));
      replay.push({index,path,result,bits:numericBits(result)});
      if (c.motion === 0) assert.equal(numericBits(result),zero[`${path}:${index}`],`zero motion bits ${path}:${index}`);
      assert.notEqual(result.converged,false);
      const factor = path === 'arc' ? result.finalLoadFactor : 1;
      if (path === 'arc') assertArcProgress(c.motion,factor);
      const snapshots = [result.results ?? result.finalResults ?? result,...(result.stages ?? []).map(s => s.results)];
      for (const snapshot of snapshots) {
        const d = snapshot.displacements.find(d => d.nodeId === 1);
        const key = c.rotation ? 'ry' : 'uz';
        assert.ok(Math.abs(d[key]-c.motion*factor) <= 1e-11,`${key}=${d[key]}, expected ${c.motion*factor}`);
        if (c.rotation && c.kind === 'rigidLink') assert.ok(Math.abs(d.uz-(c.dim===2?1:-1)*3*c.motion*factor) <= 1e-11);
        if (c.rotation && c.kind !== 'rigidLink' && ['linear','staged','winkler','contact','material'].includes(path)) assert.ok(Math.abs(d.uz-(c.dim===2?1:-1)*3/2*c.motion) <= 1e-11);
      }
    } catch (e) { failures.push(`case ${index} ${path}: ${e}`); }
  }
}
for (const dim of [2,3]) for (const rotation of [false,true]) for (const motion of [-0.0013,-1e-16,Number.MIN_VALUE,0,1e-16,0.0013]) {
  const c = structuredClone(cases.find(c => c.dim===dim && c.rotation===rotation && c.fillers===1));
  c.model.supports[2][rotation ? 'dry' : 'dz'] = motion;
  for (const method of ['newmark','hht']) for (const entry of ['solve_time_history','certify_time_history']) {
    const wrapper = {solver:c.model,densities:{1:7850},timeStep:0.001,nSteps:2,method,alpha:method === 'hht' ? -0.1 : null};
    try {
      if (motion === 0) JSON.parse(engine[`${entry}_${dim}d`](JSON.stringify(wrapper)));
      else assert.throws(() => engine[`${entry}_${dim}d`](JSON.stringify(wrapper)),/prescribed support displacements/);
    } catch (e) { failures.push(`time ${dim} ${motion}: ${e}`); }
  }
}
let cableRefusals = 0;
let cableZeroControls = 0;
for (const dim of [2,3]) for (const rotation of [false,true]) {
  const fields = dim === 2 ? ['dx','dz','dry'] : ['dx','dy','dz','drx','dry','drz'];
  const model = structuredClone(cases.find(c => c.dim===dim && c.rotation===rotation && c.fillers===1).model);
  for (const support of Object.values(model.supports)) for (const field of fields) delete support[field];
  model.elements[3]={...model.elements[2],id:3,type:'cable'};
  model.loads[0].data.fx = 1;
  const run = solver => JSON.parse(engine[`solve_cable_${dim}d`](JSON.stringify({solver,densities:{},maxIter:50,tolerance:1e-10}),50,1e-10));
  const absent = run(model);
  if (dim === 3) assert.equal(absent.converged,true);
  assert.ok((absent.results ?? absent).displacements.some(d => d.ux !== 0));
  for (const field of fields) for (const motion of [-0.0013,-1e-16,-Number.MIN_VALUE,-0,0,Number.MIN_VALUE,1e-16,0.0013]) {
    const solver = structuredClone(model);
    solver.supports[2][field] = motion;
    try {
      if (motion === 0) {
        assert.deepEqual(run(solver),absent);
        cableZeroControls++;
      } else {
        assert.throws(() => run(solver),/prescribed support displacements/);
        cableRefusals++;
      }
    } catch (e) { failures.push(`cable ${dim}D ${field} motion=${motion} rotation=${rotation}: ${e}`); }
  }
}
if (process.env.REPLAY_2008) writeFileSync(`${process.env.REPLAY_2008}/wasm.json`,JSON.stringify({replay,failures}));
assert.deepEqual(failures,[]);
console.log(`Prescribed master motion: ${replay.length} WASM results, ${cableRefusals} cable refusals and ${cableZeroControls} cable zero controls checked`);
