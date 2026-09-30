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
import { regulationsStore } from '../regulations.svelte';
import { bindRole } from '../../codes/roles';
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

  it('a load-affecting regulation goes through the review the regulations panel asks for', () => {
    // An office template that states its seismic code, applied to a project that states none.
    const other = 'inpres103-2018';
    const base = templateFromProject('Oficina');
    const regs = { version: 2, roles: JSON.parse(JSON.stringify(regulationsStore.roles)) as Record<string, unknown> };
    const tpl = parseTemplate(JSON.stringify({ ...base, regulations: { ...regs, roles: { ...regs.roles, seismic: { ...bindRole('seismic', other), state: 'applied', appliedAtRevision: 3 } } } }));
    expect(regulationsStore.binding('seismic').adapterId).not.toBe(other);
    const revisionsBefore = JSON.stringify(regulationsStore.revisions);
    const r = applyTemplate(tpl);
    console.log('DBG', JSON.stringify((modelStore.model.regulations as any)?.roles?.seismic), JSON.stringify(regulationsStore.binding('seismic')));
    // Staged, not applied behind the reader's back: the loads it generates must be reviewed.
    expect(r.regulationChanges.review).toEqual(['seismic']);
    expect(regulationsStore.binding('seismic')).toMatchObject({ adapterId: other, state: 'pending' });
    expect(regulationsStore.reviewRequested).toBe('seismic');
    expect(JSON.stringify(regulationsStore.revisions)).toBe(revisionsBefore);
    regulationsStore.cancelPending();
  });

  it('a template whose regulations are not regulations leaves the project’s alone', () => {
    const before = JSON.stringify(modelStore.model.regulations ?? null);
    const tpl = parseTemplate(JSON.stringify({ ...templateFromProject('x'), regulations: { roles: { wind: 42, nonsense: { adapterId: 'x' } } } }));
    applyTemplate(tpl);
    expect(JSON.stringify(modelStore.model.regulations ?? null)).toBe(before);
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
