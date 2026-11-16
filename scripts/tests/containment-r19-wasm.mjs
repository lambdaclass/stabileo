import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
function copiesOf(model, copies, dim) {
  const result = structuredClone(model);
  for (let copy = 1; copy < copies; copy++) {
    const root = 2*copy+1, tip = root+1;
    result.nodes[root] = { ...model.nodes[1], id:root };
    result.nodes[tip] = { ...model.nodes[2], id:tip };
    result.elements[copy+1] = { ...model.elements[1], id:copy+1, nodeI:root, nodeJ:tip };
    for (const support of Object.values(model.supports)) {
      const nodeId = 2*copy+support.nodeId;
      result.supports[nodeId] = { ...support, nodeId, ...(dim === 2 ? {id:nodeId} : {}) };
    }
    result.loads.push(...model.loads.map(l => ({...l,data:{...l.data,nodeId:tip}})));
  }
  return result;
}

let count = 0;
for (const dim of [2, 3]) {
  const cases = JSON.parse(readFileSync(`${process.argv[2]}-${dim}.json`));
  for (const { model: base, expected } of cases) {
    for (const copies of dim === 2 ? [1,10,11] : [1,5,6]) {
    const model = copiesOf(base,copies,dim);
    for (const entry of ['solve_pdelta', 'certify_pdelta']) {
      const out = JSON.parse(engine[`${entry}_${dim}d`](JSON.stringify(model), 100, 1e-12));
      const solved = entry === 'certify_pdelta' ? out.results : out;
      assert.equal(solved.converged, true);
      assert.equal(solved.results.equilibrium.residualOk, true);
      assert.equal(solved.results.reactions.length,copies*Object.keys(base.supports).length);
      assert.equal(solved.results.elementForces.length,copies);
      assert.ok(!solved.results.structuredDiagnostics?.some(d => d.code === 'result_quantity_unavailable'));
      const tip = solved.results.displacements.find(d => d.nodeId === 2);
      const a = model.nodes['1'], b = model.nodes['2'];
      const length = Math.hypot(b.x-a.x, (b.y ?? 0)-(a.y ?? 0), b.z-a.z);
      const translations = dim === 2 ? ['ux','uz'] : ['ux','uy','uz'];
      const rotations = dim === 2 ? ['ry'] : ['rx','ry','rz'];
      const scale = Math.max(Math.hypot(...translations.map(k => expected[k])), length*Math.hypot(...rotations.map(k => expected[k])));
      for (const [key, value] of Object.entries(expected)) {
        if (key !== 'nodeId') assert.ok(Math.abs(tip[key] - value)*(rotations.includes(key) ? length : 1) <= 1e-10 * scale, `${entry} ${dim}D ${key}: ${tip[key]} != ${value}`);
      }
      assert.throws(() => engine[`${entry}_${dim}d`](JSON.stringify(model), 0, 1e-12), error => {
        if (typeof error !== 'string') return false;
        if (error.startsWith('non-finite number in the results')) return true;
        const refusal = JSON.parse(error);
        return refusal.structuredDiagnostics?.some(d => d.code === 'non_finite_result' && d.severity === 'error');
      });
      count++;
    }
  }
  }
  const soilCases = JSON.parse(readFileSync(`${process.argv[3]}-${dim}.json`));
  for (const input of soilCases) {
    const out = JSON.parse(engine[`solve_ssi_${dim}d`](JSON.stringify(input)));
    assert.equal(out.converged, true);
    const applied = input.solver.loads.reduce((sum,l) => sum + l.data.fz, 0);
    const support = out.results.reactions.reduce((sum,r) => sum + r[dim === 2 ? 'rz' : 'fz'], 0);
    const soil = out.springResults.reduce((sum,r) => sum + r.reaction, 0);
    assert.ok(Math.abs(applied + support - soil) < 1e-7, `${dim}D: ${applied} + ${support} - ${soil}`);
    const nodes = input.solver.nodes;
    const momentAt = (id, fx, fz, my) => nodes[id].z * fx - nodes[id].x * fz + (dim === 2 ? -my : my);
    let moment = input.solver.loads.reduce((sum,l) => sum + momentAt(l.data.nodeId,l.data.fx,l.data.fz,l.data.my),0);
    moment += out.results.reactions.reduce((sum,r) => sum + momentAt(r.nodeId,r[dim === 2 ? 'rx' : 'fx'],r[dim === 2 ? 'rz' : 'fz'],r.my),0);
    moment += out.springResults.reduce((sum,r) => sum + nodes[r.nodeId].x * r.reaction,0);
    assert.ok(Math.abs(moment) < 1e-7, `${dim}D independent SSI moment: ${moment}`);
    if (applied !== 0) { assert.ok(Math.abs(soil) > 1e-6); assert.ok(Math.abs(support) > 1e-6); }
    count++;
  }
}
console.log(`PASS ${count} native/WASM physical-residual and independent SSI balance checks`);
