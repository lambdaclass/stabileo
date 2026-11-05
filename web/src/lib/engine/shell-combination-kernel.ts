import type { PlateStress, QuadStress, ShellEnvelopeKey } from './types-3d';
export interface ShellRecord { id: number; plateStresses: PlateStress[]; quadStresses: QuadStress[] }
export interface ShellCombinationInput {
  cases: ShellRecord[];
  combinations: Array<{ id: number; factors: Array<{ caseId: number; factor: number }> }>;
  thicknesses: Array<[number, number]>;
  envelopeOrder: ShellRecord[];
}
/** One component's extremes over the enveloped sets; a source is the set's position in the input. */
export interface IndexedExtreme { max: number; maxSource: number; min: number; minSource: number }
export interface ShellEnvelopeRow { elementId: number; extremes: Partial<Record<ShellEnvelopeKey, IndexedExtreme>> }
export interface ShellEnvelopeRows { plates: ShellEnvelopeRow[]; quads: ShellEnvelopeRow[] }
export type ShellCombinationKernel = (input: ShellCombinationInput) => { combinations: ShellRecord[]; envelope: ShellEnvelopeRows };
export type ShellEnvelopeKernel = (sources: ShellRecord[]) => ShellEnvelopeRows;

/** The kernel's component order (`shell_combination_kernel.rs`, `envelope_keys`). */
export const SHELL_ENVELOPE_KEYS: readonly ShellEnvelopeKey[] = [
  'sigmaXx', 'sigmaYy', 'tauXy', 'mx', 'my', 'mxy', 'qx', 'qy', 'vonMises', 'sigma1', 'sigma2',
  'woodArmerBottomX', 'woodArmerBottomY', 'woodArmerTopX', 'woodArmerTopY', 'faceSigma1', 'faceSigma2',
];

let kernel: ShellCombinationKernel | null = null;
let envelopeKernel: ShellEnvelopeKernel | null = null;
export function registerShellCombinationKernel(value: ShellCombinationKernel | null): void { kernel = value; }
export function getShellCombinationKernel(): ShellCombinationKernel | null { return kernel; }
export function registerShellEnvelopeKernel(value: ShellEnvelopeKernel | null): void { envelopeKernel = value; }
export function getShellEnvelopeKernel(): ShellEnvelopeKernel | null { return envelopeKernel; }

const ROW = 12;
const sourcesSize = (sources: ShellRecord[]) => sources.reduce((n, c) => n + 3 + ROW * (c.plateStresses.length + c.quadStresses.length), 1);

function shearOf(s: PlateStress | QuadStress): [number, number] {
  const { qx, qy } = s as QuadStress;
  // NaN is reserved for absent shear; explicit invalid shear must fail.
  if ((qx !== undefined && !Number.isFinite(qx)) || (qy !== undefined && !Number.isFinite(qy))) throw new Error('Non-finite shell shear');
  return [qx ?? NaN, qy ?? NaN];
}

function packSources(data: Float64Array, i: number, sources: ShellRecord[]): number {
  data[i++] = sources.length;
  for (const c of sources) {
    data[i++] = c.id; data[i++] = c.plateStresses.length; data[i++] = c.quadStresses.length;
    for (const s of c.plateStresses) {
      const [qx, qy] = shearOf(s);
      data.set([s.elementId, s.sigmaXx, s.sigmaYy, s.tauXy, s.mx, s.my, s.mxy, qx, qy, s.vonMises, s.sigma1, s.sigma2], i); i += ROW;
    }
    for (const s of c.quadStresses) {
      const [qx, qy] = shearOf(s);
      data.set([s.elementId, s.sigmaXx, s.sigmaYy, s.tauXy, s.mx, s.my, s.mxy, qx, qy, s.vonMises, NaN, NaN], i); i += ROW;
    }
  }
  return i;
}

function unpackEnvelope(result: Float64Array, start: number): ShellEnvelopeRows {
  let i = start;
  const read = (): ShellEnvelopeRow[] => {
    const rows: ShellEnvelopeRow[] = [];
    const n = result[i++];
    for (let j = 0; j < n; j++) {
      const row: ShellEnvelopeRow = { elementId: result[i++], extremes: {} };
      for (const key of SHELL_ENVELOPE_KEYS) {
        const max = result[i++], maxSource = result[i++], min = result[i++], minSource = result[i++];
        if (!Number.isNaN(max)) row.extremes[key] = { max, maxSource, min, minSource };
      }
      rows.push(row);
    }
    return rows;
  };
  const plates = read();
  const quads = read();
  return { plates, quads };
}

export function packedShellEnvelopeKernel(raw: (data: Float64Array) => Float64Array): ShellEnvelopeKernel {
  return (sources) => {
    const data = new Float64Array(sourcesSize(sources));
    packSources(data, 0, sources);
    return unpackEnvelope(raw(data), 0);
  };
}

/** Pack only the input tensors, then unpack each resulting object once. */
export function packedShellCombinationKernel(raw: (data: Float64Array) => Float64Array): ShellCombinationKernel {
  return input => {
    let size = 3 + input.thicknesses.length * 2 + sourcesSize(input.envelopeOrder);
    for (const c of input.cases) size += 3 + 9 * (c.plateStresses.length + c.quadStresses.length);
    for (const c of input.combinations) size += 2 + 2 * c.factors.length;
    const data = new Float64Array(size);
    let i = 0;
    data[i++] = input.cases.length;
    for (const c of input.cases) {
      data[i++] = c.id; data[i++] = c.plateStresses.length; data[i++] = c.quadStresses.length;
      for (const list of [c.plateStresses, c.quadStresses]) for (const s of list) {
        data[i++] = s.elementId; data[i++] = s.sigmaXx; data[i++] = s.sigmaYy; data[i++] = s.tauXy;
        data[i++] = s.mx; data[i++] = s.my; data[i++] = s.mxy;
        const [qx, qy] = shearOf(s);
        data[i++] = qx; data[i++] = qy;
      }
    }
    data[i++] = input.combinations.length;
    for (const c of input.combinations) {
      data[i++] = c.id; data[i++] = c.factors.length;
      for (const f of c.factors) { data[i++] = f.caseId; data[i++] = f.factor; }
    }
    data[i++] = input.thicknesses.length;
    for (const [id, thickness] of input.thicknesses) { data[i++] = id; data[i++] = thickness; }
    packSources(data, i, input.envelopeOrder);
    const result = raw(data);
    i = 0;
    const count = result[i++];
    const combinations: ShellRecord[] = [];
    for (let c = 0; c < count; c++) {
      const id = result[i++], np = result[i++], nq = result[i++];
      const plateStresses: PlateStress[] = [], quadStresses: QuadStress[] = [];
      for (let j = 0; j < np; j++) {
        plateStresses.push({ elementId: result[i++], sigmaXx: result[i++], sigmaYy: result[i++], tauXy: result[i++],
          mx: result[i++], my: result[i++], mxy: result[i++], sigma1: result[i++], sigma2: result[i++], vonMises: result[i++] });
      }
      for (let j = 0; j < nq; j++) {
        const q: QuadStress = { elementId: result[i++], sigmaXx: result[i++], sigmaYy: result[i++], tauXy: result[i++],
          mx: result[i++], my: result[i++], mxy: result[i++], vonMises: result[i++] };
        const qx = result[i++], qy = result[i++];
        if (!Number.isNaN(qx)) { q.qx = qx; q.qy = qy; }
        quadStresses.push(q);
      }
      combinations.push({ id, plateStresses, quadStresses });
    }
    return { combinations, envelope: unpackEnvelope(result, i) };
  };
}
