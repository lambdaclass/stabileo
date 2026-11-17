import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import frame from '../../../templates/fixtures/rc-design-frame.json';
import { solveFixture } from './helpers';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';

it('#2171 the four recovered flagship members pass independent shear and leg-distribution arithmetic in both directions', () => {
 const solved=solveFixture(frame);
 const summary=runDesign(cirsoc201Adapter,solved.contexts.values(),{maxRunMs:180_000});
 const audit:unknown[]=[];
 for(const id of [180,181,186,187]) {
  const ctx=solved.contexts.get(id)!;
  const outcome=summary.outcomes.get(id)!;
  expect(outcome.outcome,`e${id}`).toBe('VERIFIED');
  const rebar=outcome.accepted!;
  const r=rebar.regions!;
  const bottom=r.bottomSpanLayers!;
  expect(bottom.map(l=>[l.count,l.diameter,l.row])).toEqual([[4,20,0]]);
  expect(r.topStartLayers!.map(l=>[l.count,l.diameter,l.row])).toEqual([[6,16,0]]);
  expect(r.topEndLayers!.map(l=>[l.count,l.diameter,l.row])).toEqual([[6,16,0]]);
  const verdict=cirsoc201Adapter.verify(ctx,rebar);
  expect(verdict.checks.filter(c=>c.status==='fail')).toEqual([]);
  for(const region of ['Support','Span']) for(const direction of ['primary','secondary'] as const) {
   const cage=region==='Support'?r.stirrupsSupport!:r.stirrupsSpan!;
   const secondaryDepth=ctx.section.b-ctx.material.cover-cage.diameter/1000-0.020/2;
   const primary=direction==='primary';
   const axis=primary?ctx.axes.shear:ctx.axes.secondaryShear;
   const check=verdict.checks.find(c=>c.category===`Shear ${region} (${axis})`)!;
   const width=primary?ctx.section.b:ctx.section.h;
   const count=primary?cage.legs:cage.secondaryLegs!;
   expect(cage).toEqual({diameter:8,legs:2,secondaryLegs:3,spacing:0.15});
   const area=count*0.503e-4;
   const minArea=Math.max(0.062*Math.sqrt(ctx.material.fc),0.35)*width*cage.spacing/ctx.material.fy;
   expect(area).toBeGreaterThanOrEqual(minArea);
   const combo=ctx.stations!.comboResults.find(c=>c.comboName===check.comboName)!;
   const station=combo.stations.find(s=>s.x===check.stationX)!;
   const depthAt = (tuple: typeof station) => {
    if (!primary) return secondaryDepth;
    const moment = ctx.axes.flexure === 'My' ? tuple.my : tuple.mz;
    const tensionBar = moment < 0 ? r.topStartLayers![0]! : bottom[0]!;
    return ctx.section.h - ctx.material.cover - cage.diameter / 1000 - tensionBar.diameter / 2000;
   };
   const depth = depthAt(station);
   const axial=Math.min(-station.n/(ctx.section.b*ctx.section.h*1000*6),0.05*ctx.material.fc);
   const vc=Math.min(Math.max(0,0.17*Math.sqrt(ctx.material.fc)+axial),0.42*Math.sqrt(ctx.material.fc))*width*depth*1000;
   const vs=Math.min(area*Math.min(ctx.material.fy,420)*depth/cage.spacing*1000,0.66*Math.sqrt(ctx.material.fc)*width*depth*1000);
   const capacity=+(0.75*(vc+vs)).toFixed(2);
   expect(check.capacity).toBe(capacity);
   expect(check.demand!).toBeLessThan(capacity);
   for (const combination of ctx.stations!.comboResults) for (const tuple of combination.stations) {
    const demand=Math.abs(axis==='Vz'?tuple.vz:tuple.vy);
    const tupleDepth = depthAt(tuple);
    const requiredVs=Math.max(0,demand/0.75-0.17*Math.sqrt(ctx.material.fc)*width*tupleDepth*1000);
    expect(requiredVs).toBeLessThanOrEqual(0.33*Math.sqrt(ctx.material.fc)*width*tupleDepth*1000);
   }
   const acrossSpan=width-2*ctx.material.cover-cage.diameter/1000;
   const alongMax=Math.min(depth/2,0.4),acrossMax=Math.min(depth,0.4);
   expect(cage.spacing).toBeLessThanOrEqual(alongMax);
   expect(acrossSpan/(count-1)).toBeLessThanOrEqual(acrossMax);
   if(!primary) {
    expect(acrossSpan).toBeGreaterThan(acrossMax);
    const mutated=structuredClone(rebar);
    mutated.regions!.stirrupsSupport!.secondaryLegs=2;
    mutated.regions!.stirrupsSpan!.secondaryLegs=2;
    expect(cirsoc201Adapter.verify(ctx,mutated).checks.some(c=>c.status==='fail'&&c.category.includes(`(${axis}) s,max across`))).toBe(true);
   }
   audit.push({id,region,direction,depth,width,count,area,minArea,axial,vc,vs,capacity,demand:check.demand,acrossSpan,acrossMax,alongMax});
  }
 }
 if(process.env.FLAGSHIP_HAND_AUDIT) writeFileSync(process.env.FLAGSHIP_HAND_AUDIT,JSON.stringify(audit,null,2)+'\n');
},180_000);
