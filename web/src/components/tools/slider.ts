export type Span = readonly [min: number, max: number, step: number];

const niceCeil = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map(k => k * p).find(n => n >= v * (1 - 1e-12))!;
};

/** A slider's span grown to hold `value`, never shrunk, so a typed value keeps a slider that can still move it. */
export function widen(span: Span, value: number): Span {
  if (!Number.isFinite(value)) return span;
  const [min, max, step] = span;
  if (value < min) return [Math.max(0, value), max, step];
  if (value <= max) return span;
  const top = niceCeil(value), wider = Math.max(step, top / 100);
  const floor = Math.floor(min / wider) * wider;
  return [min > 0 && floor <= 0 ? wider : floor, top, wider];
}
