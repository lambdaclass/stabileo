import { copyVerificationCheck } from './verification-steps';
import type { ElementVerification } from './codes/argentina/cirsoc201';

const concurrentGetters = new WeakSet<() => unknown>();

export function hasConcurrentChecks(value: ElementVerification): boolean {
  const getter = Object.getOwnPropertyDescriptor(value, 'concurrentChecks')?.get;
  return getter !== undefined && concurrentGetters.has(getter) || Boolean(value.concurrentChecks);
}

export function verificationForElement(value: ElementVerification, elementId: number, concurrent: 'copy' | 'transfer' = 'copy'): ElementVerification {
  const { concurrentChecks, ...plain } = value;
  const check = copyVerificationCheck;
  const detailing = value.detailing && { ...value.detailing };
  if (detailing) detailing.bars = detailing.bars.map(bar => ({ ...bar }));
  const out: ElementVerification = { ...plain, elementId,
    flexure: check(value.flexure), shear: check(value.shear),
    ...(detailing ? { detailing } : {}),
    ...(value.shearSecondary ? { shearSecondary: check(value.shearSecondary) } : {}),
    ...(value.column ? { column: check(value.column) } : {}),
    ...(value.biaxial ? { biaxial: check(value.biaxial) } : {}),
    ...(value.torsion ? { torsion: check(value.torsion) } : {}),
    ...(value.slender ? { slender: check(value.slender) } : {}),
    ...(value.slenderSecondary ? { slenderSecondary: check(value.slenderSecondary) } : {}),
    ...(value.governingCombos ? { governingCombos: Object.fromEntries(Object.entries(value.governingCombos).map(([key, v]) => [key, v && { ...v }])) } : {}),
    ...(value.engineRecheck ? { engineRecheck: { ...value.engineRecheck,
      disagreements: [...value.engineRecheck.disagreements], notRechecked: [...value.engineRecheck.notRechecked],
      ...(value.engineRecheck.certified ? { certified: { ...value.engineRecheck.certified } } : {}) } } : {}),
    ...(value.diagnostics ? { diagnostics: value.diagnostics.map(d => ({ ...d,
      ...(d.details ? { details: Object.fromEntries(Object.entries(d.details).map(([key, detail]) => [key, detail !== null && typeof detail === 'object' ? structuredClone(detail) : detail])) } : {}),
      ...(d.elementIds ? { elementIds: d.elementIds.map(id => id === value.elementId ? elementId : id) } : {}) })) } : {}),
  };
  if (concurrentChecks && concurrent === 'transfer' && elementId === value.elementId) out.concurrentChecks = concurrentChecks;
  else if (concurrentChecks) {
    const get = () => {
      const own = concurrentChecks.map(c => ({ demand: c.demand, verification: verificationForElement(c.verification, elementId) }));
      Object.defineProperty(out, 'concurrentChecks', { value: own, enumerable: true, configurable: true, writable: true });
      return own;
    };
    concurrentGetters.add(get);
    Object.defineProperty(out, 'concurrentChecks', { enumerable: true, configurable: true, get,
      set(own) { Object.defineProperty(out, 'concurrentChecks', { value: own, enumerable: true, configurable: true, writable: true }); },
    });
  }
  return out;
}
