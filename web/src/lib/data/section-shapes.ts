// Section shape definitions and property calculators
// All dimensions in meters, output A in m², Iy/Iz in m⁴
// Convention: iy = about Y (horizontal axis), iz = about Z (vertical axis)

import { t } from '../i18n';

export type ShapeType =
  | 'rect' | 'circular' | 'hollow-rect' | 'hollow-circular' | 'I-custom'
  | 'T-custom' | 'U-custom' | 'C-custom'
  | 'concrete-square' | 'concrete-rect' | 'concrete-circular' | 'concrete-T' | 'concrete-invL';

/**
 * How the section is built, which is what changes the THEORY.
 *
 * This used to be 'steel' | 'concrete', which asked the wrong question. A
 * rectangle is a rectangle whether it is concrete, timber or steel — the shape
 * does not care. What does change with the shape is which analysis applies:
 *
 *   * a THIN-walled section buckles locally, carries shear as a flow along its
 *     wall, and twists by Saint-Venant or Bredt depending on whether the wall
 *     closes;
 *   * a SOLID section does none of that. Its shear is the parabolic Jourawski
 *     distribution and its torsion has no elementary closed form at all.
 *
 * Splitting by material also stranded the user: a timber beam is a solid
 * rectangle, and nothing labelled "steel" or "concrete" told them so.
 */
export type MaterialCategory = 'thin' | 'solid';

export interface ShapeDefinition {
  id: ShapeType;
  label: string;
  description: string;
  params: ShapeParam[];
  category: MaterialCategory;
}

export interface ShapeParam {
  id: string;
  label: string;
  unit: string;
  step: number;
  defaultValue: number;
}

export const SECTION_SHAPES: ShapeDefinition[] = [
  // ── Thin-walled ──
  {
    id: 'hollow-rect',
    label: 'shape.hollowRect',
    description: 'shape.hollowRect.desc',
    category: 'thin',
    params: [
      { id: 'b', label: 'shape.param.extWidth', unit: 'm', step: 0.01, defaultValue: 0.20 },
      { id: 'h', label: 'shape.param.extHeight', unit: 'm', step: 0.01, defaultValue: 0.30 },
      { id: 't', label: 'shape.param.thickness', unit: 'm', step: 0.0001, defaultValue: 0.01 },
    ],
  },
  {
    id: 'hollow-circular',
    label: 'shape.hollowCircular',
    description: 'shape.hollowCircular.desc',
    category: 'thin',
    params: [
      { id: 'd', label: 'shape.param.extDiam', unit: 'm', step: 0.01, defaultValue: 0.20 },
      { id: 't', label: 'shape.param.thickness', unit: 'm', step: 0.0001, defaultValue: 0.008 },
    ],
  },
  {
    id: 'I-custom',
    label: 'shape.iCustom',
    description: 'shape.iCustom.desc',
    category: 'thin',
    params: [
      { id: 'h', label: 'shape.param.totalHeight', unit: 'm', step: 0.01, defaultValue: 0.30 },
      { id: 'b', label: 'shape.param.flangeWidth', unit: 'm', step: 0.01, defaultValue: 0.15 },
      { id: 'tw', label: 'shape.param.webThickness', unit: 'm', step: 0.0001, defaultValue: 0.007 },
      { id: 'tf', label: 'shape.param.flangeThickness', unit: 'm', step: 0.0001, defaultValue: 0.011 },
    ],
  },
  {
    id: 'T-custom',
    label: 'shape.tCustom',
    description: 'shape.tCustom.desc',
    category: 'thin',
    params: [
      { id: 'h', label: 'shape.param.totalHeight', unit: 'm', step: 0.001, defaultValue: 0.20 },
      { id: 'bf', label: 'shape.param.flangeWidthBf', unit: 'm', step: 0.001, defaultValue: 0.15 },
      { id: 'tw', label: 'shape.param.webThickness', unit: 'm', step: 0.0001, defaultValue: 0.007 },
      { id: 'tf', label: 'shape.param.flangeThickness', unit: 'm', step: 0.0001, defaultValue: 0.011 },
    ],
  },
  {
    id: 'U-custom',
    label: 'shape.uCustom',
    description: 'shape.uCustom.desc',
    category: 'thin',
    params: [
      { id: 'h', label: 'shape.param.totalHeight', unit: 'm', step: 0.001, defaultValue: 0.20 },
      { id: 'b', label: 'shape.param.flangeWidth', unit: 'm', step: 0.001, defaultValue: 0.075 },
      { id: 'tw', label: 'shape.param.webThickness', unit: 'm', step: 0.0001, defaultValue: 0.006 },
      { id: 'tf', label: 'shape.param.flangeThickness', unit: 'm', step: 0.0001, defaultValue: 0.009 },
    ],
  },
  {
    id: 'C-custom',
    label: 'shape.cCustom',
    description: 'shape.cCustom.desc',
    category: 'thin',
    params: [
      { id: 'h', label: 'shape.param.totalHeight', unit: 'm', step: 0.001, defaultValue: 0.20 },
      { id: 'b', label: 'shape.param.flangeWidth', unit: 'm', step: 0.001, defaultValue: 0.075 },
      { id: 'tw', label: 'shape.param.webThickness', unit: 'm', step: 0.0001, defaultValue: 0.006 },
      { id: 'tf', label: 'shape.param.flangeThickness', unit: 'm', step: 0.0001, defaultValue: 0.009 },
      { id: 'c', label: 'shape.param.lipLength', unit: 'm', step: 0.001, defaultValue: 0.02 },
      { id: 'tl', label: 'shape.param.lipThickness', unit: 'm', step: 0.0001, defaultValue: 0.009 },
    ],
  },
  // ── Concrete shapes ──
  {
    id: 'concrete-square',
    label: 'shape.concSquare',
    description: 'shape.concSquare.desc',
    category: 'solid',
    params: [
      { id: 'a', label: 'shape.param.side', unit: 'm', step: 0.01, defaultValue: 0.30 },
    ],
  },
  {
    id: 'concrete-rect',
    label: 'shape.concRect',
    description: 'shape.concRect.desc',
    category: 'solid',
    params: [
      { id: 'b', label: 'shape.param.width', unit: 'm', step: 0.01, defaultValue: 0.20 },
      { id: 'h', label: 'shape.param.height', unit: 'm', step: 0.01, defaultValue: 0.40 },
    ],
  },
  {
    id: 'concrete-circular',
    label: 'shape.concCircular',
    description: 'shape.concCircular.desc',
    category: 'solid',
    params: [
      { id: 'd', label: 'shape.param.diameter', unit: 'm', step: 0.01, defaultValue: 0.40 },
    ],
  },
  {
    id: 'concrete-T',
    label: 'shape.concT',
    description: 'shape.concT.desc',
    category: 'solid',
    params: [
      { id: 'bw', label: 'shape.param.webWidth', unit: 'm', step: 0.01, defaultValue: 0.25 },
      { id: 'hw', label: 'shape.param.webHeight', unit: 'm', step: 0.01, defaultValue: 0.50 },
      { id: 'bf', label: 'shape.param.flangeWidthBf', unit: 'm', step: 0.01, defaultValue: 0.80 },
      { id: 'hf', label: 'shape.param.flangeDepth', unit: 'm', step: 0.01, defaultValue: 0.12 },
    ],
  },
  {
    id: 'concrete-invL',
    label: 'shape.concInvL',
    description: 'shape.concInvL.desc',
    category: 'solid',
    params: [
      { id: 'bw', label: 'shape.param.webWidth', unit: 'm', step: 0.01, defaultValue: 0.25 },
      { id: 'hw', label: 'shape.param.webHeight', unit: 'm', step: 0.01, defaultValue: 0.50 },
      { id: 'bf', label: 'shape.param.flangeWidthBf', unit: 'm', step: 0.01, defaultValue: 0.50 },
      { id: 'hf', label: 'shape.param.flangeDepth', unit: 'm', step: 0.01, defaultValue: 0.12 },
    ],
  },
];

/** Steel shapes only */
export const THIN_SHAPES = SECTION_SHAPES.filter(s => s.category === 'thin');
/** Solid shapes only */
export const SOLID_SHAPES = SECTION_SHAPES.filter(s => s.category === 'solid');

export interface SectionProperties {
  a: number;   // m²
  iy: number;  // m⁴ — about Y-axis (horizontal)
  iz: number;  // m⁴ — about Z-axis (vertical)
  j?: number;  // m⁴ — torsional constant Saint-Venant for 3D
  b?: number;  // m
  h?: number;  // m
  shape: string;
  tw?: number;
  tf?: number;
  t?: number;
  tl?: number; // m - lip thickness (C-channel only)
}

/** Solid rectangle torsion constant (Timoshenko approximation) */
function solidRectJ(a: number, bShort: number): number {
  // a >= b; J = (1/3)*a*b³*(1 - 0.63*b/a + 0.052*(b/a)⁵)
  const r = bShort / a;
  return (1 / 3) * a * bShort ** 3 * (1 - 0.63 * r + 0.052 * r ** 5);
}

export function computeSectionProperties(
  shapeType: ShapeType,
  params: Record<string, number>,
): SectionProperties | null {
  switch (shapeType) {
    case 'rect': {
      const { b, h } = params;
      if (!b || !h || b <= 0 || h <= 0) return null;
      const long = Math.max(b, h), short = Math.min(b, h);
      return {
        a: b * h,
        iy: (b * h ** 3) / 12,  // about Y (horizontal): h³ term
        iz: (h * b ** 3) / 12,  // about Z (vertical): b³ term
        j: solidRectJ(long, short),
        b, h,
        shape: 'rect',
      };
    }
    case 'circular': {
      const { d } = params;
      if (!d || d <= 0) return null;
      const r = d / 2;
      const I = (Math.PI * r ** 4) / 4;
      return {
        a: Math.PI * r * r,
        iy: I,
        iz: I,
        j: 2 * I, // solid circle: J = πr⁴/2 = 2I
        b: d, h: d,
        shape: 'CHS',
      };
    }
    case 'hollow-rect': {
      const { b, h, t } = params;
      if (!b || !h || !t || b <= 0 || h <= 0 || t <= 0 || t >= b / 2 || t >= h / 2) return null;
      const bi = b - 2 * t;
      const hi = h - 2 * t;
      // Bredt closed-section: J = 2*t*Am² / (Am_perimeter/2) simplified
      const Am = (b - t) * (h - t); // enclosed area (centerline)
      const s = 2 * (b - t) + 2 * (h - t); // centerline perimeter
      return {
        a: b * h - bi * hi,
        iy: (b * h ** 3 - bi * hi ** 3) / 12,  // about Y (horizontal): h³ terms
        iz: (h * b ** 3 - hi * bi ** 3) / 12,  // about Z (vertical): b³ terms
        j: 4 * Am * Am * t / s,
        b, h, t,
        shape: 'RHS',
      };
    }
    case 'hollow-circular': {
      const { d, t } = params;
      if (!d || !t || d <= 0 || t <= 0 || t >= d / 2) return null;
      const ro = d / 2;
      const ri = ro - t;
      const I = (Math.PI / 4) * (ro ** 4 - ri ** 4);
      return {
        a: Math.PI * (ro * ro - ri * ri),
        iy: I,
        iz: I,
        j: 2 * I, // circular tube: J = π(ro⁴-ri⁴)/2 = 2I
        b: d, h: d, t,
        shape: 'CHS',
      };
    }
    case 'I-custom': {
      const { h, b, tw, tf } = params;
      if (!h || !b || !tw || !tf || h <= 0 || b <= 0 || tw <= 0 || tf <= 0) return null;
      if (2 * tf >= h || tw >= b) return null;
      const hw = h - 2 * tf;
      const a = 2 * b * tf + hw * tw;
      // Iy (about Y horizontal): h-dominated, parallel axis theorem
      const iyFlanges = 2 * ((b * tf ** 3) / 12 + b * tf * ((h - tf) / 2) ** 2);
      const iyWeb = (tw * hw ** 3) / 12;
      // Iz (about Z vertical): b-dominated, flanges dominate
      const izFlanges = 2 * (tf * b ** 3) / 12;
      const izWeb = (hw * tw ** 3) / 12;
      return {
        a,
        iy: iyFlanges + iyWeb,
        iz: izFlanges + izWeb,
        j: (1 / 3) * (2 * b * tf ** 3 + hw * tw ** 3), // open thin-walled
        b, h, tw, tf,
        shape: 'I',
      };
    }
    case 'T-custom': {
      const { h, bf, tw, tf } = params;
      if (!h || !bf || !tw || !tf || h <= 0 || bf <= 0 || tw <= 0 || tf <= 0) return null;
      if (tf >= h || tw >= bf) return null;
      const hw = h - tf;
      const a = bf * tf + hw * tw;
      // Centroid from bottom of web
      const yBar = (hw * tw * (hw / 2) + bf * tf * (hw + tf / 2)) / a;
      // Iy (about Y horizontal) — h-dominated, parallel axis theorem
      const IyWeb = (tw * hw ** 3) / 12 + tw * hw * (hw / 2 - yBar) ** 2;
      const IyFlange = (bf * tf ** 3) / 12 + bf * tf * (hw + tf / 2 - yBar) ** 2;
      // Iz (about Z vertical) — b-dominated, symmetric about z-axis
      const izFlange = (tf * bf ** 3) / 12;
      const izWeb = (hw * tw ** 3) / 12;
      return {
        a,
        iy: IyWeb + IyFlange,
        iz: izFlange + izWeb,
        j: (1 / 3) * (bf * tf ** 3 + hw * tw ** 3),
        b: bf, h,
        shape: 'T',
        tw,
        tf,
      };
    }
    case 'U-custom': {
      const { h, b, tw, tf } = params;
      if (!h || !b || !tw || !tf || h <= 0 || b <= 0 || tw <= 0 || tf <= 0) return null;
      if (2 * tf >= h || tw >= b) return null;
      const hw = h - 2 * tf;
      const a = tw * hw + 2 * b * tf;
      // Iy (about Y horizontal): h-dominated, symmetric
      const iyWeb = (tw * hw ** 3) / 12;
      const iyFlanges = 2 * ((b * tf ** 3) / 12 + b * tf * ((h - tf) / 2) ** 2);
      // Iz (about Z vertical): NOT symmetric — z-centroid offset
      const zBar = (tw * hw * (tw / 2) + 2 * b * tf * (b / 2)) / a;
      const izWeb = (hw * tw ** 3) / 12 + hw * tw * (tw / 2 - zBar) ** 2;
      const izFlanges = 2 * ((tf * b ** 3) / 12 + b * tf * (b / 2 - zBar) ** 2);
      return {
        a,
        iy: iyWeb + iyFlanges,
        iz: izWeb + izFlanges,
        j: (1 / 3) * (hw * tw ** 3 + 2 * b * tf ** 3),
        b, h, tw, tf,
        shape: 'U',
      };
    }
    case 'C-custom': {
      const { h, b, tw, tf, c, tl } = params;
      if (!h || !b || !tw || !tf || !c || !tl || h <= 0 || b <= 0 || tw <= 0 || tf <= 0 || c <= 0 || tl <= 0) return null;
      /*
         ── The OUTER-FACE convention ────────────────────────────────────

         `c` is the lip depth measured from the flange's OUTER face. That is how a cold-formed
         designation reads — in `C 100x50x15x2` the `15` is the total lip depth measured from
         outside — and it is what BOTH drawing implementations already do: `createCShape` walks
         from `-halfH`, and `crossSectionPath`'s `'C'` from `-hh + lip`.

         This calculation was the odd one out. It measured from the flange's MID-LINE
         (`(h - tf)/2 - c/2`), so with the same `c` it counted `2t²` more material than either
         drawing: 452 mm² against 444 on a `C 100x50x15x2`, about 1.8 %. Two parts of the
         application described different objects, and the one that disagreed with the designation
         was this one — a user typing 15 got a lip 15 + t/2 deep.

         So the lip that ADDS material is only the part beyond the flange, `c - tf`.
         `cold-formed-lip-convention.test.ts` checks A, Iy and Iz against the moments of the
         polygon `createCShape` actually walks, on a grid, and they agree to machine precision.

         Two consequences taken on purpose, not by omission:

         · The validity bound loosens. Lips collide when `c > h/2`, not `c + tf > h/2`.
         · `c <= tf` stops being an error and becomes a PLAIN CHANNEL. That is what the drawing
           already did — `createCShape` renders an unlipped channel for `lip <= tf` while this
           function happily added `2·c·tl` of lip — so for `c <= tf` the app used to compute a
           section with a lip and draw one without. `Math.max(0, …)` closes it by construction,
           with no new guard: the useful lip is ≤ 0 exactly when the drawing refuses to draw one.

         Convention decided in `docs/handoffs/m2-lip-convention-proposal.md` (M1). H1 owns this
         file because it also holds the concrete templates.
      */
      if (2 * tf >= h || tw >= b || c > h / 2) return null;
      const hw = h - 2 * tf;
      const cl = Math.max(0, c - tf);   // lip beyond the flange; 0 means a plain channel
      const a = tw * hw + 2 * b * tf + 2 * cl * tl;
      // Iy (about Y horizontal): h-dominated, symmetric
      const iyWeb = (tw * hw ** 3) / 12;
      const iyFlanges = 2 * ((b * tf ** 3) / 12 + b * tf * ((h - tf) / 2) ** 2);
      const yLipCenter = (h - c - tf) / 2;
      const iyLips = 2 * ((tl * cl ** 3) / 12 + tl * cl * yLipCenter ** 2);
      // Iz (about Z vertical): z-centroid not centered
      const zBar = (tw * hw * (tw / 2) + 2 * b * tf * (b / 2) + 2 * cl * tl * (b - tl / 2)) / a;
      const izWeb = (hw * tw ** 3) / 12 + hw * tw * (tw / 2 - zBar) ** 2;
      const izFlanges = 2 * ((tf * b ** 3) / 12 + b * tf * (b / 2 - zBar) ** 2);
      const izLips = 2 * ((cl * tl ** 3) / 12 + cl * tl * (b - tl / 2 - zBar) ** 2);
      return {
        a,
        iy: iyWeb + iyFlanges + iyLips,
        iz: izWeb + izFlanges + izLips,
        j: (1 / 3) * (hw * tw ** 3 + 2 * b * tf ** 3 + 2 * cl * tl ** 3),
        b, h, tw, tf,
        t: c,
        tl,
        shape: 'C',
      };
    }
    // ── Concrete shapes ──
    case 'concrete-square': {
      const { a } = params;
      if (!a || a <= 0) return null;
      const I = (a ** 4) / 12;
      return {
        a: a * a,
        iy: I,
        iz: I,
        j: solidRectJ(a, a),
        b: a, h: a,
        shape: 'rect',
      };
    }
    case 'concrete-rect': {
      const { b, h } = params;
      if (!b || !h || b <= 0 || h <= 0) return null;
      const long = Math.max(b, h), short = Math.min(b, h);
      return {
        a: b * h,
        iy: (b * h ** 3) / 12,  // about Y (horizontal): h³ term
        iz: (h * b ** 3) / 12,  // about Z (vertical): b³ term
        j: solidRectJ(long, short),
        b, h,
        shape: 'rect',
      };
    }
    case 'concrete-circular': {
      const { d } = params;
      if (!d || d <= 0) return null;
      const r = d / 2;
      const I = (Math.PI * r ** 4) / 4;
      return {
        a: Math.PI * r * r,
        iy: I,
        iz: I,
        j: 2 * I,
        b: d, h: d,
        shape: 'CHS',
      };
    }
    case 'concrete-T': {
      const { bw, hw, bf, hf } = params;
      if (!bw || !hw || !bf || !hf || bw <= 0 || hw <= 0 || bf <= 0 || hf <= 0) return null;
      if (bf < bw) return null;
      const h = hw + hf;
      const A = bw * hw + bf * hf;
      const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
      // Iy (about Y horizontal): h-dominated, parallel axis theorem
      const IyWeb = (bw * hw ** 3) / 12 + bw * hw * (hw / 2 - yBar) ** 2;
      const IyFlange = (bf * hf ** 3) / 12 + bf * hf * (hw + hf / 2 - yBar) ** 2;
      // Iz (about Z vertical): b-dominated, symmetric about z-axis
      const izFlange = (hf * bf ** 3) / 12;
      const izWeb = (hw * bw ** 3) / 12;
      return {
        a: A,
        iy: IyWeb + IyFlange,
        iz: izFlange + izWeb,
        j: (1 / 3) * (bf * hf ** 3 + hw * bw ** 3),
        b: bf, h,
        shape: 'T',
        tw: bw,
        tf: hf,
      };
    }
    case 'concrete-invL': {
      const { bw, hw, bf, hf } = params;
      if (!bw || !hw || !bf || !hf || bw <= 0 || hw <= 0 || bf <= 0 || hf <= 0) return null;
      if (bf < bw) return null;
      const h = hw + hf;
      const A = bw * hw + bf * hf;
      const yBar = (bw * hw * (hw / 2) + bf * hf * (hw + hf / 2)) / A;
      // Iy (about Y horizontal): h-dominated, parallel axis theorem
      const IyWeb = (bw * hw ** 3) / 12 + bw * hw * (hw / 2 - yBar) ** 2;
      const IyFlange = (bf * hf ** 3) / 12 + bf * hf * (hw + hf / 2 - yBar) ** 2;
      // Iz (about Z vertical): NOT symmetric (flange is offset), z-centroid needed
      const zBar = (bw * hw * (bw / 2) + bf * hf * (bf / 2)) / A;
      const izWeb = (hw * bw ** 3) / 12 + hw * bw * (bw / 2 - zBar) ** 2;
      const izFlange = (hf * bf ** 3) / 12 + hf * bf * (bf / 2 - zBar) ** 2;
      return {
        a: A,
        iy: IyWeb + IyFlange,
        iz: izWeb + izFlange,
        j: (1 / 3) * (hw * bw ** 3 + bf * hf ** 3),
        b: bf, h,
        shape: 'invL',
        tw: bw,
        tf: hf,
      };
    }
    default:
      return null;
  }
}

export function generateSectionName(shapeType: ShapeType, params: Record<string, number>): string {
  switch (shapeType) {
    case 'rect':
      return `Rect ${(params.b * 100).toFixed(0)}x${(params.h * 100).toFixed(0)} cm`;
    case 'circular':
      return `Circ \u2300${(params.d * 100).toFixed(0)} cm`;
    case 'hollow-rect':
      return `${t('section.hollowRect')} ${(params.b * 100).toFixed(0)}x${(params.h * 100).toFixed(0)}x${(params.t * 1000).toFixed(0)} mm`;
    case 'hollow-circular':
      return `CHS \u2300${(params.d * 100).toFixed(0)}x${(params.t * 1000).toFixed(0)} mm`;
    case 'I-custom':
      return `I ${(params.h * 1000).toFixed(0)}x${(params.b * 1000).toFixed(0)}x${(params.tw * 1000).toFixed(1)}x${(params.tf * 1000).toFixed(1)}`;
    case 'T-custom':
      return `T ${(params.h * 1000).toFixed(0)}x${(params.bf * 1000).toFixed(0)}x${(params.tw * 1000).toFixed(1)}x${(params.tf * 1000).toFixed(1)}`;
    case 'U-custom':
      return `U ${(params.h * 1000).toFixed(0)}x${(params.b * 1000).toFixed(0)}x${(params.tw * 1000).toFixed(1)}x${(params.tf * 1000).toFixed(1)}`;
    case 'C-custom':
      return `C ${(params.h * 1000).toFixed(0)}x${(params.b * 1000).toFixed(0)}x${(params.tw * 1000).toFixed(1)}x${(params.tf * 1000).toFixed(1)} c=${(params.c * 1000).toFixed(0)}`;
    case 'concrete-square':
      return `H.A. Cuad ${(params.a * 100).toFixed(0)} cm`;
    case 'concrete-rect':
      return `H.A. Rect ${(params.b * 100).toFixed(0)}x${(params.h * 100).toFixed(0)} cm`;
    case 'concrete-circular':
      return `H.A. Circ \u2300${(params.d * 100).toFixed(0)} cm`;
    case 'concrete-T':
      return `H.A. T ${(params.bw * 100).toFixed(0)}x${((params.hw + params.hf) * 100).toFixed(0)} bf=${(params.bf * 100).toFixed(0)}`;
    case 'concrete-invL':
      return `H.A. L inv ${(params.bw * 100).toFixed(0)}x${((params.hw + params.hf) * 100).toFixed(0)} bf=${(params.bf * 100).toFixed(0)}`;
    default:
      return 'section.customName';
  }
}
