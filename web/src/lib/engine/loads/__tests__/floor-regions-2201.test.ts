import { floorResultant, regionModel } from './physical-region-invariance';
import { expect,it } from 'vitest';
import { floorLoad } from '../floor-loads';
function run(poly:number[][], distribution:'twoWay'|'oneWay'='twoWay',zone?:number[][]){
 const nodes=new Map(poly.map(([x,y],k)=>[k+1,{x:x!,y:y!,z:3}]));
 const beams=poly.map((_,k)=>({id:k+1,nodeI:k+1,nodeJ:(k+1)%poly.length+1,type:'frame' as const,sectionId:1}));
 const out=floorLoad({nodes,beams,q:1,distribution,spanAxis:'x',zone:zone?{outer:zone.map(([x,y])=>[x!,y!,3])}:undefined});
 const resultant = floorResultant(regionModel([poly]),out);
 return {f:resultant[0],x:resultant[1],y:resultant[2],out};
}
it('known wrong result: #2201 off-centre zone preserves force and both first moments',()=>{const r=run([[0,0],[10,0],[10,6],[0,6]],'twoWay',[[0,0],[1,0],[1,6],[0,6]]);expect(r.f).toBeCloseTo(6,8);expect(r.x).toBeCloseTo(3,8);expect(r.y).toBeCloseTo(18,8)});
