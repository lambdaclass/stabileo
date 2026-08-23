/**
 * Which clause each expression in the CIRSOC 301 checker implements.
 *
 * ══ What this is for ══
 *
 * `cirsoc301-capabilities.ts` gates every metallic capability, and one of its four stated reasons is
 * that the checker «cites no clause anywhere in the `ClauseRef` sense, so `deriveMaturity` could not
 * promote it past UNSUPPORTED even if benchmarks existed». The existing `CIRSOC301_CLAUSES` map is
 * chapter-level — `steelTension: '§D'` — which names a chapter, not a rule.
 *
 * This is the per-EXPRESSION map that blocker needs. It does not remove the blocker: every entry is
 * `validation: 'unvalidated'`, and until a person with normative competence signs the mapping, a
 * clause number here is a **proposal about what the code implements**, not a certificate that it
 * implements it correctly.
 *
 * ══ The numbers are cited from the shipped text, not from memory ══
 *
 * `docs/codes/CIRSOC/markdown/cirsoc-301-2018/` carries chapters A–N, so every `clause` below was
 * read out of the official text rather than recalled from AISC. That matters more than it sounds:
 * **CIRSOC 301-2018 numbers its expressions with dots** — `D.2.1`, `E.3.2a`, `F.2.1`, `G.2.3` —
 * where AISC 360 writes `D2-1`, `E3-2`, `F2-1`, `G2-3`. Cited in the AISC style, every reference
 * here would have been wrong for the regulation the project declares.
 *
 * ══ What the exercise turned up ══
 *
 * Mapping code to clauses is how you find out where the code is not the clause. Two findings, both
 * recorded on the entries themselves rather than in a comment nobody reads:
 *
 *   1. **The flexural plateau has no `1,5·My` cap.** F.2.1 reads `Mn = Mp = Fy·Zx ≤ 1,5·My`.
 *      `checkSteelFlexure` computes `Mp = Fy·Zx` and stops — it never computes `My`, so the cap is
 *      not applied. For a rolled I-section `Zx/Sx` is about 1.1–1.2 and the cap does not bind; for
 *      a shape with a high shape factor it can. A missing upper bound is unconservative.
 *   2. **The compression branches are the text's own alternative forms.** The code's
 *      `0.658^(Fy/Fe)·Fy` is E.3.2**a**, not E.3.2, and its `0.877·Fe` is E.3.3 written through
 *      `λc² = Fy/Fe`. The text supplies both forms and states the `kL/r ≤ 4,71√(E/Fy)` equivalence
 *      the code switches on, so the code matches — but the citation has to be the `a` variant, and
 *      only reading the text shows that.
 *
 * ══ What this file must never do ══
 *
 * Promote a capability, unblock the verification stage, or be read as a validation. It is a
 * contract: a place where the mapping can be reviewed clause by clause instead of argued about in
 * the abstract.
 */

/**
 * How far human review has got. Three values, and today every entry is the first.
 *
 * Separate from the capability matrix on purpose: a capability answers «can the app do this», and
 * this answers «has anyone checked that this line implements that rule». The second has to be true
 * before the first can change, and conflating them is how an unreviewed mapping becomes a claim.
 */
export type ClauseValidation =
  /** Proposed by reading the code and the text. Nobody with normative competence has confirmed it. */
  | 'unvalidated'
  /** A competent reviewer has read the expression against the clause and agrees. */
  | 'reviewed'
  /** Reviewed and signed, with the reviewer recorded outside this file. */
  | 'signed';

export interface ClauseMapEntry {
  /** The limit state, matching `STEEL_CAPABILITY_KEYS` where one applies. */
  capability: string;
  /** The expression as the code computes it, in the code's own terms. */
  expression: string;
  /**
   * The clause or expression number in CIRSOC 301-2018, as printed in the shipped text.
   *
   * Dotted, because that is how the regulation numbers them. Never the AISC form.
   */
  clause: string;
  /** Which `SteelDesignParams` fields the expression consumes. */
  inputs: readonly string[];
  /** What the expression takes for granted, in this app's implementation of it. */
  assumptions: readonly string[];
  /** What it does not cover, or where it departs from the clause. Empty when it matches. */
  limitations: readonly string[];
  validation: ClauseValidation;
}

/**
 * The map, one entry per expression the checker evaluates.
 *
 * Frozen: a caller that could edit it could mark an entry `signed` without a signature, which is the
 * one failure mode this whole structure exists to prevent.
 */
export const CIRSOC301_CLAUSE_MAP: readonly ClauseMapEntry[] = Object.freeze([
  // ── §D — tracción ────────────────────────────────────────────────
  {
    capability: 'steelTension',
    expression: 'phiPn = 0.90 · Fy · Ag',
    clause: 'D.2.1',
    inputs: ['Fy', 'A'],
    assumptions: ['φt = 0,90 is the code value for yielding on the gross section.'],
    limitations: [],
    validation: 'unvalidated',
  },
  {
    capability: 'steelTension',
    expression: 'phiPn = 0.75 · Fu · Ae,  with Ae = Ag',
    clause: 'D.2.2',
    inputs: ['Fu', 'A'],
    assumptions: [
      'Ae is taken EQUAL to Ag: no hole deduction and no shear-lag factor U.',
    ],
    limitations: [
      'D.3 defines Ae exactly: `Ae = An` when the force is transmitted by EVERY element of the '
      + 'section (D.3(1)), and `Ae = An·U` with `U = 1 − x̄/L ≤ 0,9` (D.3.2) when only some '
      + 'elements transmit it — x̄ the connection eccentricity and L its length, both in cm. `An` '
      + 'follows B.4.2, which deducts each hole at its nominal dimension PLUS 2 mm.',
      'So `Ae = Ag` is exact for a welded member with no holes, and optimistic for a bolted one. '
      + 'Closing it needs the hole pattern and the connection length and eccentricity — not a '
      + 'better rule, a datum the model does not hold.',
    ],
    validation: 'unvalidated',
  },

  // ── §E — compresión ──────────────────────────────────────────────
  {
    capability: 'steelCompression',
    expression: 'phiPn = 0.85 · Fcr · Ag',
    clause: 'E.3.1',
    inputs: ['A'],
    assumptions: ['Flexural buckling only: no torsional or flexural-torsional mode is considered.'],
    limitations: [
      'E.4 covers torsional and flexural-torsional buckling, which governs for angles, tees and '
      + 'cruciform sections. Not implemented, so those sections are checked on the wrong mode.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelCompression',
    expression: 'Fcr = 0.658^(Fy/Fe) · Fy,  for KL/r ≤ 4.71·√(E/Fy)',
    clause: 'E.3.2a',
    inputs: ['Fy', 'E', 'A', 'Iy', 'Iz', 'L', 'Kx', 'Ky'],
    assumptions: [
      'The `a` variant, which is the text\'s own restatement of E.3.2 through Fe rather than λc. '
      + 'The switch uses the kL/r ≤ 4,71·√(E/Fy) equivalence the text states alongside it.',
      'K defaults to 1.0 on both axes. Apéndice 6 §6.1 sanctions exactly that: a column braced at '
      + 'its ends and at intermediate points per §6.2 «puede ser proyectada con una longitud L '
      + 'entre puntos arriostrados y con un factor de longitud efectiva k = 1». Conditional on the '
      + 'bracing complying, which the app cannot check.',
    ],
    limitations: [],
    validation: 'unvalidated',
  },
  {
    capability: 'steelCompression',
    expression: 'Fcr = 0.877 · Fe,  for KL/r > 4.71·√(E/Fy)',
    clause: 'E.3.3',
    inputs: ['Fy', 'E', 'A', 'Iy', 'Iz', 'L', 'Kx', 'Ky'],
    assumptions: [
      'E.3.3 is printed as (0,877/λc²)·Fy; with λc² = Fy/Fe that is 0,877·Fe, which is what the '
      + 'code evaluates.',
    ],
    limitations: [],
    validation: 'unvalidated',
  },

  // ── §F — flexión ─────────────────────────────────────────────────
  {
    capability: 'steelFlexure',
    expression: 'Mp = min(Fy · Zx, 1.5 · My),  My = Fy · Sx',
    clause: 'F.2.1',
    inputs: ['Fy', 'Zx', 'Sx'],
    assumptions: [
      'Zx is computed from the section geometry when the caller supplies none.',
      'My uses the homogeneous-section form the clause gives: My = Fy·Sx·(10-3).',
    ],
    limitations: [
      'F.2 applies to «secciones de doble simetría y a canales flexados alrededor del eje fuerte, '
      + 'y con alas y almas COMPACTAS para flexión, tal como se definen en la Sección B.4.1». The '
      + 'app does not classify sections, so it may be applying F.2 outside its stated scope — see '
      + 'the B.4.1 entry.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelFlexure',
    expression: 'Mp = min(Fy · Zy, 1.5 · Fy · Sy),  Sy = Iy / (b/2)',
    clause: 'F.6.1',
    inputs: ['Fy', 'Zy', 'Iy', 'b'],
    assumptions: ['Minor-axis bending of an I or a channel. No lateral-torsional buckling applies.'],
    limitations: [
      'F.6.2 defines a FLANGE LOCAL BUCKLING limit state for minor-axis bending and it is not '
      + 'implemented, so the weak-axis capacity is the plastification one alone.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelLateralTorsionalBuckling',
    expression: 'Cb = 12.5·Mmáx / (2.5·Mmáx + 3·MA + 4·MB + 3·MC)',
    clause: 'F.1.1',
    inputs: ['stationMoments', 'shape'],
    assumptions: [
      'MA, MB and MC are the absolute moments at the quarter, mid and three-quarter points of the '
      + 'UNBRACED segment, read from the station diagram and linearly interpolated between '
      + 'stations — so the value reflects the diagram the analysis produced, not an idealised load '
      + 'shape.',
      'Absent a diagram, Cb falls back to 1,0, which the clause permits explicitly: «Se permite '
      + 'adoptar conservadoramente un valor Cb = 1 para todos los casos de diagramas de momento '
      + 'flector». The expression\'s own floor is 1, so computing it can only raise a capacity '
      + 'above that, never lower it.',
      'For a cantilever with an unbraced free end the clause REQUIRES Cb = 1, and that rule is '
      + 'applied before anything is read.',
    ],
    limitations: [
      'Applied only within F.1.1\'s stated cases: doubly-symmetric sections in either curvature, '
      + 'and singly-symmetric ones in SINGLE curvature. A singly-symmetric section in double '
      + 'curvature falls under §F.1(4), which requires LTB checked «para ambas alas» — this app '
      + 'computes one Mn, so F.1.1 is not applied there.',
      'No Cb ≤ 3 cap is imposed: that limit does not appear in this clause, and adding it would be '
      + 'adding a rule the shipped text does not state.',
      'Computing Cb does NOT certify the bracing. Apéndice 6 §6.1 requires a brace to meet minimum '
      + 'strength and stiffness «incluyendo los efectos de las uniones y detalles de anclaje», '
      + 'which this app cannot evaluate.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelSectionClassification',
    expression: '(not implemented)',
    clause: 'B.4.1',
    inputs: [],
    assumptions: [],
    limitations: [
      'B.4.1 classifies sections as compacta / no compacta / con elementos esbeltos against the λp '
      + 'and λr limits of Tables B.4.1a and B.4.1b. **Those tables are IMAGES in the source PDF**: '
      + 'the shipped markdown carries their captions, footnotes and symbol list but not the cells, '
      + 'so the limit values are not available in this repository. This is the one audited item '
      + 'that is blocked on DATA rather than on work.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelLateralTorsionalBuckling',
    expression: 'Lp = 1.76 · ry · √(E/Fy)',
    clause: 'F.2.2',
    inputs: ['E', 'Fy', 'Iy', 'A'],
    assumptions: [
      'ry is √(Iy/A) with Iy the WEAK-axis inertia — the caller must pass the axes in the '
      + 'checker\'s naming, which is the reverse of this app\'s.',
    ],
    limitations: [
      'Cb is not computed: the moment gradient factor is effectively 1,0, which is the uniform-'
      + 'moment case and conservative for most spans.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelLateralTorsionalBuckling',
    expression: 'linear interpolation of Mn between Lp and Lr',
    clause: 'F.2.2',
    inputs: ['Lb', 'Lp', 'Lr', 'Mp', 'Sx', 'Fy'],
    assumptions: [
      'Lb is supplied by the caller as the member length — the member is assumed unbraced end to '
      + 'end. Apéndice 6 §6.1 defines it as «la longitud lateralmente no arriostrada Lb igual a la '
      + 'distancia entre puntos intermedios», in cm, for beams whose intermediate braced points '
      + 'satisfy §6.3. So the definition is available; what the model lacks is the field.',
      '§6.3 rules out one candidate explicitly: «el punto de inflexión no será considerado un '
      + 'punto arriostrado, a menos que se haya ubicado una riostra en esa posición».',
    ],
    limitations: [
      'Lr uses a simplified form when J and Cw are absent, and the caller passes J = 0 when the '
      + 'section carries none, which removes the torsional term entirely.',
    ],
    validation: 'unvalidated',
  },

  // ── §G — corte ───────────────────────────────────────────────────
  {
    capability: 'steelShear',
    expression: 'phiVn = 0.90 · 0.6 · Fy · Aw · Cv',
    clause: 'G.2.1',
    inputs: ['Fy', 'h', 'tw'],
    assumptions: ['φv = 0,90, which is the code value for a web meeting the h/tw limit of G.2.1(a).'],
    limitations: [
      'No transverse stiffeners are considered, so kv is the unstiffened value and a stiffened web '
      + 'is checked as if it were not.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelShear',
    expression: 'Aw = d · tw',
    clause: 'G.2.2',
    inputs: ['h', 'tw'],
    assumptions: ['d is taken as the overall depth `h`, not the clear web depth.'],
    limitations: [],
    validation: 'unvalidated',
  },
  {
    capability: 'steelShear',
    expression: 'Cv = 1.0,  for h/tw ≤ 2.24·√(E/Fy)',
    clause: 'G.2.3',
    inputs: ['h', 'tw', 'tf', 'E', 'Fy'],
    assumptions: ['h/tw is formed from the CLEAR web depth, d − 2·tf.'],
    limitations: [],
    validation: 'unvalidated',
  },
  {
    capability: 'steelShear',
    expression: 'Cv reduced for a slender web',
    clause: 'G.2.4 / G.2.5',
    inputs: ['h', 'tw', 'tf', 'E', 'Fy'],
    assumptions: ['Which of the two branches applies follows the h/tw bands of §G.'],
    limitations: [],
    validation: 'unvalidated',
  },

  // ── §H — interacción ─────────────────────────────────────────────
  {
    capability: 'steelInteraction',
    expression: 'Pr/Pc + 8/9·(Mrx/Mcx + Mry/Mcy),  for Pr/Pc ≥ 0.2',
    clause: 'H.1.1',
    inputs: ['Nu', 'Muy', 'Muz', 'phiPn', 'phiMnZ', 'phiMnY'],
    assumptions: [
      'Second-order effects are assumed to be in the demands: the checker takes Mr as given and '
      + 'applies no amplification of its own.',
    ],
    limitations: [
      'Torsion is not in the interaction — see the `torsion` gap. H.3 is not implemented.',
    ],
    validation: 'unvalidated',
  },
  {
    capability: 'steelInteraction',
    expression: 'Pr/(2·Pc) + (Mrx/Mcx + Mry/Mcy),  for Pr/Pc < 0.2',
    clause: 'H.1.2',
    inputs: ['Nu', 'Muy', 'Muz', 'phiPn', 'phiMnZ', 'phiMnY'],
    assumptions: ['Same as H.1.1: the demands are taken as already second-order.'],
    limitations: ['Same as H.1.1.'],
    validation: 'unvalidated',
  },
]);

/** The regulation and edition every entry above refers to. */
export const CIRSOC301_CLAUSE_MAP_EDITION = { regulation: 'cirsoc-301', edition: '2018' } as const;

/**
 * Whether the whole map has been validated. **False, and it decides nothing on its own.**
 *
 * Exported so a surface can ask rather than assume, and so the day it changes there is exactly one
 * place to look. It does NOT gate anything by itself: the capability matrix does that, and it stays
 * gated for its own reasons — the unbraced length and the signature among them.
 */
export const CIRSOC301_CLAUSE_MAP_VALIDATED =
  CIRSOC301_CLAUSE_MAP.every((e) => e.validation === 'signed');

/** Entries still waiting for a competent reader. Today: all of them. */
export const CIRSOC301_CLAUSES_UNVALIDATED =
  CIRSOC301_CLAUSE_MAP.filter((e) => e.validation !== 'signed');
