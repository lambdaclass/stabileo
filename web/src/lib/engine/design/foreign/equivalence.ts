/**
 * The CIRSOC rows read under the code each edition adopts, check by check: a row keeps its
 * verdict under ACI 318-19 or AISC 360-10 only where the formula the CIRSOC engine evaluated is
 * that code's, with the same φ, within the material limits both texts set, and for the member the
 * row was computed for; it then carries that code's clause. Every other row stays, not verified,
 * with "no equivalence established", the reason, and the CIRSOC clause it came from. A row on the
 * safe side of the foreign code is not an equivalence either: its ratio is not that code's.
 *
 * CIRSOC 201-2025 → ACI 318-19 (CIRSOC 201-2025 adopts ACI 318-19's equations; the text is in
 * `docs/codes/CIRSOC/markdown/cirsoc-201-2025/`):
 *  · Every row: f'c ≥ 17 MPa (ACI 318-19 Table 19.2.1.1).
 *  · Flexure, 22.3 with φ from Table 21.2.2 (εty to εty + 0,003): identical, β1 and εcu = 0,003
 *    included. Flanged beams, non-rectangular columns and walls read the same table since
 *    f885e996 (`CIRSOC_SHAPED_PATHS_ON_TABLE_21_2_2`).
 *  · Shear, Table 22.5.5.1 (a) and (c) with λs, Av,min of 9.6.3.4, Vs ≤ 0,66·√f'c·bw·d (the limit
 *    of 22.5.1.2): identical while fy ≤ 420 MPa, since the row computes Vs with the bars' fy and ACI
 *    318-19 22.5.3.3 limits fyt to 420 MPa (Table 20.2.2.4(a)), and while f'c ≤ 69 MPa, since the
 *    row does not apply the √f'c ≤ 8,3 MPa of 22.5.3.1.
 *  · Axial force and flexure, 22.4 with Table 21.2.2 and Table 22.4.2.1 (0,80·Po ties, 0,85·Po
 *    spirals), slenderness by 6.6.4: identical while fy ≤ 500 MPa. Po takes fy ≤ 500 MPa in
 *    CIRSOC 201-2025 22.4.2.1 and fy ≤ 550 MPa in ACI 318-19 22.4.2.1.
 *  · Biaxial bending by the reciprocal load method: not a provision of ACI 318-19.
 *  · Torsion, 22.7: as shear (22.7.2.1, 22.7.2.2).
 *  · Bar fit 25.2.1, crack-control spacing 24.3.2 (fs = 2/3·fy), tie spacing 25.7.2.1, layer
 *    clearances 25.2: identical.
 *  · Development length: none. The rows read ℓd of Table 25.4.2.3 and ℓdh of 25.4.3.1 together
 *    (a bar is "insufficient" or "needs a hook" by both). CIRSOC 201-2025 25.4.3.1 keeps the
 *    hooked length linear in db (0,24·fy·ψ/√f'c·db, ACI 318-14's form); ACI 318-19 reads db^1,5.
 *    Table 25.4.2.3 splits the bars at db ≤ 16 mm where ACI splits them at No. 19/No. 22 (a
 *    Ø20 is neither), and ψg is set by grade (fy = 500 MPa is not an ACI grade).
 *  · Minimum steel: 9.6.1.2 (beams, with 9.6.1.3) and 10.6.1.1 (columns, 1 %), identical. A wall's
 *    own rows, Tabla 11.6.1 and §11.6.2, are ACI 318-19's Table 11.6.1 and 11.6.2; its 9.6.1.2 row
 *    (the beam path's flexural minimum) has none.
 *  · Maximum steel: 9.3.3.1 (beams tension-controlled, εt ≥ εty + 0,003) and 10.6.1.1 (8 %).
 *  · Cover: the bars sit inside the stated cover; both texts number the specified cover 20.5.1.3
 *    (`capitulo-20-…md:1204`). The stated cover is not compared with Table 20.5.1.3.1 in either.
 *
 * CIRSOC 301-2018 → AISC 360-10 (`docs/codes/CIRSOC/markdown/cirsoc-301-2018/`):
 *  · D2 tension: φt = 0,90 and 0,75, Pn = Fy·Ag and Fu·Ae: identical.
 *  · E3, E4, E7 compression: none. CIRSOC 301-2018 E.1 takes φc = 0,85, AISC 360-10 E1 0,90.
 *  · F2 (I-shapes, channels) and F3 (I-shapes): identical where the checker's branch is AISC's:
 *    Mp = Fy·Zx not capped (CIRSOC F.2.1 caps it at 1,5·My, AISC F2-1 does not), J and Cw known
 *    where lateral-torsional buckling applies, FL not read (CIRSOC F.2.7, F.3.2 take
 *    FL = Fy − Fr, 69 or 114 MPa, where AISC takes 0,7·Fy: so only within Lp with a compact
 *    flange), a compact web, and for a channel a compact flange (AISC F2 covers compact channels
 *    only). Cb by F1-1 is the same formula in both.
 *  · F4 and F5: none. The checker evaluates CIRSOC F.4 and F.5, whose FL is Fy − Fr (F.4.6a,
 *    F.5.3) where AISC F4 and F5 read 0,7·Fy.
 *  · F6 weak axis (I-shapes, channels): identical where Fy·Zy ≤ 1,5·Fy·Sy: CIRSOC F.6.1 caps Mp at
 *    1,5·Fy·Sy, AISC F6-1 at 1,6·Fy·Sy.
 *  · G2 strong-axis shear: rolled I-shapes take φv = 1,00 and Cv = 1,0 in AISC G2.1(a) where
 *    h/tw ≤ 2,24·√(E/Fy), with h less the fillet; the checker takes φv = 0,90 throughout (G.1)
 *    and h/tw without the root radius, so for an I-shape there is none. A channel is G2.1(b) in
 *    both: identical where the web's Cv is 1 (the checker's h/tw, larger than AISC's, then
 *    gives AISC's Cv too).
 *  · Weak-axis shear, G.6 in CIRSOC 301-2018 and G7 in AISC 360-10 (Aw = bf·tf per flange,
 *    h/tw = b/tf, kv = 1,2, φv = 0,90): identical for I-shapes and channels.
 *  · H1: identical with tension (Pc = φt·Pn, H1.2) where the flexural terms are; with compression
 *    Pc = φc·Pn and φc differs.
 *  · Other shapes (HSS, angles, tees) are read in flexure and shear with the checker's general
 *    limit, not F7 to F11 or G4 to G6: none.
 */
import type { CheckRow } from '../../../design-contract';
import type { SteelVerification } from '../../codes/argentina/cirsoc301';

/**
 * Whether the CIRSOC 201 paths for flanged beams (`flangedCapacity` with `CIRSOC201_DESIGN_EDITION`),
 * non-rectangular columns (`shaped-column` → `cirsoc201-section` with the design edition) and walls
 * read φ from Table 21.2.2 of the 2025 edition. They do since f885e996; were one of them to go back
 * to the 2005 rule, its flexure and axial-flexure rows would have no equivalence, and this says so.
 * (`cirsoc201-circular.ts` still reads 2005, but no design path calls it.)
 */
export const CIRSOC_SHAPED_PATHS_ON_TABLE_21_2_2 = true;

/** Which branch the CIRSOC 301 checker took for a member, as far as the equivalence depends on it. */
export interface SteelBranches {
  /** Mp = 1,5·My, the cap of CIRSOC 301-2018 F.2.1, bound the strong-axis plastic moment. */
  strongCapBinds: boolean;
  /** Lb > Lp and J or Cw missing: the engine does not evaluate the lateral-torsional buckling. */
  strongSimplifiedLtb: boolean;
  /** The strong-axis strength read FL (Mr = FL·Sx, F.2.7, F.3.1, F.4): CIRSOC's Fy − Fr, not AISC's 0,7·Fy. */
  strongReadsFL: boolean;
  /** The web is compact in flexure. */
  webCompactFlexure: boolean;
  /** The flange is compact in flexure (Tabla B.4.1b). */
  flangeCompactFlexure: boolean;
  /** Mp = 1,5·Fy·Sy, the cap of CIRSOC 301-2018 F.6.1, bound the weak-axis plastic moment. */
  weakCapBinds: boolean;
  /** Cv = 1 on the web in strong-axis shear. */
  webShearCv1: boolean;
  /** The axial capacity H1 read: φt·Pn or φc·Pn. */
  interactionAxial?: 'tension' | 'compression';
}

/** The member a row belongs to, as far as the equivalence depends on it. */
export interface MemberShape {
  elementType: 'beam' | 'column' | 'wall' | 'member';
  /** A flanged beam, a non-rectangular column, a wall: the CIRSOC paths whose φ was once pending. */
  pendingPhi?: boolean;
  /** Steel: the shape as the CIRSOC 301 checker reads it. */
  steelShape?: 'I' | 'U' | 'T' | 'L' | 'RHS' | 'CHS' | 'other';
  /** Concrete: f'c and fy the CIRSOC rows were computed with, MPa. */
  fc?: number; fy?: number;
  /** Steel: the checker's branches (`steelBranches`). */
  steel?: SteelBranches;
}

/**
 * The branches of the CIRSOC 301 checker, from its own result: the steps state which branch each
 * check took, and Cv is in the shear result.
 */
export function steelBranches(v: SteelVerification): SteelBranches {
  /*
   * Read off the engine's calculation messages (`c301.*`, `cirsoc301.ts`), not off rendered text:
   * the keys and their numbers are what the engine says it did.
   */
  type M = { key: string; params?: Record<string, unknown> };
  const msgs = (c?: { messages?: readonly M[] }): readonly M[] => c?.messages ?? [];
  const find = (c: { messages?: readonly M[] } | undefined, key: string) => msgs(c).find((m) => m.key === key);
  const z = v.flexureZ;
  const flange = find(z, 'c301.f.flangeClass')?.params?.cls as M | undefined;
  const weak = find(v.flexureY, 'c301.f.weakModuli')?.params as { Zy?: number; Sy?: number } | undefined;
  // The lateral-torsional buckling that needs J or Cw: without them the engine does not evaluate it.
  const ltbNeedsTorsion = new Set(['c301.refuse.ltbNoJ', 'c301.refuse.f4NoCw']);
  return {
    strongCapBinds: !!find(z, 'c301.f.mpCapped'),
    strongSimplifiedLtb: ltbNeedsTorsion.has(z.notEvaluatedMessage?.key ?? ''),
    // FL = Fy − Fr is read past Lp (Lr and Mr of F.2.2), by a noncompact flange (F.3.2) and in F.4/F.5.
    strongReadsFL: !!find(z, 'c301.f.lr') || z.clause === 'F.4' || z.clause === 'F.5' || flange?.key === 'c301.word.noncompact',
    webCompactFlexure: z.clause === undefined || z.clause === 'F.2' || z.clause === 'F.3',
    flangeCompactFlexure: flange?.key === 'c301.word.compact',
    weakCapBinds: !!weak && Number(weak.Zy) > 1.5 * Number(weak.Sy),
    webShearCv1: v.shear.Cv === 1,
    ...(v.interaction ? { interactionAxial: v.tension ? 'tension' as const : 'compression' as const } : {}),
  };
}

type Clause = string | ((r: CheckRow, m: MemberShape) => string | null);
/**
 * One check's equivalence: the foreign clause, and `unless`, the reason it does not hold for this
 * row (null when it does); or `none`, why it never does. A row without equivalence names the
 * foreign clause it answers to (`clause`, when there is one) and carries none of the CIRSOC
 * numbers: its ratio, demand, capacity and inputs are that code's, not this one's.
 */
type Equivalence =
  | { clause: Clause; note?: string; unless?: (r: CheckRow, m: MemberShape) => string | null }
  | { none: string; clause?: string };

const or = (...reasons: Array<string | null | false | undefined>): string | null => reasons.filter(Boolean).join('; ') || null;

/** f'c and fy where the formula reads them: what ACI 318-19 limits and the CIRSOC row does not. */
const shearLimits = (clauseFy: string, clauseFc: string) => (_r: CheckRow, m: MemberShape) => or(
  m.fy !== undefined && m.fy > 420 && `fyt = ${m.fy} MPa in Vs; ACI 318-19 ${clauseFy} limits it to 420 MPa (Table 20.2.2.4(a))`,
  m.fc !== undefined && m.fc > 69 && `f'c = ${m.fc} MPa: ACI 318-19 ${clauseFc} limits √f'c to 8,3 MPa, which the row does not apply`,
);

const WALL_MIN = /^11\.6\.[12]$/;

const ACI318_19: Readonly<Record<string, Equivalence>> = {
  'check.rc.flexure': { clause: '22.3; 21.2.2' },
  'check.rc.shear': {
    clause: '22.5', note: 'ACI 318-19 Table 22.5.5.1 (a), (c) with λs; Vs ≤ 0,66·√f\'c·bw·d as the limit of 22.5.1.2',
    unless: shearLimits('22.5.3.3', '22.5.3.1'),
  },
  'check.rc.axialFlexure': {
    clause: '22.4; 21.2.2; 6.6.4',
    unless: (_r, m) => (m.fy !== undefined && m.fy > 500 ? `fy = ${m.fy} MPa: Po takes fy ≤ 500 MPa in CIRSOC 201-2025 22.4.2.1 and fy ≤ 550 MPa in ACI 318-19 22.4.2.1` : null),
  },
  'check.rc.biaxial': { none: 'the reciprocal load method is not a provision of ACI 318-19' },
  'check.rc.torsion': { clause: '22.7', unless: shearLimits('22.7.2.2', '22.7.2.1') },
  'check.rc.barFit': { clause: '25.2.1' },
  'check.rc.barSpacing': { clause: '24.3.2' },
  'check.rc.anchorage': {
    clause: '25.4.2.3; 25.4.3.1',
    none: 'the row reads ℓd (Table 25.4.2.3) and ℓdh (25.4.3.1) together; CIRSOC 201-2025 25.4.3.1 takes ℓdh linear in db, '
      + 'ACI 318-19 25.4.3.1 in db^1,5, and Table 25.4.2.3 splits the bars at 16 mm where ACI 318-19 splits them at No. 19/No. 22',
  },
  'check.rc.minSteel': {
    // A wall's own rows (Tabla 11.6.1, §11.6.2) are ACI 318-19's Table 11.6.1 and 11.6.2: the same rows,
    // with the bars split at 16 mm where ACI says No. 16 (15,9 mm), the same designation.
    clause: (r, m) => (m.elementType === 'column' ? '10.6.1.1' : WALL_MIN.test(r.clause ?? '') ? r.clause! : '9.6.1.2'),
    unless: (r, m) => (m.elementType === 'wall' && !WALL_MIN.test(r.clause ?? '') ? 'the wall\'s row evaluates the flexural minimum of 9.6.1.2, not ACI 318-19 Table 11.6.1' : null),
  },
  'check.rc.maxSteel': {
    clause: (_r, m) => (m.elementType === 'column' ? '10.6.1.1' : '9.3.3.1'),
    unless: (_r, m) => (m.elementType === 'wall' ? '9.3.3.1 is a beam provision; ACI 318-19 sets no such limit on walls' : null),
  },
  'check.rc.tieSpacing': { clause: '25.7.2.1' },
  'check.rc.congestion': { clause: '25.2' },
  'check.rc.cover': { clause: '20.5.1.3', note: 'the bars sit inside the stated cover; the stated cover is not compared with Table 20.5.1.3.1' },
};

const IU = (m: MemberShape) => m.steelShape === 'I' || m.steelShape === 'U';
const GENERAL = 'the CIRSOC checker reads this shape with its general limit, not AISC 360-10 F7 to F11 or G4 to G6';
const PHI_C = 'φc = 0,85 in CIRSOC 301-2018 E.1 against 0,90 in AISC 360-10 E1';
const NO_BRANCHES = 'the checker\'s branch for this member is not known';

/** Why the strong-axis flexure of an I-shape or a channel is not AISC 360-10's F2/F3, or null. */
const strongFlexure = (m: MemberShape): string | null => {
  if (!IU(m)) return GENERAL;
  const s = m.steel;
  if (!s) return NO_BRANCHES;
  return or(
    s.strongCapBinds && 'Mp = 1,5·My by CIRSOC 301-2018 F.2.1; AISC 360-10 F2-1 has no such cap',
    s.strongSimplifiedLtb && 'J or Cw missing: the lateral-torsional buckling is not evaluated, not AISC 360-10 F2-4 and F2-6',
    s.strongReadsFL && 'FL = Fy − Fr (69 or 114 MPa) by CIRSOC 301-2018 F.2.7 and F.3.2; AISC 360-10 F2 and F3 take 0,7·Fy',
    !s.webCompactFlexure && 'the web is not compact in flexure: CIRSOC 301-2018 F.4 or F.5, whose FL is Fy − Fr where AISC 360-10 F4 and F5 take 0,7·Fy',
    m.steelShape === 'U' && !s.flangeCompactFlexure && 'AISC 360-10 F2 covers channels with compact flanges only',
  );
};
/** Why the weak-axis flexure is not AISC 360-10's F6, or null. */
const weakFlexure = (m: MemberShape): string | null => {
  if (!IU(m)) return GENERAL;
  if (!m.steel) return NO_BRANCHES;
  return m.steel.weakCapBinds ? 'Mp = 1,5·Fy·Sy by CIRSOC 301-2018 F.6.1; AISC 360-10 F6-1 caps it at 1,6·Fy·Sy' : null;
};

const AISC360_10: Readonly<Record<string, Equivalence>> = {
  'check.steel.D.2': { clause: 'D2' },
  'check.steel.E.3': { clause: 'E3; E4; E7', none: PHI_C },
  'check.steel.E.7': { clause: 'E3; E4; E7', none: PHI_C },
  'check.steel.E.4': { clause: 'E3; E4; E7', none: PHI_C },
  'check.steel.E.5': { clause: 'E5', none: PHI_C },
  'check.steel.E.6': { clause: 'E6', none: PHI_C },
  'check.steel.F.2': { clause: (_r, m) => (m.steelShape === 'I' ? 'F2; F3' : 'F2'), unless: (_r, m) => strongFlexure(m) },
  'check.steel.F.3': { clause: (_r, m) => (m.steelShape === 'I' ? 'F2; F3' : 'F2'), unless: (_r, m) => strongFlexure(m) },
  'check.steel.F.4': { clause: 'F4', none: 'CIRSOC 301-2018 F.4 takes FL = Fy − Fr (F.4.6a), AISC 360-10 F4 0,7·Fy' },
  'check.steel.F.5': { clause: 'F5', none: 'CIRSOC 301-2018 F.5 takes Fr in F.5.3 and F.5.5b, AISC 360-10 F5 0,3·Fy and 0,7·Fy' },
  'check.steel.F.6': { clause: 'F6', unless: (_r, m) => weakFlexure(m) },
  'check.steel.G.2': {
    clause: 'G2',
    unless: (_r, m) => (m.steelShape === 'I'
      ? 'AISC 360-10 G2.1(a) gives rolled I-shapes with h/tw ≤ 2,24·√(E/Fy) φv = 1,00 and Cv = 1,0, h less the fillet; the checker takes φv = 0,90 (G.1) and h/tw without the root radius'
      : m.steelShape !== 'U' ? GENERAL
        : !m.steel ? NO_BRANCHES
          : !m.steel.webShearCv1 ? 'Cv < 1 from h/tw without the root radius; AISC 360-10 G2.1(b) reads h less the fillet' : null),
  },
  'check.steel.G.6': { clause: 'G7', note: 'weak-axis shear is G7 in AISC 360-10', unless: (_r, m) => (IU(m) ? null : GENERAL) },
  'check.steel.H1': {
    clause: (r) => r.clause ?? 'H1',
    unless: (_r, m) => (!m.steel ? NO_BRANCHES
      : m.steel.interactionAxial !== 'tension' ? `with compression H1 reads φc·Pn: ${PHI_C}`
        : or(strongFlexure(m), weakFlexure(m))),
  },
};

const STRENGTH = new Set(['check.rc.flexure', 'check.rc.axialFlexure']);

function carry(
  rows: CheckRow[], m: MemberShape, table: Readonly<Record<string, Equivalence>>, code: string, edition: string, name: string,
  member: (m: MemberShape) => string | null = () => null,
): CheckRow[] {
  return rows.map((r) => {
    const eq = r.titleKey ? table[r.titleKey] : undefined;
    const pending = !!m.pendingPhi && STRENGTH.has(r.titleKey ?? '') && !CIRSOC_SHAPED_PATHS_ON_TABLE_21_2_2;
    const clause = !eq?.clause ? null : typeof eq.clause === 'function' ? eq.clause(r, m) : eq.clause;
    const why = r.status === 'unsupported' ? 'a provision the CIRSOC engine does not evaluate'
      : pending ? 'this CIRSOC path still reads φ by the 2005 edition'
        : !eq ? 'the CIRSOC formula is not one of this code\'s'
          : 'none' in eq ? eq.none
            : or(member(m), !clause && 'the CIRSOC formula is not one of this code\'s', eq.unless?.(r, m));
    if (!why && eq && !('none' in eq)) {
      return { ...r, code, edition, clause: clause!, ...(eq.note ? { derivation: [...(r.derivation ?? []), eq.note] } : {}) };
    }
    const { demand: _d, capacity: _c, clause: _cl, inputs: _i, ...rest } = r;
    return {
      ...rest, code, edition, ...(clause ? { clause } : {}), inputs: [], ratio: null, status: r.status === 'unsupported' ? 'unsupported' : 'notVerified',
      derivation: [`no equivalence established with ${name}: ${why} (${r.code} ${r.edition ?? ''} ${r.clause ?? ''})`.replace(/\s+\)/, ')'), ...(r.derivation ?? [])],
    };
  });
}

/** CIRSOC 201-2025 rows under ACI 318-19. */
export const aci318Rows = (rows: CheckRow[], m: MemberShape): CheckRow[] => carry(rows, m, ACI318_19, 'aci-318', '19', 'ACI 318-19',
  (s) => (s.fc !== undefined && s.fc < 17 ? `f'c = ${s.fc} MPa is below the 17 MPa of ACI 318-19 Table 19.2.1.1` : null));

/** CIRSOC 301-2018 rows under AISC 360-10. */
export const aisc360Rows = (rows: CheckRow[], m: MemberShape): CheckRow[] => carry(rows, m, AISC360_10, 'aisc-360', '10', 'AISC 360-10');
