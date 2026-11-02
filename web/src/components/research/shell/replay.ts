/**
 * Decoder for the precomputed replays written by the research crates (`replay.rs`): the mesh,
 * then per load step u8 damage and i8 displacements scaled per step, with every step's results
 * at full precision in the header. See research/fracture/shauer-2025/src/replay.rs for the layout.
 */
export type ReplayHeader<S> = {
  build_id?: string;
  nodes: number;
  elements: number;
  damage_max: number;
  displacement_scale: number[];
  steps: S[];
  config: unknown;
};

export type Replay<S> = {
  header: ReplayHeader<S>;
  nodes: Float64Array;
  elements: Uint32Array;
  frames: { step: S; damage: Float32Array; displacement: Float32Array }[];
};

export function decodeReplay<S>(buf: ArrayBuffer): Replay<S> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'SRPL' || dv.getUint32(4, true) !== 1) {
    throw new Error('not a version 1 replay');
  }
  const len = dv.getUint32(8, true);
  if (len > bytes.length - 12) throw new Error('replay has a truncated header');
  let header: ReplayHeader<S>;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + len))) as ReplayHeader<S>;
  } catch {
    throw new Error('invalid replay header JSON');
  }
  let o = Math.ceil((12 + len) / 4) * 4;
  if (!header || !Number.isSafeInteger(header.nodes) || header.nodes <= 0 || header.nodes > 65536
    || !Number.isSafeInteger(header.elements) || header.elements <= 0
    || !Number.isFinite(header.damage_max) || header.damage_max < 0
    || !Array.isArray(header.steps) || !Array.isArray(header.displacement_scale)
    || header.steps.length !== header.displacement_scale.length
    || !header.steps.every((step) => step !== null && typeof step === 'object' && !Array.isArray(step))
    || !header.displacement_scale.every((scale) => Number.isFinite(scale) && scale >= 0)
    || !header.config || typeof header.config !== 'object' || Array.isArray(header.config)) {
    throw new Error('invalid replay header');
  }
  const n = header.nodes;
  const end = o + 8 * n + 8 * header.elements + 3 * n * header.steps.length;
  if (!Number.isSafeInteger(end) || end !== bytes.length) throw new Error('replay payload size mismatch');
  // Check all mesh values before allocating decoded arrays.
  for (let i = 0; i < 2 * n; i++) {
    if (!Number.isFinite(dv.getFloat32(o + 4 * i, true))) throw new Error('invalid replay coordinate');
  }
  for (let i = 0; i < 4 * header.elements; i++) {
    if (dv.getUint16(o + 8 * n + 2 * i, true) >= n) throw new Error('replay connectivity out of bounds');
  }
  const nodes = new Float64Array(2 * n);
  for (let i = 0; i < 2 * n; i++) nodes[i] = dv.getFloat32(o + 4 * i, true);
  o += 8 * n;
  const elements = new Uint32Array(4 * header.elements);
  for (let i = 0; i < 4 * header.elements; i++) elements[i] = dv.getUint16(o + 2 * i, true);
  o += 8 * header.elements;
  const frames = header.displacement_scale.map((s, k) => {
    const damage = new Float32Array(n);
    const displacement = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      damage[i] = (bytes[o + i] / 255) * header.damage_max;
      displacement[2 * i] = (dv.getInt8(o + n + i) / 127) * s;
      displacement[2 * i + 1] = (dv.getInt8(o + 2 * n + i) / 127) * s;
    }
    o += 3 * n;
    return { step: header.steps[k], damage, displacement };
  });
  if (o !== bytes.length) throw new Error('replay has trailing bytes');
  return { header, nodes, elements, frames };
}

/**
 * Fetch a replay. The file is stored gzip-compressed; a host may or may not have decoded it
 * already, so the gzip magic bytes decide whether to inflate here.
 */
export async function fetchReplay<S>(url: string, signal?: AbortSignal): Promise<Replay<S>> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`replay: HTTP ${r.status} for ${url}`);
  let buf = await r.arrayBuffer();
  const b = new Uint8Array(buf).subarray(0, 2);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return decodeReplay<S>(buf);
}
