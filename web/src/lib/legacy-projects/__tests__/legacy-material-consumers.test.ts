import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver, checkSteelMembers } from '../../engine/wasm-solver';
import { checkSteelMember, missingSteelInputs } from '../../engine/verification-service';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { typologyContext } from '../../store/joint-typology';
import { hssJointChecks } from '../../store/special-connections';
import { saveEntry } from '../../store/special-elements';
import { sizeTypology } from '../../connection/typology';
import { concreteFc } from '../../model/design-data';
import { AISC360 } from '../../engine/design/other-codes/steel-codes';
import { openAndSolve, readCorpusText, readManifest } from '../legacy';

beforeAll(async () => { await initSolver(); });

async function legacySteel() {
  const entry = readManifest('v0.2.0').examples.find(e => e.example === '3d-portal-frame')!;
  await openAndSolve(readCorpusText(`v0.2.0/${entry.file}`), { solve: false });
  const material = modelStore.materials.get(1)!;
  expect(material.fu).toBeUndefined();
  return material;
}

describe('legacy material consumer audit', () => {
  it('preserves absent added fields; CIRSOC steel refuses missing Fu', async () => {
    const material = await legacySteel();
    expect(material.fc).toBeUndefined();
    expect(material.timber).toBeUndefined();
    const section = modelStore.sections.get(1)!;
    expect(missingSteelInputs(section, material)).toContain('ultimateStrength');
    expect(checkSteelMember(1, { Nc: 0, Nt: 1, MuStrong: 0, MuWeak: 0, Vu: 0, diagram: [] }, section, material, { L: 1, Lb: 0 })).toBeNull();
    const entry = readManifest('v0.2.0').examples.find(e => e.example === 'rc-beam-flexure')!;
    await openAndSolve(readCorpusText(`v0.2.0/${entry.file}`), { solve: false });
    const concrete = [...modelStore.materials.values()].find(m => m.name === 'H-25')!;
    expect(concrete.fc).toBeUndefined();
    expect(concreteFc(concrete)).toBe(concrete.fy);
  });

  it('candidate: joint typologies substitute Fu and report a designed connection without an assumption', async () => {
    const material = { ...await legacySteel() };
    modelStore.clear();
    modelStore.materials.set(1, material);
    for (const combination of [...modelStore.combinations]) modelStore.removeCombination(combination.id);
    const base = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 3), tip = modelStore.addNode(4, 0, 3);
    const column = modelStore.addElement(base, top, 'frame'), beam = modelStore.addElement(top, tip, 'frame');
    modelStore.addSupport(base, 'fixed3d');
    modelStore.addNodalLoad3D(tip, 0, 0, -1, 0, 0, 0, 1);
    const solved = modelStore.solve3D(false, false, true);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    resultsStore.setResults3D(solved);
    const ctx = typologyContext(top, [column, beam])!;
    const member = ctx.members.find(m => m.id === beam)!;
    expect(member.section!.Fu).toBe(370);
    const design = sizeTypology('shearTab', ctx, beam);
    expect(design.state).toBe('designed');
    expect(design.assumptions ?? []).toEqual([]);
    expect(design.checks.find(c => c.labelKey === 'joint.typ.check.bearing')!.capacity).toBeGreaterThan(0);
    modelStore.materials.set(1, { ...material, fu: material.fy! });
    const stated = typologyContext(top, [column, beam])!;
    expect(stated.members.find(m => m.id === beam)!.section!.Fu).toBe(material.fy!);
    const statedDesign = sizeTypology('shearTab', stated, beam);
    expect(statedDesign.checks.find(c => c.labelKey === 'joint.typ.check.bearing')!.capacity)
      .toBeLessThan(design.checks.find(c => c.labelKey === 'joint.typ.check.bearing')!.capacity);
  });

  it('candidate: tubular joints substitute Fu and return checked capacities', async () => {
    const material = { ...await legacySteel() };
    modelStore.clear();
    modelStore.materials.set(1, material);
    for (const combination of [...modelStore.combinations]) modelStore.removeCombination(combination.id);
    const chs = (D: number, t: number) => {
      const d = D - 2 * t, I = (Math.PI / 64) * (D ** 4 - d ** 4);
      return modelStore.addSection({ name: `CHS ${D} ${t}`, a: (Math.PI / 4) * (D * D - d * d), iy: I, iz: I, j: 2 * I, h: D, b: D, t, tw: t, tf: t, shape: 'CHS' });
    };
    const chord = chs(0.1683, 0.008), branch = chs(0.0603, 0.004);
    const center = modelStore.addNode(0, 0, 0);
    const ends = [[-2, 0, 0], [2, 0, 0], [0, 0, 2]];
    for (const [index, end] of ends.entries()) {
      const node = modelStore.addNode(...end as [number, number, number]);
      const element = modelStore.addElement(center, node, 'frame');
      modelStore.updateElementSection(element, index < 2 ? chord : branch);
      modelStore.addSupport(node, 'fixed3d');
    }
    modelStore.addNodalLoad3D(center, 0, 0, -1, 0, 0, 0, 1);
    const solved = modelStore.solve3D(false, false, true);
    if (!solved || typeof solved === 'string') throw new Error(String(solved));
    resultsStore.setResults3D(solved);
    saveEntry('hss', { id: 'missing-fu', nodeId: center });
    const checked = hssJointChecks()[0]!;
    expect(checked.input!.chord.Fu).toBe(370);
    expect(checked.input!.branches[0]!.Fu).toBe(370);
    expect(checked.status).toBe('ok');
    expect(checked.rows.some(row => row.capacity != null && row.capacity > 0)).toBe(true);
    modelStore.materials.set(1, { ...material, fu: material.fy });
    const stated = hssJointChecks()[0]!;
    expect(stated.input!.chord.Fu).toBe(material.fy);
    expect(stated.rows[0].status).toBe('unsupported');
  });

  it('candidate: the AISC checker reports tensile capacity without Fu or an unevaluated rupture check', async () => {
    const material = await legacySteel();
    const element = [...modelStore.elements.values()][0]!;
    const section = modelStore.sections.get(element.sectionId)!;
    const prepared = AISC360.member({ elementId: element.id, element, section, material, kind: 'beam', L: 1, Lb: 0, demands: [] });
    expect('skip' in prepared).toBe(false);
    if ('skip' in prepared) throw new Error(prepared.skip);
    expect(prepared.data.fu).toBeUndefined();
    const result = checkSteelMembers({ members: [prepared.data], forces: [{ elementId: element.id, n: 1, my: 0, mz: 0, vStrong: 0, vWeak: 0 }] })[0];
    expect(result.phiPnTension).toBeGreaterThan(0);
    expect(result.unevaluated).toEqual([]);
    expect(result.unityRatio).toBeLessThan(1);
    const forces = [{ elementId: element.id, n: result.phiPnTension * 0.75, my: 0, mz: 0, vStrong: 0, vWeak: 0 }];
    const savedFu = JSON.parse(readCorpusText('v0.4.0/truss.ded')).snapshot.materials[0][1].fu;
    expect(savedFu).toBeGreaterThan(0);
    const member = { ...prepared.data, an: Number(prepared.data.ag) / 2 };
    const absent = checkSteelMembers({ members: [member], forces })[0];
    const stated = checkSteelMembers({ members: [{ ...member, fu: savedFu * 1e6 }], forces })[0];
    expect(AISC360.read(absent).pass).toBe(true);
    expect(AISC360.read(absent).unevaluated).toEqual([]);
    expect(AISC360.read(stated).pass).toBe(false);
  });
});
