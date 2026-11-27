import type { SupportType } from '../../lib/store/ui.svelte';

/** FNV-1a: a teacher rebuilding a student's variant later depends on it never changing. */
export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface ParamRange {
  min: number;
  max: number;
  step: number;
    label?: string;
  unit?: string;
}

export interface SupportChoice {
    support: number;
  types: SupportType[];
}

export interface ExerciseParams {
  values: Record<string, ParamRange>;
  supportChoices?: SupportChoice[];
}

export interface Variant {
  values: Record<string, number>;
  supports: Record<number, SupportType>;
}

function decimal(value: number): { coefficient: bigint; exponent: number } {
  const [mantissa, power = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { coefficient: BigInt(whole + fraction), exponent: Number(power) - fraction.length };
}

export function rangeValues(r: ParamRange): number[] {
  if (![r.min, r.max, r.step].every(Number.isFinite) || !(r.step > 0) || r.max < r.min) return [];
  const parts = [r.min, r.max, r.step].map(decimal);
  const exponent = Math.min(...parts.map(p => p.exponent));
  const [min, max, step] = parts.map(p => p.coefficient * 10n ** BigInt(p.exponent - exponent));
  const count = (max - min) / step;
  if (count > 10_000n) return [];
  const out = Array.from({ length: Number(count) + 1 }, (_, i) => Number(`${min + BigInt(i) * step}e${exponent}`));
  if (out.some((v, i) => v < r.min || v > r.max || i > 0 && v <= out[i - 1])) return [];
  return out;
}

export function defaultVariant(p: ExerciseParams): Variant {
  const values: Record<string, number> = {};
  for (const [k, r] of Object.entries(p.values)) {
    const vs = rangeValues(r);
    values[k] = vs.length ? vs[Math.floor((vs.length - 1) / 2)]! : r.min;
  }
  const supports: Record<number, SupportType> = {};
  for (const c of p.supportChoices ?? []) if (c.types.length) supports[c.support] = c.types[0]!;
  return { values, supports };
}

/** Draws in parameter-name order, so reordering the authored object does not change any student's variant. */
export function drawVariant(p: ExerciseParams, seed: number): Variant {
  const next = rng(seed);
  const values: Record<string, number> = {};
  for (const k of Object.keys(p.values).sort()) {
    const vs = rangeValues(p.values[k]!);
    values[k] = vs.length ? vs[Math.floor(next() * vs.length)]! : p.values[k]!.min;
  }
  const supports: Record<number, SupportType> = {};
  for (const c of [...(p.supportChoices ?? [])].sort((a, b) => a.support - b.support)) {
    if (c.types.length) supports[c.support] = c.types[Math.floor(next() * c.types.length)]!;
  }
  return { values, supports };
}
