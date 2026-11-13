import assert from 'node:assert/strict';
import { check as checkPhysics, snapshot } from './released-load-work-physics.mjs';
import { allowsUnresolved, assertExpectedUnresolved, assertAdmittedPdeltaConverged } from './released-load-work-outcome.mjs';
import {readFileSync} from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';
engine.initSync({module:readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm',import.meta.url))});
const {cases,exact:exactCases,orphanTranslations,cancellations,assemblyCases,trussCases,mixedOrphans,mixedDynamics,nearParallel}=JSON.parse(readFileSync(process.argv[2],'utf8'));
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
const modelGauges=new Map([...cases,...exactCases,...cancellations,...assemblyCases,...trussCases].map(c=>[c.model,c.gauges]));
const condensedCache=new WeakMap();
function condensedLoads(model) {
  if(!condensedCache.has(model)) {
    const dim=Object.values(model.nodes).some(n=>Object.hasOwn(n,'y'))?3:2;
    const probe=structuredClone(model);
    probe.supports=Object.fromEntries(Object.values(model.nodes).map(n=>[n.id,dim===2?{id:n.id,nodeId:n.id,type:'fixed'}:{nodeId:n.id,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}]));
    const rows=engine[`solve_${dim}d`](probe).reactions.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==='nodeId'?value:-value])));
    condensedCache.set(model,rows);
  }
  return condensedCache.get(model);
}
function check(result,model,reference,gauges=modelGauges.get(model)) {
  checkPhysics({...snapshot(result),condensedLoads:condensedLoads(model)},model,reference,gauges);
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
{
  for(const dim of [2,3]) {
    const gaugeCase=cases.find(c=>c.dim===dim&&c.gauges.length>0);
    assert.ok(gaugeCase);
    for(const side of ['wasm','native','both']) for(const quantity of ['released moment','released load']) {
      const wrong={...snapshot(structuredClone(run('linear',dim,gaugeCase.model))),condensedLoads:structuredClone(condensedLoads(gaugeCase.model))};
      const reference=structuredClone(gaugeCase.references.linear);
      const {node,rotation}=gaugeCase.gauges[0];
      const e=Object.values(gaugeCase.model.elements)[0];
      const end=e.nodeI===node?'Start':'End';
      const key=dim===2?`m${end}`:['My','Mz','T'].filter(axis=>e[`release${axis}${end}`]).map(axis=>`${axis==='T'?'mx':axis.toLowerCase()}${end}`)[0];
      assert.ok(key);
      for(const result of side==='both'?[wrong,reference.ok]:[side==='wasm'?wrong:reference.ok]) {
        if(quantity==='released moment') result.elementForces[0][key]+=1;
        else {
          const row=result.condensedLoads.find(d=>d.nodeId===node);
          for(const [i,key] of ['mx','my','mz'].entries()) row[key]=(row[key]??0)+rotation[i];
        }
      }
      assert.throws(()=>checkPhysics(wrong,gaugeCase.model,reference,gaugeCase.gauges),new RegExp(`released ${quantity==='released moment'?'moment':'load'}`),`${side} ${quantity} corruption passed`);
    }
    const wrong=structuredClone(run('linear',dim,gaugeCase.model));
    const reference=structuredClone(gaugeCase.references.linear);
    const {node,rotation}=gaugeCase.gauges[0];
    for(const [result,spin] of [[wrong,1],[reference.ok,-2]]) {
      const row=result.displacements.find(d=>d.nodeId===node);
      for(const [i,key] of ['rx','ry','rz'].entries()) if(Object.hasOwn(row,key)) row[key]+=spin*rotation[i];
    }
    check(wrong,gaugeCase.model,reference,gaugeCase.gauges);
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
const unresolvedCases=[];
const paths=['linear','session','certified','constrained','staged','staged-two','corotational','material','cable','contact','ssi','winkler','pdelta'];
for(const [i,c] of cases.entries()) {
  for(const path of paths) {
    const unresolvedKey=`cases/${i}/${path}`;
    try {
      const result=run(path,c.dim,c.model);
      if(path==='pdelta') check(result.linearResults,c.model,{ok:c.references[path].ok?.linearResults},c.gauges);
      if(allowsUnresolved(c.references[path],result,undefined,unresolvedKey)) {unresolved++;unresolvedCases.push(unresolvedKey);}
      else {
        if(path==='pdelta') {
          assertAdmittedPdeltaConverged(c.references[path],result);
          if(result.converged) check(result,c.model,c.references[path],c.gauges);
        } else check(result,c.model,c.references[path],c.gauges);
        solves++;
        const key=`${c.dim}:${path}`;
        admitted.set(key,(admitted.get(key)??0)+1);
      }
    } catch(e) {
      if(allowsUnresolved(c.references[path],undefined,e,unresolvedKey)) {unresolved++;unresolvedCases.push(unresolvedKey);}
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
let cancellationSolves=0,cancellationRoundoffSolves=0,cancellationRoundoffRefusals=0;
for(const c of cancellations) for(const path of paths) {
  if(c.residual!==0) {
    assert.throws(()=>run(path,c.dim,c.model),/moment|rotation|Singular/i,`${c.dim}/${c.end}/${c.residual}/${path}`);
    cancellationRefusals++;
  } else {
    assert.equal(c.model.loads.length,3);
    const result=run(path,c.dim,c.model);
    if(path==='pdelta') {
      check(result.linearResults,c.model,{ok:c.references[path].ok.linearResults});
      assert.equal(result.converged,true);
    }
    check(result,c.model,c.references[path]);
    cancellationSolves++;
    const roundoff=structuredClone(c.model);
    const load=roundoff.loads[1];
    const key=c.dim===2?'my':'mz';
    roundoff.loads=roundoff.loads.slice(0,1);
    for(const magnitude of [1e20,1,-1e20,-1]) {
      const term=structuredClone(load);
      term.data[key]=magnitude;
      roundoff.loads.push(term);
    }
    const roundedResult=run(path,c.dim,roundoff);
    check(roundedResult,roundoff,c.references[path],c.gauges);
    cancellationRoundoffSolves++;
    for(const residual of [-Number.EPSILON,Number.EPSILON]) {
      const bad=structuredClone(roundoff);
      bad.loads[4].data[key]=-1+residual;
      assert.throws(()=>run(path,c.dim,bad),/moment|rotation|Singular/i,`rounded residual/${c.dim}/${path}/${residual}`);
      cancellationRoundoffRefusals++;
    }
  }
}
assert.equal(cancellationSolves,4*paths.length);
assert.equal(cancellationRoundoffSolves,4*paths.length);
assert.equal(cancellationRoundoffRefusals,8*paths.length);
assert.equal(cancellationRefusals,8*paths.length);
console.log(`Released-load work: ${cancellationRefusals} exact residual refusals`);

let trussSolves=0,trussRefusals=0,trussFeatureRefusals=0;
for(const c of trussCases) for(const path of paths) {
  if(c.kind==='thermal'&&path==='corotational') {
    const error='Corotational analysis does not support thermal loads (member 1); it would solve the model without them. Remove them or use an analysis that supports them.';
    assert.equal(c.references[path].error,error);
    assert.throws(()=>run(path,c.dim,c.model),e=>String(e)===error);
    trussFeatureRefusals++;
    continue;
  }
  const result=run(path,c.dim,c.model);
  if(path==='pdelta') {
    check(result.linearResults,c.model,{ok:c.references[path].ok.linearResults},c.gauges);
    assert.equal(result.converged,true);
  }
  check(result,c.model,c.references[path],c.gauges);
  trussSolves++;
  for(const nodeId of [1,2]) for(const magnitude of [-1,-Number.EPSILON,Number.EPSILON,1]) {
    const bad=structuredClone(c.model);
    const moment=c.dim===2?{my:magnitude}:{mx:magnitude,my:0,mz:0,fy:0};
    bad.loads.push({type:'nodal',data:{nodeId,fx:0,fz:0,...moment}});
    assert.throws(()=>run(path,c.dim,bad),/moment|rotation/i,`truss ${c.dim}/${c.point}/${nodeId}/${magnitude}/${path}`);
    trussRefusals++;
  }
}
assert.equal(trussCases.length,8);
assert.equal(trussFeatureRefusals,2);
assert.equal(trussSolves,8*paths.length-2);
assert.equal(trussRefusals,(8*paths.length-2)*8);
console.log(`Released-load work: ${cancellationSolves} loaded exact cancellations, ${cancellationRoundoffSolves} roundoff-order cancellations, ${cancellationRoundoffRefusals} roundoff-order residual refusals, ${trussSolves} oblique truss admissions, ${trussRefusals} truss moment refusals`);

let assemblySolves=0,assemblyUnresolved=0,assemblyRefusals=0,featureRefusals=0;
for(const [i,c] of assemblyCases.entries()) for(const path of paths) {
  if(['staged','staged-two'].includes(path)) {
    assert.match(c.references[path].error,/^Inclined supports are not yet supported in staged construction analysis/);
    assert.throws(()=>run(path,c.dim,c.model),/^Inclined supports are not yet supported in staged construction analysis/);
    featureRefusals++;
    continue;
  }
  const unresolvedKey=`assemblyCases/${i}/${path}`;
  try {
    const result=run(path,c.dim,c.model);
    if(path==='pdelta') check(result.linearResults,c.model,{ok:c.references[path].ok?.linearResults},c.gauges);
    if(allowsUnresolved(c.references[path],result,undefined,unresolvedKey)) {assemblyUnresolved++;unresolvedCases.push(unresolvedKey);}
    else {
      if(path==='pdelta') {
        assertAdmittedPdeltaConverged(c.references[path],result);
        if(result.converged) check(result,c.model,c.references[path],c.gauges);
      } else check(result,c.model,c.references[path],c.gauges);
      assemblySolves++;
    }
  } catch(e) {
    if(allowsUnresolved(c.references[path],undefined,e,unresolvedKey)) {assemblyUnresolved++;unresolvedCases.push(unresolvedKey);}
    else failures.push(`inclined ${c.dim}/${c.end}/${path}: ${e}`);
  }
  for(const magnitude of [-1,-Math.sqrt(Number.EPSILON),Math.sqrt(Number.EPSILON),1]) {
    const bad=structuredClone(c.model);
    const moment=c.dim===2?{my:magnitude}:{mx:magnitude*c.direction[0],my:magnitude*c.direction[1],mz:magnitude*c.direction[2]};
    bad.loads.push({type:'nodal',data:{nodeId:c.node,fx:0,fz:0,...(c.dim===3?{fy:0}:{}),...moment}});
    assert.throws(()=>run(path,c.dim,bad),/moment|rotation/i,`inclined ${c.dim}/${c.end}/${path}/${magnitude}`);
    assemblyRefusals++;
  }
}
assert.equal(featureRefusals,8);
assert.equal(assemblyRefusals,4*(paths.length-2)*4);
console.log(`Released-load work: ${assemblySolves} inclined-support admissions, ${assemblyUnresolved} expected numerical refusals, ${assemblyRefusals} genuine moment refusals, ${featureRefusals} existing staged feature refusals`);

for(const dim of [2,3]) for(const path of paths) assert.ok((admitted.get(`${dim}:${path}`)??0)>0,`no completed control ${dim}:${path}`);
assert.equal(assemblySolves+assemblyUnresolved+featureRefusals,4*paths.length);


let mixedSolves=0,mixedRefusals=0;
for(const [i,c] of mixedOrphans.entries()) for(const path of paths) {
  if(c.refuses) {
    assert.throws(()=>run(path,c.dim,c.model),/moment|rotation/i,`mixed ${c.dim}/${c.axis}/${c.terms}/${path}`);
    mixedRefusals++;
  } else if(c.dim===3&&path==='corotational') {
    const key=`mixedOrphans/${i}/${path}`;
    assert.throws(()=>run(path,c.dim,c.model),error=>allowsUnresolved(c.references[path],undefined,error,key));
    unresolvedCases.push(key);
  } else {
    const result=run(path,c.dim,c.model);
    if(path==='pdelta') {
      check(result.linearResults,c.model,{ok:c.references[path].ok.linearResults},[]);
      assert.equal(result.converged,true);
    }
    check(result,c.model,c.references[path],[]);
    mixedSolves++;
  }
}
assert.equal(mixedSolves,12*paths.length-9);
assert.equal(mixedRefusals,16*paths.length);
const dynamicRun=(name,input)=>parse(engine[name](JSON.stringify(input)));
const baselineDynamic=mixedDynamics[0];
const harmonicBaseline=dynamicRun('solve_harmonic_3d',baselineDynamic.harmonic);
const historyBaseline=dynamicRun('solve_time_history_3d',baselineDynamic.history);
assert.ok(harmonicBaseline.responsePoints.some(p=>p.amplitude>0));
assert.ok(historyBaseline.nodeHistories.some(n=>n.ux.some(x=>x!==0)));
for(const c of mixedDynamics) {
  for(const [name,key,field,baseline] of [
    ['solve_harmonic_3d','harmonic','responsePoints',harmonicBaseline],
    ['solve_time_history_3d','history','nodeHistories',historyBaseline],
  ]) {
    if(!c[key]) continue;
    if(c.refuses) assert.throws(()=>dynamicRun(name,c[key]),/moment|rotation/i);
    else assert.deepEqual(dynamicRun(name,c[key])[field],baseline[field]);
  }
}
console.log(`Released-load work: ${mixedSolves} mixed frame/truss cancellations and controls, ${mixedRefusals} mixed-resultant refusals; harmonic and per-record time-history controls passed`);

assertExpectedUnresolved(unresolvedCases);

for(const c of trussCases) {
  const result=parse(engine[`solve_harmonic_${c.dim}d`](JSON.stringify(c.harmonic)));
  assert.ok(result.peakAmplitude>0);
  assert.equal(result.responsePoints.length,c.harmonicReference.responsePoints.length);
  for(const [i,point] of result.responsePoints.entries()) for(const key of ['frequency','omega','amplitude','phase','real','imag']) {
    const expected=c.harmonicReference.responsePoints[i][key];
    assert.ok(Number.isFinite(point[key])&&Number.isFinite(expected));
    assert.ok(Math.abs(point[key]-expected)<=2.5e-10*Math.max(Math.abs(point[key]),Math.abs(expected),1e-30),`harmonic truss ${c.dim}/${c.kind}/${i}/${key}`);
  }
  for(const nodeId of [1,2]) for(const magnitude of [-1,-Number.EPSILON,Number.EPSILON,1]) {
    const bad=structuredClone(c.harmonic);
    const moment=c.dim===2?{my:magnitude}:{mx:magnitude,my:0,mz:0,fy:0};
    bad.solver.loads.push({type:'nodal',data:{nodeId,fx:0,fz:0,...moment}});
    assert.throws(()=>engine[`solve_harmonic_${c.dim}d`](JSON.stringify(bad)),/moment|rotation/i);
  }
}
console.log(`Released-load work: ${trussCases.length} loaded truss harmonic controls passed`);

assert.deepEqual(failures,[]);
assert.equal(solves+unresolved,cases.length*paths.length);

{
  for(const c of nearParallel) for(const path of paths) {
    const nearRun=model=>path==='pdelta'?parse(engine.solve_pdelta_3d(JSON.stringify(model),0,1e-12)):run(path,3,model);
    if(path==='ssi') {
      assert.equal(c.references[path].error,'Singular stiffness in SSI iteration');
      assert.throws(()=>nearRun(c.model),/Singular stiffness in SSI iteration/);
    } else {
      const result=nearRun(c.model);
      if(path==='pdelta') {
        check(result.linearResults,c.model,c.references.linear,c.gauges);
        assert.equal(result.converged,false);
      } else check(result,c.model,c.references[path],c.gauges);
    }
    for(const factor of [-Number.EPSILON,-Math.sqrt(Number.EPSILON),Number.EPSILON,Math.sqrt(Number.EPSILON)]) {
      const bad=structuredClone(c.model);
      bad.loads.push({type:'nodal',data:{nodeId:c.node,fx:0,fy:0,fz:0,mx:factor*c.direction[0],my:factor*c.direction[1],mz:factor*c.direction[2]}});
      assert.throws(()=>nearRun(bad),/Nodal moment|free rotation would carry load|loaded released rotation/i,`near parallel/${c.end}/${c.angle}/${path}/${factor}`);
    }
  }
  console.log(`Released-load work: ${nearParallel.length*paths.length} near-parallel zero-work checks and ${nearParallel.length*paths.length*4} genuine-moment refusals`);
}

{
  const extraRun=(path,input)=>path==='multi'?engine.solve_multi_case_3d(input):parse(engine[`solve_${path==='creep'?'creep_shrinkage':'plastic'}_3d`](JSON.stringify(input)));
  const responses=(path,result)=>path==='creep'?result.steps:path==='multi'?result.combinationResults.map(c=>c.results):result.steps.map(s=>s.results);
  for(const c of nearParallel) for(const [path,input] of Object.entries(c.extraInputs)) {
    const result=extraRun(path,input),reference=c.extraReferences[path];
    const model=path==='multi'?{...input.solver,loads:input.loadCases[0].loads}:input.solver;
    const actual=responses(path,result),expected=responses(path,reference);
    assert.ok(expected.length>0);
    assert.equal(actual.length,expected.length);
    for(let i=0;i<actual.length;i++) check(actual[i],model,{ok:{...expected[i],condensedLoads:condensedLoads(model)}},c.gauges);
    if(path==='plastic') {
      assert.equal(result.isMechanism,reference.isMechanism);
      assert.ok(Number.isFinite(result.collapseFactor));
      assert.ok(Math.abs(result.collapseFactor-reference.collapseFactor)<=2.5e-10*Math.abs(reference.collapseFactor));
    }
    for(const factor of [-Math.sqrt(Number.EPSILON),Math.sqrt(Number.EPSILON)]) {
      const bad=structuredClone(input);
      const loads=path==='multi'?bad.loadCases[0].loads:bad.solver.loads;
      loads.push({type:'nodal',data:{nodeId:c.node,fx:0,fy:0,fz:0,mx:factor*c.direction[0],my:factor*c.direction[1],mz:factor*c.direction[2]}});
      assert.throws(()=>extraRun(path,bad),/Nodal moment|free rotation would carry load|loaded released rotation/i,`near parallel/${path}/${factor}`);
    }
  }
  console.log(`Released-load work: ${nearParallel.length*3} additional creep, plastic and combination WASM controls`);
}
