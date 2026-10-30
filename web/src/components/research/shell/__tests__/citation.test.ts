import { pickSnapshot, permalinkUrl, type SnapshotEntry } from '../permalink';
import { describe, expect, it } from 'vitest';
import { citationBuild, citation, type CitationInput } from '../citation';

const input: CitationInput = {
  id: 'shauer-2025',
  name: 'Phase-field fracture of a notched plate',
  version: 1,
  year: '2026',
  url: 'https://stabileo.com/@abc1234/en/research/fracture/shauer-2025/',
  commit: 'abc1234def56',
  engineWasmSha256: 'e'.repeat(64),
  experimentWasmSha256: 'f'.repeat(64),
  paper: { authors: ['Nathan Shauer', 'Carlos Armando Duarte'], title: 'A title', venue: 'Advances in Engineering Software', year: 2025, doi: '10.1016/j.advengsoft.2025.104013' },
};

describe('research citation', () => {
  it('plain text names the permanent link, commit, both WASM hashes, our version and the DOI', () => {
    const t = citation(input, 'text');
    expect(t).toBe(
      'Stabileo Research (2026). Phase-field fracture of a notched plate, experiment version 1. ' +
        'Reproduction of Shauer and Duarte (2025), “A title”, Advances in Engineering Software, doi:10.1016/j.advengsoft.2025.104013. ' +
        `Stabileo commit abc1234def56; engine WASM SHA-256 ${'e'.repeat(64)}; experiment WASM SHA-256 ${'f'.repeat(64)}. ` +
        'https://stabileo.com/@abc1234/en/research/fracture/shauer-2025/',
    );
  });

  it('BibTeX is one @misc entry with a stable key, the URL and an escaped note', () => {
    const b = citation({ ...input, name: 'Under_score & 50% {x}' }, 'bibtex');
    expect(b.split('\n')[0]).toBe('@misc{stabileo-shauer-2025-v1,');
    expect(b).toContain('howpublished = {\\url{https://stabileo.com/@abc1234/en/research/fracture/shauer-2025/}}');
    expect(b).toContain('title        = {Under\\_score \\& 50\\% \\{x\\}}');
    expect(b).toContain('doi:10.1016/j.advengsoft.2025.104013');
    expect(b).toContain('publisher    = {Ergodic Group}');
    expect(b.trim().endsWith('}')).toBe(true);
    // Balanced braces, so a BibTeX parser reads it as one entry.
    let depth = 0;
    for (const ch of b.replace(/\\[{}]/g, '')) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('says nothing about hashes it does not have, and "et al." from three authors', () => {
    const t = citation({ ...input, engineWasmSha256: null, experimentWasmSha256: null, version: null, paper: { ...input.paper, authors: ['A B', 'C D', 'E F'] } }, 'text');
    expect(t).not.toContain('SHA-256');
    expect(t).not.toContain('experiment version');
    expect(t).toContain('Reproduction of B et al. (2025)');
  });
});

const page = '/research/fracture/shauer-2025';
const current = {
  version: { version: 2, date: '2026-11-02', commit: null },
  commit: 'bbbbbbb22222', engineWasmSha256: 'current-engine', experimentWasmSha256: 'current-experiment',
};
const older = {
  short: 'aaaaaaa', commit: 'aaaaaaa11111', date: '2025-10-28', url: '/@aaaaaaa/', research: [page],
  experimentVersions: { 'shauer-2025': { version: 1, date: '2025-10-27', commit: null } },
  engineWasmSha256: 'older-engine', researchWasmSha256: { 'shauer-2025': 'older-experiment' },
};

function selected(entry: SnapshotEntry | null) {
  const build = citationBuild(pickSnapshot(entry ? [entry] : [], page, current.commit, null, current.version.version), input.id, current);
  const c = { ...input, ...build, version: build.version?.version ?? null, year: build.date.slice(0, 4),
    permanent: !!build.link, url: build.link ? permalinkUrl(build.link.snapshot, page, 'en', 'https://stabileo.com') : `https://stabileo.com${page}/` };
  return { build, text: citation(c, 'text'), bibtex: citation(c, 'bibtex') };
}

it('cites a snapshot completely when its experiment version matches', () => {
  const matching = { ...older, experimentVersions: { 'shauer-2025': { ...current.version } } };
  const { build, text, bibtex } = selected(matching);
  expect(build).toMatchObject({ version: current.version, commit: older.commit,
    engineWasmSha256: 'older-engine', experimentWasmSha256: 'older-experiment', date: older.date });
  for (const output of [text, bibtex]) {
    expect(output).toContain('version 2');
    expect(output).toContain(older.commit);
    expect(output).toContain('older-engine');
    expect(output).toContain('older-experiment');
    expect(output).toContain('/@aaaaaaa/en/research/fracture/shauer-2025/');
    expect(output).not.toContain('current-');
    expect(output).not.toContain('version 1');
    expect(output).not.toContain('No permanent link');
  }
  expect(text).toContain('Stabileo Research (2025)');
});

it.each([
  null,
  older,
  { ...older, experimentVersions: undefined },
  { ...older, experimentVersions: {} },
  { ...older, engineWasmSha256: undefined },
  { ...older, researchWasmSha256: undefined },
])('cites the current build without a permanent link if snapshot metadata is unavailable (%#)', (entry) => {
  const { build, text, bibtex } = selected(entry);
  expect(build).toMatchObject({ ...current, link: null });
  for (const output of [text, bibtex]) {
    expect(output).toContain('version 2');
    expect(output).toContain(current.commit);
    expect(output).toContain('current-engine');
    expect(output).toContain('current-experiment');
    expect(output).toContain(`https://stabileo.com${page}/`);
    expect(output).toContain('No permanent link for this build');
    expect(output).not.toContain('/@aaaaaaa/');
    expect(output).not.toContain(older.commit);
  }
});

it('does not cite legacy index entries without version evidence', () => {
  const { build, text } = selected({ ...older, commit: current.commit, short: 'bbbbbbb', url: '/@bbbbbbb/', experimentVersions: undefined });
  expect(build).toMatchObject({ ...current, link: null });
  expect(text).not.toContain('/@bbbbbbb/');
  expect(text).toContain('No permanent link');
});

it.each(['de', 'fr', 'tr'])('offers complete citation controls in %s', async (locale) => {
  const { citeStrings } = await import('../cite-i18n');
  const en = citeStrings('en');
  const translated = citeStrings(locale);
  expect(translated).not.toBe(en);
  expect(Object.keys(translated).sort()).toEqual(Object.keys(en).sort());
  expect(translated.olderSnapshot('abc1234')).toContain('abc1234');
  expect(translated.permalink).not.toBe(en.permalink);
  expect(translated.footnote).not.toBe(en.footnote);
});

it.each(['de', 'fr', 'tr'])('preserves citation provenance when rendered in %s', (locale) => {
  for (const format of ['text', 'bibtex'] as const) {
    const rendered = citation({ ...input, permanent: false }, format, locale);
    expect(rendered).not.toBe(citation({ ...input, permanent: false }, format));
    for (const value of [input.commit, input.engineWasmSha256!, input.experimentWasmSha256!, input.paper.doi, input.url]) {
      expect(rendered).toContain(value);
    }
    expect(rendered).not.toContain('No permanent link for this build');
  }
});
