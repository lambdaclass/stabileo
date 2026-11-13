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
