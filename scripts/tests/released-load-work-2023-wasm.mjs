import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';
engine.initSync({module:readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm',import.meta.url))});
const {cases,exact:exactCases}=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(cases.length,234);
const parse=x=>typeof x==='string'?JSON.parse(x):x;
function stage(model,dim,two) {
  const all={name:'all',elementsAdded:Object.values(model.elements).map(e=>e.id),supportsAdded:Object.values(model.supports).map(s=>dim===2?s.id:s.nodeId),loadIndices:model.loads.map((_,i)=>i)};
  return {...model,stages:two?[{...all,loadIndices:[]},{name:'loads',elementsAdded:[],supportsAdded:[],loadIndices:all.loadIndices}]:[all]};
}
function run(path,dim,model) {
  const wrapper={solver:model,soilSprings:[],foundationSprings:[],densities:{},materialModels:{},sectionCapacities:{},maxIter:60,tolerance:1e-10,nIncrements:4};
  if(path==='linear') return engine[`solve_${dim}d`](model);
  if(path==='certified') return engine[`certify_linear_${dim}d`](model).results;
  if(path==='session') {
    const session=new engine[`LoadSession${dim}D`](model);
    try{return session.solve(model.loads);}finally{session.free();}
  }
  if(path==='staged'||path==='staged-two') return parse(engine[`solve_staged_${dim}d`](JSON.stringify(stage(model,dim,path==='staged-two')))).finalResults;
  if(path==='constrained') return parse(engine[`solve_constrained_${dim}d`](JSON.stringify({solver:model,constraints:model.constraints??[]})));
  if(path==='corotational') return parse(engine[`solve_corotational_${dim}d`](JSON.stringify(model),100,1e-10,4));
  if(path==='pdelta') return parse(engine[`solve_pdelta_${dim}d`](JSON.stringify(model),100,1e-12));
  const name={material:'solve_nonlinear_material',contact:'solve_contact',ssi:'solve_ssi',winkler:'solve_winkler',cable:'solve_cable'}[path];
  return parse(engine[`${name}_${dim}d`](JSON.stringify(wrapper),100,1e-10));
}
function snapshot(result) {
  assert.notEqual(result.converged,false);
  return result.results??result;
}
function check(result,model) {
  const r=snapshot(result);
  assert.deepEqual(r.displacements.map(d=>d.nodeId).sort(),Object.values(model.nodes).map(n=>n.id).sort());
  assert.deepEqual(r.elementForces.map(e=>e.elementId).sort(),Object.values(model.elements).map(e=>e.id).sort());
  const values=r.elementForces.flatMap(f=>Object.entries(f).filter(([k,v])=>typeof v==='number'&&/(Start|End)$/.test(k)).map(([,v])=>v));
  assert.ok(values.every(Number.isFinite));
  assert.ok(values.some(v=>v!==0));
  for(const d of r.displacements) for(const value of Object.values(d)) if(typeof value==='number') assert.ok(Number.isFinite(value));
}
const oracleModel=cases[0].model;
const mutationFailures=[];
for(const factor of [2,-1]) {
  const wrong=structuredClone(run('linear',2,oracleModel));
  for(const f of wrong.elementForces) for(const key of Object.keys(f)) if(/(Start|End)$/.test(key)&&typeof f[key]==='number') f[key]*=factor;
  try {assert.throws(()=>check(wrong,oracleModel,cases[0].references.linear),`force corruption ${factor} passed`);} catch(e) {mutationFailures.push(String(e));}
}
assert.deepEqual(mutationFailures,[]);
const corrupted=structuredClone(run('linear',2,oracleModel));
for(const f of corrupted.elementForces) for(const key of Object.keys(f)) if(/(Start|End)$/.test(key)&&typeof f[key]==='number') f[key]=0;
assert.throws(()=>check(corrupted,oracleModel));
const missing=structuredClone(run('linear',2,oracleModel));
missing.displacements=[];
assert.throws(()=>check(missing,oracleModel));
let solves=0,refusals=0,unresolved=0;
const failures=[];
const admitted=new Map();
const paths=['linear','session','certified','constrained','staged','staged-two','corotational','material','cable','contact','ssi','winkler','pdelta'];
for(const [i,c] of cases.entries()) {
  for(const path of paths) {
    const mayRefuse=c.dim===3&&['corotational','material','ssi'].includes(path);
    try {
      const result=run(path,c.dim,c.model);
      if(mayRefuse&&result.converged===false) unresolved++;
      else {
        if(path==='pdelta') check(result.linearResults,c.model);else check(result,c.model);
        solves++;
        const key=`${c.dim}:${path}`;
        admitted.set(key,(admitted.get(key)??0)+1);
      }
    } catch(e) {
      if(mayRefuse&&/^Singular (tangent )?stiffness/.test(String(e))) unresolved++;
      else failures.push(`${path}/${i}: ${e}`);
    }
    for(const factor of [1,Number.EPSILON*28/(1-Number.EPSILON*28)]) {
      try {
        const bad=structuredClone(c.model);
        const magnitude=factor*c.scale;
        const moment=c.dim===2?{my:magnitude}:{mx:c.direction[0]*magnitude,my:c.direction[1]*magnitude,mz:c.direction[2]*magnitude};
        bad.loads.push({type:'nodal',data:{nodeId:c.node,fx:0,fz:0,...(c.dim===3?{fy:0}:{}),...moment}});
        assert.throws(()=>run(path,c.dim,bad),/Nodal moment|free rotation would carry load|loaded released rotation/i,`${path}/${i}/${factor}`);
        refusals++;
      } catch(e) {failures.push(`${path}/${i}/${factor}: ${e}`);}
    }
  }
}
assert.deepEqual(failures,[]);
for(const dim of [2,3]) for(const path of paths) assert.ok((admitted.get(`${dim}:${path}`)??0)>0,`no completed control ${dim}:${path}`);
assert.equal(solves+unresolved,cases.length*paths.length);
assert.equal(refusals,cases.length*paths.length*2);
console.log(`Released-load work: ${solves} public WASM admissions, ${unresolved} explicit nonlinear numerical refusals, ${refusals} unsupported-moment refusals`);

let exactSolves=0;
for(const {name,model} of exactCases) {
  for(const path of ['linear','session','certified','constrained','staged','staged-two']) {
    try {check(run(path,3,model),model);exactSolves++;}
    catch(e){throw new Error(`${name}/${path}: ${e}`);}
  }
}
assert.equal(exactSolves,18);
console.log(`Released-load work: ${exactSolves} exact-witness public WASM admissions`);
