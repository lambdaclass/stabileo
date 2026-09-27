/**
 * Office templates: taken from a project, applied to another as one undo step, adding what is
 * missing by name and remapping combinations onto the cases found; project data travels with the
 * project and its code.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { templateFromProject, applyTemplate } from '../office-templates';
import { parseTemplate, TemplateError } from '../../model/office-template';
import { cleanProjectInfo, currentRevision } from '../../model/project-info';
import { modelToCode, codeToModel } from '../../model/code/format';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('office templates', () => {
  it('adds what the project lacks, keeps what it has, remaps the combinations, in one undo', () => {
    modelStore.addMaterial({ name: 'H-30', e: 28000, nu: 0.2, rho: 25, fy: 30 } as never);
    const d = modelStore.addLoadCase('Permanente', 'D');
    const l = modelStore.addLoadCase('Sobrecarga', 'L');
    modelStore.addCombination('1,2D+1,6L', [{ caseId: d, factor: 1.2 }, { caseId: l, factor: 1.6 }]);
    modelStore.setDeflectionLimits({ rules: [
      { id: 1, scope: { kind: 'memberKind', value: 'beam' }, n: 480, direction: 'resultant' },
      { id: 2, scope: { kind: 'members', ids: [7] }, n: 250, direction: 'resultant' },
    ] });
    const tpl = parseTemplate(JSON.stringify(templateFromProject('Oficina')));
    expect(tpl.deflectionLimits!.rules).toHaveLength(1);

    modelStore.clear();
    modelStore.addMaterial({ name: 'H-30', e: 99, nu: 0.2, rho: 25 } as never);
    const w = modelStore.addLoadCase('Viento', 'W');
    const pSame = modelStore.addLoadCase('Permanente', 'D');
    const undoBefore = historyStore.undoCount;
    const plan = applyTemplate(tpl);
    // Every template material is already here by name (the default one and H-30): none added.
    expect(plan.materials).toEqual([]);
    expect([...modelStore.materials.values()].find((m) => m.name === 'H-30')!.e).toBe(99);
    const names = modelStore.loadCases.map((c) => c.name);
    expect(names.filter((n) => n === 'Permanente')).toHaveLength(1);
    expect(names).toContain('Sobrecarga');
    expect(names).toContain('Viento');
    const combo = modelStore.combinations.find((c) => c.name === '1,2D+1,6L')!;
    expect(combo.factors.find((f) => f.factor === 1.2)!.caseId).toBe(pSame);
    const sob = modelStore.loadCases.find((c) => c.name === 'Sobrecarga')!.id;
    expect(combo.factors.find((f) => f.factor === 1.6)!.caseId).toBe(sob);
    expect(modelStore.deflectionLimits!.rules[0]!.n).toBe(480);
    void w;
    expect(historyStore.undoCount).toBe(undoBefore + 1);
  });

  it('refuses a file that is not a template', () => {
    expect(() => parseTemplate('{"a":1}')).toThrow(TemplateError);
    expect(() => parseTemplate('nope')).toThrow(TemplateError);
  });
});

describe('project data', () => {
  it('cleans what is blank, knows its current revision, and travels in the model code', () => {
    const info = cleanProjectInfo({ client: '  ', job: 'Edificio Norte', revisions: [{ code: 'A', date: '2026-09-01' }, { code: 'B', date: '2026-09-20', note: 'Losas' }], designer: { name: 'B. C.', date: '2026-09-20' }, checker: { name: '' } })!;
    expect(info.client).toBeUndefined();
    expect(info.checker).toBeUndefined();
    expect(currentRevision(info)!.code).toBe('B');
    expect(cleanProjectInfo({ client: '' })).toBeUndefined();
    modelStore.setProjectInfo(info);
    const back = codeToModel(modelToCode(modelStore.snapshot() as never));
    expect(back.errors).toEqual([]);
    expect((back.snapshot as { projectInfo?: unknown }).projectInfo).toEqual(info);
  });
});
