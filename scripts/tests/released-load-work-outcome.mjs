import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pinned=JSON.parse(readFileSync(new URL('./released-load-work-unresolved.json',import.meta.url),'utf8'));
const expectedUnresolved=new Set(Object.entries(pinned).flatMap(([groupPath,indices])=>{
  const [group,path]=groupPath.split('/');
  return indices.map(i=>`${group}/${i}/${path}`);
}));
export function assertExpectedUnresolved(actual) {
  assert.equal(new Set(actual).size,actual.length,'duplicate unresolved case');
  assert.deepEqual([...actual].sort(),[...expectedUnresolved].sort());
}
export function allowsUnresolved(reference,result,error,key) {
  const nativeUnresolved=reference?.ok?.converged===false||/^Singular (tangent )?stiffness/.test(String(reference?.error));
  return expectedUnresolved.has(key)&&nativeUnresolved&&(result?.converged===false||/^Singular (tangent )?stiffness/.test(String(error)));
}

export function assertAdmittedPdeltaConverged(reference,result) {
  assert.equal(reference.ok?.converged,true,'admitted native P-Delta must converge');
  assert.equal(result.converged,true,'admitted WASM P-Delta must converge');
}
