/**
 * A steel member of variable section checked station by station: a welded I from 600 to 300 mm
 * with 100 kN·m at the deep end and 60 kN·m at the shallow one. Each station is rated against the
 * section there; the shallow end governs, and its ratio is the one a prismatic 300 mm member
 * gives under 60 kN·m with the same lengths and Cb = 1.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { checkSteelMember, checkVariableSteelMember, steelGoverningRatio, type SteelMemberDemand } from '../verification-service';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';

const I = (h: number) => {
  const params = { h, b: 0.2, tw: 0.008, tf: 0.012 };
  return modelStore.addSection(toSectionFields({ kind: 'built', name: `I${h}`, shapeType: 'I-custom', params, props: computeSectionProperties('I-custom', params)!, rotationDeg: 0 }, 0) as never);
};
let sections = new Map<number, unknown>(), deepId = 0, shallowId = 0;
beforeEach(() => { modelStore.clear(); deepId = I(0.6); shallowId = I(0.3); sections = new Map(modelStore.sections); });
const material = { fy: 240, fu: 370, e: 200000 } as never;
const st = (t: number, my: number) => ({ t, x: 6 * t, n: 0, vy: 0, vz: 20, my, mz: 0, torsion: 0 });
const stations = { elementId: 1, length: 6, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'U', stations: [st(0, -100), st(1, -60)] }] };

describe('a steel member of variable section', () => {
  it('rates each station against the section there, and names the governing one', () => {
    const v = checkVariableSteelMember(1, { sectionId: deepId, variableSection: { sectionJ: shallowId } }, sections as never, material, stations, { L: 6, Lb: 6 })!;
    expect(v).not.toBeNull();
    const demand = (M: number): SteelMemberDemand => ({ Nc: 0, Nt: 0, MuStrong: M, MuWeak: 0, Vu: 20, VuStrong: 20, VuWeak: 0, diagram: [] });
    const shallow = checkSteelMember(1, demand(60), sections.get(shallowId)! as never, material, { L: 6, Lb: 6 })!;
    const deep = checkSteelMember(1, demand(100), sections.get(deepId)! as never, material, { L: 6, Lb: 6 })!;
    const worst = Math.max(steelGoverningRatio(shallow), steelGoverningRatio(deep));
    expect(steelGoverningRatio(v)).toBeCloseTo(worst, 9);
    expect(v.steps[0]).toContain('sección variable');
  });
});
