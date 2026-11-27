import { assignMemberProfile } from '../assign-member-profile';
import { PROFILE_FAMILIES } from '../../data/steel-profiles';
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { buildProjectFile, deserializeProject } from '../../store/file';
import { commercialDefaultFor } from '../../data/commercial-default';
import {
  readCustomMaterial, customMaterialForm, saveCustomMaterial, saveCatalogueMaterial, type CustomMaterialForm,
} from '../custom-material';
import { getMaterialPresets } from '../../data/material-presets';

const form = (over: Partial<CustomMaterialForm> = {}): CustomMaterialForm => ({
  name: 'Madera dura', e: 12000, nu: '0,3', rho: 9, fy: null, alpha: '', ...over,
});

describe('reading the form', () => {
  it('turns the fields into a hand-entered material, in SI', () => {
    expect(readCustomMaterial(form({ name: '  Pino  ', fy: 14, alpha: '5,5' }))).toEqual({
      ok: true,
      choice: { kind: 'custom', name: 'Pino', e: 12000, nu: 0.3, rho: 9, fy: 14, alpha: 5.5e-6 },
    });
  });

  it.each([-1001, -1000, 1000, 1001, NaN, Infinity, -Infinity])('rejects out-of-range coefficient %s on entry and reopening', micro => {
    const original = { alpha: micro * 1e-6 };
    for (const stored of [undefined, original]) {
      expect(readCustomMaterial(form({ alpha: String(micro) }), stored)).toEqual({ ok: false, reasonKey: 'materials.alphaInvalid' });
    }
  });

  it('leaves fy and α out when they are blank', () => {
    const r = readCustomMaterial(form());
    expect(r.ok && r.choice).toEqual({ kind: 'custom', name: 'Madera dura', e: 12000, nu: 0.3, rho: 9 });
  });

  it.each([
    [{ name: '   ' }, 'material.custom.needName'],
    [{ e: null }, 'material.custom.needNumbers'],
    [{ nu: '' }, 'material.custom.needNumbers'],
    [{ nu: 'abc' }, 'material.custom.needNumbers'],
    [{ rho: null }, 'material.custom.needNumbers'],
    [{ e: 0 }, 'material.custom.badE'],
    [{ e: -200000 }, 'material.custom.badE'],
    [{ nu: '0.5' }, 'material.custom.badNu'],
    [{ nu: '-1' }, 'material.custom.badNu'],
    [{ nu: '3' }, 'material.custom.badNu'],
    [{ rho: -78.5 }, 'material.custom.badRho'],
    [{ fy: 0 }, 'material.custom.badFy'],
    [{ fy: -250 }, 'material.custom.badFy'],
    [{ alpha: 'NaN' }, 'materials.alphaInvalid'],
    [{ alpha: '-Infinity' }, 'materials.alphaInvalid'],
    [{ alpha: '1e999' }, 'materials.alphaInvalid'],
    [{ alpha: 'doce' }, 'materials.alphaInvalid'],
  ] as const)('refuses %o with %s', (over, reasonKey) => {
    expect(readCustomMaterial(form(over))).toEqual({ ok: false, reasonKey });
  });

  it('accepts the bounds that are physical: ρ = 0 and ν just under 0.5', () => {
    expect(readCustomMaterial(form({ rho: 0, nu: '0.499' })).ok).toBe(true);
  });

  it.each([-999.999, -5, 0, -12, 100, 101, 999.999])('accepts a finite signed coefficient of %s µm/(m·°C)', (a) => {
    const r = readCustomMaterial(form({ alpha: String(a) }));
    expect(r.ok && r.choice.alpha).toBe(a * 1e-6);
  });

  it.each([12.34567e-6, -12.34567e-6, 0, 1.2345678901234567e-4])('preserves untouched coefficient %s exactly on rename', (alpha) => {
    const original = { name: 'Old', e: 30000, nu: 0.2, rho: 25, alpha };
    const draft = customMaterialForm(original);
    draft.name = 'New';
    const r = readCustomMaterial(draft, original);
    expect(r.ok && r.choice.alpha).toBe(alpha);
  });

  it('opens a stored material as it was typed, α back in 10⁻⁶/°C', () => {
    expect(customMaterialForm({ name: 'H', e: 30000, nu: 0.2, rho: 24, fy: 25, alpha: 10e-6 }))
      .toEqual({ name: 'H', e: 30000, nu: '0.2', rho: 24, fy: 25, alpha: '10' });
    expect(customMaterialForm({ name: 'S', e: 200000, nu: 0.3, rho: 78.5 }))
      .toEqual({ name: 'S', e: 200000, nu: '0.3', rho: 78.5, fy: null, alpha: '' });
  });
});

function cantilever(materialId: number) {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
  const e = modelStore.addElement(a, b);
  const s = modelStore.addSection({ name: 'R', a: 0.01, iz: 1e-4, iy: 1e-4 });
  modelStore.updateElementSection(e, s);
  modelStore.updateElementMaterial(e, materialId);
  modelStore.addSupport(a, 'fixed');
  modelStore.addNodalLoad(b, 0, -10);
  return { tip: b, element: e };
}

function tipDeflection(tip: number): number {
  const r = modelStore.solve();
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r.displacements.find((d) => d.nodeId === tip)!.uz;
}

describe('saving a hand-entered material', () => {
  beforeEach(() => {
    uiStore.analysisMode = '2d';
    modelStore.clear();
    historyStore.clear();
  });

  const choice = () => {
    const r = readCustomMaterial(form({ e: 100000, nu: '0.25', rho: 20, fy: 300, alpha: '11' }));
    if (!r.ok) throw new Error(r.reasonKey);
    return r.choice;
  };

  it.each([0, -5])('reopens the coefficient %s entered in the Basic form', micro => {
    const r = readCustomMaterial(form({ alpha: String(micro) }));
    if (!r.ok) throw new Error(r.reasonKey);
    const id = saveCustomMaterial(r.choice);
    const file = JSON.stringify(buildProjectFile());
    modelStore.clear();
    expect(deserializeProject(file)).toBe(true);
    expect(Number(customMaterialForm(modelStore.materials.get(id)!).alpha)).toBeCloseTo(micro, 12);
    expect(modelStore.materials.get(id)?.alpha).toBe(micro * 1e-6);
  });

  it.each(['e', 'rho', 'fy'] as const)('rejects nonfinite %s', field => {
    for (const v of [Infinity, -Infinity, NaN]) expect(readCustomMaterial(form({ [field]: v })).ok).toBe(false);
  });

  it('preserves mechanical strengths when only alpha changes', () => {
    const id = saveCustomMaterial(choice());
    const timber = { fb: 1, ft: 2, fc: 3, fcPerp: 4, fv: 5, e: 100000, emin: 6, kind: 'sawn' as const };
    modelStore.updateMaterial(id, { timber, fu: 410 });
    saveCustomMaterial({ ...choice(), alpha: 0 }, id);
    expect(modelStore.materials.get(id)).toMatchObject({ alpha: 0, timber, fu: 410 });
  });

  it('keeps a reopened legacy hand-entered material when assigning an IPN profile', () => {
    const id = modelStore.addMaterial({ name: 'Measured steel', e: 170000, nu: 0.27, rho: 76, fy: 310 });
    const { element } = cantilever(id);
    const original = { ...modelStore.materials.get(id)! };
    const file = JSON.stringify(buildProjectFile());
    modelStore.clear();
    expect(deserializeProject(file)).toBe(true);
    assignMemberProfile(element, PROFILE_FAMILIES.IPN[0]!, 'AR');
    expect(modelStore.materials.get(modelStore.elements.get(element)!.materialId)).toEqual(original);
  });

  it('preserves grade and timber properties when only the name changes', () => {
    const preset = getMaterialPresets().find(p => p.category === 'madera' && p.gradeId)!;
    const id = saveCatalogueMaterial(preset);
    const timber = { fb: 1, ft: 2, fc: 3, fcPerp: 4, fv: 5, e: preset.e, emin: 6, kind: 'sawn' as const };
    modelStore.updateMaterial(id, { timber });
    const original = modelStore.materials.get(id)!;
    const r = readCustomMaterial({ ...customMaterialForm(original), name: 'Renamed' }, original);
    if (!r.ok) throw new Error(r.reasonKey);
    saveCustomMaterial(r.choice, id);
    expect(modelStore.materials.get(id)).toMatchObject({ name: 'Renamed', gradeId: preset.gradeId, timber });
  });

  it('adds it to the model with every field, in one undo step', () => {
    const before = modelStore.materials.size;
    const id = saveCustomMaterial(choice());
    expect(modelStore.materials.get(id)).toEqual({
      id, name: 'Madera dura', e: 100000, nu: 0.25, rho: 20, fy: 300, alpha: 11e-6, userDefined: true,
    });
    historyStore.undo();
    expect(modelStore.materials.has(id)).toBe(false);
    expect(modelStore.materials.size).toBe(before);
  });

  it('edits in place: drops the catalogue grade the numbers no longer match, keeps f\'c, and clears a blank fy and α', () => {
    const id = modelStore.addMaterial({ name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 370, fc: 30, alpha: 12e-6, gradeId: 'ar-f24' });
    const r = readCustomMaterial(form({ name: 'F-24 reducido', e: 180000, nu: '0.3', rho: 78.5 }));
    if (!r.ok) throw new Error(r.reasonKey);
    expect(saveCustomMaterial(r.choice, id)).toBe(id);
    const m = modelStore.materials.get(id)!;
    expect(m).toMatchObject({ name: 'F-24 reducido', e: 180000, nu: 0.3, rho: 78.5, fc: 30, userDefined: true });
    for (const key of ['fy', 'fu', 'alpha', 'gradeId'] as const) expect(m[key], key).toBeUndefined();
    historyStore.undo();
    expect(modelStore.materials.get(id)).toMatchObject({ name: 'F-24', e: 200000, fy: 235, fu: 370, alpha: 12e-6, gradeId: 'ar-f24' });
  });

  it('a catalogue grade put in place of a hand-entered material keeps none of its α or its mark', () => {
    const id = saveCustomMaterial(choice());
    const steel = getMaterialPresets().find((p) => p.gradeId && p.fy !== undefined)!;
    modelStore.updateMaterial(id, { maxAggregateSizeMm: 42, spacingMarginMm: 5, shotcrete: true });
    expect(saveCatalogueMaterial(steel, id)).toBe(id);
    const m = modelStore.materials.get(id)!;
    expect(m).toMatchObject({ name: steel.name, e: steel.e, nu: steel.nu, rho: steel.rho, fy: steel.fy, gradeId: steel.gradeId });
    expect(m.alpha).toBeUndefined();
    expect(m.userDefined).toBeUndefined();
    for (const key of ['maxAggregateSizeMm', 'spacingMarginMm', 'shotcrete'] as const) expect(m[key]).toBeUndefined();
    historyStore.undo();
    expect(modelStore.materials.get(id)).toMatchObject({ name: 'Madera dura', alpha: 11e-6, userDefined: true });
    const added = saveCatalogueMaterial(steel);
    expect(added).not.toBe(id);
    expect(modelStore.materials.get(added)?.gradeId).toBe(steel.gradeId);
  });

  it('is never swapped for the steel a catalogue profile is rolled in', () => {
    const id = saveCustomMaterial(choice());
    expect(commercialDefaultFor('IPN', modelStore.materials.get(id), 'AR')).toBeNull();
  });

  it('adds a new one when the material to edit is gone', () => {
    const id = saveCustomMaterial(choice(), 9999);
    expect(id).not.toBe(9999);
    expect(modelStore.materials.get(id)?.name).toBe('Madera dura');
  });

  it('solves with its E: the cantilever tip moves PL³/3EI, and twice as much at half the E', () => {
    const id = saveCustomMaterial(choice());
    const { tip } = cantilever(id);
    const exact = -(10 * 4 ** 3) / (3 * 100000e3 * 1e-4);
    expect(tipDeflection(tip)).toBeCloseTo(exact, 6);
    const half = readCustomMaterial(form({ e: 50000, nu: '0.25', rho: 20 }));
    if (!half.ok) throw new Error(half.reasonKey);
    saveCustomMaterial(half.choice, id);
    expect(tipDeflection(tip)).toBeCloseTo(2 * exact, 6);
  });

  it('survives saving and opening the project', () => {
    const id = saveCustomMaterial(choice());
    const { element } = cantilever(id);
    const text = JSON.stringify(buildProjectFile());
    modelStore.clear();
    expect(deserializeProject(text)).toBe(true);
    const back = modelStore.materials.get(modelStore.elements.get(element)!.materialId);
    expect(back).toMatchObject({ name: 'Madera dura', e: 100000, nu: 0.25, rho: 20, fy: 300, alpha: 11e-6, userDefined: true });
    expect(commercialDefaultFor('IPN', back, 'AR')).toBeNull();
    const profile = PROFILE_FAMILIES.IPN[0]!;
    assignMemberProfile(element, profile, 'AR');
    const assigned = modelStore.elements.get(element)!;
    expect(modelStore.sections.get(assigned.sectionId)?.name).toBe(profile.name);
    expect(assigned.materialId).toBe(id);
  });
});
