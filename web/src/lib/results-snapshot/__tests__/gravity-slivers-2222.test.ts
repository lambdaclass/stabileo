import { refusesMomentFringes } from '../gravity-supported-hand-profile';
import { beforeAll, expect, it } from 'vitest';
import { initSolver, solve3D, solvePDelta3D } from '../../engine/wasm-solver';
import { floorLoad } from '../../engine/loads/floor-loads';
import { regionModel, rectangle } from '../../engine/loads/__tests__/physical-region-invariance';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { variableExpansionFor, collapseVariableResults } from '../../engine/variable-members';
import { buildSolverInput3D } from '../../engine/solver-service';
import { compute_diagram_value_at_3d } from '../../wasm/dedaliano_engine.js';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';

beforeAll(async()=>{await initSolver();});
for(const width of [0.5e-12,1.5e-12,0.5e-9,1.5e-9]) for(const distribution of ['oneWay','twoWay'] as const) {
  it(`gravity sliver has the hand-solved member response in WASM: ${distribution}, width=${width}`,()=>{
    const geometry=regionModel([[[0,0,0],[3,0,0],[6,0,0],[6,4,0],[0,4,0]]]),a=1.5,b=a+width;
    const load=floorLoad({nodes:geometry.nodes,beams:[...geometry.elements.values()].map(e=>({...e,type:'frame' as const})),q:1/(b-a),distribution,spanAxis:'y',zone:{outer:rectangle(a,0,b,1,0).map(v=>[v[0]!,v[1]!,v[2]!] as [number,number,number])}});
    modelStore.clear();
    const ids=[0,3,6].map(x=>modelStore.addNode(x,0,0));
    const elements=[modelStore.addElement(ids[0]!,ids[1]!),modelStore.addElement(ids[1]!,ids[2]!)];
    for(const node of [ids[0]!,ids[2]!]) modelStore.addSupport(node,'fixed3d');
    const material=[...modelStore.materials.values()][0]!,section=[...modelStore.sections.values()][0]!;
    modelStore.updateMaterial(material.id,{e:1000,nu:0});
    modelStore.updateSection(section.id,{a:0.1,iy:0.001,iz:0.001,j:0.002});
    for(const l of load.loads.filter(l=>l.elementId<=2)) modelStore.addLoadEntry({type:'distributed3d',data:{...l,id:0,elementId:elements[l.elementId-1]!}});
    for(const l of load.concentrated.filter(l=>l.elementId<=2)) modelStore.addLoadEntry({type:'pointOnElement3d',data:{...l,id:0,elementId:elements[l.elementId-1]!}});
    if (width < 1e-12) {
      expect(() => buildSolverInput3D(modelStore.model)).toThrow(/Member .*span.*native/);
      return;
    }
    const input=buildSolverInput3D(modelStore.model)!;
    for(const section of input.sections.values()) Object.assign(section,{a:0.1,iy:0.001,iz:0.001,j:0.002,asY:undefined,asZ:undefined,cw:undefined});
    for(const material of input.materials.values()) Object.assign(material,{e:1000,nu:0});
    if (refusesMomentFringes({ ...input, elements: Object.fromEntries(input.elements), nodes: Object.fromEntries(input.nodes) }, [() => solve3D(input), () => solvePDelta3D(input,100,1e-10)])) return;
    for(const result of [solve3D(input),solvePDelta3D(input,100,1e-10).results]) {
      const r=collapseVariableResults(result,variableExpansionFor(modelStore.model));
      expect(r.reactions.find(d=>d.nodeId===ids[0])!.fz).toBeCloseTo(0.84375,8);
      expect(r.displacements.find(d=>d.nodeId===ids[1])!.uz).toBeCloseTo(-0.0005625,10);
      const first=r.elementForces.find(f=>f.elementId===elements[0])!;
      expect(evaluateDiagramAt(first,'torsion',0.25)).toBeCloseTo(0.375,8);
      expect(evaluateDiagramAt(first,'torsion',0.75)).toBeCloseTo(-0.125,8);
      for(const [t,expected] of [[0.25,0.375],[0.75,-0.125]]) expect(compute_diagram_value_at_3d(JSON.stringify({elementForces:first,kind:'torsion',t}))).toBeCloseTo(expected!,8);
    }
  });
}
