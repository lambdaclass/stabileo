// Production-browser benchmark: preparation/transfer included; parity checked after timing.
import { initSolver, solve3D, prepareLoadSession3D } from '../src/lib/engine/wasm-solver';
import { spectrumCompatible, clearSpectrumRecordCache } from '../src/lib/engine/dynamics/spectrum-compatible';
import { enrichComboShellStresses } from '../src/lib/engine/shell-combos';
import { getShellCombinationKernel, registerShellCombinationKernel } from '../src/lib/engine/shell-combination-kernel';
import { memberLocalCurve, type ElementEI, type LocalCurve } from '../src/lib/engine/member-deflection';
import type { AnalysisResults3D, SolverInput3D, SolverLoad3D, ElementForces3D, Displacement3D } from '../src/lib/engine/types-3d';
type Pt = { x: number; y: number; z: number };
const median = (xs: number[]) => { const sorted = [...xs].sort((a, b) => a - b); return (sorted[Math.floor((xs.length - 1) / 2)] + sorted[Math.floor(xs.length / 2)]) / 2; };
function same(a: unknown,b: unknown): void {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a-b) > 1e-9*Math.max(1,Math.abs(a),Math.abs(b))) throw new Error(`Numeric mismatch ${a} vs ${b}`);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (JSON.stringify(ak)!==JSON.stringify(bk)) throw new Error('Shape mismatch');
    for (const k of ak) same((a as any)[k],(b as any)[k]);
  } else if (a!==b) throw new Error('Value mismatch');
}
async function compare(name: string, reference: () => unknown, optimized: () => unknown, exact = false) {
  const times = { reference: [] as number[], optimized: [] as number[] };
  for(let round=0;round<8;round++) {
    const values: Record<string,unknown> = {};
    for(const mode of round%2 ? ['optimized','reference'] as const : ['reference','optimized'] as const) {
      const start = performance.now(); values[mode] = (mode==='reference' ? reference : optimized)();
      if(round>=2) times[mode].push(performance.now()-start);
    }
    same(values.reference, values.optimized);
    if(exact) { if(JSON.stringify(values.reference)!==JSON.stringify(values.optimized)) throw new Error(`${name}: exact parity failed`); }
    await new Promise(r=>setTimeout(r,0));
  }
  return { name, referenceMs: median(times.reference), optimizedMs: median(times.optimized), times, equivalent:true };
}
export async function benchmark() {
  await initSolver();
  const rows=[];
  for(const duration of [20,60]) {
    const run=(reference:boolean)=> { clearSpectrumRecordCache(); return spectrumCompatible({target:T=>T<=0.5?0.8:0.4/T,duration,dt:duration===20?0.01:0.005,seed:41,reference}); };
    rows.push(await compare(`ground-motion-${duration}s`,()=>run(true),()=>run(false),true));
  }
  const n=30;
  const base: SolverInput3D={
    nodes:new Map(Array.from({length:n+1},(_,i)=>[i+1,{id:i+1,x:i*0.5,y:0,z:0}])),
    elements:new Map(Array.from({length:n},(_,i)=>[i+1,{id:i+1,type:'frame' as const,nodeI:i+1,nodeJ:i+2,materialId:1,sectionId:1}])),
    materials:new Map([[1,{id:1,e:200000,nu:0.3}]]),sections:new Map([[1,{id:1,a:0.02,iy:0.0002,iz:0.0001,j:0.00001}]]),
    supports:new Map([[1,{nodeId:1,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}]]),loads:[],
  };
  const loads: SolverLoad3D[][]=Array.from({length:120},(_,i)=>[{type:'pointOnElement',data:{elementId:1+i%n,a:0.1+(i%3)*0.1,py:0,pz:-10-i}}]);
  const keep=(r:AnalysisResults3D)=>({d:r.displacements,f:r.elementForces,r:r.reactions});
  rows.push(await compare('moving-load-120-positions-30-members',()=>loads.map(l=>keep(solve3D({...base,loads:l}))),()=>{
    const session=prepareLoadSession3D(base); try{return loads.map(l=>keep(session.solve(l)));}finally{session.free();}
  }));
  const empty=():AnalysisResults3D=>({displacements:[],reactions:[],elementForces:[]});
  for (const count of [1000, 10000]) {
    const cases=new Map(Array.from({length:4},(_,c)=>[c,{...empty(),quadStresses:Array.from({length:count},(_,i)=>({elementId:i+1,sigmaXx:10+c+i/13,sigmaYy:-c-i/17,tauXy:i/11,mx:0.2*i,my:-0.1*i,mxy:0.01*i,vonMises:0,qx:c+i,qy:c-i}))}]));
    const combos=Array.from({length:12},(_,i)=>({id:i,factors:Array.from({length:4},(_,c)=>({caseId:c,factor:(i+c)%3===0?-0.7:1.2}))}));
    const kernel=getShellCombinationKernel();
    if (!kernel) throw new Error('Rust shell kernel was not registered');
    const shells=(rust:boolean)=>{
      registerShellCombinationKernel(rust?kernel:null);
      const results=new Map(combos.map(c=>[c.id,empty()])),env=empty();
      try { enrichComboShellStresses(cases,results,env,combos,new Map());return {results:[...results],env}; }
      finally { registerShellCombinationKernel(kernel); }
    };
    rows.push(await compare(`shells-${count}-4-cases-12-combos`,()=>shells(false),()=>shells(true)));
  }
  const disp=(id:number):Displacement3D=>({nodeId:id,ux:id*1e-5,uy:id*2e-5,uz:id*3e-5,rx:0,ry:id*1e-6,rz:id*2e-6});
  const forces=(id:number):ElementForces3D=>({elementId:id,length:0.5,nStart:0,nEnd:0,vyStart:0,vyEnd:0,vzStart:0,vzEnd:0,myStart:0,myEnd:0,mzStart:0,mzEnd:0,mxStart:0,mxEnd:0,qYi:0,qYj:0,qZi:0,qZj:0,distributedLoadsY:[],distributedLoadsZ:[],pointLoadsY:[],pointLoadsZ:[]} as ElementForces3D);
  const f={...forces(1),length:6,pieces:Array.from({length:12},(_,i)=>({x0:i*0.5,x1:(i+1)*0.5,forces:forces(i+1),dI:disp(i),dJ:disp(i+1),ei:{EIy:20000,EIz:40000}}))};
  const at={x:0,y:0,z:0},end={x:6,y:0,z:0};
  const curves=(prepared:boolean)=>Array.from({length:100},()=> (prepared?memberLocalCurve:referencePiecewise)(at,end,disp(0),disp(12),f,undefined,undefined,0,false,240));
  rows.push(await compare('deflection-100-curves-12-pieces-241-samples',()=>curves(false),()=>curves(true),true));
  return rows;
}

function referencePiecewise(
  nodeI: Pt, nodeJ: Pt, _dispI: Displacement3D, _dispJ: Displacement3D, ef: ElementForces3D, ei: ElementEI | undefined,
  localY: Pt | undefined, rollAngle: number | undefined, leftHand: boolean | undefined, segments: number | readonly number[],
): LocalCurve | null {
  const pieces = ef.pieces!;
  const L = ef.length;
  const at = (x: number): Pt => {
    const f = x / L;
    return { x: nodeI.x + f * (nodeJ.x - nodeI.x), y: nodeI.y + f * (nodeJ.y - nodeI.y), z: nodeI.z + f * (nodeJ.z - nodeI.z) };
  };
  const xis = typeof segments === 'number'
    ? [...new Set([...Array.from({ length: segments + 1 }, (_, i) => i / segments), ...pieces.map((p) => p.x1 / L)])].sort((a, b) => a - b)
    : segments;
  const curves = pieces.map((p) => ({ p, c: null as LocalCurve | null }));
  let out: LocalCurve | null = null;
  for (const xi of xis) {
    const x = xi * L;
    const k = Math.max(0, curves.findIndex(({ p }) => x <= p.x1 + 1e-9));
    const entry = curves[k] ?? curves[curves.length - 1]!;
    const { p } = entry;
    const local = Math.min(1, Math.max(0, (x - p.x0) / Math.max(p.x1 - p.x0, 1e-12)));
    const c = memberLocalCurve(at(p.x0), at(p.x1), p.dI!, p.dJ!, p.forces, p.ei ?? ei, localY, rollAngle, leftHand, [local]);
    if (!c) return null;
    out ??= { L, ex: c.ex, ey: c.ey, ez: c.ez, xi: [], u: [], v: [], w: [] };
    out.xi.push(xi); out.u.push(c.u[0]!); out.v.push(c.v[0]!); out.w.push(c.w[0]!);
  }
  return out;
}
