import { expect, it } from 'vitest';
import { building } from './span-fixture';
import { plannedGrowth, RESIZE_STEP_M } from '../design-resize';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2171' ? it : it.skip;
for (const constraint of ['shear', 'tieSpacing'] as const) for (const flexure of ['My','Mz'] as const) for (const direction of ['primary','secondary','torsion'] as const) {
 knownWrong(`known wrong result: #2171 resizing follows the failing dimension ${constraint} ${flexure} ${direction}`,()=>{
  building(null);
  const element=[...modelStore.elements.values()].find(e=>modelStore.nodes.get(e.nodeI)?.z===modelStore.nodes.get(e.nodeJ)?.z)!;
  const id=element.id;
  const shear=flexure==='My'?'Vz':'Vy', secondaryShear=flexure==='My'?'Vy':'Vz';
  verificationStore.setDemandData(new Map([[id,{elementId:id,elementType:'beam',material:{stirrupDia:8},axes:{flexure,shear,secondaryShear}}]]) as never);
  verificationStore.setDesignOutcomes({outcomes:new Map([[id,{elementId:id,outcome:'SEARCH_EXHAUSTED',limiting:[direction==='torsion'?'torsion':constraint],provisional:{verdict:{checks:[{status:'fail',limiting:direction==='torsion'?'torsion':constraint,demandCategory:constraint==='tieSpacing'?null:direction==='secondary'?secondaryShear:shear,shearDirection:direction==='secondary'?'secondary':'primary'}]}}}]])} as never);
  const r=plannedGrowth().find(g=>g.elementIds.includes(id))!;
  const width=direction==='secondary' ? flexure==='My' : flexure==='Mz';
  expect({b:r.db,h:r.dh}).toEqual(direction==='torsion'?{b:RESIZE_STEP_M,h:RESIZE_STEP_M}:{b:width?RESIZE_STEP_M:0,h:width?0:RESIZE_STEP_M});
 });
}
