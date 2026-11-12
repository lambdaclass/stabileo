import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({module:readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm',import.meta.url))});

function check(r, dim, kind, factor) {
  assert.equal(r.elementForces.length,1);
  const f = r.elementForces[0];
  const d = r.displacements.find(d => d.nodeId === 1);
  const x = 3+d.ux, z = d.uz, length = Math.hypot(x,z);
  assert.ok(Math.abs(z)>1e-4, `${kind} must rotate the loaded chord`);
  assert.ok(Math.abs(f.length-length)<1e-9);
  for (const key of dim === 2 ? ['nEnd','vEnd','mEnd'] : ['nEnd','vyEnd','vzEnd','mxEnd','myEnd','mzEnd']) {
    assert.ok(Number.isFinite(f[key]) && Math.abs(f[key])<1e-6, `${kind} ${dim}D free tip ${key}: ${JSON.stringify(f)}`);
  }
  const reaction = r.reactions.find(r => r.nodeId === 0);
  const [fx,fz] = dim === 2 ? [reaction.rx,reaction.rz] : [reaction.fx,reaction.fz];
  assert.ok(Math.abs(f.nStart+(x*fx+z*fz)/length)<1e-6, `${kind} reaction reference`);
  const [vs,ve,ms,me,sign] = dim === 2 ? [f.vStart,f.vEnd,f.mStart,f.mEnd,1] : [f.vzStart,f.vzEnd,f.myStart,f.myEnd,-1];
  const axial = -2*factor*3*z/length, transverse = -2*factor*3*x/length;
  assert.ok(Math.abs(vs-(-z*fx+x*fz)/length)<1e-6);
  assert.ok(Math.abs(ms-reaction.my)<1e-6);
  assert.ok(Math.abs(f.nEnd-f.nStart+axial)<1e-6);
  assert.ok(Math.abs(ve-vs-transverse)<1e-6);
  assert.ok(Math.abs(sign*(me-ms)+vs*length+transverse*length/2)<1e-6);
}

let failed = false;
for (const dim of [2,3]) {
  for (const kind of dim === 2 ? ['corotational','arc','displacement'] : ['corotational']) {
    try {
      const m = JSON.parse(readFileSync(new URL(`../../engine/tests/fixtures/reaction-recovery-${dim}d.json`,import.meta.url)));
      m.materials[1].e = 200;
      m.loads = [{type:'distributed',data:dim === 2 ? {elementId:1,qI:-2,qJ:-2} : {elementId:1,qYI:0,qYJ:0,qZI:-2,qZJ:-2}}];
      let raw;
      if (kind === 'corotational') raw = engine[`solve_corotational_${dim}d`](JSON.stringify(m),40,1e-9,2);
      else if (kind === 'arc') raw = engine.solve_arc_length(JSON.stringify({solver:m,maxSteps:3,maxIter:40,tolerance:1e-9,initialDs:0.1,minDs:1e-8,maxDs:0.1,targetIter:5}));
      else raw = engine.solve_displacement_control(JSON.stringify({solver:m,controlNode:1,controlDof:1,targetDisplacement:-1,nSteps:10,maxIter:40,tolerance:1e-9}));
      const output = JSON.parse(raw);
      assert.equal(output.converged,true);
      check(output.results,dim,kind,output.finalLoadFactor ?? 1);
      assert.throws(() => check({...output.results,elementForces:[]},dim,kind,output.finalLoadFactor ?? 1));
      const zero = structuredClone(output.results);
      for (const key of Object.keys(zero.elementForces[0])) if (typeof zero.elementForces[0][key] === 'number') zero.elementForces[0][key] = 0;
      assert.throws(() => check(zero,dim,kind,output.finalLoadFactor ?? 1));
      console.log(`PASS ${kind} ${dim}D loaded chord`);
    } catch (e) { failed = true; console.error(e); }
  }
}
if (failed) process.exitCode = 1;
