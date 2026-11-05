import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DIR, LEGACY, NUMBERED, ORDER_FILE, readRegistry, readRegistryAt, writeOrderFile } from '../result-changes/registry.mjs';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'result-changes-'));
  roots.push(root);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  git('init', '-q', '-b', 'main');
  const write = (path: string, value: unknown) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
  };
  const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', message); };
  const fragment = (id: string, extra: object = {}) => write(`${DIR}/${id}.json`, { id, area: 'analysis', ...extra });
  const land = (branch: string) => git('merge', '-q', '--no-ff', '-m', `Merge pull request from ${branch}`, branch);
  write('README.md', 'x');
  commit('root');
  write(LEGACY, { schema: 1, currentResultsVersion: 29, changes: [{ id: 'old-29', resultsVersion: 29 }, { id: 'old-1', resultsVersion: 1 }] });
  commit('the single registry file');
  unlinkSync(join(root, LEGACY));
  write(`${DIR}/${NUMBERED}`, { schema: 1, changes: [{ id: 'old-29', resultsVersion: 29 }, { id: 'old-1', resultsVersion: 1 }] });
  commit('one file per change');
  return { root, git, commit, fragment, land };
}

const versions = (r: { changes: { id: string; resultsVersion: number }[] }) =>
  Object.fromEntries(r.changes.map((c) => [c.id, c.resultsVersion]));

describe('results versions from the order changes reach main', { timeout: 60_000 }, () => {
  it('keeps the numbered versions and their current version when nothing has landed since', () => {
    const { root } = repo();
    const r = readRegistry(root);
    expect(r.currentResultsVersion).toBe(29);
    expect(versions(r)).toEqual({ 'old-29': 29, 'old-1': 1 });
  });

  it('numbers two changes made in parallel by the order they merge, and they never conflict', () => {
    for (const [first, second] of [['a', 'b'], ['b', 'a']]) {
      const { root, git, commit, fragment, land } = repo();
      for (const id of ['a', 'b']) {
        git('checkout', '-q', '-b', `pr-${id}`, 'main');
        fragment(id);
        commit(`change ${id}`);
      }
      git('checkout', '-q', 'main');
      land(`pr-${first}`);
      expect(readRegistry(root).currentResultsVersion).toBe(30);
      land(`pr-${second}`);
      const r = readRegistry(root);
      expect(versions(r)).toMatchObject({ [first]: 30, [second]: 31 });
      expect(r.currentResultsVersion).toBe(31);
      expect(versions(readRegistryAt('HEAD~1', root)!)).toMatchObject({ [first]: 30 });
      expect(readRegistryAt('HEAD~1', root)!.changes.map((c) => c.id)).not.toContain(second);
    }
  });

  it('gives the changes one pull request lands together one version, and the next landing the one after', () => {
    const { root, git, commit, fragment, land } = repo();
    git('checkout', '-q', '-b', 'pr-pair', 'main');
    fragment('p');
    commit('p');
    fragment('q');
    commit('q');
    git('checkout', '-q', 'main');
    land('pr-pair');
    git('checkout', '-q', '-b', 'pr-r', 'main');
    fragment('r');
    commit('r');
    git('checkout', '-q', 'main');
    land('pr-r');
    expect(versions(readRegistry(root))).toMatchObject({ p: 30, q: 30, r: 31 });
  });

  it('keeps a landed change\'s version when a later pull request merges main into its branch first', () => {
    const { root, git, commit, fragment, land } = repo();
    git('checkout', '-q', '-b', 'pr-late', 'main');
    fragment('late');
    commit('late');
    git('checkout', '-q', '-b', 'pr-early', 'main');
    fragment('early');
    commit('early');
    git('checkout', '-q', 'main');
    land('pr-early');
    git('checkout', '-q', 'pr-late');
    git('merge', '-q', '--no-ff', '-m', 'Merge main into pr-late', 'main');
    git('checkout', '-q', 'main');
    land('pr-late');
    expect(versions(readRegistry(root))).toMatchObject({ early: 30, late: 31 });
  });

  it('gives a change not yet committed the version after every landing', () => {
    const { root, git, commit, fragment, land } = repo();
    git('checkout', '-q', '-b', 'pr-a', 'main');
    fragment('a');
    commit('a');
    git('checkout', '-q', 'main');
    land('pr-a');
    fragment('draft');
    const r = readRegistry(root);
    expect(versions(r)).toMatchObject({ a: 30, draft: 31 });
    expect(r.currentResultsVersion).toBe(31);
  });

  it('never lowers a version: a change removed and added again counts from its last landing, and the slot it left stays used', () => {
    const { root, git, commit, fragment } = repo();
    fragment('a');
    commit('a');
    fragment('b');
    commit('b');
    git('rm', '-q', `${DIR}/a.json`);
    commit('a removed');
    fragment('a');
    commit('a again');
    const r = readRegistry(root);
    expect(versions(r)).toMatchObject({ a: 32, b: 31 });
    expect(r.currentResultsVersion).toBe(32);
  });

  it('refuses a fragment that names its own version, or whose id is not its file name', () => {
    const { root, commit, fragment } = repo();
    fragment('a', { resultsVersion: 31 });
    commit('a');
    expect(() => readRegistry(root)).toThrow(/carries no resultsVersion/);
    const other = repo();
    other.fragment('b', { id: 'c' });
    other.commit('b');
    expect(() => readRegistry(other.root)).toThrow(/its id must be "b"/);
  });

  it('refuses to guess without the history: a shallow clone fails', () => {
    const { root, git, commit, fragment } = repo();
    fragment('a');
    commit('a');
    const shallow = mkdtempSync(join(tmpdir(), 'result-changes-shallow-'));
    roots.push(shallow);
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${root}`, shallow]);
    expect(() => readRegistry(shallow)).toThrow(/history .* is missing/);
    expect(git('rev-parse', 'HEAD')).toBeTruthy();
  });

  it('builds a copy without its git history from the order file, and refuses a stale one', () => {
    const { root, git, commit, fragment, land } = repo();
    git('checkout', '-q', '-b', 'pr-a', 'main');
    fragment('a');
    commit('a');
    git('checkout', '-q', 'main');
    land('pr-a');
    writeOrderFile(root);
    const copy = mkdtempSync(join(tmpdir(), 'result-changes-copy-'));
    roots.push(copy);
    for (const path of [DIR, ORDER_FILE]) cpSync(join(root, path), join(copy, path), { recursive: true });
    expect(readRegistry(copy)).toEqual(readRegistry(root));
    writeFileSync(join(copy, DIR, 'b.json'), JSON.stringify({ id: 'b' }));
    expect(() => readRegistry(copy)).toThrow(/stale/);
  });

  it('reads a commit from before the move in the single file it had', () => {
    const { root } = repo();
    expect(readRegistryAt('HEAD~1', root)).toMatchObject({ currentResultsVersion: 29 });
    expect(readRegistryAt('HEAD~2', root)).toBeNull();
  });
});
