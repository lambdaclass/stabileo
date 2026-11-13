import assert from 'node:assert/strict';
import test from 'node:test';
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
  const exact=Object.entries(pinned).flatMap(([groupPath,indices])=>{
    const [group,path]=groupPath.split('/');
    return indices.map(i=>`${group}/${i}/${path}`);
  });
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
const knownWrong={skip:process.env.RUN_KNOWN_WRONG==='1'?false:'known wrong result: #2074'};

test('#2074: a proven P-Delta non-convergence identity retains its exact category',knownWrong,()=>{
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,'cases/15/pdelta'),true);
});

test('#2074: a proven P-Delta NaN withholding identity retains its exact category',knownWrong,()=>{
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
