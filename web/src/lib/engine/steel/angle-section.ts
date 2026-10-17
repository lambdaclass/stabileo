/**
 * Single and double angles for the CIRSOC 301 checker (§E.5, §E.6, E.4).
 *
 * ── What was wrong ────────────────────────────────────────────────
 *
 * A catalogue angle stores ONE thickness `t`, and the steel input check asked for a web and a
 * flange thickness, so no angle ever reached the checker: it was silently left out of the steel
 * check. A double angle (`composition.arrangement = 'doubleBack'`) carried no thicknesses at all.
 *
 * ── What is read ─────────────────────────────────────────────────
 *
 *   single angle  — `shape: 'L'`, legs `h` (drawn vertical) and `b`, thickness `t`, the catalogue's
 *                   area and the inertias about the leg-parallel axes (`iy` horizontal axis, i.e.
 *                   parallel to the `b` leg; `iz` vertical, parallel to the `h` leg);
 *   double angle  — a composition of two catalogue angles back to back (`doubleBack`, the `h`
 *                   legs against each other) with the gusset gap.
 *
 * What CIRSOC 301 needs and the section cannot know comes from the member
 * (`Element.angleCompression`): how a single angle is loaded at its ends (E.5: concentric, E.5(a)
 * or E.5(b), by the long or the short leg), and the spacing and kind of a double angle's
 * intermediate connectors (E.6.2.1). Absent, the engine refuses the compression check by name.
 * Every other arrangement of angles is refused by name here.
 */
import { profileByName } from '../../data/steel-profiles';
import type { AngleParams } from '../codes/argentina/cirsoc301';

export interface AngleCompressionInput {
  /** E.5: 'concentric' | 'e5aLong' | 'e5aShort' | 'e5bLong' | 'e5bShort'. */
  endCondition?: string;
  /** E.6.2.1: spacing a of intermediate connectors, m. */
  connectorSpacing?: number;
  connector?: 'snugBolts' | 'welded';
}

interface AngleSectionData {
  shape?: string;
  h?: number; b?: number; t?: number; a?: number; iy?: number; iz?: number;
  composition?: { profileName: string; arrangement: string; gapMm: number };
}

export type AngleResolution =
  | { kind: 'none' }
  | { kind: 'angle'; shape: 'L' | '2L'; angle: AngleParams; t: number; h: number; b: number }
  | { kind: 'refused'; reason: 'arrangement' | 'profile' | 'thickness'; detail?: string };

/** The section as angle data, or why the angle cannot be checked, or `none` for a non-angle. */
export function angleSection(sec: AngleSectionData, member?: AngleCompressionInput): AngleResolution {
  const cond = member ?? {};
  if (sec.composition && sec.composition.arrangement !== 'single') {
    const part = profileByName(sec.composition.profileName);
    if (!part || part.family !== 'L') return { kind: 'none' };
    if (sec.composition.arrangement !== 'doubleBack') return { kind: 'refused', reason: 'arrangement', detail: sec.composition.arrangement };
    if (!part.t) return { kind: 'refused', reason: 'thickness' };
    const h = part.h / 1000, b = part.b / 1000, t = part.t / 1000;
    const longVertical = h >= b;
    return {
      kind: 'angle', shape: '2L', t, h, b,
      angle: {
        legLong: Math.max(h, b), legShort: Math.min(h, b), t,
        area: part.a * 1e-4,
        iParLong: (longVertical ? part.iz : part.iy) * 1e-8,
        iParShort: (longVertical ? part.iy : part.iz) * 1e-8,
        // doubleBack meets the vertical (h) legs.
        backToBack: longVertical ? 'long' : 'short',
        gap: sec.composition.gapMm / 1000,
        ...(cond.connectorSpacing !== undefined ? { connectorSpacing: cond.connectorSpacing } : {}),
        ...(cond.connector !== undefined ? { connector: cond.connector } : {}),
      },
    };
  }
  if (sec.shape !== 'L') return { kind: 'none' };
  if (!(sec.t && sec.t > 0 && sec.h && sec.h > 0 && sec.b && sec.b > 0)) return { kind: 'refused', reason: 'thickness' };
  const { h, b, t } = sec;
  const longVertical = h >= b;
  return {
    kind: 'angle', shape: 'L', t, h, b,
    angle: {
      legLong: Math.max(h, b), legShort: Math.min(h, b), t,
      ...(sec.a ? { area: sec.a } : {}),
      ...(sec.iz && sec.iy ? { iParLong: longVertical ? sec.iz : sec.iy, iParShort: longVertical ? sec.iy : sec.iz } : {}),
      ...(cond.endCondition !== undefined ? { endCondition: cond.endCondition } : {}),
    },
  };
}
