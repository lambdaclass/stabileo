import { expect,it } from 'vitest';
import { superposed } from '../../combination-methods';
import { evaluateDiagramAt } from '../../diagrams-3d';
import type { AnalysisResults3D, ElementForces3D } from '../../types-3d';

for(const f of [-2,0,2]) it.skipIf(!process.env.STABILEO_KNOWN_WRONG_2219)(`known wrong result: #2219 torque metadata follows combination factor ${f}`,()=>{
  const ef={elementId:1,length:6,nStart:0,nEnd:0,vyStart:0,vyEnd:0,vzStart:0,vzEnd:0,myStart:0,myEnd:0,mzStart:0,mzEnd:0,mxStart:0.375-0.2*3,mxEnd:-0.125+0.2*3,qYI:0,qYJ:0,qZI:0,qZJ:0,distributedLoadsY:[],distributedLoadsZ:[],pointLoadsY:[],pointLoadsZ:[],pointTorques:[{a:1.5,p:-0.5}],memberMoments:[{a:0,b:6,moments:{x:[0.2,0.2,0.2],y:[0,0,0],z:[0,0,0]}}]} as ElementForces3D;
  const r={displacements:[],reactions:[],elementForces:[ef]} as unknown as AnalysisResults3D;
  const combined=superposed([{r,f}]).elementForces[0]!;
  for(const x of [0,1.5-1e-6,1.5+1e-6,3,6]) expect(evaluateDiagramAt(combined,'torsion',x/6)).toBeCloseTo(f*(0.375+0.2*(x-3)+(x>1.5?-0.5:0)),10);
});
