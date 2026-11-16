import { expect,it } from 'vitest';
import { levelsWithPlanArea,buildLoadPlan } from '../load-plan';
import { mesh,transform } from './snow-surface-round2-fixture';
import { regulations } from './snow-roof-plane-fixture';
const wrong2210 = process.env.RUN_KNOWN_WRONG === '2210' ? it : it.skip;
function rectangle(angle=0){return transform(mesh([[[0,0,3],[10,0,3],[10,6,3],[0,6,3]]]),angle,0)}
wrong2210('known wrong result: #2210 level area is physical plan area independent of rotation',()=>{const base=levelsWithPlanArea(rectangle()),rotated=levelsWithPlanArea(rectangle(Math.PI/4));expect(rotated[0]!.planAreaM2).toBeCloseTo(60,10)});
wrong2210('known wrong result: #2210 complete width planner retains superimposed seismic mass when rotated',()=>{const plan=(angle:number)=>buildLoadPlan({regulations:regulations(),model:rectangle(angle),dead:[{labelKey:'test',q:1}],occupancyKey:'vivienda',tributaryWidth:1,applyLiveReduction:false,reductionElementKind:'interiorBeam',floorsSupported:1,generateCombinations:false});const base=plan(0),rotated=plan(Math.PI/4);expect(base.outcome).toBe('READY');expect(rotated.outcome).toBe('READY');expect(rotated.levels[0]!.superimposedKN).toBeCloseTo(base.levels[0]!.superimposedKN,10)});
