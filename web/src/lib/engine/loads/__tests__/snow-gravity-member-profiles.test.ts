import { expect, it } from 'vitest';
import { ridgeRoofs } from './snow-surface-round3-fixture';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import { pressure, snow } from './snow-roof-plane-fixture';

it('the hip snapshot has the hand-derived force profile on every carrier in every case',()=>{
  const model=ridgeRoofs('hip'),layout=gravityLayout(model,{mode:'panels',tributaryWidth:1});
  const out=snowLoadCases({model,layout,snow:{...snow,partial:true},tributaryWidth:1})!;
  expect(out.result.refused).toBeUndefined();
  const ps=0.7*(70-Math.atan(0.5)*180/Math.PI)/65;
  const gradients: Record<number,[number,number][]>={1:[[0,1]],2:[[0,1],[-1,0]],3:[[0,1],[1,0]],4:[[-1,0]],5:[[-1,0],[0,-1]],6:[[-1,0],[1,0]],7:[[0,-1]],8:[[0,-1],[1,0]],9:[[1,0]]};
  const span: Record<number,number>={1:2,2:1,3:1,4:2,5:3,6:2,7:2,8:3,9:2};
  const projectedPressure=(c: typeof out.cases[number],id:number)=>gradients[id]!.reduce((sum,[gx,gy])=>{
    let factor=1;
    if(c.nameKey==='snow.case.unbalanced') {
      const dir=String(c.nameParams.dir),v=dir.includes('X')?gx:gy,sense=dir.startsWith('+')?1:-1;
      factor=v*sense<0?1.5:v*sense>0?0:1;
    } else if(c.pattern && gy===0) {
      const k=span[id]!,which=Number(c.nameParams.c);
      factor=(which===1?k!==2:which===2?k===2:Math.abs(Number(c.nameParams.at))===4?k<=2:k>=2)?1:0.5;
    }
    return sum+ps*factor;
  },0)/gradients[id]!.length;
  const fringe=(L:number,x:number,long:boolean)=>{
    const inset=1/Math.sqrt(2),t=2*1e-3;
    const central=Math.max(0,Math.min(x-inset,L-inset-x,long?3.5:Infinity));
    const corner=(s:number)=>Math.max(0,Math.min(s,2*t-s));
    return central+corner(x)+corner(L-x);
  };
  expect(out.cases).toHaveLength(9);
  for(const c of out.cases) for(let id=1;id<=9;id++) {
    const e=model.elements.get(id)!,a=model.nodes.get(e.nodeI)!,b=model.nodes.get(e.nodeJ)!,L=Math.hypot(b.x-a.x,b.y-a.y,(b.z??0)-(a.z??0));
    if([1,4,7,9].includes(id)) for(const x of [0.001,0.003,0.3,1,2,L/2,L-2,L-0.003,L-0.001, ...c.distributed.filter(d=>d.elementId===id).flatMap(d=>[d.a??0,d.b??L,((d.a??0)+(d.b??L))/2])]) {
      expect(pressure(c.distributed,id,x),`${c.nameKey} ${JSON.stringify(c.nameParams)} member ${id} at ${x}`).toBeCloseTo(projectedPressure(c,id)*fringe(L,x,[4,9].includes(id)),9);
    } else for(const x of [0.1,L/2,L-0.1]) expect(pressure(c.distributed,id,x),`${c.nameKey} ${JSON.stringify(c.nameParams)} member ${id} at ${x}`).toBeCloseTo(projectedPressure(c,id),9);
  }
});
