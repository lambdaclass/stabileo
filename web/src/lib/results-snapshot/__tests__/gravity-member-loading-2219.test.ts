import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initSolver } from '../../engine/wasm-solver';
import { solve_3d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { floorLoad } from '../../engine/loads/floor-loads';
import { physicalRegion, transferRegionToCarriers } from '../../engine/loads/physical-region-loads';
import { regionModel, rectangle } from '../../engine/loads/__tests__/physical-region-invariance';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import { mapMoments } from '../../engine/member-moments';
import type { AnalysisResults3D } from '../../engine/types-3d';

beforeAll(async () => { await initSolver(); });
const fixture = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/nightly-2026-11-13.json', import.meta.url), 'utf8'))['2023'];

function hand(L: number, x: number, mirror: number) {
  const cap = Math.min(2,L/2);
  const pieces = [[0,cap,0,cap],[cap,L-cap,cap,cap],[L-cap,L,cap,0]].filter(([a,b]) => b!>a!);
  let F=0,Q1=0,Q2=0,C3=0,total=0,torque=0,torqueConvolution=0;
  for (const [a,b,qa,qb] of pieces as [number,number,number,number][]) {
    const k=(qb-qa)/(b-a), h=Math.max(0,Math.min(x,b)-a), H=b-a;
    total += (qa+qb)*H/2;
    const fullF=qa*H+k*H*H/2,fullQ1=a*fullF+qa*H*H/2+k*H**3/3;
    Q2+=a*a*fullF+2*a*(qa*H*H/2+k*H**3/3)+qa*H**3/3+k*H**4/4;
    Q1+=fullQ1;
    F+=qa*h+k*h*h/2;
    const c=x-a;
    C3+=qa*(c**3*h-3*c*c*h*h/2+c*h**3-h**4/4)+k*(c**3*h*h/2-c*c*h**3+3*c*h**4/4-h**5/5);
    torque+=qa*qa*h/2+qa*k*h*h/2+k*k*h**3/6;
    torqueConvolution+=c*(qa*qa*h/2+qa*k*h*h/2+k*k*h**3/6)-(qa*qa*h*h/2+2*qa*k*h**3/3+k*k*h**4/4)/2;
  }
  const R=total/2,M0=((L*L*total-2*L*Q1+Q2)/2-R*L*L/2)/L;
  let first=0,torqueTotal=0;
  for (const [a,b,qa,qb] of pieces as [number,number,number,number][]) {
    const k=(qb-qa)/(b-a),h=Math.max(0,Math.min(x,b)-a),H=b-a,f=qa*h+k*h*h/2;
    first+=a*f+qa*h*h/2+k*h**3/3;
    torqueTotal+=qa*qa*H/2+qa*k*H*H/2+k*k*H**3/6;
  }
  return { shear:R-F, moment:M0+R*x-x*F+first, torsion:mirror*(torqueTotal/2-torque), deflection:(M0*x*x/2+R*x**3/6-C3/6)/(1e6*0.001), rotation:-mirror*(torqueTotal*x/2-torqueConvolution)/(0.5e6*0.002) };
}

for (const source of ['floor','region']) for (const angle of [0,0.37]) for (const mirror of [1,-1]) for (const divided of [false,true]) {
  it(`each ${source} carrier retains hand-solved internal forces and deflection, angle=${angle}, mirror=${mirror}, divided=${divided}`, () => {
    const point=([x,y]: number[]): [number,number] => [mirror*x!*Math.cos(angle)-y!*Math.sin(angle),mirror*x!*Math.sin(angle)+y!*Math.cos(angle)];
    const corners=rectangle(0,0,6,4).map(point),fractions=divided?[0,0.2,0.5,0.7]:[0,0.5], count=fractions.length;
    const ring=corners.flatMap((a,k) => { const b=corners[(k+1)%4]!; return fractions.map(t=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]); });
    const m=regionModel([ring]);
    const floor=floorLoad({ nodes:m.nodes,beams:[...m.elements.values()].map(e=>({...e,type:'frame' as const})),q:1,distribution:'twoWay' });
    const region=transferRegionToCarriers(m,physicalRegion(corners),[...m.elements.keys()]);
    for (let carrier=0;carrier<4;carrier++) {
      const ids=Array.from({length:count},(_,i)=>carrier*count+i+1),elements=ids.map(id=>m.elements.get(id)!);
      const nodeIds=[elements[0]!.nodeI,...elements.map(e=>e.nodeJ)],s=structuredClone(fixture);
      s.nodes=Object.fromEntries(nodeIds.map(id=>[id,m.nodes.get(id)]));
      s.elements=Object.fromEntries(elements.map(e=>[e.id,{id:e.id,type:'frame',nodeI:e.nodeI,nodeJ:e.nodeJ,sectionId:1,materialId:1}]));
      s.materials['1'].e=1000;s.materials['1'].nu=0;
      Object.assign(s.sections['1'],{a:0.1,iy:0.001,iz:0.001,j:0.002});
      for(const key of ['cw','asY','asZ']) delete s.sections['1'][key];
      s.supports=Object.fromEntries([nodeIds[0]!,nodeIds.at(-1)!].map(nodeId=>[nodeId,{nodeId,rx:true,ry:true,rz:true,rrx:true,rry:true,rrz:true}]));
      s.loads=source==='floor'?floor.loads.filter(l=>ids.includes(l.elementId)).map(l=>({type:'distributed',data:l})):region.pieces.filter(l=>ids.includes(l.elementId)).map(l=>({type:'distributed',data:{elementId:l.elementId,a:l.a,b:l.b,qYI:0,qYJ:0,qZI:-l.wI,qZJ:-l.wJ}}));
      if(source==='region') for(const l of (region.moments ?? []).filter(l=>ids.includes(l.elementId))) {
        const e=m.elements.get(l.elementId)!,axes=computeLocalAxes3D({...m.nodes.get(e.nodeI)!,z:3},{...m.nodes.get(e.nodeJ)!,z:3});
        const moments=mapMoments({x:l.first.map(v=>-v[1]) as [number,number,number],y:l.first.map(v=>v[0]) as [number,number,number],z:[0,0,0]},v=>[axes.ex,axes.ey,axes.ez].map(axis=>v.reduce((sum,x,i)=>sum+x*axis[i]!,0)) as [number,number,number]);
        s.loads.push({type:'distributed',data:{elementId:l.elementId,a:l.a,b:l.b,qYI:0,qYJ:0,qZI:0,qZJ:0,moments}});
      }
      const L=carrier%2===0?6:4;
      for(const result of [solve_3d(s),JSON.parse(solve_pdelta_3d(JSON.stringify(s),100,1e-10)).results] as AnalysisResults3D[]) {
        for(const [index,e] of elements.entries()) {
          const ef=result.elementForces.find(f=>f.elementId===e.id)!;
          for(const t of [0,0.25,0.5,0.75,1]) {
            const at=fractions[index]!*L+t*ef.length,expected=hand(L,at,mirror);
            expect(evaluateDiagramAt(ef,'shearZ',t)).toBeCloseTo(expected.shear,8);
            expect(evaluateDiagramAt(ef,'momentY',t)).toBeCloseTo(expected.moment,8);
            expect(evaluateDiagramAt(ef,'torsion',t)).toBeCloseTo(expected.torsion,8);
          }
        }
        const middle=result.displacements.find(d=>d.nodeId===nodeIds[fractions.indexOf(0.5)])!,expected=hand(L,L/2,mirror);
        expect(middle.uz).toBeCloseTo(expected.deflection,10);
        const a=m.nodes.get(nodeIds[0]!)!,b=m.nodes.get(nodeIds.at(-1)!)!;
        expect((middle.rx*(b.x-a.x)+middle.ry*(b.y-a.y))/L).toBeCloseTo(expected.rotation,10);
      }
    }
  });
}
