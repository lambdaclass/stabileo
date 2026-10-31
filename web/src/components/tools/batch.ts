import type { SolverInput, SupportType } from '../../lib/engine/types';
export const BATCH_IDS = ['continuous-beam', 'portal-frame', 'truss-2d', 'influence-line', 'beam-natural-frequency'] as const;
export type BatchId = typeof BATCH_IDS[number];
export type BatchParameters = { e: number; i: number; area: number; length: number; height: number; load: number; horizontal: number; spans: string; loads: string; ends: 'pinned' | 'fixed'; rightEnd: 'pinned' | 'fixed'; boundary: 'simple' | 'cantilever' | 'fixed'; count: number; quantity: 'reaction' | 'moment' | 'shear'; position: number; mass: number; nodes: string; members: string; supports: string; nodalLoads: string };
export const DEFAULT_BATCH: BatchParameters = { e: 200000, i: .00008, area: .01, length: 6, height: 3, load: 10, horizontal: 10, spans: '6, 6', loads: '10, 10', ends: 'pinned', rightEnd: 'pinned', boundary: 'simple', count: 1, quantity: 'moment', position: 3, mass: 100,
  nodes: '1, 0, 0\n2, 3, 0\n3, 6, 0\n4, 9, 0\n5, 12, 0\n6, 3, 3\n7, 6, 3\n8, 9, 3',
  members: '1, 2\n2, 3\n3, 4\n4, 5\n1, 6\n6, 7\n7, 8\n8, 5\n2, 6\n3, 7\n4, 8\n6, 3\n3, 8', supports: '1, pinned\n5, rollerX', nodalLoads: '6, 0, -10\n7, 0, -10\n8, 0, -10' };
const check = (ok: boolean) => { if (!ok) throw new Error('tools.batch.invalid'); };
export function numbers(text: string): number[] {
  const tokens = text.trim().split(/[;,\s]+/); check(text.trim().length > 0 && tokens.length <= 100 && tokens.every(t => t.length > 0));
  const values = tokens.map(Number); check(values.every(Number.isFinite)); return values;
}
function rows(text: string) { check(text.length <= 10000); const lines = text.trim().split(/\n/); check(lines.length > 0 && lines.length <= 100); return lines.map(line => { const tokens = line.trim().split(/[,;\s]+/); check(tokens.every(t => t.length > 0)); return tokens; }); }
export function parseTruss(p: Pick<BatchParameters, 'nodes' | 'members' | 'supports' | 'nodalLoads'>) {
  const nodes: SolverInput['nodes'] = new Map();
  for (const row of rows(p.nodes)) {
    const [id, x, z] = row.map(Number);
    check(row.length === 3 && Number.isInteger(id) && id > 0 && !nodes.has(id) && Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= 100 && Math.abs(z) <= 100);
    check(![...nodes.values()].some(n => Math.hypot(n.x - x, n.z - z) < .01)); nodes.set(id, { id, x, z });
  }
  check(nodes.size >= 3 && nodes.size <= 40);
  const elements: SolverInput['elements'] = new Map(); const pairs = new Set<string>();
  for (const row of rows(p.members)) {
    const [nodeI, nodeJ] = row.map(Number); const pair = [nodeI, nodeJ].sort((a,b) => a-b).join(',');
    check(row.length === 2 && nodes.has(nodeI) && nodes.has(nodeJ) && nodeI !== nodeJ && !pairs.has(pair)); pairs.add(pair);
    const id = elements.size + 1; elements.set(id, { id, nodeI, nodeJ, type: 'truss', materialId: 1, sectionId: 1, hingeStart: true, hingeEnd: true });
  }
  const supports: SolverInput['supports'] = new Map(); const supported = new Set<number>();
  for (const row of rows(p.supports)) {
    const nodeId = Number(row[0]), type = row[1] as SupportType;
    check(row.length === 2 && nodes.has(nodeId) && ['pinned', 'rollerX', 'rollerZ'].includes(type) && !supported.has(nodeId)); supported.add(nodeId);
    const id = supports.size + 1; supports.set(id, { id, nodeId, type });
  }
  const loads: SolverInput['loads'] = rows(p.nodalLoads).map(row => {
    const [nodeId, fx, fz] = row.map(Number); check(row.length === 3 && nodes.has(nodeId) && Number.isFinite(fx) && Number.isFinite(fz) && Math.max(Math.abs(fx), Math.abs(fz)) <= 1e6);
    return { type: 'nodal', data: { nodeId, fx, fz, my: 0 } };
  });
  // Reject disconnected topology before entering the engine; stability is checked by the engine.
  const seen = new Set([nodes.keys().next().value!]);
  for (let j = 0; j < nodes.size; j++) for (const el of elements.values()) if (seen.has(el.nodeI) || seen.has(el.nodeJ)) { seen.add(el.nodeI); seen.add(el.nodeJ); }
  check(seen.size === nodes.size); return { nodes, elements, supports, loads };
}
export function validateBatch(id: BatchId, p: BatchParameters) {
  for (const [v, min, max] of [[p.e,1,1e6], [p.i,1e-10,10], [p.area,1e-6,10], [p.length,.1,100], [p.height,.1,100], [p.load,0,1e6], [p.horizontal,0,1e6], [p.mass,.001,1e6]]) check(Number.isFinite(v) && v >= min && v <= max);
  check(['pinned','fixed'].includes(p.rightEnd) && ['pinned','fixed'].includes(p.ends) && ['simple','cantilever','fixed'].includes(p.boundary));
  if (id === 'continuous-beam') { const ls = numbers(p.spans), qs = numbers(p.loads); check(ls.length >= 2 && ls.length <= 4 && ls.length === qs.length && ls.every(l => l >= .1 && l <= 100) && qs.every(q => q >= 0 && q <= 1e6)); }
  if (id === 'influence-line') check([1,2].includes(p.count) && ['reaction','moment','shear'].includes(p.quantity) && Number.isFinite(p.position) && p.position > 0 && p.position < p.length * p.count);
  if (id === 'truss-2d') parseTruss(p);
}
export function batchModel(id: BatchId, p: BatchParameters): SolverInput {
  validateBatch(id, p);
  const model: SolverInput = { nodes: new Map(), elements: new Map(), supports: new Map(), loads: [], materials: new Map([[1,{ id:1,e:p.e,nu:.3 }]]), sections: new Map([[1,{ id:1,a:p.area,iz:p.i }]]) };
  if (id === 'truss-2d') return { ...model, ...parseTruss(p) };
  const node = (x:number,z:number) => { const id = model.nodes.size+1; model.nodes.set(id,{id,x,z}); return id; };
  const support = (nodeId:number,type:SupportType) => { const id=model.supports.size+1; model.supports.set(id,{id,nodeId,type}); };
  const member = (nodeI:number,nodeJ:number,q=0) => { const id=model.elements.size+1; model.elements.set(id,{id,nodeI,nodeJ,type:'frame',materialId:1,sectionId:1,hingeStart:false,hingeEnd:false}); if(q) model.loads.push({type:'distributed',data:{elementId:id,qI:-q,qJ:-q}}); };
  if (id === 'portal-frame') {
    const a=node(0,0), b=node(0,p.height), c=node(p.length,p.height), d=node(p.length,0);
    member(a,b); member(b,c,p.load); member(d,c); support(a,p.ends); support(d,p.ends);
    // Split the horizontal resultant equally to retain the classical symmetric sway case.
    for (const nodeId of [b,c]) model.loads.push({type:'nodal',data:{nodeId,fx:p.horizontal/2,fz:0,my:0}});
    return model;
  }
  const lengths = id === 'continuous-beam' ? numbers(p.spans) : Array.from({length:id === 'influence-line' ? p.count : 1},()=>p.length);
  const qs = id === 'continuous-beam' ? numbers(p.loads) : lengths.map(()=>0);
  let x=0, prev=node(0,0); support(prev,id === 'beam-natural-frequency' ? p.boundary === 'simple' ? 'pinned' : 'fixed' : id === 'continuous-beam' ? p.ends : 'pinned');
  for (const [s,L] of lengths.entries()) {
    const xs = Array.from({length:32},(_,j)=>x+L*(j+1)/32);
    if(id === 'influence-line' && p.position>x && p.position<x+L) xs.push(p.position);
    for(const xi of [...new Set(xs)].sort((a,b)=>a-b)) { const next=node(xi,0); member(prev,next,qs[s]); prev=next; }
    x+=L;
    if(id !== 'beam-natural-frequency' || p.boundary !== 'cantilever') support(prev, s===lengths.length-1 && (id === 'continuous-beam' && p.rightEnd === 'fixed' || id === 'beam-natural-frequency' && p.boundary === 'fixed') ? 'fixed' : 'rollerX');
  }
  return model;
}
export function linearSystem(matrix: number[][], rhs: number[]) {
  const a=matrix.map((row,i)=>[...row,rhs[i]]), n=rhs.length;
  for(let j=0;j<n;j++) { let k=j; for(let i=j+1;i<n;i++) if(Math.abs(a[i][j])>Math.abs(a[k][j])) k=i;
    check(Math.abs(a[k][j])>1e-14); [a[j],a[k]]=[a[k],a[j]]; const v=a[j][j]; for(let c=j;c<=n;c++) a[j][c]/=v;
    for(let i=0;i<n;i++) if(i!==j) { const v=a[i][j]; for(let c=j;c<=n;c++) a[i][c]-=v*a[j][c]; }
  } return a.map(row=>row[n]);
}
/** Classical slope-deflection: only support rotations are unknown, EI cancels. */
export function continuousReactions(lengths:number[], loads:number[], fixed=false, rightFixed=fixed) {
  const n=lengths.length+1, k=Array.from({length:n},()=>Array(n).fill(0)), f=Array(n).fill(0);
  lengths.forEach((L,j)=>{ k[j][j]+=4/L; k[j+1][j+1]+=4/L; k[j][j+1]+=2/L; k[j+1][j]+=2/L; f[j]-=loads[j]*L*L/12; f[j+1]+=loads[j]*L*L/12; });
  for(const j of [...(fixed?[0]:[]),...(rightFixed?[n-1]:[])]) { k[j].fill(0); k[j][j]=1; f[j]=0; }
  const theta=linearSystem(k,f), r=Array(n).fill(0);
  lengths.forEach((L,j)=>{ const v=6*(theta[j]+theta[j+1])/(L*L); r[j]+=loads[j]*L/2+v; r[j+1]+=loads[j]*L/2-v; }); return r;
}
export function portalSway(p:BatchParameters) {
  const {length:L,height:h}=p, EI=p.e*1000*p.i;
  return p.ends === 'pinned' ? p.horizontal*h*h*(L+2*h)/(12*EI) : p.horizontal*h**3*(4*L+6*h)/(24*EI*(L+6*h));
}
export function frequencies(p:BatchParameters) {
  const beta = p.boundary === 'simple' ? [Math.PI,2*Math.PI,3*Math.PI] : p.boundary === 'cantilever' ? [1.875104068711961,4.694091132974174,7.854757438237613] : [4.730040744862704,7.853204624095838,10.99560783800167];
  return beta.map(b=>b*b/(2*Math.PI*p.length*p.length)*Math.sqrt(p.e*1e6*p.i/p.mass));
}
export function simpleInfluence(L:number,a:number,x:number,quantity:BatchParameters['quantity']) {
  if(quantity==='reaction') return 1-x/L;
  if(quantity==='moment') return x<=a ? x*(L-a)/L : a*(L-x)/L;
  return 1-x/L-(x<a ? 1 : 0); // section immediately to the left when load coincides
}
/** Method of joints, for statically determinate trusses. Null means no unique statics-only reference. */
export function jointForces(model:SolverInput): number[] | null {
  const nodes=[...model.nodes.values()], members=[...model.elements.values()];
  const reactions=[...model.supports.values()].flatMap(s=>s.type==='pinned' ? [[s.nodeId,0],[s.nodeId,1]] : [[s.nodeId,s.type==='rollerX'?1:0]]);
  if(members.length+reactions.length!==nodes.length*2) return null;
  const k=Array.from({length:nodes.length*2},()=>Array(nodes.length*2).fill(0)), f=Array(nodes.length*2).fill(0);
  members.forEach((el,j)=>{ const a=model.nodes.get(el.nodeI)!,b=model.nodes.get(el.nodeJ)!,L=Math.hypot(b.x-a.x,b.z-a.z); for(const [n,sign] of [[a,1],[b,-1]] as const) { const row=nodes.findIndex(v=>v.id===n.id)*2; k[row][j]=sign*(b.x-a.x)/L; k[row+1][j]=sign*(b.z-a.z)/L; } });
  reactions.forEach(([id,dir],j)=>k[nodes.findIndex(v=>v.id===id)*2+dir][members.length+j]=1);
  for(const load of model.loads) if(load.type==='nodal') { const row=nodes.findIndex(v=>v.id===load.data.nodeId)*2; f[row]-=load.data.fx; f[row+1]-=load.data.fz; }
  return linearSystem(k,f).slice(0,members.length);
}
/** Force method: release the middle support; recover its reaction from compatibility. EI cancels. */
export function continuousInfluence(span:number,a:number,x:number,quantity:BatchParameters['quantity']) {
  const L=2*span, b=L-x;
  const delta=span<=x ? b*span*(L*L-b*b-span*span)/(6*L) : x*(L-span)*(L*L-x*x-(L-span)**2)/(6*L);
  const middle=delta/(L**3/48), left=(L-x)/L-middle/2;
  if(quantity==='reaction') return left;
  if(quantity==='moment') return left*a+middle*Math.max(a-span,0)-Math.max(a-x,0);
  return left+(a>span?middle:0)-(x<a?1:0);
}
