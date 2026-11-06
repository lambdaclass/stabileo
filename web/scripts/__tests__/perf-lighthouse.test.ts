import { describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CATEGORIES, aggregate, compare, median, parseArgs, raised, summarize } from '../perf-lighthouse.mjs';

const script = new URL('../perf-lighthouse.mjs', import.meta.url).pathname;

function lhr(perf: number, extra: Record<string, unknown> = {}) {
  return {
    finalDisplayedUrl: 'http://127.0.0.1:4173/en/',
    categories: { performance: { score: perf / 100 }, accessibility: { score: 0.92 }, 'best-practices': { score: 0.96 }, seo: { score: 1 } },
    audits: {
      'largest-contentful-paint': { numericValue: 2500.4 },
      'network-requests': { details: { items: [
        { url: 'http://127.0.0.1:4173/en/', resourceType: 'Document', transferSize: 1000 },
        { url: 'http://127.0.0.1:4173/assets/a.js', resourceType: 'Script', transferSize: 5000 },
        { url: 'https://challenges.cloudflare.com/turnstile.js', resourceType: 'Script', transferSize: 300 },
        { url: 'data:image/png;base64,AAAA', resourceType: 'Image', transferSize: 0 },
      ] } },
    },
    ...extra,
  };
}

const baseline = {
  urls: ['/en/'],
  margin: { performance: 3, accessibility: 0, 'best-practices': 0, seo: 0 },
  scores: { mobile: { '/en/': { performance: 90, accessibility: 92, 'best-practices': 96, seo: 100 } } },
};

describe('perf-lighthouse', () => {
  it('summarizes scores, bytes by kind and third-party origins', () => {
    const s = summarize(lhr(91));
    expect(s.scores).toEqual({ performance: 91, accessibility: 92, 'best-practices': 96, seo: 100 });
    expect(s.bytes).toEqual({ html: 1000, js: 5300, image: 0 });
    expect(s.thirdParty).toEqual(['https://challenges.cloudflare.com']);
    expect(s.lcpMs).toBe(2500);
  });

  it('refuses a report without a category score instead of counting it as zero', () => {
    const bad = lhr(91);
    (bad.categories as Record<string, { score: number | null }>).seo = { score: null };
    expect(() => summarize(bad)).toThrow(/no seo score/);
  });

  it('takes the median of the runs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(aggregate([summarize(lhr(80)), summarize(lhr(95)), summarize(lhr(90))]).scores.performance).toBe(90);
  });

  it('fails beyond the margin either way and a URL without a baseline, passes at the margin', () => {
    const at = (perf: number) => ({ '/en/': { scores: { performance: perf, accessibility: 92, 'best-practices': 96, seo: 100 } } });
    expect(compare(baseline, 'mobile', at(87)).failures).toEqual([]);
    expect(compare(baseline, 'mobile', at(93)).failures).toEqual([]);
    expect(compare(baseline, 'mobile', at(94)).failures).toEqual(['/en/ performance: RAISE (baseline 90, median 94, margin 3)']);
    expect(compare(baseline, 'mobile', at(86)).failures).toEqual(['/en/ performance: FAIL (baseline 90, median 86, margin 3)']);
    expect(compare(baseline, 'desktop', at(99)).failures).toHaveLength(CATEGORIES.length);
    expect(compare(baseline, 'mobile', { '/en/': { scores: { performance: 92, accessibility: 91, 'best-practices': 96, seo: 100 } } }).failures).toEqual(['/en/ accessibility: FAIL (baseline 92, median 91, margin 0)']);
    expect(() => compare({ ...baseline, margin: { performance: 3 } }, 'mobile', at(90))).toThrow(/margin\.accessibility/);
  });

  it('uses a URL margin over the category margin for that URL and preset only', () => {
    const wide = structuredClone(baseline);
    wide.scores.mobile['/en/'] = { ...wide.scores.mobile['/en/'], performance: 46, margin: { performance: 13 } } as typeof wide.scores.mobile['/en/'];
    const at = (perf: number) => ({ '/en/': { scores: { performance: perf, accessibility: 92, 'best-practices': 96, seo: 100 } } });
    expect(compare(wide, 'mobile', at(33)).failures).toEqual([]);
    expect(compare(wide, 'mobile', at(59)).failures).toEqual([]);
    expect(compare(wide, 'mobile', at(32)).failures).toEqual(['/en/ performance: FAIL (baseline 46, median 32, margin 13)']);
    expect(compare(wide, 'mobile', at(60)).failures).toEqual(['/en/ performance: RAISE (baseline 46, median 60, margin 13)']);
    expect(compare(wide, 'mobile', { '/en/': { scores: { performance: 46, accessibility: 91, 'best-practices': 96, seo: 100 } } }).failures).toEqual(['/en/ accessibility: FAIL (baseline 92, median 91, margin 0)']);
    const bad = structuredClone(wide);
    (bad.scores.mobile['/en/'] as unknown as { margin: { performance: number } }).margin.performance = -1;
    expect(() => compare(bad, 'mobile', at(46))).toThrow(/margin\.performance for \/en\//);
    const kept = raised(wide, 'mobile', at(59));
    expect(kept.changed).toBe(false);
    expect(kept.next.scores.mobile['/en/']).toEqual(wide.scores.mobile['/en/']);
  });

  it('only raises the baseline', () => {
    const { next, changed } = raised(baseline, 'mobile', { '/en/': { scores: { performance: 85, accessibility: 95, 'best-practices': 96, seo: 100 } } });
    expect(changed).toBe(true);
    expect(next.scores.mobile['/en/']).toEqual({ performance: 90, accessibility: 95, 'best-practices': 96, seo: 100 });
    expect(baseline.scores.mobile['/en/'].accessibility).toBe(92);
    expect(raised(baseline, 'mobile', { '/en/': { scores: { performance: 80, accessibility: 92, 'best-practices': 96, seo: 100 } } }).changed).toBe(false);
  });

  it('rejects bad arguments', () => {
    expect(() => parseArgs([])).toThrow(/--base/);
    expect(() => parseArgs(['--base', 'x', '--runs', '0'])).toThrow(/--runs/);
    expect(() => parseArgs(['--base', 'x', '--preset', 'tablet'])).toThrow(/--preset/);
    expect(parseArgs(['--base', 'http://h/']).base).toBe('http://h');
  });

  it('the CLI exits non-zero on a regression, an unrecorded improvement and a failed Lighthouse, --write included', () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-lh-'));
    const fake = join(dir, 'lighthouse');
    writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
if (process.env.FAKE_LH_FAIL) process.exit(2);
const out = process.argv.find((a) => a.startsWith('--output-path=')).slice('--output-path='.length);
fs.writeFileSync(out, process.env.FAKE_LHR);
`);
    chmodSync(fake, 0o755);
    const file = join(dir, 'baseline.json');
    writeFileSync(file, JSON.stringify(baseline));
    const run = (perf: number, extra: string[] = [], env: Record<string, string> = {}) => spawnSync(process.execPath, [script, '--base', 'http://127.0.0.1:4173', '--runs', '1', '--baseline', file, '--out', dir, ...extra], {
      encoding: 'utf8',
      env: { ...process.env, LIGHTHOUSE_BIN: fake, FAKE_LHR: JSON.stringify(lhr(perf)), GITHUB_STEP_SUMMARY: '', ...env },
    });
    expect(run(88).status).toBe(0);
    const low = run(80);
    expect(low.status).toBe(1);
    expect(low.stderr).toMatch(/performance: FAIL/);
    expect(run(80, ['--no-check']).status).toBe(0);
    expect(run(90, [], { FAKE_LH_FAIL: '1' }).status).not.toBe(0);
    expect(run(94).status).toBe(1);
    expect(run(94, ['--write']).status).toBe(0);
    expect(JSON.parse(readFileSync(file, 'utf8')).scores.mobile['/en/'].performance).toBe(94);
    expect(run(94).status).toBe(0);
    expect(run(90).status).toBe(1);

    const mixed = lhr(80);
    mixed.categories.accessibility.score = 0.99;
    const both = spawnSync(process.execPath, [script, '--base', 'http://127.0.0.1:4173', '--runs', '1', '--baseline', file, '--out', dir, '--write'], {
      encoding: 'utf8',
      env: { ...process.env, LIGHTHOUSE_BIN: fake, FAKE_LHR: JSON.stringify(mixed), GITHUB_STEP_SUMMARY: '' },
    });
    expect(both.status).toBe(1);
    expect(both.stderr).toMatch(/performance: FAIL/);
    expect(JSON.parse(readFileSync(file, 'utf8')).scores.mobile['/en/']).toEqual({ performance: 94, accessibility: 99, 'best-practices': 96, seo: 100 });
  });
});
