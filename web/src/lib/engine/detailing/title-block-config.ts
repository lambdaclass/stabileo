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
 * So the author's half is free text and the app's half is READ-ONLY — not "editable with a
 * qualifier", read-only. The title block states what the drawing was produced under, and a
 * field that could disagree with the run would make every sheet in the set unfalsifiable.
 *
 * An earlier draft let an author DECLARE an extra code, printed beside the verified ones and
 * marked as unverified. That is out by decision: the rótulo shows the regulations selected in
 * the Reglamentos stage and nothing else, and it follows that selection when it changes. A
 * per-code visibility switch is a future extension and is deliberately not here — a control
 * that could hide a governing code is the same failure as one that could rename it.
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
} as const;

/**
 * One norm, as the rótulo prints it.
 *
 * A plain text and nothing else. It carried a `source` and a qualifier while an author could
 * declare a code of their own; with that removed every entry is a regulation this application
 * verified against, and a single-valued discriminator is a field a reader has to check to learn
 * nothing.
 */
export interface RcTitleBlockCode {
  text: string;
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
  return {
    ...(project ? { project } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(office ? { office } : {}),
  };
}

/**
 * The codes the sheet prints: the regulations bound in the Reglamentos stage, and only those.
 *
 * In the order the roles are bound, deduplicated — one instrument bound to two roles is one
 * line on a rótulo, and printing it twice would read as two instruments whose names happen to
 * match. Nothing the author can type reaches this list; see the header for why.
 */
export function rcTitleBlockCodes(bound: readonly RcBoundCode[]): RcTitleBlockCode[] {
  const out: RcTitleBlockCode[] = [];
  const seen = new Set<string>();
  for (const b of bound) {
    const text = [b.label, b.edition].filter(Boolean).join(' · ')
      + (b.jurisdiction ? ` (${b.jurisdiction})` : '');
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text });
  }
  return out;
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
