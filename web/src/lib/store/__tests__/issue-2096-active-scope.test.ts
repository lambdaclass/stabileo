import { it, expect, afterEach } from 'vitest';
import { modelStore, resultsStore, uiStore, historyStore } from '..';
import { verificationStore } from '../verification.svelte';
import { foreignRun } from '../foreign-design';
import { runSteelCheck } from '../steel-check';
import { membersFor } from '../steel-optimise.svelte';
import { referenceContext } from '../../engine/__tests__/helpers/issue-2096-reference';

function solved() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const ctx = referenceContext('steel');
  const { id: materialId, ...material } = ctx.material;
  const { id: sectionId, ...section } = ctx.section;
  void materialId; void sectionId;
  const mat = modelStore.addMaterial(material);
  const sec = modelStore.addSection(section);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const id = modelStore.addElement(a, b, 'frame');
  modelStore.updateElementMaterial(id, mat); modelStore.updateElementSection(id, sec);
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  for (const name of ['C1', 'C2']) {
    const lc = modelStore.addLoadCase(name, 'D');
    modelStore.addNodalLoad3D(b, 0, 0, name === 'C1' ? -10 : -1000, 0, 0, 0, lc);
    modelStore.addCombination(name, [{ caseId: lc, factor: 1 }]);
  }
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return { id, r, missing: modelStore.combinations[1]!.id };
}
afterEach(() => { uiStore.analysisMode = '3d'; });
for (const code of ['ec3', 'ec3-uk', 'ec2', 'ec2-uk'] as const) it(`known wrong result: #2096 ${code} preserves active combinations missing from the store`, () => {
  const { r, missing } = solved();
  r.perCombo.delete(missing);
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
  expect(() => foreignRun(code)).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
    expect.objectContaining({ code: 'missing-combination', comboId: missing }),
  ]) }));
});
for (const entry of ['check', 'optimise'] as const) it(`known wrong result: #2096 steel ${entry} refuses missing envelope member with complete combination records`, () => {
  const { id, r } = solved();
  resultsStore.setResults3D({ ...r.perCombo.values().next().value!, elementForces: [] });
  resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
  expect(() => entry === 'check' ? runSteelCheck() : membersFor([id])).toThrow(expect.objectContaining({ code: 'incomplete-concurrent-demand', diagnostics: expect.arrayContaining([
    expect.objectContaining({ code: 'missing-member', elementId: id }),
  ]) }));
});
