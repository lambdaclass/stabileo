import type { PlateStress, QuadStress } from './types-3d';
export interface ShellRecord { id: number; plateStresses: PlateStress[]; quadStresses: QuadStress[] }
export interface ShellCombinationInput {
  cases: ShellRecord[];
  combinations: Array<{ id: number; factors: Array<{ caseId: number; factor: number }> }>;
  thicknesses: Array<[number, number]>;
  envelopeOrder: ShellRecord[];
}
export type ShellCombinationKernel = (input: ShellCombinationInput) => { combinations: ShellRecord[]; envelope: ShellRecord };
let kernel: ShellCombinationKernel | null = null;
export function registerShellCombinationKernel(value: ShellCombinationKernel | null): void { kernel = value; }
export function getShellCombinationKernel(): ShellCombinationKernel | null { return kernel; }

/** Pack only the input tensors, then unpack each resulting object once. The
 * envelope contains row references, preserving all fields of retained combos. */
export function packedShellCombinationKernel(raw: (data: Float64Array) => Float64Array): ShellCombinationKernel {
  return input => {
    let size = 4 + input.thicknesses.length * 2;
    for (const c of input.cases) size += 3 + 9 * (c.plateStresses.length + c.quadStresses.length);
    for (const c of input.combinations) size += 2 + 2 * c.factors.length;
    for (const c of input.envelopeOrder) size += 3 + 2 * (c.plateStresses.length + c.quadStresses.length);
    const data = new Float64Array(size);
    let i = 0;
    data[i++] = input.cases.length;
    for (const c of input.cases) {
      data[i++] = c.id; data[i++] = c.plateStresses.length; data[i++] = c.quadStresses.length;
      for (const list of [c.plateStresses, c.quadStresses]) for (const s of list) {
        data[i++] = s.elementId; data[i++] = s.sigmaXx; data[i++] = s.sigmaYy; data[i++] = s.tauXy;
        data[i++] = s.mx; data[i++] = s.my; data[i++] = s.mxy;
        // NaN is reserved for absent shear; explicit invalid shear must fail.
        const { qx, qy } = s as QuadStress;
        if ((qx !== undefined && !Number.isFinite(qx)) || (qy !== undefined && !Number.isFinite(qy))) {
          throw new Error('Non-finite shell shear');
        }
        data[i++] = qx ?? NaN; data[i++] = qy ?? NaN;
      }
    }
    data[i++] = input.combinations.length;
    for (const c of input.combinations) {
      data[i++] = c.id; data[i++] = c.factors.length;
      for (const f of c.factors) { data[i++] = f.caseId; data[i++] = f.factor; }
    }
    data[i++] = input.thicknesses.length;
    for (const [id, thickness] of input.thicknesses) { data[i++] = id; data[i++] = thickness; }
    data[i++] = input.envelopeOrder.length;
    for (const c of input.envelopeOrder) {
      data[i++] = c.id; data[i++] = c.plateStresses.length; data[i++] = c.quadStresses.length;
      for (const list of [c.plateStresses, c.quadStresses]) for (const s of list) {
        data[i++] = s.elementId; data[i++] = s.vonMises;
      }
    }
    const result = raw(data);
    i = 0;
    const count = result[i++];
    const combinations: ShellRecord[] = [];
    const updated = new Map<number, ShellRecord>();
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
      const record = { id, plateStresses, quadStresses };
      combinations.push(record); updated.set(id, record);
    }
    const ordered = input.envelopeOrder.map(c => updated.get(c.id) ?? c);
    const envelope: ShellRecord = { id: 0, plateStresses: [], quadStresses: [] };
    const np = result[i++];
    for (let j = 0; j < np; j++) envelope.plateStresses.push(ordered[result[i++]].plateStresses[result[i++]]);
    const nq = result[i++];
    for (let j = 0; j < nq; j++) envelope.quadStresses.push(ordered[result[i++]].quadStresses[result[i++]]);
    return { combinations, envelope };
  };
}
