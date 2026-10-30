export type Config = { nelx: number; nely: number; volfrac: number; penal: number; rmin: number; ft: number };
export type Frame = { iteration: number; compliance: number; volume: number; change: number; density: number[] };
export const defaults: Config = { nelx: 60, nely: 20, volfrac: 0.5, penal: 3, rmin: 2.4, ft: 1 };
export function validConfig(c: Config): boolean {
  if (!c || typeof c !== 'object') return false;
  return Number.isInteger(c.nelx) && Number.isInteger(c.nely) && c.nelx >= 2 && c.nelx <= 120 && c.nely >= 2 && c.nely <= 60 && c.nelx * c.nely <= 3600 &&
    Number.isFinite(c.volfrac) && c.volfrac >= .05 && c.volfrac <= .95 && Number.isFinite(c.penal) && c.penal >= 1 && c.penal <= 5 && Number.isFinite(c.rmin) && c.rmin >= 1 && c.rmin <= 10 && [1, 2].includes(c.ft);
}
export function validFrame(f: Frame, c: Config, index: number): boolean {
  if (!f || typeof f !== 'object') return false;
  return f.iteration === index + 1 && Number.isFinite(f.compliance) && f.compliance > 0 && Number.isFinite(f.volume) && f.volume >= 0 && f.volume <= 1 && Number.isFinite(f.change) && f.change >= 0 && f.change <= 1 && Array.isArray(f.density) && f.density.length === c.nelx * c.nely && f.density.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
}
export function referenceMatches(c: Config): boolean {
  return Object.entries(defaults).every(([k, v]) => k === 'ft' || c[k as keyof Config] === v);
}
export function mesh(c: Config) {
  if (!validConfig(c)) throw Error('Invalid mesh');
  const xy: number[] = [], cells: number[] = [];
  for (let i = 0; i <= c.nelx; i++) for (let j = 0; j <= c.nely; j++) xy.push(i, c.nely - j);
  for (let i = 0; i < c.nelx; i++) for (let j = 0; j < c.nely; j++) {
    const n = i * (c.nely + 1) + j;
    cells.push(n + 1, n + c.nely + 2, n + c.nely + 1, n);
  }
  return { xy, cells };
}
export function decodeReplay(bytes: ArrayBuffer): { config: Config; frames: Frame[] } {
  if (bytes.byteLength < 12 || bytes.byteLength > 32_000_000) throw Error('Invalid replay size');
  const v = new DataView(bytes);
  if (v.getUint32(0, true) !== 0x4c505253 || v.getUint32(4, true) !== 2) throw Error('Invalid replay version');
  const size = v.getUint32(8, true);
  if (size > bytes.byteLength - 12) throw Error('Truncated replay');
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 12, size)));
  if (!validConfig(h.config) || !Array.isArray(h.frames) || !h.frames.length || h.frames.length > 1000) throw Error('Invalid replay header');
  const n = h.config.nelx * h.config.nely;
  if (12 + size + n * h.frames.length !== bytes.byteLength) throw Error('Invalid replay length');
  const frames: Frame[] = h.frames.map((s: Frame, i: number) => ({ ...s, density: Array.from(new Uint8Array(bytes, 12 + size + i * n, n), b => b / 255) }));
  if (!frames.every((f, i) => validFrame(f, h.config, i))) throw Error('Invalid replay values');
  return { config: h.config, frames };
}
