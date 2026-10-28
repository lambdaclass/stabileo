/**
 * The corpus, its snapshots and its test entry points match one to one (#716 review).
 *
 * Without this a case could leave the corpus and its snapshot stay behind, unread: the gate saw
 * no change and the coverage was gone in silence. With it, removing a case means deleting its
 * snapshot, which the gate counts as a result change to register; and a snapshot nothing runs, a
 * group nothing runs, or a test file running a group with no cases fails.
 */
export interface CoverageInput {
  /** The corpus: each case's name and group. */
  corpus: ReadonlyArray<{ name: string; group: string }>;
  /** The snapshot files in `web/results-snapshots/`, without `.json`. */
  snapshots: readonly string[];
  /** The groups the test entry points run (`__tests__/snapshot-<group>.test.ts`, `runGroup('<group>')`). */
  entryGroups: readonly string[];
}

export function coverageProblems({ corpus, snapshots, entryGroups }: CoverageInput): string[] {
  const out: string[] = [];
  const names = corpus.map((c) => c.name);
  for (const n of new Set(names.filter((n, i) => names.indexOf(n) !== i))) out.push(`corpus case ${n} is listed twice`);
  const files = new Set(snapshots);
  for (const n of new Set(names)) if (!files.has(n)) out.push(`corpus case ${n} has no snapshot: run make snapshots-update`);
  const cases = new Set(names);
  for (const f of snapshots) {
    if (!cases.has(f)) out.push(`snapshot ${f}.json belongs to no corpus case: delete it (the gate counts the deletion as a result change to register)`);
  }
  const groups = new Set(corpus.map((c) => c.group));
  const entries = new Set(entryGroups);
  for (const g of groups) if (!entries.has(g)) out.push(`corpus group ${g} has no test entry point (__tests__/snapshot-${g}.test.ts)`);
  for (const g of entries) if (!groups.has(g)) out.push(`test entry point snapshot-${g}.test.ts runs a group with no corpus case`);
  for (const g of new Set(entryGroups.filter((g, i) => entryGroups.indexOf(g) !== i))) out.push(`group ${g} is run by more than one entry point`);
  return out;
}
