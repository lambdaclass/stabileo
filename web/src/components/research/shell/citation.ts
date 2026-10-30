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

const CITATION_TEXT = {
  "en": {
    "anonymous": "Anonymous",
    "and": "and",
    "version": "Experiment version",
    "reproduction": "Reproduction of",
    "engine": "engine WASM SHA-256",
    "experiment": "experiment WASM SHA-256",
    "noPermanent": "No permanent link for this build",
    "unrecorded": "unrecorded",
    "reproduces": "reproduces"
  },
  "es": {
    "anonymous": "Anónimo",
    "and": "y",
    "version": "Versión del experimento",
    "reproduction": "Reproducción de",
    "engine": "WASM del motor SHA-256",
    "experiment": "WASM del experimento SHA-256",
    "noPermanent": "Esta compilación no tiene enlace permanente",
    "unrecorded": "sin registrar",
    "reproduces": "reproduce"
  },
  "pt": {
    "anonymous": "Anônimo",
    "and": "e",
    "version": "Versão do experimento",
    "reproduction": "Reprodução de",
    "engine": "WASM do motor SHA-256",
    "experiment": "WASM do experimento SHA-256",
    "noPermanent": "Esta compilação não tem link permanente",
    "unrecorded": "não registrada",
    "reproduces": "reproduz"
  },
  "de": {
    "anonymous": "Anonym",
    "and": "und",
    "version": "Experimentversion",
    "reproduction": "Reproduktion von",
    "engine": "Engine-WASM SHA-256",
    "experiment": "Experiment-WASM SHA-256",
    "noPermanent": "Kein permanenter Link für diesen Build",
    "unrecorded": "nicht erfasst",
    "reproduces": "reproduziert"
  },
  "fr": {
    "anonymous": "Anonyme",
    "and": "et",
    "version": "Version de l’expérience",
    "reproduction": "Reproduction de",
    "engine": "WASM du moteur SHA-256",
    "experiment": "WASM de l’expérience SHA-256",
    "noPermanent": "Aucun lien permanent pour cette compilation",
    "unrecorded": "non consignée",
    "reproduces": "reproduit"
  },
  "tr": {
    "anonymous": "Anonim",
    "and": "ve",
    "version": "Deney sürümü",
    "reproduction": "Yeniden üretimi:",
    "engine": "Motor WASM SHA-256",
    "experiment": "Deney WASM SHA-256",
    "noPermanent": "Bu derleme için kalıcı bağlantı yok",
    "unrecorded": "kaydedilmedi",
    "reproduces": "yeniden üretir"
  }
};

/** "Shauer", "Shauer and Duda", "Shauer et al." from Crossref's "Given Family" names. */
function authorShort(authors: string[], labels: typeof CITATION_TEXT.en): string {
  const family = (a: string) => a.trim().split(/\s+/).at(-1) ?? a;
  if (authors.length === 0) return labels.anonymous;
  if (authors.length === 1) return family(authors[0]);
  if (authors.length === 2) return `${family(authors[0])} ${labels.and} ${family(authors[1])}`;
  return `${family(authors[0])} et al.`;
}

/** BibTeX-safe text: braces balanced away, specials escaped. */
function tex(s: string): string {
  return s.replace(/\\/g, '\\textbackslash{}').replace(/([{}%&$#_])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
}

export function citation(c: CitationInput, format: 'text' | 'bibtex', locale = 'en'): string {
  const labels = CITATION_TEXT[locale as keyof typeof CITATION_TEXT] ?? CITATION_TEXT.en;
  const v = c.version == null ? '' : `, ${labels.version.toLocaleLowerCase(locale)} ${c.version}`;
  const reproduces = `${authorShort(c.paper.authors, labels)} (${c.paper.year}), “${c.paper.title}”, ${c.paper.venue}, doi:${c.paper.doi}`;
  const hashes = [
    c.engineWasmSha256 ? `${labels.engine} ${c.engineWasmSha256}` : null,
    c.experimentWasmSha256 ? `${labels.experiment} ${c.experimentWasmSha256}` : null,
  ].filter(Boolean);
  if (format === 'text') {
    return (
      `Stabileo Research (${c.year}). ${c.name}${v}. ${labels.reproduction} ${reproduces}. ` +
      `Stabileo commit ${c.commit}${hashes.length ? `; ${hashes.join('; ')}` : ''}. ${c.url}${c.permanent === false ? ` (${labels.noPermanent}.)` : ''}`
    );
  }
  const key = `stabileo-${c.id}${c.version == null ? '' : `-v${c.version}`}`.replace(/[^A-Za-z0-9_:-]/g, '');
  const note = [
    `${labels.version} ${c.version ?? labels.unrecorded}`,
    `Stabileo commit ${c.commit}`,
    ...hashes,
    ...(c.permanent === false ? [labels.noPermanent] : []),
    `${labels.reproduces} ${authorShort(c.paper.authors, labels)} (${c.paper.year}), doi:${c.paper.doi}`,
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
      return { link, version, released: true, commit: snapshot.commit, engineWasmSha256: snapshot.engineWasmSha256,
        experimentWasmSha256: snapshot.researchWasmSha256[id] ?? null, date: snapshot.date };
    }
  }
  const own = link?.current ? link : null;
  return { ...current, link: own, released: !!own || !!current.version?.commit, date: own?.snapshot.date || current.version?.date || new Date().toISOString() };
}
