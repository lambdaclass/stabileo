/** Batched rectangular-column equilibrium. See engine/column_capacity_kernel.rs for the buffer contract. */
export type ColumnCapacityKernel = (constants: Float64Array, bars: Float64Array, loads: Float64Array) => Float64Array;
let kernel: ColumnCapacityKernel | null = null;
let enabled = true;
export function registerColumnCapacityKernel(value: ColumnCapacityKernel | null): void { kernel = value; }
/** Benchmark/reference switch: keep the same prepared cache while comparing TS and Rust. */
export function setColumnCapacityKernelEnabled(value: boolean): void { enabled = value; }
export function getColumnCapacityKernel(): ColumnCapacityKernel | null { return enabled ? kernel : null; }
