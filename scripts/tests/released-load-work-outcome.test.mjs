import assert from 'node:assert/strict';
import test from 'node:test';
import { allowsUnresolved } from './released-load-work-outcome.mjs';

for(const outcome of [{result:{converged:false}},{error:'Singular tangent stiffness matrix'}]) {
  test(`native success requires WASM completion: ${JSON.stringify(outcome)}`,()=>{
    assert.equal(allowsUnresolved({ok:{converged:true}},outcome.result,outcome.error,true),false);
    assert.equal(allowsUnresolved({ok:{}},outcome.result,outcome.error,true),false);
  });
}
test('only explicit expected numerical outcomes can remain unresolved',()=>{
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,true),true);
  assert.equal(allowsUnresolved({error:'Singular stiffness matrix'},undefined,'Singular tangent stiffness matrix',true),true);
  assert.equal(allowsUnresolved({ok:{converged:false}},{converged:false},undefined,false),false);
  assert.equal(allowsUnresolved({error:'Singular stiffness matrix'},undefined,new Error('wrong answer'),true),false);
});

test('known wrong result: #2074: a newly unresolved native and WASM case fails outside the pinned set', {skip:!process.env.RUN_KNOWN_WRONG},()=>{
  for(const reference of [{ok:{converged:false}},{error:'Singular tangent stiffness matrix'}]) {
    assert.equal(allowsUnresolved(reference,{converged:false},undefined,'cases/0/material'),false);
    assert.equal(allowsUnresolved(reference,undefined,'Singular tangent stiffness matrix','cases/0/material'),false);
  }
});
