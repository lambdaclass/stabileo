/**
 * Whether an analysis meshes the physical plates that need it (`store/physical-plates.ts`) or stops
 * and names them. A way of working rather than model data: kept in this browser, on by default.
 */
const KEY = 'stabileo-mesh-before-analysis';

function read(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

let auto = $state(read());

export const meshBeforeAnalysis = {
  get value() { return auto; },
  set value(v: boolean) {
    auto = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* lasts the session */ }
  },
};
