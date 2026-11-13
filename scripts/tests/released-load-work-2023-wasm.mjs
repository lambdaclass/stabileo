import assert from 'node:assert/strict';
import { allowsUnresolved } from './released-load-work-outcome.mjs';
import {readFileSync} from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';
engine.initSync({module:readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm',import.meta.url))});
const {cases,exact:exactCases,orphanTranslations,cancellations,assemblyCases}=JSON.parse(readFileSync(process.argv[2],'utf8'));
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
function check(result,model,reference,gauges=[]) {
  assert.ok(reference && Object.hasOwn(reference,'ok'),`missing native answer: ${JSON.stringify(reference)}`);
  const expected=snapshot(reference.ok);
  const r=snapshot(result);
  assert.deepEqual(r.displacements.map(d=>d.nodeId).sort(),Object.values(model.nodes).map(n=>n.id).sort());
  assert.deepEqual(r.elementForces.map(e=>e.elementId).sort(),Object.values(model.elements).map(e=>e.id).sort());
  const values=r.elementForces.flatMap(f=>Object.entries(f).filter(([k,v])=>typeof v==='number'&&/(Start|End)$/.test(k)).map(([,v])=>v));
  assert.ok(values.every(Number.isFinite));
  assert.ok(values.some(v=>v!==0));
  for(const d of r.displacements) for(const value of Object.values(d)) if(typeof value==='number') assert.ok(Number.isFinite(value));
  const fields={
    displacements:{id:'nodeId',family:key=>key.startsWith('u')?'t':'r'},
    reactions:{id:'nodeId',family:key=>key.startsWith('m')?'m':'f'},
    elementForces:{id:'elementId',family:key=>/^(m|t)/i.test(key)?'m':'f',include:key=>/(Start|End)$/.test(key)}
  };
  const scale={t:0,r:0,f:0,m:0};
  for(const [collection,{id,family,include}] of Object.entries(fields)) {
    assert.deepEqual(r[collection].map(row=>row[id]).sort(),expected[collection].map(row=>row[id]).sort(),collection);
    for(const row of expected[collection]) for(const [key,value] of Object.entries(row)) {
      if(key===id||typeof value!=='number'||(include&&!include(key))) continue;
      assert.ok(Number.isFinite(value));
      scale[family(key)]=Math.max(scale[family(key)],Math.abs(value));
    }
  }
  const length=Math.max(...expected.elementForces.map(f=>f.length));
  assert.ok(Number.isFinite(length)&&length>0);
  const bound={t:Math.max(scale.t,scale.r*length),r:Math.max(scale.r,scale.t/length),f:Math.max(scale.f,scale.m/length),m:Math.max(scale.m,scale.f*length)};
  const rotations=new Map();
  for(const {node,rotation} of gauges) {
    const basis=rotations.get(node)??[];
    const v=[...rotation];
    for(const q of basis) {
      const dot=v.reduce((sum,x,i)=>sum+x*q[i],0);
      for(let i=0;i<3;i++) v[i]-=dot*q[i];
    }
    const norm=Math.hypot(...v);
    assert.ok(norm>0&&Number.isFinite(norm));
    basis.push(v.map(x=>x/norm));
    rotations.set(node,basis);
  }
  const comparable=structuredClone(r),native=structuredClone(expected);
  for(const response of [comparable,native]) for(const row of response.displacements) {
    for(const q of rotations.get(row.nodeId)??[]) {
      const dot=['rx','ry','rz'].reduce((sum,key,i)=>sum+row[key]*q[i],0);
      for(const [i,key] of ['rx','ry','rz'].entries()) row[key]-=dot*q[i];
    }
  }
  for(const [collection,{id,family,include}] of Object.entries(fields)) {
    for(const row of native[collection]) {
      const actual=comparable[collection].find(a=>a[id]===row[id]);
      for(const [key,value] of Object.entries(row)) {
        if(key===id||typeof value!=='number'||(include&&!include(key))) continue;
        assert.ok(Number.isFinite(actual[key]),`${collection}/${row[id]}/${key}`);
        assert.ok(Math.abs(actual[key]-value)<=2.5e-10*bound[family(key)],`${collection}/${row[id]}/${key}: ${actual[key]} != native ${value}`);
      }
    }
  }
}
const oracleModel=cases[0].model;
const mutationFailures=[];
for(const factor of [2,-1]) {
  const wrong=structuredClone(run('linear',2,oracleModel));
  for(const f of wrong.elementForces) for(const key of Object.keys(f)) if(/(Start|End)$/.test(key)&&typeof f[key]==='number') f[key]*=factor;
  try {assert.throws(()=>check(wrong,oracleModel,cases[0].references.linear),`force corruption ${factor} passed`);} catch(e) {mutationFailures.push(String(e));}
}
assert.deepEqual(mutationFailures,[]);
const oracle3=cases.find(c=>c.dim===3&&c.references.linear.ok.displacements.some(d=>['ux','uy','uz','rx','ry','rz'].some(key=>d[key]!==0)));
assert.ok(oracle3);
for(const collection of ['displacements','reactions','elementForces']) for(const factor of [2,-1]) {
  const wrong=structuredClone(run('linear',3,oracle3.model));
  for(const row of wrong[collection]) for(const key of Object.keys(row)) {
    if(typeof row[key]==='number'&&!['nodeId','elementId'].includes(key)&&(collection!=='elementForces'||/(Start|End)$/.test(key))) row[key]*=factor;
  }
  assert.throws(()=>check(wrong,oracle3.model,oracle3.references.linear,oracle3.gauges),`${collection} corruption ${factor} passed`);
}
if(!process.env.RUN_KNOWN_WRONG) console.log('SKIP known wrong result: #2074 released rotation corruption');
else {
  const gaugeCase=cases.find(c=>c.dim===3&&c.gauges.length>0);
  assert.ok(gaugeCase);
  for(const side of ['wasm','native','both']) {
    const wrong=structuredClone(run('linear',3,gaugeCase.model));
    const reference=structuredClone(gaugeCase.references.linear);
    const {node,rotation}=gaugeCase.gauges[0];
    for(const result of side==='both'?[wrong,reference.ok]:[side==='wasm'?wrong:reference.ok]) {
      const row=result.displacements.find(d=>d.nodeId===node);
      for(const [i,key] of ['rx','ry','rz'].entries()) row[key]+=rotation[i];
    }
    assert.throws(()=>check(wrong,gaugeCase.model,reference,gaugeCase.gauges),`${side} released rotation corruption passed`);
  }
}
const corrupted=structuredClone(run('linear',2,oracleModel));
for(const f of corrupted.elementForces) for(const key of Object.keys(f)) if(/(Start|End)$/.test(key)&&typeof f[key]==='number') f[key]=0;
assert.throws(()=>check(corrupted,oracleModel,cases[0].references.linear));
const missing=structuredClone(run('linear',2,oracleModel));
missing.displacements=[];
assert.throws(()=>check(missing,oracleModel,cases[0].references.linear));
let solves=0,refusals=0,unresolved=0;
const failures=[];
const admitted=new Map();
const paths=['linear','session','certified','constrained','staged','staged-two','corotational','material','cable','contact','ssi','winkler','pdelta'];
for(const [i,c] of cases.entries()) {
  for(const path of paths) {
    const mayRefuse=c.dim===3&&['corotational','material','ssi'].includes(path);
    try {
      const result=run(path,c.dim,c.model);
      if(allowsUnresolved(c.references[path],result,undefined,mayRefuse)) unresolved++;
      else {
        if(path==='pdelta') {
          check(result.linearResults,c.model,{ok:c.references[path].ok?.linearResults},c.gauges);
          assert.equal(result.converged,c.references[path].ok.converged);
          if(result.converged) check(result,c.model,c.references[path],c.gauges);
        } else check(result,c.model,c.references[path],c.gauges);
        solves++;
        const key=`${c.dim}:${path}`;
        admitted.set(key,(admitted.get(key)??0)+1);
      }
    } catch(e) {
      if(allowsUnresolved(c.references[path],undefined,e,mayRefuse)) unresolved++;
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
for(const {name,model,references,gauges} of exactCases) {
  for(const path of ['linear','session','certified','constrained','staged','staged-two']) {
    try {check(run(path,3,model),model,references[path],gauges);exactSolves++;}
    catch(e){throw new Error(`${name}/${path}: ${e}`);}
  }
}
assert.equal(exactSolves,18);
console.log(`Released-load work: ${exactSolves} exact-witness public WASM admissions`);

let orphanRefusals=0;
for(const c of orphanTranslations) for(const path of paths) {
  assert.equal(typeof c.references[path].error,'string');
  assert.throws(()=>run(path,c.dim,c.model),/Singular|unstable|mechanism|not found|does not exist|not supported|not active|not in/i,`${c.dim}/${c.local}/${path}`);
  orphanRefusals++;
}
assert.equal(orphanRefusals,5*paths.length);
console.log(`Released-load work: ${orphanRefusals} public WASM unsupported-translation refusals`);

let cancellationRefusals=0;
for(const c of cancellations) if(c.residual!==0) for(const path of paths) {
  assert.throws(()=>run(path,c.dim,c.model),/moment|rotation|Singular/i,`${c.dim}/${c.end}/${c.residual}/${path}`);
  cancellationRefusals++;
}
assert.equal(cancellationRefusals,8*paths.length);
console.log(`Released-load work: ${cancellationRefusals} exact residual refusals`);

let assemblySolves=0,assemblyUnresolved=0,assemblyRefusals=0,featureRefusals=0;
for(const c of assemblyCases) for(const path of paths) {
  if(['staged','staged-two'].includes(path)) {
    assert.match(c.references[path].error,/^Inclined supports are not yet supported in staged construction analysis/);
    assert.throws(()=>run(path,c.dim,c.model),/^Inclined supports are not yet supported in staged construction analysis/);
    featureRefusals++;
    continue;
  }
  const mayRefuse=c.dim===3&&['corotational','material','ssi'].includes(path);
  try {
    const result=run(path,c.dim,c.model);
    if(allowsUnresolved(c.references[path],result,undefined,mayRefuse)) assemblyUnresolved++;
    else {
      if(path==='pdelta') {
        check(result.linearResults,c.model,{ok:c.references[path].ok?.linearResults},c.gauges);
        assert.equal(result.converged,c.references[path].ok.converged);
        if(result.converged) check(result,c.model,c.references[path],c.gauges);
      } else check(result,c.model,c.references[path],c.gauges);
      assemblySolves++;
    }
  } catch(e) {
    if(allowsUnresolved(c.references[path],undefined,e,mayRefuse)) assemblyUnresolved++;
    else throw new Error(`inclined ${c.dim}/${c.end}/${path}: ${e}`);
  }
  for(const magnitude of [-1,-Math.sqrt(Number.EPSILON),Math.sqrt(Number.EPSILON),1]) {
    const bad=structuredClone(c.model);
    const moment=c.dim===2?{my:magnitude}:{mx:magnitude*c.direction[0],my:magnitude*c.direction[1],mz:magnitude*c.direction[2]};
    bad.loads.push({type:'nodal',data:{nodeId:c.node,fx:0,fz:0,...(c.dim===3?{fy:0}:{}),...moment}});
    assert.throws(()=>run(path,c.dim,bad),/moment|rotation/i,`inclined ${c.dim}/${c.end}/${path}/${magnitude}`);
    assemblyRefusals++;
  }
}
assert.equal(assemblySolves+assemblyUnresolved+featureRefusals,4*paths.length);
assert.equal(featureRefusals,8);
assert.equal(assemblyRefusals,4*(paths.length-2)*4);
console.log(`Released-load work: ${assemblySolves} inclined-support admissions, ${assemblyUnresolved} expected numerical refusals, ${assemblyRefusals} genuine moment refusals, ${featureRefusals} existing staged feature refusals`);
