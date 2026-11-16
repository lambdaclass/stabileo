import { extractGoverningDemands, type ElementStationResult } from '../../station-design-forces';
import { ConcurrentDemand } from '../../concurrent-demand';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../../auto-verify';
import { verifyElement, prepareElementVerification } from '../../codes/argentina/cirsoc201';
import { runOtherCode } from '../../design/other-codes/run';
import { AISC360, EC3 } from '../../design/other-codes/steel-codes';
import { ACI318, EC2 } from '../../design/other-codes/concrete-codes';
import { AISI_S100 } from '../../design/other-codes/cfs-code';
import { ec2MemberDesign } from '../../design/eurocode/ec2-member';
import { EC2_RECOMMENDED } from '../../design/eurocode/ec2-params';
import type { MemberContext } from '../../design/other-codes/types';
import { profileByName, profileToSectionFull } from '../../../data/steel-profiles';
import { coldFormedSectionFields, coldFormedSource } from '../../../profiles/cold-formed-catalogue';
import { NO_RELEASE } from '../../../store/model.svelte';

export function referenceStations(elementId = 1): ElementStationResult {
  return { elementId, length: 4, stationTs: [0, 0.5, 1], comboResults: [1, 2].map(comboId => ({ comboId, comboName: `C${comboId}`,
    stations: [0, 0.5, 1].map(t => ({ t, x: 4 * t, n: 0, my: elementId === 2 && t === 0.5 ? 1000 : 20, mz: 0, vy: 0, vz: 1, torsion: 0 })),
  })) };
}
export function referenceModel(): AutoVerifyModelData {
  return {
    elements: new Map([1, 2].map(id => [id, { id, type: 'frame', nodeI: 2 * id - 1, nodeJ: 2 * id, sectionId: 1, materialId: 1 }])),
    nodes: new Map<number, { id: number; x: number; y: number; z: number }>([1, 2].flatMap(id => [[2 * id - 1, { id: 2 * id - 1, x: 0, y: id - 1, z: 0 }], [2 * id, { id: 2 * id, x: 4, y: id - 1, z: 0 }]] as const)),
    sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4 }]]),
    materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000, nu: 0.2 }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 3, type: 'fixed' }]]),
  };
}
export function referenceRaw() {
  return { displacements: [], reactions: [], elementForces: [1, 2].map(elementId => ({ elementId, length: 4,
    nStart: 0, nEnd: 0, myStart: 20, myEnd: 20, mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 1, vzEnd: 1, mxStart: 0, mxEnd: 0 })) };
}
export function referenceContext(family: 'concrete' | 'steel' | 'cfs' = 'concrete'): MemberContext {
  const d = extractGoverningDemands(referenceStations());
  const model = referenceModel();
  const section = family === 'steel' ? { ...profileToSectionFull(profileByName('HEB 200')!), id: 1, name: 'HEB 200' }
    : family === 'cfs' ? { ...coldFormedSectionFields(coldFormedSource.byId('C 150x60x20x2')!), id: 1 }
      : { ...model.sections.get(1), shape: 'rect', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12 };
  const material = family === 'steel' ? { id: 1, name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275, fu: 430 }
    : family === 'cfs' ? { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 } : { ...model.materials.get(1), rho: 25 };
  return { elementId: 1, element: { ...model.elements.get(1), releaseI: NO_RELEASE, releaseJ: NO_RELEASE,
    reinforcement: { bottom: { count: 4, diameter: 16 }, top: { count: 4, diameter: 16 }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } } },
    section, material, kind: 'beam', L: 4, Lb: 4, demands: d.demands, tuples: [...d.concurrent!], expectedCombinationIds: [1, 2], stationTs: [0, 0.5, 1] } as MemberContext;
}
export function referenceReading(v: ReturnType<typeof verifyElement>) {
  return { elementId: v.elementId, Mu: v.Mu, Nu: v.Nu, Vu: v.Vu, overallStatus: v.overallStatus,
    flexure: { AsReq: v.flexure.AsReq, AsProv: v.flexure.AsProv, phiMn: v.flexure.phiMn, ratio: v.flexure.ratio },
    shear: { ratio: v.shear.ratio, phiVn: v.shear.phiVn } };
}
export function completeReferenceAnswers() {
  const contexts = { concrete: referenceContext(), steel: referenceContext('steel'), cfs: referenceContext('cfs') };
  const foreign = [AISC360, EC3, ACI318, EC2, AISI_S100].map(code => runOtherCode(code, [contexts[code.id === 'aisiS100' ? 'cfs' : code.family === 'steel' ? 'steel' : 'concrete']]));
  const input = { elementId: 1, elementType: 'beam' as const, b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8,
    demand: ConcurrentDemand.fromStations(referenceStations())[0]!.section('My') };
  const data = new Map([1, 2].map(id => [id, extractGoverningDemands(referenceStations(id))]));
  return JSON.parse(JSON.stringify({ foreign, direct: referenceReading(verifyElement(input)), prepared: referenceReading(prepareElementVerification(input)()),
    auto: autoVerifyFromResults(referenceRaw() as never, referenceModel(), null, undefined, data).concrete.map(referenceReading),
    ec2: ec2MemberDesign({ ...contexts.concrete, kind: 'beam', b: 0.4, h: 0.4, cover: 0.025, linkDia: 8, barDia: 16, fck: 30, fyk: 420, params: EC2_RECOMMENDED }) }));
}
