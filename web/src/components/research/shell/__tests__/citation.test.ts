import { describe, expect, it } from 'vitest';
import { citation, type CitationInput } from '../citation';

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
