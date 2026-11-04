/**
 * Whether a member is part of the lateral-force-resisting system, as the project DECLARES it.
 *
 * CIRSOC 201-2025 §9.7.3.8.2 makes the positive steel's anchorage at a support depend on it: a
 * quarter of the bars run 150 mm into any support that is not a simple one, and "si la viga forma
 * parte del sistema principal de resistencia a cargas laterales, debe anclarse para desarrollar fy
 * en la cara del apoyo". The seismic design (INPRES-CIRSOC 103 Parte II, through §18.1) asks the
 * same question as primary against secondary members. Both read this one declaration.
 *
 * ── Three values, and the third is not the second ──────────────────
 *
 * A member is declared part of the system, declared not part of it, or not declared. Nothing in
 * the model can answer for the engineer: a moment frame and a gravity frame braced by walls have
 * the same geometry, so the seismic classifier's guess (`engine/design/seismic/classify.ts`) is
 * offered as a suggestion and never read as a declaration. Until this existed nothing set the
 * flag and every beam was read, silently, as outside the system, which is the reading that asks
 * less of the bars.
 *
 * NOT DECLARED is designed as part of the system: fy developed at the face. That bar end satisfies
 * the clause whichever way the member is later declared, because the 150 mm is part of what a bar
 * that develops fy at the face reaches (ℓdh ≥ máx(8·db, 150 mm), §25.4.3.1; ℓd ≥ 300 mm,
 * §25.4.2.1), so a design made under it never has to be revisited for the anchorage. The verifier
 * and the detailing both lay that end already (`planSupportEnd`, need `develop`), and they read
 * the same reading (`developsAtFace`), so the member can reach a conforming state with the
 * assumption stated rather than be held unverified for a datum the code would be satisfied
 * without. What it costs is the bars a member outside the system would not need; declaring it
 * gives them back.
 *
 * ── Where a declaration lives ───────────────────────────────────────
 *
 *   `members['P{id}']` — a physical element (a continuous beam, `model/physical`): every analysis
 *      bar of it. Survives a re-recognition through `store/group-references.ts` (place `lateral`),
 *      and a bar split or re-meshed under it, because its members are read when the design runs.
 *   `members['e{id}']` — one analysis member, where no physical element holds it.
 *   `beams` — the project's default for its beams (the beam family).
 *
 * The member's own declaration wins over its physical element's, which wins over the project's.
 * Kept in the project's design data, so it saves, opens, autosaves and undoes with it, and a
 * change retires the design it fed (`store/design-data.ts`).
 *
 * Pure.
 */

export type LateralRole = 'lateral' | 'gravity';
export const LATERAL_ROLES: readonly LateralRole[] = ['lateral', 'gravity'];

export interface LateralSystemData {
  /** What a beam that declares nothing of its own is. Absent: not declared. */
  beams?: LateralRole;
  /** Declarations by member: `P{groupId}` a physical element, `e{elementId}` an analysis member. */
  members?: Record<string, LateralRole>;
}

/** What the design reads for one member: the role declared and where it was declared, or none. */
export interface LateralReading {
  role: LateralRole | 'undeclared';
  source?: 'member' | 'physical' | 'project';
}

export const UNDECLARED: LateralReading = Object.freeze({ role: 'undeclared' }) as LateralReading;

export const memberKey = (elementId: number): string => `e${elementId}`;
export const physicalKey = (groupId: number): string => `P${groupId}`;

/**
 * Whether the positive steel develops fy at the face of the supports (§9.7.3.8.2): declared part
 * of the lateral system, or not declared. Only a declaration that the member is NOT part of it
 * reads the 150 mm. Absent reading: not declared.
 */
export const developsAtFace = (r: LateralReading | undefined): boolean => r?.role !== 'gravity';

const isRole = (v: unknown): v is LateralRole => v === 'lateral' || v === 'gravity';

/**
 * A member's reading: its own declaration, its physical element's, the project's for its kind.
 * `kind` is the member's design kind; the project default is the beams'.
 */
export function lateralReadingOf(
  data: LateralSystemData | undefined, elementId: number,
  o: { physicalId?: number; kind?: 'beam' | 'column' | 'wall' } = {},
): LateralReading {
  const own = data?.members?.[memberKey(elementId)];
  if (isRole(own)) return { role: own, source: 'member' };
  const phys = o.physicalId !== undefined ? data?.members?.[physicalKey(o.physicalId)] : undefined;
  if (isRole(phys)) return { role: phys, source: 'physical' };
  if ((o.kind ?? 'beam') === 'beam' && isRole(data?.beams)) return { role: data!.beams!, source: 'project' };
  return UNDECLARED;
}

/**
 * A span's reading from its pieces' (`design-spans.ts`): one member, one role. A piece declared
 * part of the system makes the span part of it; the span is outside it only when every piece is
 * declared so; otherwise it is not declared. Each of those develops at least what the pieces ask.
 */
export function spanLateralReading(pieces: ReadonlyArray<LateralReading | undefined>): LateralReading {
  const lateral = pieces.find((r) => r?.role === 'lateral');
  if (lateral) return lateral;
  if (pieces.length > 0 && pieces.every((r) => r?.role === 'gravity')) return pieces[0]!;
  return UNDECLARED;
}

/**
 * The design data with only the project-level declaration, the beams' default: what an office
 * template carries, since a member's declaration names the members of the project it was made in.
 */
export function withProjectLateralOnly<T extends { lateralSystem?: LateralSystemData }>(d: T): T {
  const { lateralSystem, ...rest } = d;
  return (lateralSystem?.beams ? { ...rest, lateralSystem: { beams: lateralSystem.beams } } : rest) as T;
}

/**
 * Read any stored shape. The seismic roles once fixed by hand (`seismic.roles`, primary or
 * secondary by element id) were the same declaration under another name: they become member
 * declarations, a stored one of this record winning.
 */
export function migrateLateralSystem(raw: unknown, legacyRoles?: Record<string, unknown>): LateralSystemData | undefined {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const members: Record<string, LateralRole> = {};
  for (const [k, v] of Object.entries(legacyRoles ?? {})) {
    if (!/^\d+$/.test(k)) continue;
    if (v === 'primary') members[memberKey(Number(k))] = 'lateral';
    else if (v === 'secondary') members[memberKey(Number(k))] = 'gravity';
  }
  for (const [k, v] of Object.entries((r.members && typeof r.members === 'object' ? r.members : {}) as Record<string, unknown>)) {
    if (/^[eP]\d+$/.test(k) && isRole(v)) members[k] = v;
  }
  const out: LateralSystemData = {
    ...(isRole(r.beams) ? { beams: r.beams } : {}),
    ...(Object.keys(members).length ? { members } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}
