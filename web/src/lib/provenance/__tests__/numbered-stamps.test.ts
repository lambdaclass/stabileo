import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESULT_CHANGES } from '../full-registry';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';
import type { ResultChangeRegistry } from '../registry';
import { LEGACY, readRegistryAt } from '../../../../scripts/result-changes/registry.mjs';

const repo = resolve(__dirname, '../../../../..');
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const moved = git('log', '--first-parent', '--diff-merges=first-parent', '--no-renames', '--diff-filter=D', '--name-only', '--format=%H', '-1', 'HEAD', '--', LEGACY).split('\n')[0];
const BEFORE = readRegistryAt(`${moved}^1`, repo) as ResultChangeRegistry;

const projects = [
  ...['v0.2.0', 'v0.3.0', 'v0.4.0'].flatMap((tag) => readdirSync(resolve(repo, 'web/legacy-projects', tag))
    .filter((f) => f.endsWith('.ded')).map((f) => `web/legacy-projects/${tag}/${f}`)),
  'web/src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json',
].map((file) => ({ file, project: JSON.parse(readFileSync(resolve(repo, file), 'utf8')) as { snapshot: FeatureSnapshot; analysisMode?: string } }));

describe('saved projects stamped before the registry became one file per change', () => {
  it('read the last single registry file and real saved projects', () => {
    expect(BEFORE.currentResultsVersion).toBeGreaterThanOrEqual(29);
    expect(projects.length).toBeGreaterThan(30);
  });

  it('keep every notice they had, with the same versions, for every stamp up to the frozen ones', () => {
    const frozen = BEFORE.currentResultsVersion;
    let notices = 0;
    for (const { file, project } of projects) {
      for (let version = 0; version <= frozen; version++) {
        const stamp = version === 0 ? null : ({ id: 'saved', resultsVersion: version, analyses: ['linear'] } as unknown as SolveStamp);
        const ids = (registry: ResultChangeRegistry) => assessProject(project.snapshot, stamp, project.analysisMode, registry)
          .changes.map((c) => `${c.resultsVersion}:${c.id}`);
        const before = ids(BEFORE);
        const now = ids(RESULT_CHANGES);
        expect(now.filter((c) => Number(c.split(':')[0]) <= frozen), `${file} stamped ${version}`).toEqual(before);
        expect(now.filter((c) => Number(c.split(':')[0]) <= version), `${file} stamped ${version}`).toEqual([]);
        notices += before.length;
      }
    }
    expect(notices).toBeGreaterThan(0);
  });

  it('are told about every change registered after the frozen versions that concerns them, and never about a change to bundled examples only', () => {
    const frozen = BEFORE.currentResultsVersion;
    const later = RESULT_CHANGES.changes.filter((c) => c.resultsVersion > frozen && c.scope !== 'examples').map((c) => c.id);
    for (const { project } of projects) {
      const stamp = { id: 'saved', resultsVersion: frozen, analyses: ['linear'] } as unknown as SolveStamp;
      const all = { ...RESULT_CHANGES, changes: RESULT_CHANGES.changes.map((c) => ({ ...c, when: {} })) };
      expect(assessProject(project.snapshot, stamp, project.analysisMode, all).changes.map((c) => c.id).sort()).toEqual([...later].sort());
    }
  });
});
