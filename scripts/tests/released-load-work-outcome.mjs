import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const pinned=JSON.parse(readFileSync(new URL('./released-load-work-unresolved.json',import.meta.url),'utf8'));
const pdeltaPinned=JSON.parse(readFileSync(new URL('./released-load-work-pdelta-outcomes.json',import.meta.url),'utf8'));
const expectedUnresolved=new Set([...Object.keys(pdeltaPinned),...Object.entries(pinned).flatMap(([groupPath,indices])=>{
  const [group,path]=groupPath.split('/');
  return indices.map(i=>`${group}/${i}/${path}`);
})]);
export function assertExpectedUnresolved(actual) {
  assert.equal(new Set(actual).size,actual.length,'duplicate unresolved case');
  assert.deepEqual([...actual].sort(),[...expectedUnresolved].sort());
}
const nanMessage='The result was withheld: it contains NaN at results.reactions[0].fx';
const nanWithholding={message:nanMessage,structuredDiagnostics:[{
  code:'non_finite_result',message:nanMessage,phase:'results.reactions[0].fx',severity:'error'
}]};
export function allowsUnresolved(reference,result,error,key) {
  if(Object.hasOwn(pdeltaPinned,key)) {
    if(reference?.ok?.converged!==false||reference?.error!==undefined) return false;
    switch(pdeltaPinned[key].category) {
      case 'matching-non-convergence':
      case 'main-refused-before-pdelta':
        return error===undefined&&result?.converged===false;
      case 'nan-withholding':
        if(result!==undefined) return false;
        try {return isDeepStrictEqual(JSON.parse(String(error)),nanWithholding);}
        catch {return false;}
      default:
        return false;
    }
  }
  const nativeUnresolved=reference?.ok?.converged===false||/^Singular (tangent )?stiffness/.test(String(reference?.error));
  return expectedUnresolved.has(key)&&nativeUnresolved&&(result?.converged===false||/^Singular (tangent )?stiffness/.test(String(error)));
}

export function assertAdmittedPdeltaConverged(reference,result) {
  assert.equal(reference.ok?.converged,true,'admitted native P-Delta must converge');
  assert.equal(result.converged,true,'admitted WASM P-Delta must converge');
}
