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
  else if (kind === 'displacement') raw = engine.solve_displacement_control(JSON.stringify({ ...o, controlNode: m.loads[0].data.nodeId, controlDof: 1, targetDisplacement: -0.005, nSteps: 3 }));
  else if (kind === 'linear') return [engine[`solve_${dim}d`](m), 1];
  else if (kind === 'corotational') raw = engine[`solve_corotational_${dim}d`](JSON.stringify(m), 40, 1e-9, 2);
  else if (kind === 'pdelta') raw = engine[`solve_pdelta_${dim}d`](JSON.stringify(m), 40, 1e-9);
  else if (kind === 'cable') raw = engine[`solve_cable_${dim}d`](JSON.stringify({solver: m, densities: {}}), 40, 1e-9);
  else if (kind === 'winkler') raw = engine[`solve_winkler_${dim}d`](JSON.stringify(o));
  else if (kind === 'guyan') raw = engine.guyan_reduce_2d(JSON.stringify(o));
  else if (kind === 'staged') raw = engine[`solve_staged_${dim}d`](JSON.stringify({ ...m, stages: [{ name: 'loaded', elementsAdded: Object.values(m.elements).map(e => e.id), supportsAdded: Object.values(m.supports).map(s => s.id ?? s.nodeId), loadIndices: m.loads.map((_, i) => i) }] }));
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
  if (dim === 2 && ['arc', 'displacement', 'corotational'].includes(kind)) {
    for (const f of r.elementForces) {
      const e = Object.values(m.elements).find(e => e.id === f.elementId);
      if (e.type !== 'frame' || m.loads.some(l => l.data.elementId === e.id)) continue;
      const at = id => {
        const n = m.nodes[id], d = r.displacements.find(d => d.nodeId === id);
        return [n.x + d.ux, n.z + d.uz];
      };
      const a = at(e.nodeI), b = at(e.nodeJ), l = Math.hypot(b[0]-a[0],b[1]-a[1]);
      assert.ok(Math.abs(f.length-l) < 1e-12);
      assert.ok(Math.abs(f.vStart-f.vEnd) < 1e-9);
      assert.ok(Math.abs(f.mEnd-f.mStart+f.vStart*l) < 1e-9, `${kind}: ${JSON.stringify(f)}`);
    }
  }
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
for (const kind of ['arc', 'displacement', 'linear']) {
  for (const segments of [1, 21, 22]) {
    for (const loading of ['distributed', 'pointOnElement', 'both', 'none']) {
      try {
        const m = model(2, false);
        m.nodes = {}; m.elements = {};
        for (let i = 0; i <= segments; i++) {
          m.nodes[i] = { id: i, x: 3 * i / segments, z: 0 };
          if (i > 0) m.elements[i] = { id: i, type: 'frame', nodeI: i - 1, nodeJ: i, materialId: 1, sectionId: 1 };
        }
        m.loads[0].data.nodeId = segments;
        for (const [id, x] of [[1000, 0], [1001, 3]]) {
          m.nodes[id] = { id, x, z: 2 };
          m.supports[id] = { id, nodeId: id, type: 'fixed' };
        }
        m.elements[1000] = { ...m.elements[1], id: 1000, nodeI: 1000, nodeJ: 1001 };
        const qi = ['distributed', 'both'].includes(loading) ? -10 : 0;
        const qj = ['distributed', 'both'].includes(loading) ? -4 : 0;
        const p = ['pointOnElement', 'both'].includes(loading) ? -7 : 0;
        m.loads.push({ type: 'distributed', data: { elementId: 1000, qI: qi, qJ: qj } });
        m.loads.push({ type: 'pointOnElement', data: { elementId: 1000, a: 1, p } });
        const [r, factor] = run(kind, 2, m);
        assert.ok(Number.isFinite(factor) && factor > 0);
        if (kind !== 'linear') assert.ok(Math.abs(factor - 1) > 0.1, `${kind}: ${factor}`);
        const a = r.elementForces.find(f => f.elementId === 1000);
        const l = 3, t = 1 / 3;
        const equivalent = [
          l * (7 * qi + 3 * qj) / 20 + p * (1 - 3 * t*t + 2 * t*t*t),
          l*l * (3 * qi + 2 * qj) / 60 + p * l * (t - 2 * t*t + t*t*t),
          l * (3 * qi + 7 * qj) / 20 + p * (3 * t*t - 2 * t*t*t),
          -l*l * (2 * qi + 3 * qj) / 60 + p * l * (-t*t + t*t*t),
        ];
        for (const [i, key] of ['vStart', 'mStart', 'vEnd', 'mEnd'].entries()) {
          const expected = (i < 2 ? -1 : 1) * equivalent[i] * factor;
          assert.ok(Math.abs(a[key] - expected) < 1e-9, `${kind} ${loading} segments=${segments} ${key}: ${a[key]}, expected=${expected}, factor=${factor}`);
        }
        for (const id of [1000, 1001]) {
          const d = r.displacements.find(d => d.nodeId === id);
          for (const key of ['ux', 'uz', 'ry']) assert.equal(d[key], 0);
        }
        console.log(`PASS ${kind} ${loading} segments=${segments} independently calculated member shears and moments factor=${factor}`);
      } catch (error) { failed = true; console.error(`FAIL ${kind} ${loading} segments=${segments} member shears and moments: ${error}`); }
    }
  }
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
      assert.ok((r.structuredDiagnostics ?? []).some(d=>d.code === 'result_quantity_unavailable' && d.phase === 'stageResults'));
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
for (const dim of [2, 3]) {
  for (const segments of [2, 22]) {
    for (const motion of [0, 0.0013, -0.0013]) {
      for (const tied of [false, true]) {
        try {
          const m = model(dim, false);
          const node = { ...m.nodes[0] }, elem = { ...m.elements[1] };
          m.nodes = {}; m.elements = {}; m.loads = [];
          m.supports[0].dx = motion;
          m.supports[segments] = { ...m.supports[0], nodeId: segments, dx: 0, ...(dim === 2 ? { id: segments } : {}) };
          for (let i = 0; i <= segments; i++) {
            m.nodes[i] = { ...node, id: i, x: 3 * i / segments };
            if (i > 0) m.elements[i] = { ...elem, id: i, nodeI: i - 1, nodeJ: i };
          }
          if (tied) {
            m.nodes[segments + 1] = { ...node, id: segments + 1 };
            m.constraints = [{ type: 'equalDOF', masterNode: 0, slaveNode: segments + 1, dofs: Array.from({ length: dim === 2 ? 3 : 6 }, (_, i) => i) }];
          }
          const [r] = run('pdelta', dim, m);
          assert.equal(r.equilibrium.residualOk, true, JSON.stringify(r.equilibrium));
          assert.equal(r.equilibrium.equilibriumOk, true, JSON.stringify(r.equilibrium));
          assert.ok(!(r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable'));
          for (const d of r.displacements) assert.ok(Math.abs(d.ux - motion * (1 - m.nodes[d.nodeId].x / 3)) < 1e-12);
          for (const a of r.reactions) {
            const expected = (a.nodeId === 0 ? 1 : -1) * 200000 * 1000 * 0.01 * motion / 3;
            assert.ok(Math.abs(a[dim === 2 ? 'rx' : 'fx'] - expected) < 1e-7);
          }
          console.log(`PASS settlement-only P-Delta ${dim}D segments=${segments} motion=${motion} tied=${tied}`);
        } catch (error) { failed = true; console.error(`FAIL settlement-only P-Delta ${dim}D segments=${segments} motion=${motion} tied=${tied}: ${error}`); }
      }
    }
  }
  for (const inactiveMember of [false, true]) {
    for (const motion of [0, 0.0001]) {
      try {
        const m = model(dim, false);
        if (!inactiveMember) m.elements = {};
        m.supports[1] = { ...m.supports[0], nodeId: 1, ...(dim === 2 ? { id: 1 } : {}) };
        m.supports[0].dx = motion;
        m.loads[0].data.fx = 3;
        m.stages = [{ name: 'restrained only', supportsAdded: [0, 1], loadIndices: [0] }];
        const output = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m)));
        for (const r of [output.finalResults, output.stages[0].results]) {
          assert.ok(!(r.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable'));
          assert.equal(r.reactions.length, 2);
          for (const a of r.reactions) {
            assert.equal(a[dim === 2 ? 'rx' : 'fx'], a.nodeId === 1 ? -3 : 0);
            assert.equal(a[dim === 2 ? 'rz' : 'fz'], a.nodeId === 1 ? 10 : 0);
          }
          for (const d of r.displacements) assert.equal(d.ux, d.nodeId === 0 ? motion : 0);
        }
        console.log(`PASS fully restrained staged ${dim}D inactiveMember=${inactiveMember} motion=${motion}`);
      } catch (error) { failed = true; console.error(`FAIL fully restrained staged ${dim}D inactiveMember=${inactiveMember} motion=${motion}: ${error}`); }
    }
  }
}
for (const dim of [2, 3]) {
  try {
    const m = model(dim, false);
    delete m.nodes[1]; m.elements = {};
    m.supports[0] = dim === 2 ? { id: 0, nodeId: 0, type: 'rollerX' } : { nodeId: 0, rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: true };
    m.loads[0].data.nodeId = 0; m.loads[0].data.fx = 3; m.loads[0].data.fz = 0;
    m.stages = [{ name: 'one free DOF', supportsAdded: Object.values(m.supports).map(s => s.id ?? s.nodeId), loadIndices: [0] }];
    let r;
    try { r = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m))).finalResults; }
    catch (error) { assert.match(String(error), /mechanism/); }
    if (r) assert.ok(r.structuredDiagnostics.some(d => d.code === 'result_quantity_unavailable' && d.phase === 'stageResults'));
    console.log(`PASS stiffness-free staged ${dim}D one free DOF remains unavailable`);
  } catch (error) { failed = true; console.error(`FAIL stiffness-free staged ${dim}D one free DOF: ${error}`); }
}

for (const dim of [2, 3]) {
  for (const segments of [0, 1, 21, 22]) {
    for (const motion of [0, 0.0013, -0.0013]) {
      try {
        const m = model(dim, false), n = Math.max(1, segments);
        const node = {...m.nodes[0]}, elem = {...m.elements[1]};
        m.nodes = {}; m.elements = {}; m.loads = [];
        m.supports[0].dx = motion;
        for (let i = 0; i <= n; i++) {
          m.nodes[i] = {...node, id:i, x:3*i/n};
          if (segments && i) m.elements[i] = {...elem, id:i, nodeI:i-1, nodeJ:i};
        }
        if (segments) m.loads = [{type:'nodal',data:dim === 2 ? {nodeId:n,fx:0,fz:-10,my:0} : {nodeId:n,fx:0,fy:0,fz:-10,mx:0,my:0,mz:0}}];
        const slave = segments ? n+1 : 1;
        if (segments) m.nodes[slave] = {...m.nodes[n], id:slave};
        m.constraints = [{type:'equalDOF',masterNode:segments ? n : 0,slaveNode:slave,dofs:Array.from({length:dim === 2 ? 3 : 6},(_,i)=>i)}];
        m.stages = [{name:'artificial tie',elementsAdded:Array.from({length:segments},(_,i)=>i+1),supportsAdded:[0],loadIndices:segments ? [0] : []}];
        const output = JSON.parse(engine[`solve_staged_${dim}d`](JSON.stringify(m)));
        for (const r of [output.finalResults, output.stages[0].results]) {
          const warned = (r.structuredDiagnostics ?? []).some(d=>d.code === 'result_quantity_unavailable' && d.phase === 'stageResults');
          assert.equal(warned, segments === 0);
          for (const cf of r.constraintForces ?? []) assert.equal(cf.force, 0, JSON.stringify(cf));
          if (!segments) for (const a of r.reactions) for (const k of dim === 2 ? ['rx','rz','my'] : ['fx','fy','fz','mx','my','mz']) assert.equal(a[k],0);
        }
        console.log(`PASS staged physical residual ${dim}D segments=${segments} motion=${motion}`);
      } catch (error) { failed=true; console.error(`FAIL staged physical residual ${dim}D segments=${segments} motion=${motion}: ${error}`); }
    }
  }
}
if (failed) process.exitCode = 1;

for (const dim of [2, 3]) {
  for (const kind of ['linear', 'corotational', 'material', 'pdelta', 'contact', 'staged', 'time', ...(dim === 2 ? ['arc', 'displacement', 'guyan'] : [])]) {
    for (const segments of (kind === 'guyan' ? [1] : [1,21,22])) {
    for (const motion of [0, 0.0013, -0.0013]) {
      const m = model(dim, false);
      m.nodes[2] = { ...m.nodes[0], id: 2 };
      m.supports[2] = { ...m.supports[0], nodeId: 2, dry: motion, ...(dim === 2 ? {id: 2} : {}) };
      m.elements[1][dim === 2 ? 'hingeEnd' : 'releaseMyEnd'] = true;
      m.constraints = [{type:'equalDOF',masterNode:2,slaveNode:1,dofs:[dim === 2 ? 2 : 4]}];
      if (kind === 'guyan') {
        m.nodes[3] = {...m.nodes[1], id:3, x:1.5};
        m.elements[2] = {...m.elements[1], id:2, nodeI:3};
        m.elements[1].nodeJ = 3;
        m.elements[1].hingeEnd = false;
      }
      if (segments > 1) {
        const template = m.elements[1];
        m.elements = {};
        for (let i=1; i<segments; i++) m.nodes[10+i] = {...m.nodes[1],id:10+i,x:3*i/segments};
        for (let i=0; i<segments; i++) m.elements[i+1] = {...template,id:i+1,nodeI:i===0 ? 0 : 10+i,nodeJ:i+1===segments ? 1 : 11+i,[dim===2 ? 'hingeEnd' : 'releaseMyEnd']:i+1===segments};
      }
      let r;
      try {
        if (kind === 'time') {
          const out = JSON.parse(engine[`solve_time_history_${dim}d`](JSON.stringify({solver:m,densities:{'1':7850},timeStep:0.01,nSteps:3})));
          assert.ok(out.structuredDiagnostics.some(d => d.code === 'result_quantity_unavailable'));
          r = {reactions:out.peakReactions};
        } else [r] = run(kind, dim, m);
      }
      catch (e) {
        assert.ok(motion !== 0 && ['guyan','corotational','displacement','time'].includes(kind), `${kind} ${dim}D: ${e}`);
        assert.match(String(e), /prescribed/i);
        continue;
      }
      assert.equal(r.reactions.find(r => r.nodeId === 2).my, 0, `${kind} ${dim}D motion=${motion}`);
      for (const cf of r.constraintForces ?? []) assert.equal(cf.force, 0);
    }
    }
    console.log(`PASS released rotational slave ${kind} ${dim}D`);
  }
}
