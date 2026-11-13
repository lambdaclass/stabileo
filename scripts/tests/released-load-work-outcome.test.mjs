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

const knownWrong=process.env.RUN_KNOWN_WRONG==='1'?{}:{skip:'known wrong result: #2074'};
test('#2074: matching unpinned P-Delta non-convergence cannot count as admitted',knownWrong,()=>{
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
