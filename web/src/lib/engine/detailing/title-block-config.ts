/**
 * The rótulo: what the author may write on a sheet, and what the app writes for them.
 *
 * ── The two halves, and why the line between them is fixed ─────────
 *
 * A title block carries two kinds of statement and they have different owners.
 *
 *   The IDENTIFICATION — the works, the stage, the office — is the author's. The app cannot
 *   know it, has never known it, and until now printed nothing: every export was headed with
 *   `t('detailing.doc.project')`, a translated word meaning "Project". A drawing set whose
 *   sheets all say "Proyecto" identifies nothing.
 *
 *   The REGULATIONS are the app's. `roles.ts` records which instrument governs each role, at
 *   which edition, under which jurisdiction and by which route it applies, and the verification
 *   ran against exactly those. That is not a preference; it is what was checked.
 *
 * So the author's half is free text and the app's half is read-only. An author may ADD a code
 * they also worked to — a municipal ordinance, a client standard — and it is printed as
 * `declared`, beside the verified ones and distinguishable from them. What they may not do is
 * edit or remove a verified one, because the only thing a title block is for is stating what
 * the drawing was produced under, and a field that could quietly disagree with the run would
 * make every sheet in the set unfalsifiable.
 *
 * ── Why "brief" is enforced rather than advised ────────────────────
 *
 * `sheetToSvg` prints the title block as fixed 0.16 m lines under the drawing and `sheetToDxf`
 * emits each as one `TEXT` entity. A pasted paragraph does not wrap in either: in the SVG it
 * runs off the right edge of the viewBox, and in DXF a newline inside a TEXT group breaks the
 * entity and CAD refuses the file. Both failures are silent at the point of typing and appear
 * on someone else's screen. The limits below are what makes the field a rótulo.
 *
 * Pure: no store, no runes, no DOM. Names i18n keys, never translated strings.
 */

/**
 * What the author sets. Every field optional: a project that says nothing prints nothing,
 * which is honest, and is different from a project that says "Project".
 */
export interface RcTitleBlockConfig {
  /** The works. `Edificio Los Álamos — estructura de hormigón`. */
  project?: string;
  /** A second line: stage, block, contract number. */
  subtitle?: string;
  /** Who drew it. */
  office?: string;
  /** Codes the author declares they ALSO worked to. Never replaces a verified one. */
  declaredCodes?: string[];
}

/**
 * How long each field may be, in characters.
 *
 * Sized to the width `sheetToSvg` actually has: the title block prints at 0.09 m in a viewBox
 * whose width is the drawing's extent, and a beam-line elevation is six to eight metres wide.
 * Eighty characters fills it. They are limits on a RÓTULO, not on what a project may be
 * called — the report's heading takes the same string and has a paragraph to put it in.
 */
export const RC_TITLE_BLOCK_LIMITS = {
  project: 80,
  subtitle: 60,
  office: 60,
  code: 60,
} as const;

/**
 * How many codes an author may declare.
 *
 * Four, for the same reason `MAX_CONFLICT_NOTES` is twelve: a note block is read, not searched.
 * The VERIFIED codes are not bounded — every one of them is a statement about the run and
 * dropping any would be dropping evidence.
 */
export const RC_MAX_DECLARED_CODES = 4;

/**
 * One norm, as the rótulo prints it.
 *
 * `verified` — this application checked the design against it. `declared` — the author states
 * they also worked to it, and nothing in this application verified that. The distinction is
 * the whole reason the two are not one list of strings.
 */
export interface RcTitleBlockCode {
  text: string;
  source: 'verified' | 'declared';
  /**
   * i18n key qualifying a declared code. Null for a verified one, which needs no qualifier.
   *
   * A declared code with no qualifier beside it reads as a claim this application makes. It
   * does not make it.
   */
  qualifierKey: string | null;
}

/** A regulation binding, reduced to what a rótulo prints. Translated by the caller. */
export interface RcBoundCode {
  /** The instrument's name, already translated — `roles.ts` stores it as a key. */
  label: string;
  edition: string;
  /** Province, municipality, or the national scope. Empty when unstated. */
  jurisdiction?: string;
}

/**
 * Collapse a field to one line and clip it to its limit.
 *
 * Newlines and tabs become spaces rather than being rejected: a name pasted from a spreadsheet
 * carries them, refusing the paste would be hostile, and letting one through breaks a DXF TEXT
 * entity so that CAD will not open the file. Runs of whitespace collapse for the same reason a
 * rótulo has a width.
 */
export function rcTitleField(raw: string | undefined, limit: number): string {
  if (!raw) return '';
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit).trimEnd() : flat;
}

/** The config as it will be stored: every field normalised, empty ones dropped. */
export function rcNormaliseTitleBlock(config: RcTitleBlockConfig): RcTitleBlockConfig {
  const project = rcTitleField(config.project, RC_TITLE_BLOCK_LIMITS.project);
  const subtitle = rcTitleField(config.subtitle, RC_TITLE_BLOCK_LIMITS.subtitle);
  const office = rcTitleField(config.office, RC_TITLE_BLOCK_LIMITS.office);
  const declaredCodes = (config.declaredCodes ?? [])
    .map((c) => rcTitleField(c, RC_TITLE_BLOCK_LIMITS.code))
    .filter((c) => c.length > 0)
    // Deduplicated, because two identical lines on a rótulo read as two different instruments
    // whose names happen to match.
    .filter((c, i, all) => all.indexOf(c) === i)
    .slice(0, RC_MAX_DECLARED_CODES);
  return {
    ...(project ? { project } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(office ? { office } : {}),
    ...(declaredCodes.length > 0 ? { declaredCodes } : {}),
  };
}

/**
 * The codes the sheet prints: the verified ones the run used, then the author's declarations.
 *
 * Verified first and always. A declared code that repeats a verified one is DROPPED rather
 * than printed twice — the verified entry already says it and says more, and a reader seeing
 * `CIRSOC 201 · 2025` twice, once qualified as unverified, would reasonably conclude the two
 * lines meant different things.
 */
export function rcTitleBlockCodes(
  bound: readonly RcBoundCode[],
  config: RcTitleBlockConfig = {},
): RcTitleBlockCode[] {
  const verified: RcTitleBlockCode[] = [];
  const seen = new Set<string>();
  for (const b of bound) {
    const text = [b.label, b.edition].filter(Boolean).join(' · ')
      + (b.jurisdiction ? ` (${b.jurisdiction})` : '');
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push({ text, source: 'verified', qualifierKey: null });
  }
  const declared: RcTitleBlockCode[] = [];
  for (const raw of rcNormaliseTitleBlock(config).declaredCodes ?? []) {
    if (seen.has(raw.toLowerCase())) continue;
    seen.add(raw.toLowerCase());
    declared.push({
      text: raw, source: 'declared', qualifierKey: 'detailing.titleBlock.declared',
    });
  }
  return [...verified, ...declared];
}

/**
 * Whether the author has identified the project at all.
 *
 * Read by the panel to say so, and by the export path to decide whether it has a name to head
 * a document with. False is not an error: an unnamed project is a normal state of a project
 * being worked on, and it must be distinguishable from one called "Project".
 */
export function rcTitleBlockNamed(config: RcTitleBlockConfig): boolean {
  return rcTitleField(config.project, RC_TITLE_BLOCK_LIMITS.project).length > 0;
}
