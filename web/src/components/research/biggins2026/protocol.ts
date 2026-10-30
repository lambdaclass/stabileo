export type ArchRun = {
  width: number;
  compression: number;
  threshold: number;
  modes: { force: number; y: number[]; slope: number[] }[];
  curve: [number, number][];
  frames: { alpha: number; force: number; y: number[] }[];
};

export function decodeRun(value: unknown): ArchRun {
  const r = value as ArchRun;
  if (!r || !Number.isFinite(r.threshold) || r.threshold <= 0 || !Number.isFinite(r.width)
    || !Number.isFinite(r.compression) || !Array.isArray(r.frames) || r.frames.length !== 61
    || !Array.isArray(r.modes) || r.modes.length !== 16 || !Array.isArray(r.curve)
    || !r.frames.every(f => Number.isFinite(f.alpha) && Number.isFinite(f.force) && f.y.length === 65 && f.y.every(Number.isFinite))
    || !r.modes.every(m => m.force > 0 && m.y.length === 65 && m.y.every(Number.isFinite))
    || !r.curve.every(p => p.length === 2 && p.every(Number.isFinite))) throw new Error('Invalid arch result');
  return r;
}
