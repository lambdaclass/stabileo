import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });

function model(dim, tied) {
  const m = JSON.parse(readFileSync(new URL(`../../engine/tests/fixtures/reaction-recovery-${dim}d.json`, import.meta.url)));
  if (tied) {
    m.nodes[2] = { ...m.nodes[0], id: 2 };
    m.constraints.push({ type: 'equalDOF', masterNode: 0, slaveNode: 2, dofs: Array.from({ length: dim === 2 ? 3 : 6 }, (_, i) => i) });
    m.loads.push({ type: 'nodal', data: { ...m.loads[0].data, nodeId: 2, fx: 3, my: 2 } });
  }
  return m;
}

function run(kind, dim, m, extra = {}) {
  const o = { solver: m, maxIter: 40, tolerance: 1e-9, nIncrements: 2, materialModels: {}, sectionCapacities: {}, fiberSections: {}, soilSprings: [], foundationSprings: [], boundaryNodes: [1], ...extra };
  let raw;
  if (kind === 'arc') raw = engine.solve_arc_length(JSON.stringify({ ...o, maxSteps: 3, initialDs: 0.1, minDs: 1e-8, maxDs: 0.1, targetIter: 5 }));
  else if (kind === 'displacement') raw = engine.solve_displacement_control(JSON.stringify({ ...o, controlNode: 1, controlDof: 1, targetDisplacement: -0.005, nSteps: 3 }));
  else if (kind === 'linear') return [engine[`solve_${dim}d`](m), 1];
  else if (kind === 'corotational') raw = engine[`solve_corotational_${dim}d`](JSON.stringify(m), 40, 1e-9, 2);
  else if (kind === 'pdelta') raw = engine[`solve_pdelta_${dim}d`](JSON.stringify(m), 40, 1e-9);
  else if (kind === 'cable') raw = engine[`solve_cable_${dim}d`](JSON.stringify({solver: m, densities: {}}), 40, 1e-9);
  else if (kind === 'winkler') raw = engine[`solve_winkler_${dim}d`](JSON.stringify(o));
  else if (kind === 'guyan') raw = engine.guyan_reduce_2d(JSON.stringify(o));
  else if (kind === 'staged') raw = engine[`solve_staged_${dim}d`](JSON.stringify({ ...m, stages: [{ name: 'loaded', elementsAdded: [1], supportsAdded: [0], loadIndices: m.loads.map((_, i) => i) }] }));
  else raw = engine[`solve_${({ material: 'nonlinear_material', fiber: 'fiber_nonlinear', contact: 'contact', ssi: 'ssi' })[kind]}_${dim}d`](JSON.stringify(o));
  const output = JSON.parse(raw);
  if ('converged' in output) assert.equal(output.converged, true);
  return [output.results ?? output.finalResults ?? output, output.finalLoadFactor ?? 1];
}

function equilibrium(kind, dim, m) {
  if (kind === 'guyan') {
    m.nodes[3] = {...m.nodes[1], id:3, x:1.5};
    m.elements[2] = {...m.elements[1], id:2, nodeI:3, nodeJ:1};
    m.elements[1].nodeJ = 3;
  }
  if (kind === 'cable') {
    m.elements[1].type = 'cable';
    m.loads[0].data.fx = 10;
    m.loads[0].data.fz = 0;
    if (m.constraints.length) {
      m.loads[1].data.my = 0;
      m.constraints[0].dofs = Array.from({length: dim === 2 ? 2 : 3}, (_, i) => i);
    }
    m.supports[1] = dim === 2 ? {id: 1, nodeId: 1, type: 'rollerX'} : {nodeId: 1, rx:false,ry:true,rz:true,rrx:true,rry:true,rrz:true};
  }
  if (kind === 'fiber' && m.constraints.length) {
    assert.throws(() => run(kind, dim, m), /constraints are not supported/);
    return;
  }
  const [r, factor] = run(kind, dim, m);
  assert.ok(Number.isFinite(factor) && factor > 0);
  assert.equal(r.reactions.length, Object.keys(m.supports).length);
  const balance = Array(6).fill(0);
  const large = ['arc', 'displacement', 'corotational', 'pdelta'].includes(kind);
  function add(id, f, moment) {
    const n = m.nodes[id];
    const d = r.displacements.find(x => x.nodeId === id);
    const p = [n.x, n.y ?? 0, n.z].map((v, i) => v + (large ? [d.ux, d.uy ?? 0, d.uz][i] : 0));
    for (let i = 0; i < 3; i++) { balance[i] += f[i]; balance[i + 3] += moment[i]; }
    balance[3] += p[1] * f[2] - p[2] * f[1];
    balance[4] += p[2] * f[0] - p[0] * f[2];
    balance[5] += p[0] * f[1] - p[1] * f[0];
  }
  for (const { data: l } of m.loads) add(l.nodeId, [l.fx, l.fy ?? 0, l.fz].map(x => x * factor), (dim === 2 ? [0, -l.my, 0] : [l.mx, l.my, l.mz]).map(x => x * factor));
  for (const a of r.reactions) add(a.nodeId, dim === 2 ? [a.rx, 0, a.rz] : [a.fx, a.fy, a.fz], dim === 2 ? [0, -a.my, 0] : [a.mx, a.my, a.mz]);
  for (const v of balance.slice(0,3)) assert.ok(Math.abs(v) < 1e-6, `${kind} ${dim}D force balance: ${balance}`);
  if (kind === 'pdelta' && !m.constraints.length) assert.ok(!(r.structuredDiagnostics ?? []).some(d=>d.code === 'result_quantity_unavailable'));
  if (kind === 'pdelta' && (r.equilibrium?.equilibriumOk === false || r.equilibrium?.residualOk === false)) {
    assert.ok(r.structuredDiagnostics.some(d=>d.code === 'result_quantity_unavailable' && d.phase === 'reactions' && d.severity === 'warning'));
    return;
  }
  for (const [i, value] of balance.entries()) assert.ok(Math.abs(value) < 1e-6, `${kind} ${dim}D component ${i}: ${value}`);
}

let failed = false;
for (const dim of [2, 3]) {
  for (const kind of ['linear', 'corotational', 'material', 'fiber', 'pdelta', 'contact', 'cable', 'ssi', 'staged', 'winkler', ...(dim === 2 ? ['arc', 'displacement', 'guyan'] : [])]) {
    for (const tied of [false, true]) {
      try {
        equilibrium(kind, dim, model(dim, tied));
        if (tied && !['fiber', 'cable'].includes(kind)) {
          const rigid = model(dim, true);
          rigid.nodes[2].x = 1;
          rigid.nodes[2].z = 1;
          rigid.constraints[0].type = 'rigidLink';
          equilibrium(kind, dim, rigid);
          if (!['staged', 'displacement'].includes(kind)) {
            rigid.supports[1] = dim === 2 ? {id:1,nodeId:1,type:'inclinedRoller',angle:30} : {nodeId:1,rx:false,ry:false,rz:false,rrx:false,rry:false,rrz:false,isInclined:true,normalX:0.5,normalY:0,normalZ:Math.cos(Math.PI/6)};
            equilibrium(kind, dim, rigid);
          }
        }
        console.log(`PASS ${kind} ${dim}D tied=${tied}`);
      } catch (error) {
        failed = true;
        console.error(`FAIL ${kind} ${dim}D tied=${tied}: ${error}`);
      }
    }
  }
}
for (const dim of [2,3]) {
  for (const springsOnly of [false, true]) {
    for (const method of ['newmark','hht']) {
      try {
        const m = model(dim, false);
        if (springsOnly) {
          m.elements = {};
          delete m.nodes[0];
          m.masses = {nodal:[{nodeId:1,mass:1}]};
          m.supports = dim === 2 ? {1:{id:1,nodeId:1,type:'spring',kx:1000,ky:1000,kz:1000}} : {1:{nodeId:1,rx:false,ry:false,rz:false,rrx:false,rry:false,rrz:false,kx:1000,ky:1000,kz:1000,krx:1000,kry:1000,krz:1000}};
        }
        const r = JSON.parse(engine[`solve_time_history_${dim}d`](JSON.stringify({solver:m,densities:{1:7850},timeStep:0.01,nSteps:3,method,alpha:method === 'hht' ? -0.1 : null})));
        assert.equal(r.timeSteps.length, 4);
        assert.equal(r.peakReactions.length, 1);
        assert.ok(r.structuredDiagnostics.some(d=>d.code === 'result_quantity_unavailable' && d.phase === 'peakReactions' && d.severity === 'warning'));
        console.log(`PASS dynamic ${dim}D ${method} springsOnly=${springsOnly}: explicit unavailable total reactions`);
      } catch (error) { failed = true; console.error(`FAIL dynamic ${dim}D ${method} springsOnly=${springsOnly}: ${error}`); }
    }
  }
  try {
    const m = model(dim, false);
    m.stages = [{name:'no stiffness', supportsAdded:[0], loadIndices:[0]}];
    const r = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m)));
    assert.ok(r.finalResults.structuredDiagnostics.some(d=>d.code === 'result_quantity_unavailable' && d.phase === 'stageResults'));
    console.log(`PASS staged ${dim}D no stiffness: explicit unavailable equilibrium state`);
  } catch (error) { if (String(error).includes('mechanism')) console.log(`PASS staged ${dim}D no stiffness: explicit mechanism refusal`); else { failed = true; console.error(`FAIL staged ${dim}D no stiffness: ${error}`); } }
}
for (const kind of ['arc','displacement']) {
  try {
    const m = model(2, false);
    m.loads.push({type:'distributed',data:{elementId:1,qI:-10,qJ:-10}});
    const [r, factor] = run(kind, 2, m);
    assert.ok(Math.abs(r.elementForces[0].qI + 10 * factor) < 1e-9);
    assert.ok(Math.abs(r.elementForces[0].qJ + 10 * factor) < 1e-9);
    console.log(`PASS ${kind} final member load factor`);
  } catch (error) { failed = true; console.error(`FAIL ${kind} final member load factor: ${error}`); }
}
for (const dim of [2,3]) {
  for (const kind of ['corotational','material']) {
    try {
      const m = model(dim, false);
      m.nodes[2] = {...m.nodes[0], id:2, z:2};
      m.nodes[3] = {...m.nodes[1], id:3, z:2};
      m.elements[2] = {...m.elements[1], id:2, nodeI:2, nodeJ:3};
      m.supports[2] = {...m.supports[0], nodeId:2, ...(dim === 2 ? {id:2} : {})};
      m.constraints = [{type:'equalDOF',masterNode:1,slaveNode:3,dofs:[dim === 2 ? 1 : 2]}];
      let extra = {};
      if (kind === 'material') {
        const [elastic] = run('linear', dim, m);
        const cap = Math.abs(elastic.reactions[0].my) / 2;
        extra = {materialModels:{1:{modelType:'bilinear',fy:200,alpha:0.01}},sectionCapacities:{1:dim === 2 ? {np:2000000,mp:cap} : {np:2000000,mpy:cap,mpz:cap}}};
      }
      const [r] = run(kind, dim, m, extra);
      const cf = r.constraintForces.find(c=>c.nodeId === 3 && c.dof === 'uz');
      const base = r.reactions.find(c=>c.nodeId === 2);
      assert.ok(Math.abs(cf.force + (dim === 2 ? base.rz : base.fz)) < 1e-7);
      console.log(`PASS ${kind} ${dim}D actual constraint force at final state`);
    } catch (error) { failed = true; console.error(`FAIL ${kind} ${dim}D actual constraint force: ${error}`); }
  }
}
for (const kind of ['arc','displacement']) {
  for (const y of [0,1,-1]) {
    try {
      const m = model(2, false);
      m.nodes[1].y = y;
      assert.throws(()=>run(kind, 2, m));
      console.log(`PASS ${kind} refuses spatial coordinate y=${y}`);
    } catch (error) { failed=true; console.error(`FAIL ${kind} spatial coordinate y=${y}: ${error}`); }
  }
}
for (const dim of [2,3]) {
  for (const memberType of ['frame','truss']) {
    try {
      const m = model(dim, false);
      const dofs = memberType === 'truss' ? dim : dim === 2 ? 3 : 6;
      if (memberType === 'truss') { m.elements[1].type = memberType; m.loads[0].data.fx = 10; m.loads[0].data.fz = 0; }
      m.constraints = [{type:'rigidLink',masterNode:0,slaveNode:1,dofs:Array.from({length:dofs},(_, i)=>i)}];
      m.stages = [{name:'rigid link only',supportsAdded:[0],loadIndices:[0]}];
      const r = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m))).finalResults;
      const a = r.reactions[0];
      assert.ok(Math.abs((dim === 2 ? a.rx : a.fx) + m.loads[0].data.fx) < 1e-6);
      assert.ok(Math.abs((dim === 2 ? a.rz : a.fz) + m.loads[0].data.fz) < 1e-6);
      assert.ok(Math.abs((dim === 2 ? a.my : -a.my) + 3 * m.loads[0].data.fz) < 1e-6);
      assert.ok(!(r.structuredDiagnostics ?? []).some(d=>d.code === 'result_quantity_unavailable'));
      console.log(`PASS staged ${dim}D constrained ${memberType} without elastic stiffness`);
    } catch (error) { failed=true; console.error(`FAIL staged ${dim}D constrained ${memberType}: ${error}`); }
  }
}
for (const dim of [2,3]) {
  for (const remove of [false,true]) {
    try {
      const m = model(dim, false);
      m.stages = remove ? [{name:'supported',elementsAdded:[1],supportsAdded:[0],loadIndices:[0]},{name:'released',supportsRemoved:[0]}] : [{name:'not yet supported',elementsAdded:[1],loadIndices:[0]}];
      let refusal;
      try { engine[`solve_staged_${dim}d`](JSON.stringify(m)); } catch(error) { refusal=JSON.parse(String(error)); }
      assert.ok(refusal?.structuredDiagnostics.some(d=>d.code === 'result_quantity_unavailable' && d.phase === 'reactions' && d.severity === 'error'));
      console.log(`PASS staged ${dim}D refuses support-mask mismatch remove=${remove}`);
    } catch(error) { failed=true; console.error(`FAIL staged ${dim}D support-mask mismatch remove=${remove}: ${error}`); }
  }
}
if (failed) process.exitCode = 1;
