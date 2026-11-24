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
const physicalEquilibriumMessage='P-Delta results were withheld because the physical free-DOF residual did not meet the requested tolerance.';
const pdeltaTolerance=1e-12;
function isPdeltaEquilibriumRefusal(error) {
  try {
    const payload=JSON.parse(String(error));
    const value=payload.structuredDiagnostics[0].value;
    return Number.isFinite(value)&&value>pdeltaTolerance&&isDeepStrictEqual(payload,{
      message:physicalEquilibriumMessage,structuredDiagnostics:[{
        code:'result_quantity_unavailable',message:physicalEquilibriumMessage,phase:'equilibrium',
        severity:'error',threshold:pdeltaTolerance,value
      }]
    });
  } catch {return false;}
}
export function allowsUnresolved(reference,result,error,key) {
  if(Object.hasOwn(pdeltaPinned,key)) {
    switch(pdeltaPinned[key].category) {
      case 'matching-non-convergence':
      case 'main-refused-before-pdelta':
        return reference?.ok?.converged===false&&reference?.error===undefined&&error===undefined&&result?.converged===false;
      case 'physical-equilibrium-refusal':
        return reference?.ok===undefined&&result===undefined&&isPdeltaEquilibriumRefusal(reference?.error)&&isPdeltaEquilibriumRefusal(error);
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
