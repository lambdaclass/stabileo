import metadata from 'virtual:result-change-metadata';
import { RESULT_CHANGES } from '../full-registry';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateRegistry, githubSlug, changelogUrl, conditionGroups } from '../registry';
import { FEATURE_IDS } from '../model-features';

const repo = resolve(__dirname, '../../../../..');

describe('result-change registry', () => {
  it('derives synchronous applicability metadata from the complete registry without notice text', () => {
    expect(metadata).toEqual({
      schema: RESULT_CHANGES.schema,
      currentResultsVersion: RESULT_CHANGES.currentResultsVersion,
      changes: RESULT_CHANGES.changes.map(({ title, explanation, ...change }) => change),
    });
    expect(JSON.stringify(metadata)).not.toContain('explanation');
    expect(JSON.stringify(metadata)).not.toContain('title');
  });

  it('is well formed: ids, versions, three languages, known features', () => {
    expect(validateRegistry(RESULT_CHANGES, new Set(FEATURE_IDS))).toEqual([]);
  });

  it('links every entry to a heading that exists in the named file', () => {
    for (const c of RESULT_CHANGES.changes) {
      const text = readFileSync(resolve(repo, c.changelog.file), 'utf8');
      const headings = text.split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#+ /, '').trim());
      expect(headings, `${c.id}: "${c.changelog.heading}" in ${c.changelog.file}`).toContain(c.changelog.heading);
      expect(changelogUrl(c)).toMatch(/^https:\/\/github\.com\/lambdaclass\/stabileo\/blob\/main\//);
    }
  });

  it('seeds every behaviour change of the October 2026 safety wave', () => {
    const ids = new Set(RESULT_CHANGES.changes.map((c) => c.id));
    for (const id of [
      'dead-load-default-2.52', 'cirsoc301-tension-needs-connection', 'cirsoc301-ltb-top-flange',
      'ec3-aisc-ltb-and-slender', 'constraints-on-supported-slaves', 'inclined-supports-every-analysis',
      'cirsoc201-strain-compatibility', 'aci318-strain-and-axial', 'buckling-axial-from-elongation',
      'weld-groups-end-loaded', 'multiple-supports-one-node', 'cirsoc-combinations-and-loads',
    ]) expect(ids.has(id), id).toBe(true);
  });

  it('refuses an entry naming an unknown feature or a version beyond the current one', () => {
    const bad = {
      ...RESULT_CHANGES,
      changes: [{ ...RESULT_CHANGES.changes[0], id: 'x', resultsVersion: 99, when: { any: ['noSuchFeature'] } }],
    };
    const problems = validateRegistry(bad, new Set(FEATURE_IDS));
    expect(problems.some((p) => p.includes('noSuchFeature'))).toBe(true);
    expect(problems.some((p) => p.includes('resultsVersion 99'))).toBe(true);
  });

  it('slugs headings the way GitHub anchors them', () => {
    expect(githubSlug('CIRSOC 301 steel checks in the engine, re-checked and certified (2026-10-17)'))
      .toBe('cirsoc-301-steel-checks-in-the-engine-re-checked-and-certified-2026-10-17');
    expect(githubSlug("2D buckling and time integration use the linear path's stiffness (2026-10-17)"))
      .toBe('2d-buckling-and-time-integration-use-the-linear-paths-stiffness-2026-10-17');
  });

  it('normalises conditions to OR-groups that must all hold', () => {
    expect(conditionGroups({ any: ['a', 'b'], all: ['c'], allOf: [['d', 'e']] })).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
  });
});
