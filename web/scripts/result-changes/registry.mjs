import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DIR = 'web/src/lib/provenance/result-changes';
export const NUMBERED = 'numbered.json';
export const LEGACY = 'web/src/lib/provenance/result-changes.json';
export const ORDER_FILE = 'web/.result-change-order.json';
export const TEXT_FIELDS = ['title', 'explanation', 'changelog'];

const REPO = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

export function isFragmentPath(path) {
  if (!path.startsWith(`${DIR}/`)) return false;
  const name = path.slice(DIR.length + 1);
  return !name.includes('/') && name.endsWith('.json') && name !== NUMBERED;
}

const idOf = (path) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

/**
 * `numbered`: the frozen entries with their versions. `fragments`: id → entry without a version.
 * `landings`: the fragment ids each landing on main added, oldest first. A fragment in none of
 * them has not landed yet and takes the version after every landing.
 */
export function assemble({ numbered, fragments, landings }) {
  const problems = [];
  const released = Math.max(0, ...numbered.changes.map((c) => c.resultsVersion));
  const version = new Map();
  landings.forEach((ids, k) => { for (const id of ids) version.set(id, released + k + 1); });
  const pending = [...fragments.keys()].filter((id) => !version.has(id)).sort();
  const current = released + landings.length + (pending.length ? 1 : 0);
  for (const id of pending) version.set(id, current);
  const changes = [...numbered.changes];
  for (const [id, entry] of [...fragments].sort(([a], [b]) => a.localeCompare(b))) {
    if ('resultsVersion' in entry) problems.push(`${DIR}/${id}.json: a fragment carries no resultsVersion; main's merge order gives it one`);
    if (entry.id !== id) problems.push(`${DIR}/${id}.json: its id must be "${id}", the file name`);
    changes.push({ ...entry, id, resultsVersion: version.get(id) });
  }
  if (problems.length) throw new Error(problems.join('\n'));
  changes.sort((a, b) => b.resultsVersion - a.resultsVersion || a.id.localeCompare(b.id));
  return { schema: numbered.schema, currentResultsVersion: current, changes };
}

function gitIn(root) {
  return (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * The fragments each first-parent commit of `rev` added, oldest first, from the commit that
 * introduced the numbered file on. A fragment added twice counts at its last addition.
 */
export function landingsAt(git, rev) {
  const log = git('log', '--first-parent', '--diff-merges=first-parent', '--no-renames', '--reverse',
    '--diff-filter=A', '--name-only', '--format=%x00%H', rev, '--', DIR);
  const commits = log.split('\0').filter((c) => c.trim()).map((block) => {
    const [sha, ...files] = block.split('\n').map((l) => l.trim()).filter(Boolean);
    return { sha, files };
  });
  const anchor = commits.findIndex((c) => c.files.includes(`${DIR}/${NUMBERED}`));
  const missing = () => new Error(`${rev}: the history from before ${DIR} was introduced is missing (a shallow clone). `
    + 'Results versions come from the order changes reached main: fetch the whole history (actions/checkout fetch-depth: 0).');
  if (anchor < 0) {
    if (git('rev-parse', '--is-shallow-repository').trim() === 'true') throw missing();
    throw new Error(`${rev}: no first-parent commit adds ${DIR}/${NUMBERED}`);
  }
  try {
    git('rev-parse', '--verify', '--quiet', `${commits[anchor].sha}^1`);
  } catch {
    throw missing();
  }
  const last = new Map();
  commits.slice(anchor).forEach((c, k) => { for (const f of c.files) if (isFragmentPath(f)) last.set(idOf(f), k); });
  const groups = commits.slice(anchor).map(() => []);
  for (const [id, k] of last) groups[k].push(id);
  return groups.filter((ids, k) => ids.length || commits[anchor + k].files.some(isFragmentPath)).map((ids) => ids.sort());
}

function readWorkingTree(root) {
  const dir = join(root, DIR);
  const hash = createHash('sha256');
  const read = (name) => {
    const text = readFileSync(join(dir, name), 'utf8');
    hash.update(`${name}\0${text}\0`);
    return JSON.parse(text);
  };
  const numbered = read(NUMBERED);
  const fragments = new Map();
  for (const name of readdirSync(dir).sort()) {
    if (isFragmentPath(`${DIR}/${name}`)) fragments.set(idOf(name), read(name));
  }
  return { numbered, fragments, fingerprint: hash.digest('hex') };
}

function insideGit(root) {
  try {
    return gitIn(root)('rev-parse', '--is-inside-work-tree').trim() === 'true';
  } catch {
    return false;
  }
}

function orderFromFile(root, fingerprint) {
  const file = join(root, ORDER_FILE);
  if (!existsSync(file)) {
    throw new Error(`${root} is not a git checkout and has no ${ORDER_FILE}: run "make result-changes.order" in the checkout first`);
  }
  const order = JSON.parse(readFileSync(file, 'utf8'));
  if (order.fingerprint !== fingerprint) {
    throw new Error(`${ORDER_FILE} is stale: it was written for other registry files than these; run "make result-changes.order" again`);
  }
  return order.landings;
}

/** The registry of the checkout at `root`: its files as they are on disk, ordered by its history. */
export function readRegistry(root = REPO) {
  const { numbered, fragments, fingerprint } = readWorkingTree(root);
  const landings = insideGit(root) ? landingsAt(gitIn(root), 'HEAD') : orderFromFile(root, fingerprint);
  return assemble({ numbered, fragments, landings });
}

/**
 * The entries as commit `rev` has them, unassembled: `numbered` with their frozen versions (every
 * entry, in the format before this directory), `unnumbered` the fragments. Null when `rev` has none.
 */
export function readSourcesAt(rev, root = REPO) {
  const git = gitIn(root);
  const show = (path) => { try { return git('show', `${rev}:${path}`); } catch { return null; } };
  const numberedText = show(`${DIR}/${NUMBERED}`);
  if (numberedText === null) {
    const legacy = show(LEGACY);
    return legacy === null ? null : { schema: JSON.parse(legacy).schema, numbered: JSON.parse(legacy).changes, unnumbered: [] };
  }
  const unnumbered = git('ls-tree', '--name-only', `${rev}:${DIR}`).split('\n').filter(Boolean)
    .map((name) => `${DIR}/${name}`).filter(isFragmentPath).map((path) => ({ file: path, ...JSON.parse(show(path)) }));
  const numbered = JSON.parse(numberedText);
  return { schema: numbered.schema, numbered: numbered.changes, unnumbered };
}

/** The registry as commit `rev` has it, in either format; null when `rev` has none. */
export function readRegistryAt(rev, root = REPO) {
  const git = gitIn(root);
  let numbered;
  try { numbered = JSON.parse(git('show', `${rev}:${DIR}/${NUMBERED}`)); } catch {
    try { return JSON.parse(git('show', `${rev}:${LEGACY}`)); } catch { return null; }
  }
  const { unnumbered } = readSourcesAt(rev, root);
  const fragments = new Map(unnumbered.map(({ file, ...entry }) => [idOf(file), entry]));
  return assemble({ numbered, fragments, landings: landingsAt(git, rev) });
}

function frozen(entry) {
  const { file: _, ...rest } = entry;
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
  return JSON.stringify(sortKeys(Object.fromEntries(Object.entries(rest).filter(([k]) => !TEXT_FIELDS.includes(k)))));
}

/**
 * What `head` changed in `base`'s entries that it may not: an entry on main keeps its id, its
 * version (or its place in main's merge order) and every field but its wording (TEXT_FIELDS).
 * Returns the problems and the ids of the entries `head` adds.
 */
export function compareSources(base, head) {
  const problems = [];
  const baseNumbered = new Map((base?.numbered ?? []).map((c) => [c.id, c]));
  const headNumbered = new Map((head?.numbered ?? []).map((c) => [c.id, c]));
  const baseUnnumbered = new Map((base?.unnumbered ?? []).map((c) => [c.id, c]));
  const headUnnumbered = new Map((head?.unnumbered ?? []).map((c) => [c.id, c]));
  for (const [id, entry] of baseNumbered) {
    const now = headNumbered.get(id);
    if (!now) problems.push(`${id} (version ${entry.resultsVersion}) was removed from ${NUMBERED}`);
    else if (frozen(now) !== frozen(entry)) problems.push(`${id} (version ${entry.resultsVersion}) was changed in ${NUMBERED}: only ${TEXT_FIELDS.join(', ')} may be`);
  }
  for (const id of headNumbered.keys()) {
    if (!baseNumbered.has(id)) problems.push(`${id} was added to ${NUMBERED}: its versions are frozen, a new change is a file of its own`);
  }
  for (const [id, entry] of baseUnnumbered) {
    const now = headUnnumbered.get(id);
    if (!now) problems.push(`${id} is on main and was removed or renamed: withdraw a change with a new entry instead`);
    else if (frozen(now) !== frozen(entry)) problems.push(`${id} is on main and was changed: only ${TEXT_FIELDS.join(', ')} may be`);
  }
  const added = [];
  for (const [id, entry] of headUnnumbered) {
    if ('resultsVersion' in entry) problems.push(`${entry.file ?? id}: carries a resultsVersion; main's merge order gives it one`);
    if (headNumbered.has(id)) problems.push(`${id} is both numbered and a fragment`);
    if (!baseUnnumbered.has(id) && !baseNumbered.has(id)) added.push(id);
  }
  return { problems, added };
}

/** The landing order of the checkout, for a build of it without its git history (Docker). */
export function writeOrderFile(root = REPO) {
  const landings = landingsAt(gitIn(root), 'HEAD');
  const { fingerprint } = readWorkingTree(root);
  writeFileSync(join(root, ORDER_FILE), `${JSON.stringify({ fingerprint, landings })}\n`);
  return landings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd] = process.argv.slice(2);
  if (cmd === '--write-order') {
    const landings = writeOrderFile();
    console.log(`${ORDER_FILE}: ${landings.length} landing(s) after the numbered versions`);
  } else if (cmd === '--print') {
    const r = readRegistry();
    console.log(JSON.stringify({ currentResultsVersion: r.currentResultsVersion, versions: Object.fromEntries(r.changes.map((c) => [c.id, c.resultsVersion])) }, null, 2));
  } else {
    console.error('usage: node web/scripts/result-changes/registry.mjs --write-order | --print');
    process.exit(2);
  }
}
