import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { allowsUnresolved, assertExpectedUnresolved, assertAdmittedPdeltaConverged } from './released-load-work-outcome.mjs';

for(const outcome of [{result:{converged:false}},{error:'Singular tangent stiffness matrix'}]) {
  test(`native success requires WASM completion: ${JSON.stringify(outcome)}`,()=>{
    assert.equal(allowsUnresolved({ok:{converged:true}},outcome.result,outcome.error,'cases/9/corotational'),false);
    assert.equal(allowsUnresolved({ok:{}},outcome.result,outcome.error,'cases/9/corotational'),false);
  });
}
test('only explicit expected numerical outcomes can remain unresolved',()=>{
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,'cases/9/corotational'),true);
  assert.equal(allowsUnresolved({error:'Singular stiffness matrix'},undefined,'Singular tangent stiffness matrix','cases/9/corotational'),true);
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,'cases/0/material'),false);
  assert.equal(allowsUnresolved({error:'Singular stiffness matrix'},undefined,new Error('wrong answer'),'cases/9/corotational'),false);
});

test('#2074: a newly unresolved native and WASM case fails outside the pinned set',()=>{
  for(const reference of [{ok:{converged:false}},{error:'Singular tangent stiffness matrix'}]) {
    assert.equal(allowsUnresolved(reference,{converged:false},undefined,'cases/0/material'),false);
    assert.equal(allowsUnresolved(reference,undefined,'Singular tangent stiffness matrix','cases/0/material'),false);
  }
});

test('the observed unresolved set must exactly equal the pinned set',()=>{
  assert.throws(()=>assertExpectedUnresolved([]));
  assert.throws(()=>assertExpectedUnresolved(['cases/0/material']));
  assert.throws(()=>assertExpectedUnresolved(['cases/9/corotational','cases/9/corotational']));
});

test('a same-count substitution cannot change the pinned unresolved cases',()=>{
  const pinned=JSON.parse(readFileSync(new URL('./released-load-work-unresolved.json',import.meta.url),'utf8'));
  const pdeltaPinned=JSON.parse(readFileSync(new URL('./released-load-work-pdelta-outcomes.json',import.meta.url),'utf8'));
  const exact=[...Object.keys(pdeltaPinned),...Object.entries(pinned).flatMap(([groupPath,indices])=>{
    const [group,path]=groupPath.split('/');
    return indices.map(i=>`${group}/${i}/${path}`);
  })];
  assertExpectedUnresolved(exact);
  const replaced=[...exact];
  replaced[0]='cases/0/material';
  assert.throws(()=>assertExpectedUnresolved(replaced));
});

test('#2074: matching unpinned P-Delta non-convergence cannot count as admitted',()=>{
  const reference={ok:{converged:false}};
  const result={converged:false};
  assert.equal(allowsUnresolved(reference,result,undefined,'cases/0/pdelta'),false);
  assert.throws(()=>assertAdmittedPdeltaConverged(reference,result));
});

test('P-Delta completion requires both runtimes to converge',()=>{
  assertAdmittedPdeltaConverged({ok:{converged:true}},{converged:true});
  for(const [native,wasm] of [[true,false],[false,true]]) {
    assert.throws(()=>assertAdmittedPdeltaConverged({ok:{converged:native}},{converged:wasm}));
  }
});

test('missing or malformed P-Delta convergence flags cannot count as completion',()=>{
  for(const converged of [undefined,null,0,1,'true']) {
    assert.throws(()=>assertAdmittedPdeltaConverged({ok:{converged}},{converged}));
    assert.throws(()=>assertAdmittedPdeltaConverged({ok:{converged:true}},{converged}));
    assert.throws(()=>assertAdmittedPdeltaConverged({ok:{converged}},{converged:true}));
  }
});

const nanWithholding='{"message":"The result was withheld: it contains NaN at results.reactions[0].fx","structuredDiagnostics":[{"code":"non_finite_result","message":"The result was withheld: it contains NaN at results.reactions[0].fx","phase":"results.reactions[0].fx","severity":"error"}]}';

test('#2074: a proven P-Delta non-convergence identity retains its exact category',()=>{
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,'cases/15/pdelta'),true);
});

test('#2074: a proven P-Delta NaN withholding identity retains its exact category',()=>{
  assert.equal(allowsUnresolved({ok:{converged:false}},undefined,nanWithholding,'cases/12/pdelta'),true);
});

test('P-Delta categories cannot accept each other or a different numerical refusal',()=>{
  assert.equal(allowsUnresolved({ok:{converged:false}},undefined,nanWithholding,'cases/15/pdelta'),false);
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,'cases/12/pdelta'),false);
  for(const key of ['cases/12/pdelta','cases/15/pdelta']) {
    for(const error of ['Singular stiffness matrix','Singular tangent stiffness matrix','wrong answer']) {
      assert.equal(allowsUnresolved({ok:{converged:false}},undefined,error,key),false);
    }
    assert.equal(allowsUnresolved({error:'Singular stiffness matrix'},undefined,nanWithholding,key),false);
    assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},nanWithholding,key),false);
  }
});

test('P-Delta withholding requires the observed structured NaN refusal and reaction path',()=>{
  const payload=JSON.parse(nanWithholding);
  const mutations=[{}, {message:payload.message}, {...payload,structuredDiagnostics:[]},
    {...payload,structuredDiagnostics:[{...payload.structuredDiagnostics[0],code:'known_issue'}]},
    {...payload,structuredDiagnostics:[{...payload.structuredDiagnostics[0],severity:'warning'}]},
    {...payload,structuredDiagnostics:[{...payload.structuredDiagnostics[0],phase:'results.reactions[1].fx'}]},
    {...payload,message:payload.message.replace('NaN','inf')},
    {...payload,structuredDiagnostics:[{...payload.structuredDiagnostics[0],message:payload.message.replace('NaN','inf')}]}];
  for(const error of ['NaN','The result was withheld',...mutations.map(x=>JSON.stringify(x))]) {
    assert.equal(allowsUnresolved({ok:{converged:false}},undefined,error,'cases/12/pdelta'),false);
  }
});

test('new P-Delta unresolved cases outside the pins still break verification',()=>{
  for(const key of ['cases/0/pdelta','cases/11/pdelta','cases/16/pdelta','cases/234/pdelta','assemblyCases/15/pdelta','cases/15/linear']) {
    assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,key),false);
    assert.equal(allowsUnresolved({ok:{converged:false}},undefined,nanWithholding,key),false);
    assert.throws(()=>assertAdmittedPdeltaConverged({ok:{converged:false}},{converged:false}));
  }
});

test('pinned P-Delta identities still reject native success and malformed convergence flags',()=>{
  for(const converged of [true,undefined,null,0,1,'false']) for(const key of ['cases/12/pdelta','cases/15/pdelta']) {
    assert.equal(allowsUnresolved({ok:{converged}},{converged:false},undefined,key),false);
    assert.equal(allowsUnresolved({ok:{converged}},undefined,nanWithholding,key),false);
    assert.equal(allowsUnresolved({ok:{converged:false}},{converged},undefined,key),false);
  }
  for(const key of ['cases/0/pdelta','cases/12/pdelta','cases/15/pdelta']) {
    assert.equal(allowsUnresolved({ok:{converged:true}},{converged:true},undefined,key),false);
    assertAdmittedPdeltaConverged({ok:{converged:true}},{converged:true});
  }
});

const pdeltaPinned=JSON.parse(readFileSync(new URL('./released-load-work-pdelta-outcomes.json',import.meta.url),'utf8'));
const categoryIndices={
  'matching-non-convergence':[
    15,18,20,24,37,51,54,55,56,62,66,67,68,69,70,
    71,72,73,74,75,76,77,78,79,80,86,88,90,91,92,
    93,94,96,97,105,106,107,109,110,111,112,113,114,115,116,
    132,135,137,141,154,168,171,172,173,179,183,184,185,186,187,
    188,189,190,191,192,193,194,195,196,197,203,205,207,208,209,
    210,211,213,214,222,223,224,226,227,228,229,230,231,232,233
  ],
  'nan-withholding':[
    12,13,14,17,42,43,53,57,58,84,85,87,89,95,129,
    130,131,134,159,160,170,174,175,201,202,204,206,212
  ],
  'main-refused-before-pdelta':[
    36,38,153,155
  ],
};

test('the 122 P-Delta identities retain all three coordinator-approved categories',()=>{
  assert.equal(Object.keys(pdeltaPinned).length,122);
  for(const [category,indices] of Object.entries(categoryIndices)) {
    assert.deepEqual(Object.entries(pdeltaPinned).filter(([,pin])=>pin.category===category).map(([key])=>key),indices.map(i=>`cases/${i}/pdelta`));
  }
  for(const [key,pin] of Object.entries(pdeltaPinned)) {
    assert.match(key,/^cases\/\d+\/pdelta$/);
    assert.ok(Object.hasOwn(categoryIndices,pin.category));
    if(pin.category==='main-refused-before-pdelta') {
      const node={'cases/36/pdelta':1,'cases/38/pdelta':1,'cases/153/pdelta':2,'cases/155/pdelta':2}[key];
      assert.match(pin.mainRefusal,new RegExp(`^Nodal moment at node ${node} is not supported: a loaded released rotation or unstiffened rotational/warping direction is present; free directions \\[`));
      assert.ok(pin.mainRefusal.endsWith('Apply it as a force couple, or connect the node to a frame or shell'));
    } else assert.equal(pin.mainRefusal,undefined);
  }
});

for(const [key,{category,mainRefusal}] of Object.entries(pdeltaPinned)) {
  test(`${key}: ${category} requires its exact native and WASM outcome`,()=>{
    const withholding=category==='nan-withholding';
    const reference={ok:{converged:false}};
    assert.equal(allowsUnresolved(reference,withholding?undefined:{converged:false},withholding?nanWithholding:undefined,key),true);
    assert.equal(allowsUnresolved(reference,withholding?{converged:false}:undefined,withholding?undefined:nanWithholding,key),false);
    for(const error of ['Singular stiffness matrix','wrong answer',mainRefusal].filter(Boolean)) {
      assert.equal(allowsUnresolved(reference,undefined,error,key),false);
      assert.equal(allowsUnresolved(reference,{converged:false},error,key),false);
    }
    for(const converged of [true,undefined,null,0,1,'false']) {
      assert.equal(allowsUnresolved({ok:{converged}},withholding?undefined:{converged:false},withholding?nanWithholding:undefined,key),false);
      assert.equal(allowsUnresolved(reference,{converged},undefined,key),false);
    }
    assert.equal(allowsUnresolved({...reference,error:'unexpected native refusal'},withholding?undefined:{converged:false},withholding?nanWithholding:undefined,key),false);
    assertAdmittedPdeltaConverged({ok:{converged:true}},{converged:true});
  });
}

test('an additional unresolved identity breaks the full pinned-set verification',()=>{
  const oldPinned=JSON.parse(readFileSync(new URL('./released-load-work-unresolved.json',import.meta.url),'utf8'));
  const exact=[...Object.keys(pdeltaPinned),...Object.entries(oldPinned).flatMap(([groupPath,indices])=>{
    const [group,path]=groupPath.split('/');
    return indices.map(i=>`${group}/${i}/${path}`);
  })];
  assertExpectedUnresolved(exact);
  const outside='cases/234/pdelta';
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,outside),false);
  assert.throws(()=>assertAdmittedPdeltaConverged({ok:{converged:false}},{converged:false}));
  assert.throws(()=>assertExpectedUnresolved([...exact,outside]));
  assert.throws(()=>assertExpectedUnresolved([outside,...exact.slice(1)]));
});

for(const baseline of ['valid','missing','corrupted']) test(`#2074: pinned non-convergence validates its ${baseline} linear baseline`,()=>{
  const script=readFileSync(new URL('./released-load-work-2023-wasm.mjs',import.meta.url),'utf8');
  const loop=script.slice(script.indexOf('let solves=0'),script.indexOf('let exactSolves=0'));
  const good={displacements:[{nodeId:1,ux:1}],reactions:[],elementForces:[{elementId:1,nStart:1}]};
  const result={converged:false,linearResults:baseline==='missing'?undefined:structuredClone(good)};
  if(baseline==='corrupted') result.linearResults.elementForces[0].nStart=-1;
  const references=Object.fromEntries(['linear','session','certified','constrained','staged','staged-two','corotational','material','cable','contact','ssi','winkler','pdelta'].map(path=>[path,path==='pdelta'?{ok:{converged:false,linearResults:good}}:{ok:good}]));
  const c={dim:3,model:{loads:[]},references,scale:1,direction:[1,0,0],node:1};
  const cases={length:1,entries:()=>[[15,c]]};
  const failures=runInNewContext(loop+'; failures',{
    assert,cases,structuredClone,console:{log:()=>{}},allowsUnresolved,assertAdmittedPdeltaConverged,
    run:(path,dim,model)=>{if(model.loads.length) throw new Error('Nodal moment');return path==='pdelta'?result:good;},
    check:(actual,model,reference)=>assert.deepEqual(actual,reference.ok),
  });
  assert.equal(failures.length===0,baseline==='valid',JSON.stringify(failures));
});
