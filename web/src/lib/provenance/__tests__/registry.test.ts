import metadata from 'virtual:result-change-metadata';
import { RESULT_CHANGES } from '../full-registry';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateRegistry, githubSlug, changelogUrl, conditionGroups, type ResultChangeRegistry } from '../registry';
import { FEATURE_IDS } from '../model-features';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';

const repo = resolve(__dirname, '../../../../..');

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

  it('is well formed: ids, versions, six languages, known features, quantities', () => {
    expect(validateRegistry(RESULT_CHANGES, new Set(FEATURE_IDS))).toEqual([]);
    expect(validateRegistry(source(), new Set(FEATURE_IDS))).toEqual([]);
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

  it.each(['en', 'es', 'pt', 'de', 'fr', 'tr'] as const)('refuses an entry without its %s title or explanation', (locale) => {
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
