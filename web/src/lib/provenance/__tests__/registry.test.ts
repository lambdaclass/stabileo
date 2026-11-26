import metadata from 'virtual:result-change-metadata';
import { RESULT_CHANGES } from '../full-registry';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REGISTRY_LOCALES, validateRegistry, githubSlug, changelogUrl, conditionGroups, type ResultChangeRegistry } from '../registry';
import { assessProject } from '../applicability';
import { FEATURE_IDS, type FeatureSnapshot } from '../model-features';
import { unknownStamp } from '../solve-stamp';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';

const repo = resolve(__dirname, '../../../../..');

const plateChanges = [
  ['perforated-plate-grid', ['unifiedPlateMeshes']],
  ['plates-coarse-as-modelled-meshed', ['coarseShellsPro']],
  ['plates-conforming-batch-mesh', ['coarseShellsPro', 'unifiedPlateMeshes']],
] as const;
const plateChangeIds = new Set<string>(plateChanges.flatMap(([id]) => [id, `${id}-withdrawn`]));

const plateSurface: FeatureSnapshot = {
  groups: [[1, { data: { surface: { loops: [4] } }, members: { nodes: [1, 2, 3, 4] } }]],
};
const plateShell: FeatureSnapshot = { quads: [[1, { nodes: [1, 2, 3, 4] }]] };

describe('result-change registry', () => {
  it('keeps only the current version eager regardless of registry history', () => {
    expect(metadata).toEqual({
      currentResultsVersion: RESULT_CHANGES.currentResultsVersion,
    });
    expect(JSON.stringify(metadata)).not.toContain('explanation');
    expect(JSON.stringify(metadata)).not.toContain('title');
  });

  const source = (): ResultChangeRegistry => readRegistry();

  it('decodes the complete source registry except the test-only quantities', () => {
    const registry = source();
    expect(registry.changes.some((c) => c.quantities)).toBe(true);
    expect(RESULT_CHANGES.changes.some((c) => 'quantities' in c)).toBe(false);
    expect(RESULT_CHANGES).toEqual({ ...registry, changes: registry.changes.map(({ quantities: _, ...c }) => c) });
  });

  it('is well formed: ids, versions, required languages, known features, quantities', () => {
    expect(validateRegistry(RESULT_CHANGES, new Set(FEATURE_IDS))).toEqual([]);
    expect(validateRegistry(source(), new Set(FEATURE_IDS))).toEqual([]);
  });

  it.each(plateChanges)('validates the retired features of %s only on its historical entry', (id, features) => {
    const registry = source();
    const entry = registry.changes.find((change) => change.id === id);
    expect(entry?.when).toEqual({ any: [...features] });
    const known = new Set<string>(FEATURE_IDS);
    for (const feature of features) expect(known.has(feature)).toBe(false);

    expect(validateRegistry(registry, known).filter((problem) => problem.startsWith(`change ${id}:`))).toEqual([]);
    expect(registry.changes.find((change) => change.id === `${id}-withdrawn`)?.quantities).toBeUndefined();
    const unrelated = { ...entry!, id: `${id}-unrelated` };
    const withUnrelated = { ...registry, changes: [...registry.changes, unrelated] };
    expect(validateRegistry(withUnrelated, known).filter((problem) => problem.startsWith(`change ${unrelated.id}:`)))
      .toEqual(features.map((feature) => `change ${unrelated.id}: unknown feature "${feature}"`));
  });

  it.each([
    { mode: 'pro', model: plateSurface, affected: ['perforated-plate-grid', 'plates-conforming-batch-mesh'] },
    { mode: 'pro', model: plateShell, affected: ['plates-coarse-as-modelled-meshed', 'plates-conforming-batch-mesh'] },
    { mode: 'pro', model: { ...plateSurface, ...plateShell }, affected: plateChanges.map(([id]) => id) },
    { mode: 'pro', model: {}, affected: [] },
    { mode: '2d', model: { ...plateSurface, ...plateShell }, affected: [] },
    { mode: '3d', model: { ...plateSurface, ...plateShell }, affected: [] },
  ])('shows the plate withdrawals for $mode with affected entries $affected', ({ mode, model, affected }) => {
    const withdrawals = RESULT_CHANGES.changes.filter(({ id }) => plateChangeIds.has(id) && id.endsWith('-withdrawn'));
    expect(withdrawals).toHaveLength(plateChanges.length);
    const version = Math.min(...withdrawals.map(({ resultsVersion }) => resultsVersion));
    expect(new Set(withdrawals.map(({ resultsVersion }) => resultsVersion))).toEqual(new Set([version]));

    const notices = (resultsVersion: number) => assessProject(model, { ...unknownStamp(), resultsVersion, analyses: ['linear'] }, mode)
      .changes.map(({ id }) => id).filter((id) => plateChangeIds.has(id)).sort();
    const expected = affected.map((id) => `${id}-withdrawn`).sort();
    expect(notices(0)).toEqual(expected);
    expect(notices(version - 1)).toEqual(expected);
    expect(notices(version)).toEqual([]);
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
    const nextVersion = RESULT_CHANGES.currentResultsVersion + 1;
    const bad = {
      ...RESULT_CHANGES,
      changes: [{ ...RESULT_CHANGES.changes[0], id: 'x', resultsVersion: nextVersion, when: { any: ['noSuchFeature'] } }],
    };
    const problems = validateRegistry(bad, new Set(FEATURE_IDS));
    expect(problems.some((p) => p.includes('noSuchFeature'))).toBe(true);
    expect(problems).toContain(`change x: resultsVersion ${nextVersion} outside 1..${RESULT_CHANGES.currentResultsVersion}`);
  });

  it.each(REGISTRY_LOCALES)('refuses an entry without its %s title or explanation', (locale) => {
    const entry = RESULT_CHANGES.changes[0];
    const title = { ...entry.title, [locale]: ' ' };
    const explanation: Partial<typeof entry.explanation> = { ...entry.explanation };
    delete explanation[locale];
    const bad = { ...RESULT_CHANGES, changes: [{ ...entry, title, explanation } as typeof entry] };
    expect(validateRegistry(bad, new Set(FEATURE_IDS))).toEqual([`change ${entry.id}: missing title.${locale}`, `change ${entry.id}: missing explanation.${locale}`]);
  });

  it('takes an examples-scoped entry only with the example ids it changed, and no when or quantities', () => {
    const entry = RESULT_CHANGES.changes.find((c) => c.scope === 'examples')!;
    expect(entry.examples).toEqual(['3d-cantilever-load']);
    const check = (over: Record<string, unknown>) => validateRegistry({ ...RESULT_CHANGES, changes: [{ ...entry, resultsVersion: RESULT_CHANGES.currentResultsVersion, ...over } as typeof entry] }, new Set(FEATURE_IDS));
    expect(check({})).toEqual([]);
    for (const examples of [undefined, [], [''], [7]]) {
      expect(check({ examples }), JSON.stringify(examples)).toContain(`change ${entry.id}: an examples-scoped entry must list the example ids it changed`);
    }
    expect(check({ when: { any: ['members'] } })).toContain(`change ${entry.id}: an examples-scoped entry concerns no saved model and takes no when`);
    expect(check({ quantities: ['*'] })).toContain(`change ${entry.id}: an examples-scoped entry explains no saved result and takes no quantities`);
    expect(check({ scope: 'everything' })).toContain(`change ${entry.id}: unknown scope "everything"`);
    const engine = RESULT_CHANGES.changes.find((c) => c.scope === undefined)!;
    const checkEngine = (over: Record<string, unknown>) => validateRegistry({ ...RESULT_CHANGES, changes: [{ ...engine, resultsVersion: RESULT_CHANGES.currentResultsVersion, ...over } as typeof engine] }, new Set(FEATURE_IDS));
    expect(checkEngine({ when: undefined })).toContain(`change ${engine.id}: missing when`);
    expect(checkEngine({ examples: ['x'] })).toContain(`change ${engine.id}: examples are listed only with scope "examples"`);
  });

  it('refuses a malformed list of the quantities a change moves', () => {
    const entry = { ...RESULT_CHANGES.changes.find((c) => c.scope === undefined)!, resultsVersion: RESULT_CHANGES.currentResultsVersion };
    for (const quantities of [[], [''], ['reactions[].fx'], ['a.b.c'], [7]]) {
      const bad = { ...RESULT_CHANGES, changes: [{ ...entry, quantities: quantities as string[] }] };
      expect(validateRegistry(bad, new Set(FEATURE_IDS)), JSON.stringify(quantities)).toContain(`change ${entry.id}: quantities must be a non-empty list of "*", "solve.ok", a collection or collection.field`);
    }
    const good = { ...RESULT_CHANGES, changes: [{ ...entry, quantities: ['*', 'solve.ok', 'reactions', 'quadStresses.sigmaXx'] }] };
    expect(validateRegistry(good, new Set(FEATURE_IDS))).toEqual([]);
  });

  it('accepts a scoped numerical quantity only with complete response fingerprints', () => {
    const entry = { ...RESULT_CHANGES.changes[0], resultsVersion: RESULT_CHANGES.currentResultsVersion };
    const scope = { quantity: 'displacements.rz', before: 'a'.repeat(64), after: 'b'.repeat(64) };
    const check = (q: unknown) => validateRegistry({ ...RESULT_CHANGES, changes: [{ ...entry, quantities: [q] } as typeof entry] }, new Set(FEATURE_IDS));
    expect(check(scope)).toEqual([]);
    for (const q of [null, {}, { ...scope, before: '' }, { ...scope, after: 'bad' },
      { ...scope, quantity: undefined }, { ...scope, quantity: null }, { ...scope, quantity: true },
      { ...scope, quantity: '*' }, { ...scope, quantity: 'solve.ok' }, { ...scope, quantity: 'a.b.c' }]) {
      expect(check(q).some((p) => p.includes('quantities must be')), JSON.stringify(q)).toBe(true);
    }
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

it('rejects missing or malformed PR metadata before a consumer reads includes', () => {
  const entry = { ...RESULT_CHANGES.changes[0], resultsVersion: RESULT_CHANGES.currentResultsVersion };
  for (const prs of [undefined, null, '2095', [0], [-1], [1.5], ['2095']]) {
    expect(validateRegistry({ ...RESULT_CHANGES, changes: [{ ...entry, prs } as typeof entry] }, new Set(FEATURE_IDS))).toContain(`change ${entry.id}: prs must be a list of positive integer issue or PR numbers`);
  }
});

it('serves the separated eccentric connection notice in the supplemental languages', () => {
  const entry = RESULT_CHANGES.changes.find(change => change.id === 'separated-planar-eccentric-connection');
  for (const locale of ['ar', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'ru'] as const) {
    expect.soft(entry?.title[locale]?.trim(), locale).toBeTruthy();
    expect.soft(entry?.explanation[locale]?.trim(), locale).toBeTruthy();
  }
});

it('finds both malformed-input changes under PR 2588', () => {
  const changes = RESULT_CHANGES.changes.filter(change => change.prs?.includes(2588)).map(change => change.id);
  expect(changes).toEqual(expect.arrayContaining(['malformed-authored-loads', 'malformed-structural-input']));
});
