import type { ExperimentVersion, Permalink } from './permalink';

/**
 * A research experiment's citation, as plain text and as BibTeX (CiteThis.svelte). Pure, so the
 * exact strings are tested (`__tests__/citation.test.ts`).
 */
export type CitationInput = {
  /** The paper's catalogue id, e.g. `shauer-2025`. */
  id: string;
  /** The experiment's name. */
  name: string;
  /** Our experiment version (research/<field>/<id>/versions.json), null when none is recorded. */
  version: number | null;
  /** Year of the cited build. */
  year: string;
  /** The permanent link (or the plain page when no snapshot holds it yet). */
  url: string;
  permanent?: boolean;
  commit: string;
  engineWasmSha256: string | null;
  experimentWasmSha256: string | null;
  paper: { authors: string[]; title: string; venue: string; year: number; doi: string };
};

/** "Shauer", "Shauer and Duda", "Shauer et al." from Crossref's "Given Family" names. */
function authorShort(authors: string[]): string {
  const family = (a: string) => a.trim().split(/\s+/).at(-1) ?? a;
  if (authors.length === 0) return 'Anonymous';
  if (authors.length === 1) return family(authors[0]);
  if (authors.length === 2) return `${family(authors[0])} and ${family(authors[1])}`;
  return `${family(authors[0])} et al.`;
}

/** BibTeX-safe text: braces balanced away, specials escaped. */
function tex(s: string): string {
  return s.replace(/\\/g, '\\textbackslash{}').replace(/([{}%&$#_])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
}

export function citation(c: CitationInput, format: 'text' | 'bibtex'): string {
  const v = c.version == null ? '' : `, experiment version ${c.version}`;
  const reproduces = `${authorShort(c.paper.authors)} (${c.paper.year}), “${c.paper.title}”, ${c.paper.venue}, doi:${c.paper.doi}`;
  const hashes = [
    c.engineWasmSha256 ? `engine WASM SHA-256 ${c.engineWasmSha256}` : null,
    c.experimentWasmSha256 ? `experiment WASM SHA-256 ${c.experimentWasmSha256}` : null,
  ].filter(Boolean);
  if (format === 'text') {
    return (
      `Stabileo Research (${c.year}). ${c.name}${v}. Reproduction of ${reproduces}. ` +
      `Stabileo commit ${c.commit}${hashes.length ? `; ${hashes.join('; ')}` : ''}. ${c.url}${c.permanent === false ? ' (No permanent link for this build.)' : ''}`
    );
  }
  const key = `stabileo-${c.id}${c.version == null ? '' : `-v${c.version}`}`.replace(/[^A-Za-z0-9_:-]/g, '');
  const note = [
    `Experiment version ${c.version ?? 'unrecorded'}`,
    `Stabileo commit ${c.commit}`,
    ...hashes,
    ...(c.permanent === false ? ['No permanent link for this build'] : []),
    `reproduces ${authorShort(c.paper.authors)} (${c.paper.year}), doi:${c.paper.doi}`,
  ].join('; ');
  return [
    `@misc{${key},`,
    `  author       = {{Stabileo Research}},`,
    `  title        = {${tex(c.name)}},`,
    `  year         = {${c.year}},`,
    `  publisher    = {Ergodic Group},`,
    `  howpublished = {\\url{${c.url}}},`,
    `  note         = {${tex(note)}},`,
    `}`,
  ].join('\n');
}

/** Select one build atomically; legacy index entries cannot supply an older citation. */
export function citationBuild(
  link: Permalink | null | undefined,
  id: string,
  current: { version: ExperimentVersion | null; commit: string; engineWasmSha256: string | null; experimentWasmSha256: string | null },
) {
  if (link && !link.current) {
    const snapshot = link.snapshot;
    const version = snapshot.experimentVersions?.[id];
    if (version && snapshot.engineWasmSha256 !== undefined && snapshot.researchWasmSha256 !== undefined) {
      return { link, version, commit: snapshot.commit, engineWasmSha256: snapshot.engineWasmSha256,
        experimentWasmSha256: snapshot.researchWasmSha256[id] ?? null, date: snapshot.date };
    }
  }
  const own = link?.current ? link : null;
  return { ...current, link: own, date: own?.snapshot.date || current.version?.date || new Date().toISOString() };
}
