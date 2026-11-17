import type { EngineMessage } from '../codes/message';

export type VerificationStep = string | EngineMessage;

const deferredSteps = new WeakSet<() => unknown>();

export function withDeferredVerificationSteps<T extends object, S extends VerificationStep>(value: T, render: () => S[]): T & { steps: S[] } {
  let snapshot: readonly S[] | undefined;
  function get(this: T) {
    snapshot ??= Object.freeze([...render()]);
    const steps = [...snapshot];
    Object.defineProperty(this, 'steps', { value: steps, enumerable: true, configurable: true, writable: true });
    return steps;
  }
  deferredSteps.add(get);
  Object.defineProperty(value, 'steps', { enumerable: true, configurable: true, get,
    set(steps) { Object.defineProperty(this, 'steps', { value: steps, enumerable: true, configurable: true, writable: true }); },
  });
  return value as T & { steps: S[] };
}

export function verificationCheckFields<T extends object>(value: T): Omit<T, 'steps'> {
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(value)) if (key !== 'steps') fields[key] = (value as Record<string, unknown>)[key];
  return fields as Omit<T, 'steps'>;
}

export function copyVerificationCheck<T extends { steps: VerificationStep[] }>(value: T): T {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'steps');
  const fields = verificationCheckFields(value);
  if (descriptor?.get && deferredSteps.has(descriptor.get)) return Object.defineProperty(fields, 'steps', descriptor) as T;
  return { ...fields, steps: [...value.steps] } as T;
}
