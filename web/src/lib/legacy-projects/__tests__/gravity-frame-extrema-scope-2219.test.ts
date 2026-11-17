import { expect, it } from 'vitest';
import declaredQuantities from 'virtual:result-change-quantities';
import { assessProject } from '../../provenance/applicability';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { modelFeatures, type FeatureSnapshot } from '../../provenance/model-features';
import { freshStamp } from '../../provenance/solve-stamp';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';

const id = 'gravity-member-frames-and-extrema';
const source = RESULT_CHANGES.changes.find(c => c.id === id)!;
const entry = { ...source, quantities: declaredQuantities[id]!.filter((q): q is string => typeof q === 'string') };

it('known wrong result: #2219 frame corrections require a floor couple on the same oriented carrier', () => {
  for (const mode of ['2d', '3d', 'pro']) for (const oriented of [false, true]) for (const floor of [false, true]) for (const couple of [0, Number.MIN_VALUE, -1, 1]) for (const same of [false, true]) {
    const snapshot: FeatureSnapshot = {
      elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2, ...(oriented ? { rollAngle: 30 } : {}) }], [2, { id: 2, type: 'frame', materialId: 1, nodeI: 2, nodeJ: 3 }]],
      loads: [{ type: 'distributed3d', data: { elementId: same ? 1 : 2, ...(floor ? { fromDef: 'floor-1' } : {}), moments: { x: [couple, 0, 0], y: [0, 0, 0], z: [0, 0, 0] } } }],
    };
    const applicable = assessProject(snapshot, { ...freshStamp(), resultsVersion: source.resultsVersion - 1 }, mode).changes.filter(c => c.id === id);
    const affected = mode !== '2d' && oriented && floor && couple !== 0 && same;
    expect.soft(applicable.length).toBe(affected ? 1 : 0);
    const features = [...modelFeatures(snapshot, { analysisMode: mode })];
    for (const prefix of ['base', 'case[2]', 'combo[1]', 'pdelta.results', 'nonlinear.results']) {
      expect.soft(fieldCovered(entry, `${prefix}.displacements[n10].rz`, features)).toBe(affected);
    }
  }
});

it('envelope extrema explain envelope values only, through the shared applicability path', () => {
  const source = RESULT_CHANGES.changes.find(c => c.id === 'gravity-member-envelope-extrema') ?? RESULT_CHANGES.changes.find(c => c.id === id)!;
  const envelopeId = source.id;
  const entry = { ...source, quantities: declaredQuantities[envelopeId]!.filter((q): q is string => typeof q === 'string') };
  for (const mode of ['2d', '3d', 'pro']) for (const combinations of [[], [{}]]) {
    const snapshot: FeatureSnapshot = { elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]], combinations };
    const features = [...modelFeatures(snapshot, { analysisMode: mode })];
    const affected = mode !== '2d' && combinations.length > 0;
    const applicable = assessProject(snapshot, { ...freshStamp(), resultsVersion: source.resultsVersion-1 }, mode).changes.filter(c=>c.id===envelopeId);
    expect(applicable.length).toBe(affected ? 1 : 0);
    expect(fieldCovered(entry, 'envelope.momentY[e1].posValues[1]', features)).toBe(affected);
    for (const path of ['base.displacements[n10].rz', 'base.reactions[n10].mz', 'base.elementForces[e1].nStart', 'combo[1].elementForces[e1].myEnd']) expect(fieldCovered(entry,path,features)).toBe(false);
    expect(assessProject(snapshot, freshStamp(), mode).changes.filter(c=>c.id===envelopeId)).toEqual([]);
  }
});

it('frame notices retain custom axes, section rotation and generator provenance on the loaded member', () => {
  for (const orientation of [{ rollAngle: -30 }, { localYx: 0, localYy: 1, localYz: 0 }, {}]) for (const rotation of [0, 30]) for (const origin of [{ fromDef: 1 }, { floorLoadsVersion: 0 }, { generatedBy: 'load-plan' }]) {
    const snapshot: FeatureSnapshot = {
      elements: [[1,{id:1,type:'frame',materialId:1,sectionId:1,nodeI:1,nodeJ:2,...orientation}]],
      sections: [[1,{id:1,rotation}]],
      loads: [{type:'distributed3d',data:{elementId:1,...origin,moments:{x:[0,0,0],y:[0,-1,0],z:[0,0,0]}}}],
    };
    const changes = assessProject(snapshot,{...freshStamp(),resultsVersion:0},'pro').changes.filter(c=>c.id===id);
    expect(changes.length).toBe(Object.keys(orientation).length || rotation !== 0 ? 1 : 0);
  }
});

it('affected frame notices clear only after both floor and generated load provenance are current', () => {
  for (const floorCurrent of [false,true]) for (const generatorCurrent of [false,true]) {
    const snapshot: FeatureSnapshot = {
      elements:[[1,{id:1,type:'frame',materialId:1,nodeI:1,nodeJ:2,rollAngle:30}]],
      loads:[{type:'distributed3d',data:{elementId:1,fromDef:1,generatedBy:'load-plan',floorLoadsVersion:floorCurrent ? source.resultsVersion : source.resultsVersion-1,moments:{x:[1,1,1],y:[0,0,0],z:[0,0,0]}}}],
      designData:{loadBasis:{resultsVersion:generatorCurrent ? source.resultsVersion : source.resultsVersion-1}},
    };
    const changes=assessProject(snapshot,freshStamp(),'pro').changes.filter(c=>c.id===id);
    expect(changes.length).toBe(floorCurrent && generatorCurrent ? 0 : 1);
  }
});
