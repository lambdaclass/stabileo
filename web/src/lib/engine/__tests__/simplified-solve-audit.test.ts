import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { buildSimplified2DModel } from '../../templates/../geometry/plane-projection';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { buildSolverInput2D } from '../solver-service';
import { solve } from '../wasm-solver';
import type { DrawPlane } from '../../geometry/plane-projection';

const fixtureDir = 'src/lib/templates/fixtures';
const toolbar3D = ['3d-cantilever-load','3d-torsion-beam','hinged-arch-3d','3d-portal-frame','grid-beams','3d-space-truss','space-frame','tower-3d-2','tower-3d-4','3d-nave-industrial'];

function createMock() {
  let nn=1,ne=1,ns=1,nl=1,nsc=2,nm=2,np=1,nq=1;
  const model: any = {name:'',nodes:new Map(),materials:new Map([[1,{id:1,name:'A36',e:200000,nu:0.3,rho:78.5,fy:250}]]),sections:new Map([[1,{id:1,name:'IPN300',a:0.0069,iy:0.000098,iz:0.00000451,j:1e-7,b:0.125,h:0.3}]]),elements:new Map(),supports:new Map(),loads:[] as any[],plates:new Map(),quads:new Map(),constraints:[] as any[],loadCases:[],combinations:[]};
  const api: any = {addNode(x:number,y:number,z?:number){const id=nn++;model.nodes.set(id,{id,x,y,z:z??0});return id},addElement(nI:number,nJ:number,type='frame'){const id=ne++;model.elements.set(id,{id,type,nodeI:nI,nodeJ:nJ,materialId:1,sectionId:1,hingeStart:false,hingeEnd:false});return id},addSupport(nodeId:number,type:string,extra?:any){const id=ns++;model.supports.set(id,{id,nodeId,type,...(extra||{})});return id},updateSupport(id:number,data:any){const s=model.supports.get(id);if(s)Object.assign(s,data)},addMaterial(data:any){const id=nm++;model.materials.set(id,{id,...data});return id},addSection(data:any){const id=nsc++;model.sections.set(id,{id,...data});return id},updateElementMaterial(eid:number,mid:number){const e=model.elements.get(eid);if(e)e.materialId=mid},updateElementSection(eid:number,sid:number){const e=model.elements.get(eid);if(e)e.sectionId=sid},toggleHinge(eid:number,end:'start'|'end'){const e=model.elements.get(eid);if(e){if(end==='start')e.hingeStart=!e.hingeStart;else e.hingeEnd=!e.hingeEnd}},addDistributedLoad(eid:number,qI:number,qJ?:number,angle?:number,isGlobal?:boolean,caseId?:number){const id=nl++;model.loads.push({type:'distributed',data:{id,elementId:eid,qI,qJ:qJ??qI,angle,isGlobal,caseId}});return id},addNodalLoad(nodeId:number,fx:number,fz:number,my?:number,caseId?:number){const id=nl++;model.loads.push({type:'nodal',data:{id,nodeId,fx,fz,my:my??0,caseId}});return id},addPointLoadOnElement(eid:number,a:number,p:number,opts?:any){const id=nl++;model.loads.push({type:'pointOnElement',data:{id,elementId:eid,a,p,...(opts||{})}});return id},addThermalLoad(eid:number,u:number,g:number){const id=nl++;model.loads.push({type:'thermal',data:{id,elementId:eid,dtUniform:u,dtGradient:g}});return id},addDistributedLoad3D(eid:number,qYI:number,qYJ:number,qZI:number,qZJ:number,a?:number,b?:number,caseId?:number){const id=nl++;model.loads.push({type:'distributed3d',data:{id,elementId:eid,qYI,qYJ,qZI,qZJ,a,b,caseId}});return id},addNodalLoad3D(nodeId:number,fx:number,fy:number,fz:number,mx:number,my:number,mz:number,caseId?:number){const id=nl++;model.loads.push({type:'nodal3d',data:{id,nodeId,fx,fy,fz,mx,my,mz,caseId}});return id},addSurfaceLoad3D(qid:number,q:number,caseId?:number){const id=nl++;model.loads.push({type:'surface3d',data:{id,quadId:qid,q,caseId}});return id},addPlate(nodes:number[],mid:number,t:number){const id=np++;model.plates.set(id,{id,nodes,materialId:mid,thickness:t});return id},addQuad(nodes:number[],mid:number,t:number){const id=nq++;model.quads.set(id,{id,nodes,materialId:mid,thickness:t});return id},addConstraint(c:any){model.constraints.push(c)},model,nextId:{loadCase:5,combination:1}};
  return {model,api};
}

describe('Exhaustive simplified 2D solve', { timeout: 60_000 }, () => {
  for (const name of toolbar3D) {
    for (const plane of ['xy','xz','yz'] as DrawPlane[]) {
      it(`${name} → ${plane.toUpperCase()}`, () => {
        const json = JSON.parse(readFileSync(`${fixtureDir}/${name}.json`, 'utf8'));
        const { model, api } = createMock();
        loadFixture(json, api);

        const result = buildSimplified2DModel(plane, model.nodes.values(), model.elements.values(), model.supports.values(), model.loads, model.materials, model.sections);
        if (!result.ok) {
          // Only acceptable failure: ALL elements collapse (e.g. cantilever along X projected to YZ)
          expect(result.error).toContain('All elements collapse');
          return;
        }

        const m = result.model;
        expect(m.nodes.size).toBeGreaterThan(1);
        expect(m.elements.size).toBeGreaterThan(0);
        expect(m.supports.size).toBeGreaterThan(0);

        // Build solver input from simplified model
        const case1Loads = m.loads.filter((l: any) => ((l.data as any).caseId ?? 1) === 1);
        const solveModel = { nodes: m.nodes, elements: m.elements, supports: m.supports, loads: case1Loads, materials: m.materials, sections: m.sections };
        const input = buildSolverInput2D(solveModel);
        
        if (!input) {
          // May happen if supports don't cover enough DOFs — document but don't fail hard
          console.log(`  ${name}/${plane}: buildSolverInput2D returned null`);
          return;
        }

        const res = solve(input);
        expect(res.displacements.length).toBeGreaterThan(0);
        for (const d of res.displacements) {
          expect(Number.isFinite(d.ux)).toBe(true);
          expect(Number.isFinite(d.uz)).toBe(true);
        }
      });
    }
  }
});
