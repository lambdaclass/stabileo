import { initSolver, solve, solveModal, analyzeKinematics } from '../../lib/engine/wasm-solver';
import { computeElementDiagram, computeDeformedShape } from '../../lib/engine/diagrams';
import type { Displacement } from '../../lib/engine/types';
import { batchModel, continuousInfluence, continuousReactions, frequencies, jointForces, numbers, portalSway, simpleInfluence, type BatchId, type BatchParameters } from './batch';
export type Series = { name: string; points: [number,number][] };
export type Comparison = { label: string; engine: number; reference: number; unit: string; difference: number };
export async function calculateBatch(id:BatchId,p:BatchParameters) {
  const model=batchModel(id,p); await initSolver();
  if(id==='truss-2d' && analyzeKinematics(model).mechanismModes > 0) throw new Error('tools.batch.unstable');
  const linear=solve(model), charts:Record<string,Series[]>={deflection:[],shear:[],moment:[]};
  const comparisons:Comparison[]=[];
  const compare=(label:string,engine:number,reference:number,unit:string)=>comparisons.push({label,engine,reference,unit,difference:Math.abs(engine-reference)/Math.max(Math.abs(reference),1e-12)});
  const shapes:{elementId:number;points:[number,number][]}[]=[];
  let sagging=0,hogging=0,maxMoment=0,maxDeflection=0;
  for(const ef of linear.elementForces) {
    const el=model.elements.get(ef.elementId)!, a=model.nodes.get(el.nodeI)!, b=model.nodes.get(el.nodeJ)!;
    const da=linear.displacements.find(d=>d.nodeId===a.id)!, db=linear.displacements.find(d=>d.nodeId===b.id)!;
    for(const key of ['moment','shear'] as const) {
      const points=computeElementDiagram(key,ef,a.x,a.z,b.x,b.z).points.map(v=>[v.t*ef.length,key==='moment'?-v.value:v.value] as [number,number]);
      charts[key].push({name:String(el.id),points});
      if(key==='moment') for(const [,v] of points) { sagging=Math.max(sagging,v); hogging=Math.min(hogging,v); maxMoment=Math.max(maxMoment,Math.abs(v)); }
    }
    const deformed=computeDeformedShape(a.x,a.z,b.x,b.z,da.ux,da.uz,da.ry,db.ux,db.uz,db.ry,1,ef.length,el.type==='truss',el.type==='truss',p.e*1000*p.i,ef.qI,ef.qJ,ef.pointLoads,ef.distributedLoads);
    const points=deformed.map(v=>[v.x,v.y] as [number,number]); shapes.push({elementId:el.id,points});
    charts.deflection.push({name:String(el.id),points:deformed.map((v,j)=>{const t=j/(deformed.length-1); const displacement=Math.hypot(v.x-(a.x+(b.x-a.x)*t),v.y-(a.z+(b.z-a.z)*t)); maxDeflection=Math.max(maxDeflection,displacement); return [t*ef.length,displacement];})});
  }
  const modes:{frequency:number;displacements:Displacement[]}[]=[];
  let influence:[number,number][]=[]; let maximum:[number,number]=[0,0];
  if(id==='continuous-beam') {
    const reference=continuousReactions(numbers(p.spans),numbers(p.loads),p.ends==='fixed',p.rightEnd==='fixed');
    [...model.supports.values()].forEach((support,j)=>compare(`R${j+1}`,linear.reactions.find(r=>r.nodeId===support.nodeId)!.rz,reference[j],'kN'));
  }
  if(id==='portal-frame') compare('tools.batch.sway',(linear.displacements.find(d=>d.nodeId===2)!.ux+linear.displacements.find(d=>d.nodeId===3)!.ux)/2,portalSway(p),'m');
  if(id==='truss-2d') { const reference=jointForces(model); if(reference) linear.elementForces.forEach((ef,j)=>{ if(Math.abs(reference[j])>1e-9) compare(`N${ef.elementId}`,ef.nStart,reference[j],'kN'); }); }
  if(id==='beam-natural-frequency') {
    const modal=solveModal(model,new Map([[1,p.mass/p.area]]),12);
    modes.push(...(modal.modes as typeof modes).filter(m=>Math.hypot(...m.displacements.map(d=>d.uz))>Math.hypot(...m.displacements.map(d=>d.ux))).slice(0,3));
    if(modes.length!==3) throw new Error('tools.failed');
    modes.forEach((m,j)=>compare(`f${j+1}`,m.frequency,frequencies(p)[j],'Hz'));
  }
  if(id==='influence-line') {
    const L=p.length*p.count;
    const xs=[...new Set([...Array.from({length:101},(_,j)=>L*j/100),p.position,Math.max(0,p.position-L*1e-7),Math.min(L,p.position+L*1e-7)])].sort((a,b)=>a-b);
    const section=[...model.elements.values()].find(el=>Math.abs(model.nodes.get(el.nodeJ)!.x-p.position)<1e-9)!;
    for(const x of xs) {
      const node=[...model.nodes.values()].find(n=>Math.abs(n.x-x)<1e-10);
      const el=[...model.elements.values()].find(el=>model.nodes.get(el.nodeI)!.x<x && model.nodes.get(el.nodeJ)!.x>x);
      model.loads=node ? [{type:'nodal',data:{nodeId:node.id,fx:0,fz:-1,my:0}}] : [{type:'pointOnElement',data:{elementId:el!.id,a:x-model.nodes.get(el!.nodeI)!.x,p:-1}}];
      const answer=solve(model);
      const ef=answer.elementForces.find(ef=>ef.elementId===section.id)!;
      const a=model.nodes.get(section.nodeI)!,b=model.nodes.get(section.nodeJ)!;
      const value=p.quantity==='reaction' ? answer.reactions.find(r=>r.nodeId===1)!.rz : (p.quantity==='moment'?-1:1)*computeElementDiagram(p.quantity,ef,a.x,a.z,b.x,b.z).points.at(-1)!.value;
      influence.push([x,value]);
    }
    maximum=influence.reduce((best,v)=>Math.abs(v[1])>Math.abs(best[1])?v:best,[0,0]);
    const expected=p.count===1 ? simpleInfluence(L,p.position,maximum[0],p.quantity) : continuousInfluence(p.length,p.position,maximum[0],p.quantity);
    compare('tools.batch.effect',maximum[1]*p.load,expected*p.load,p.quantity==='moment'?'kN·m':'kN');
    // Export the actual moving axle at its sampled critical position, not the last unit-load case.
    const x=maximum[0],node=[...model.nodes.values()].find(n=>Math.abs(n.x-x)<1e-10),el=[...model.elements.values()].find(el=>model.nodes.get(el.nodeI)!.x<x && model.nodes.get(el.nodeJ)!.x>x);
    model.loads=node ? [{type:'nodal',data:{nodeId:node.id,fx:0,fz:-p.load,my:0}}] : [{type:'pointOnElement',data:{elementId:el!.id,a:x-model.nodes.get(el!.nodeI)!.x,p:-p.load}}];
    charts.influence=[{name:'tools.batch.influence',points:influence}];
  }
  const difference=comparisons.length ? Math.max(...comparisons.map(c=>c.difference)) : null;
  if([...comparisons.flatMap(c=>[c.engine,c.reference,c.difference]),maxDeflection,maxMoment,...influence.flat()].some(v=>!Number.isFinite(v))) throw new Error('tools.failed');
  return {model,linear,charts,shapes,modes,comparisons,difference,sagging,hogging,maxMoment,maxDeflection,influence,maximum};
}
export type BatchResult=Awaited<ReturnType<typeof calculateBatch>>;
