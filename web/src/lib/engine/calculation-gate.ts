let refusal: string | null = null;
let failure: string | null = null;
let active = 0;
const waiters = new Set<() => void>();
export class CalculationRefused extends Error {}
export function refuseNewJobs(reason: string | null): void { refusal = reason; }
export function failCalculations(reason: string): void { failure = reason; }
export function assertCalculationsAllowed(): void {
  if (import.meta.env.VITE_DESKTOP === '1' && (failure ?? refusal) !== null) throw new CalculationRefused((failure ?? refusal)!);
}
export function calculationsBusy(): boolean { return active > 0; }
export function calculationsIdle(): Promise<void> {
  return active === 0 ? Promise.resolve() : new Promise(resolve => waiters.add(resolve));
}
export function calculationLease(): () => void {
  assertCalculationsAllowed();
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--active === 0) {
      for (const resolve of waiters) resolve();
      waiters.clear();
    }
  };
}
export function guardedCalculation<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: Parameters<T>) => {
    const release = calculationLease();
    try { return fn(...args); } finally { release(); }
  }) as T;
}

const originals = new WeakMap<object, unknown>();

/** Desktop app: leases every plain function a WASM module exports, so an update waits for
 * running calculations. Classes (wasm-bindgen emits them as `class X`) and the init entry
 * points pass through, so `new` and start-up keep working. Outside the desktop app a call
 * goes straight through. Wrappers are cached, so a function keeps one identity. */
export function guardExports<M extends object>(module: M, enabled = () => import.meta.env.VITE_DESKTOP === '1'): M {
  const wrapped = new WeakMap<object, unknown>();
  return new Proxy(module, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== 'function' || key === 'default' || key === 'initSync') return value;
      if (/^class\b/.test(Function.prototype.toString.call(value))) return value;
      if (!wrapped.has(value)) {
        const fn = value as (...args: any[]) => any;
        const leased = guardedCalculation(fn);
        const wrapper = function (this: unknown, ...args: any[]) { return enabled() ? leased(...args) : fn.apply(this, args); };
        originals.set(wrapper, fn);
        wrapped.set(value, wrapper);
      }
      return wrapped.get(value);
    },
  });
}

/** The WASM export behind a `guardExports` wrapper (the function itself otherwise). */
export function unwrapCalculation<T>(fn: T): T {
  return (fn !== null && typeof fn === 'function' && originals.has(fn) ? originals.get(fn) : fn) as T;
}
