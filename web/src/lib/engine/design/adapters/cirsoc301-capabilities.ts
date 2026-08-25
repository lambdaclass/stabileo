/**
 * What CIRSOC 301 support actually means today: nothing that may be relied on.
 *
 * ── Written the same way the concrete one was ──────────────────────
 *
 * `cirsoc201-capabilities.ts` opens by saying every declaration in it was made by checking
 * what the code in that branch actually executes, not what it aspires to. This file is the
 * same exercise for steel, and the answer is shorter: **every facet of every metallic
 * capability is false.**
 *
 * ── Why, when a checker exists ─────────────────────────────────────
 *
 * `lib/engine/codes/argentina/cirsoc301.ts` is 769 lines of AISC 360 LRFD — tension,
 * compression with Fe/Fcr, flexure with Lp/Lr and lateral-torsional reduction, shear with
 * Cv, and the H1 interaction. It runs. It produces numbers. And:
 *
 *   · it has ZERO tests — no external benchmark, no hand fixture, no property test;
 *   · it cites no clause anywhere in the `ClauseRef` sense, so `deriveMaturity` could not
 *     promote it past UNSUPPORTED even if benchmarks existed;
 *   · it is invoked with `Lb = L`, i.e. the member is assumed unbraced over its whole
 *     length, which for a beam usually decides the answer;
 *   · when the section carries no `tw`/`tf` it invents them as `b/10` and `b/15`, and when
 *     the material carries no `fu` it invents `1,25·fy`.
 *
 * A capability is a claim about what the product can do. `verify: true` on any of these
 * would be that claim, and none of the four points above is compatible with making it.
 *
 * ── `gate` is true, and that is the load-bearing part ──────────────
 *
 * An unsupported capability that is UNGATED lets a model reach a complete state with the
 * check never performed. Every metallic capability here is gated, so a model containing
 * steel cannot be reported as complete or constructible on the strength of its concrete
 * having passed. That is the single most important line in this file.
 *
 * Lives beside `cirsoc201-capabilities.ts` rather than under `lib/codes/`, for the same
 * reason that one does: the `limitation` strings are rendered verbatim to the user, and
 * `lib/codes/` is held to engine purity — no user-facing prose, only message keys. A
 * capability declaration is exactly the place where the explanation has to be written out.
 *
 * Pure of stores and runes.
 */

import { clause } from '../../../codes/regulation';
import { emptyMatrix, type CapabilityKey, type CapabilityMatrix } from '../../../codes/capability';

const C301 = (c: string, label?: string) => clause('cirsoc-301', '2018', c, label);

/**
 * Chapters of CIRSOC 301-2018 that WOULD govern each capability.
 *
 * The official text is supplied with this app — `docs/codes/CIRSOC/markdown/cirsoc-301-2018/`
 * carries chapters B through L and eight appendices — so unlike CIRSOC 201-2005 the
 * obstacle here is not the source. Citing the clauses on an unsupported capability is not
 * an over-claim: it is the map of what an implementation would have to satisfy, and it is
 * what makes the gap specific instead of a shrug.
 */
export const CIRSOC301_CLAUSES: Record<string, string> = {
  steelTension: '§D',
  steelCompression: '§E',
  steelFlexure: '§F',
  steelLateralTorsionalBuckling: '§F',
  steelShear: '§G',
  steelInteraction: '§H',
  steelSectionClassification: '§B.4',
  steelConnections: '§J',
  steelBracing: '§C',
  steelMemberSchedules: '',
};

/** Why each metallic capability is unsupported, in the words the user sees. */
const LIMITATION: Record<string, string> = {
  steelTension:
    'Existe un verificador de tracción, sin tests ni cláusulas mapeadas. No se usa para decidir nada.',
  steelCompression:
    'Existe un verificador de compresión, sin tests ni cláusulas mapeadas. No se usa para decidir nada.',
  steelFlexure:
    'Existe un verificador de flexión, sin tests ni cláusulas mapeadas. No se usa para decidir nada.',
  steelLateralTorsionalBuckling:
    'El verificador existente asume la longitud no arriostrada igual a la longitud del miembro. '
    + 'La app no modela arriostramientos, así que esa hipótesis no puede confirmarse ni corregirse.',
  steelShear:
    'Existe un verificador de corte, sin tests ni cláusulas mapeadas. No se usa para decidir nada.',
  steelInteraction:
    'Existe una verificación de interacción, sin tests ni cláusulas mapeadas. No se usa para decidir nada.',
  steelSectionClassification:
    'No se clasifica la sección (compacta / no compacta / esbelta), y esa clasificación decide qué '
    + 'estado límite gobierna la flexión.',
  steelConnections:
    'Hay tablas de bulones y soldadura de filete del capítulo J, sin tests. No hay diseño de unión.',
  steelBracing:
    'No hay modelo de arriostramiento: ni longitudes no arriostradas, ni rigidez requerida.',
  steelMemberSchedules:
    'No hay planilla de miembros metálicos ni cómputo metálico. El cómputo existente es de armadura.',
};

/** Every metallic capability key, in the order the surface lists them. */
export const STEEL_CAPABILITY_KEYS: readonly CapabilityKey[] = Object.freeze([
  'steelSectionClassification',
  'steelTension',
  'steelCompression',
  'steelFlexure',
  'steelLateralTorsionalBuckling',
  'steelShear',
  'steelInteraction',
  'steelBracing',
  'steelConnections',
  'steelMemberSchedules',
]);

/**
 * The matrix.
 *
 * Built rather than written out so that a metallic key added to `CAPABILITY_KEYS` without a
 * limitation here fails loudly at import instead of appearing as an unexplained blank.
 */
function build(): CapabilityMatrix {
  const m = emptyMatrix();
  for (const key of STEEL_CAPABILITY_KEYS) {
    const limitation = LIMITATION[key];
    if (!limitation) {
      throw new Error(
        `cirsoc301-capability: '${key}' has no limitation text. An unsupported capability `
        + 'without a stated reason is an unexplained blank, which is what this model exists '
        + 'to prevent.',
      );
    }
    const ref = CIRSOC301_CLAUSES[key];
    m[key] = {
      // Every facet false. See the module header.
      facets: m[key].facets,
      refs: ref ? [C301(ref)] : [],
      limitation,
    };
  }
  // `gate` on every metallic capability: a model with steel in it cannot be reported
  // complete because its concrete passed.
  for (const key of STEEL_CAPABILITY_KEYS) {
    m[key] = { ...m[key], facets: { ...m[key].facets, gate: true } };
  }
  return Object.freeze(m) as CapabilityMatrix;
}

export const CIRSOC301_CAPABILITIES: CapabilityMatrix = build();

/** What would have to exist before any of this could be promoted. */
export const CIRSOC301_PROMOTION_KEY = 'steel.promotion.needsClauseMapAndBenchmark';

/**
 * The assumptions the existing JS checker makes, as i18n keys.
 *
 * Attached to any EXPERIMENTAL result that comes out of it, because a number produced under
 * these and shown without them is a number a reader will trust more than it deserves.
 */
export const CIRSOC301_JS_ASSUMPTIONS: readonly string[] = Object.freeze([
  'steel.assume.unbracedLengthIsMemberLength',
  'steel.assume.webAndFlangeThicknessInferred',
  'steel.assume.ultimateStrengthInferred',
  'steel.assume.noSectionClassification',
  'steel.assume.noTests',
]);
