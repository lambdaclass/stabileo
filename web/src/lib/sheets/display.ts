/**
 * How the sheets show: colour by bar diameter, which layers go to the screen and which to the
 * plan, text size and line weight per layer, colour per layer, and the order and affixes of a bar's
 * label. One object, kept with the project's sheet settings and as the user's default.
 *
 * Pure: the sheet builder passes primitives through `displayPrimitives` and the renderers read the
 * layers through `displayStyle`.
 */
import { layerDef, type LayerDef, type LayerStyle } from './layers';
import type { Primitive } from './primitives';

export type LabelPart = 'mark' | 'count' | 'dia' | 'spacing' | 'length';
export interface SheetDisplay {
  colorByDiameter?: boolean;
  /** Layers left off the screen and off the plan. */
  hidden?: { screen?: string[]; plan?: string[] };
  /** Per layer: text height factor, line weight (mm), colour (ACI). */
  layers?: Record<string, { text?: number; weight?: number; color?: number }>;
  /** A bar's label: its parts in order, each with its prefix and suffix. */
  barLabel?: { order: LabelPart[]; prefix?: Partial<Record<LabelPart, string>>; suffix?: Partial<Record<LabelPart, string>> };
}

export const DEFAULT_LABEL: NonNullable<SheetDisplay['barLabel']> = {
  order: ['mark', 'count', 'dia', 'spacing', 'length'],
  prefix: { dia: 'Ø', spacing: 'c/', length: 'L=' },
};

/** A bar's label from its parts, in the display's order with its affixes; absent parts are left out. */
export function barLabel(parts: Partial<Record<LabelPart, string | number>>, display?: SheetDisplay): string {
  const f = display?.barLabel ?? DEFAULT_LABEL;
  const pre = { ...(display?.barLabel ? {} : DEFAULT_LABEL.prefix), ...f.prefix }, suf = f.suffix ?? {};
  const out: string[] = [];
  for (const k of f.order) {
    const v = parts[k];
    if (v === undefined || v === '') continue;
    const s = `${pre[k] ?? ''}${v}${suf[k] ?? ''}`;
    // Count and diameter read as one word («4Ø12»).
    if (k === 'dia' && out.length && f.order[f.order.indexOf(k) - 1] === 'count' && parts.count !== undefined) out[out.length - 1] += s;
    else out.push(s);
  }
  return out.join(' ');
}

/** The primitives as the target shows them: hidden layers left out, bars on their diameter's layer, text scaled. */
export function displayPrimitives(ps: readonly Primitive[], display: SheetDisplay | undefined, target: 'screen' | 'plan'): Primitive[] {
  if (!display) return [...ps];
  const hidden = new Set(display.hidden?.[target] ?? []);
  const out: Primitive[] = [];
  for (const p of ps) {
    if (hidden.has(p.layer)) continue;
    let q: Primitive = p;
    if (display.colorByDiameter && p.dia) q = { ...q, layer: `${p.layer}-D${p.dia}` };
    const t = display.layers?.[p.layer]?.text;
    if (t && q.kind === 'text') q = { ...q, height: q.height * t };
    out.push(q);
  }
  return out;
}

/** How the renderers read a layer under the display: its weight and colour where the display sets them. */
export function displayStyle(display: SheetDisplay | undefined): LayerStyle {
  if (!display?.layers) return layerDef;
  return (name: string): LayerDef => {
    const base = layerDef(name), key = name.replace(/-D\d+$/, ''), o = display.layers?.[key];
    if (!o) return base;
    return { ...base, ...(o.weight !== undefined ? { weight: o.weight } : {}), ...(o.color !== undefined && !/-D\d+$/.test(name) ? { color: o.color } : {}) };
  };
}
