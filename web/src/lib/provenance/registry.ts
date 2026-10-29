/**
 * The registry of result-affecting changes (`result-changes.json`), typed and checked.
 *
 * Each entry says which RESULTS VERSION introduced the change, which model features it touches,
 * and what to tell the engineer in each offered language. A project records the results version
 * it was last solved with (`solve-stamp.ts`); opening it in a newer version lists the entries
 * between the two that apply to that model (`applicability.ts`).
 *
 * The results version is an integer, not the app version: the app version (`package.json`, still
 * 0.1.0) and the commit say which build ran, but neither orders "did the numbers change". Every
 * change that makes the same saved model give different numbers gets an entry here, and the first
 * entry of a new version bumps `currentResultsVersion`.
 */
import metadata from 'virtual:result-change-metadata';

export type Locale3 = 'en' | 'es' | 'pt';
export type Localised = Record<Locale3, string>;

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
  when: ChangeCondition;
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

/** Every condition group of an entry, normalised to OR-groups that must all hold. */
export function conditionGroups(w: ChangeCondition): string[][] {
  const groups: string[][] = [];
  if (w.any && w.any.length) groups.push(w.any);
  for (const f of w.all ?? []) groups.push([f]);
  for (const g of w.allOf ?? []) groups.push(g);
  return groups;
}

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
    for (const loc of ['en', 'es', 'pt'] as const) {
      if (!c.title?.[loc]?.trim()) problems.push(`${where}: missing title.${loc}`);
      if (!c.explanation?.[loc]?.trim()) problems.push(`${where}: missing explanation.${loc}`);
    }
    if (!c.changelog?.file || !c.changelog?.heading) problems.push(`${where}: missing changelog link`);
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
