export type HingeTrack = Array<{ step: number; position: number; x: number }>;

/** Where a hinge sat at step `step`: a span hinge moves with the peak of the moment (`track`). */
export function hingePlaceAt(h: { position?: number; end: 'start' | 'end'; x?: number; track?: HingeTrack }, step: number): { position: number; x: number } {
  const at = h.track?.filter((p) => p.step <= step).at(-1);
  return at ?? { position: h.position ?? (h.end === 'start' ? 0 : 1), x: h.x ?? 0 };
}
