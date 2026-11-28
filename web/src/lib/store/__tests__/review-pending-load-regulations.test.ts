import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '..';
import { bindRole, defaultRegulations, REGULATIONS_SCHEMA_VERSION, unsetBinding } from '../../codes/roles';
import { modelFeatures } from '../../provenance/model-features';
import { parseTemplate } from '../../model/office-template';
import { applyTemplate, templateFromProject } from '../office-templates';
import { deserializeProject, serializeProject } from '../file';
import { regulationsStore } from '../regulations.svelte';

beforeEach(() => {
  regulationsStore.cancelPending();
  modelStore.clear();
  modelStore.model.regulations = { version: REGULATIONS_SCHEMA_VERSION, roles: { ...defaultRegulations(), concrete: unsetBinding('concrete') } };
});

it.each(['direct', 'office template', 'reopened project'] as const)('known wrong result: #1928 a design selection preserves the load review from a %s', source => {
  const before = { ...regulationsStore.revisions };
  if (source === 'office template') {
    const template = parseTemplate(JSON.stringify({ ...templateFromProject('Mixed codes'), regulations: { roles: {
      seismic: bindRole('seismic', 'inpres103-2018'), concrete: bindRole('concrete', 'cirsoc'),
    } } }));
    expect(applyTemplate(template).regulationChanges.review).toEqual(['seismic', 'concrete']);
  } else {
    expect(regulationsStore.requestChange('seismic', 'inpres103-2018').kind).toBe('needsLoadReview');
    if (source === 'reopened project') {
      const text = serializeProject();
      modelStore.clear();
      expect(deserializeProject(text)).toBe(true);
    }
    expect(regulationsStore.requestChange('concrete', 'cirsoc')).toEqual({ kind: 'needsLoadReview', role: 'seismic', navigateTo: 'loads' });
  }
  expect(regulationsStore.applyPending('designRegulation')).toMatchObject({ kind: 'needsLoadReview' });
  expect(regulationsStore.pending).toEqual(['seismic', 'concrete']);
  expect(regulationsStore.revisions).toEqual(before);
  expect(regulationsStore.applyPending('loadRegulation').requiresSolve).toBe(true);
  expect(regulationsStore.pending).toEqual([]);
  expect(regulationsStore.binding('seismic').appliedAtRevision).toBe(regulationsStore.revisions.regulationConfig);
});

it.each(['2d', '3d'] as const)('known wrong result: #1928 a deferred change cancels without losing its previous design or load basis in %s', mode => {
  uiStore.analysisMode = mode;
  const was = JSON.stringify(regulationsStore.roles);
  regulationsStore.requestChange('seismic', 'inpres103-2018');
  regulationsStore.requestChange('concrete', 'cirsoc');
  regulationsStore.cancelPending();
  expect(JSON.stringify(regulationsStore.roles)).toBe(was);
  const lone = regulationsStore.requestChange('concrete', 'cirsoc');
  expect(lone).toMatchObject({ kind: 'applied', consequence: { requiresSolve: false } });
  expect(regulationsStore.pending).toEqual([]);
});

it('identifies applied load roles stamped ahead of the saved regulation revision', () => {
  const check = (role: string, state: string, appliedAtRevision: number) => modelFeatures({
    revisions: { regulationConfig: 1 },
    regulations: { roles: { [role]: { state, appliedAtRevision } } },
  }).has('unreviewedLoadRoleStamp');
  expect(check('seismic', 'applied', 2)).toBe(true);
  expect(check('seismic', 'applied', 1)).toBe(false);
  expect(check('seismic', 'applied', 0)).toBe(false);
  expect(check('seismic', 'pending', 2)).toBe(false);
  expect(check('concrete', 'applied', 2)).toBe(false);
});
