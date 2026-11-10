/**
 * The registry of result-affecting changes (`result-changes/`, assembled by
 * `web/scripts/result-changes/registry.mjs`), typed and checked.
 *
 * Each entry says which RESULTS VERSION introduced the change, which model features it touches,
 * and what to tell the engineer in each offered language. A project records the results version
 * it was last solved with (`solve-stamp.ts`); opening it in a newer version lists the entries
 * between the two that apply to that model (`applicability.ts`).
 *
 * The results version is an integer, not the app version: the app version (`package.json`, still
 * 0.1.0) and the commit say which build ran, but neither orders "did the numbers change". Every
 * change that makes the same saved model give different numbers gets an entry here. The versions
 * in `numbered.json` are frozen; each later merge to main that adds entries takes the next one.
 */
import metadata from 'virtual:result-change-metadata';
import { conditionGroups } from '../../../scripts/results-snapshot/applicability.mjs';

export const REGISTRY_LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
export type RegistryLocale = (typeof REGISTRY_LOCALES)[number];
export type Localised = Record<RegistryLocale, string>;

export function registryLocale(locale: string): RegistryLocale {
  return (REGISTRY_LOCALES as readonly string[]).includes(locale) ? (locale as RegistryLocale) : 'en';
}

/**
 * When an entry applies, in feature ids (`model-features.ts`). Every listed group must hold; a
 * group holds when the model has ANY of its features.
 *   any: [a, b]        a OR b
 *   all: [a, b]        a AND b
 *   allOf: [[a, b], [c]]  (a OR b) AND c
 * The three combine by AND. An entry with no condition at all applies to every model.
 */
export interface ChangeCondition {
  any?: string[];
  all?: string[];
  allOf?: string[][];
}

export interface ResultChange {
  id: string;
  resultsVersion: number;
  /** When the change reached main (ISO date). */
  date: string;
  prs: number[];
  area: 'analysis' | 'design' | 'loads';
  /**
   * Absent for an entry with `scope: 'examples'`, which concerns no saved model and is never
   * shown on opening one.
   */
  when?: ChangeCondition;
  /**
   * `examples`: only bundled examples changed, listed in `examples` by id; a saved model gives the
   * same numbers. The snapshot gate accepts it only for snapshots of those examples, and only when
   * each listed example's fixture changed too.
   */
  scope?: 'examples';
  examples?: string[];
  /**
   * The solve results it can move, for the legacy-projects test (#718): `*` (every result of a
   * solve), `solve.ok` (a solve that now refuses or now succeeds), a collection
   * (`quadNodalStresses`) or one field of it (`quadStresses.sigmaXx`). Absent: it explains no
   * difference in a solve's results, which is right for a design change and strict for any other.
   */
  quantities?: string[];
  title: Localised;
  explanation: Localised;
  /** Where the change is written up: a repository file and one of its headings. */
  changelog: { file: string; heading: string };
}

export interface ResultChangeRegistry {
  schema: number;
  currentResultsVersion: number;
  changes: ResultChange[];
}

const REPO_BLOB = 'https://github.com/lambdaclass/stabileo/blob/main/';

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
export function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** The public link to an entry's write-up. */
export function changelogUrl(c: Pick<ResultChange, 'changelog'>): string {
  return `${REPO_BLOB}${c.changelog.file}#${githubSlug(c.changelog.heading)}`;
}

export function concernsGeneratedLoads(w: ChangeCondition = {}): boolean {
  return conditionGroups(w).some((g) => g.includes('generatedLoads'));
}

/** Every condition group of an entry, normalised to OR-groups that must all hold. */
export { conditionGroups } from '../../../scripts/results-snapshot/applicability.mjs';

const QUANTITY = /^(\*|solve\.ok|[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)?)$/;

/**
 * Refuse a malformed registry rather than read it partially: a change that silently fails to
 * load is a change nobody is told about. Returns the problems (empty: valid).
 */
export function validateRegistry(r: ResultChangeRegistry, knownFeatures: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (r.schema !== 1) problems.push(`unknown schema ${r.schema}`);
  if (!Number.isInteger(r.currentResultsVersion) || r.currentResultsVersion < 1) problems.push('currentResultsVersion must be a positive integer');
  const ids = new Set<string>();
  for (const c of r.changes) {
    const where = `change ${c.id}`;
    if (!c.id || ids.has(c.id)) problems.push(`${where}: missing or duplicate id`);
    ids.add(c.id);
    if (!Number.isInteger(c.resultsVersion) || c.resultsVersion < 1 || c.resultsVersion > r.currentResultsVersion) {
      problems.push(`${where}: resultsVersion ${c.resultsVersion} outside 1..${r.currentResultsVersion}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) problems.push(`${where}: date must be YYYY-MM-DD`);
    if (!['analysis', 'design', 'loads'].includes(c.area)) problems.push(`${where}: unknown area ${c.area}`);
    for (const loc of REGISTRY_LOCALES) {
      if (!c.title?.[loc]?.trim()) problems.push(`${where}: missing title.${loc}`);
      if (!c.explanation?.[loc]?.trim()) problems.push(`${where}: missing explanation.${loc}`);
    }
    if (!c.changelog?.file || !c.changelog?.heading) problems.push(`${where}: missing changelog link`);
    if (c.quantities !== undefined && (!Array.isArray(c.quantities) || c.quantities.length === 0
      || c.quantities.some((q) => typeof q !== 'string' || !QUANTITY.test(q)))) {
      problems.push(`${where}: quantities must be a non-empty list of "*", "solve.ok", a collection or collection.field`);
    }
    if (c.scope !== undefined && c.scope !== 'examples') problems.push(`${where}: unknown scope "${c.scope}"`);
    if (c.scope === 'examples') {
      if (c.when !== undefined) problems.push(`${where}: an examples-scoped entry concerns no saved model and takes no when`);
      if (c.quantities !== undefined) problems.push(`${where}: an examples-scoped entry explains no saved result and takes no quantities`);
      if (!Array.isArray(c.examples) || c.examples.length === 0 || c.examples.some((e) => typeof e !== 'string' || !e.trim())) {
        problems.push(`${where}: an examples-scoped entry must list the example ids it changed`);
      }
    } else {
      if (c.when === undefined) problems.push(`${where}: missing when`);
      if (c.examples !== undefined) problems.push(`${where}: examples are listed only with scope "examples"`);
    }
    const groups = conditionGroups(c.when ?? {});
    for (const g of groups) {
      if (g.length === 0) problems.push(`${where}: empty condition group`);
      for (const f of g) if (!knownFeatures.has(f)) problems.push(`${where}: unknown feature "${f}"`);
    }
  }
  if (!r.changes.some((c) => c.resultsVersion === r.currentResultsVersion)) {
    problems.push(`no change carries the current results version ${r.currentResultsVersion}`);
  }
  return problems;
}

/** The results version this build produces. A project solved here is stamped with it. */
export const RESULTS_VERSION: number = metadata.currentResultsVersion;
