import { expect,it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { stampSolve } from '../solve-stamp';

for(const mode of ['2d','3d','pro']) for(const linked of [true,false]) for(const analysis of ['linear','pdelta','plastic'] as const) it(`known wrong result: #2219 floor regeneration notice survives ${mode}/${analysis}, linked=${linked}`,()=>{
  const change=RESULT_CHANGES.changes.find(c=>c.id==='gravity-torque-projection-and-carriers')!;
  const snapshot={loadCases:[{id:1,type:'L'}],loads:[{type:'distributed3d',data:{caseId:1,...(linked?{fromDef:7}:{}),floorLoadsVersion:change.resultsVersion-1}}]};
  const ids=()=>assessProject(snapshot,stampSolve(analysis,null),mode).changes.map(c=>c.id);
  expect(ids()).toContain(change.id);
  snapshot.loads[0]!.data.floorLoadsVersion=change.resultsVersion;
  expect(ids()).not.toContain(change.id);
  snapshot.loads[0]!.data.floorLoadsVersion=RESULT_CHANGES.currentResultsVersion;
  expect(ids()).not.toContain(change.id);
});
