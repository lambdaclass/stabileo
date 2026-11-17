import type { EngineMessage } from '../codes/message';

export type VerificationStep = string | EngineMessage;

type StepSource = () => readonly VerificationStep[];
const stepSources = new WeakMap<() => unknown, StepSource>();

function withStepSource<T extends object, S extends VerificationStep>(value: T, source: () => readonly S[]): T & { steps: S[] } {
  const get = () => {
    const steps = [...source()];
    Object.defineProperty(value, 'steps', { value: steps, enumerable: true, configurable: true, writable: true });
    return steps;
  };
  stepSources.set(get, source);
  Object.defineProperty(value, 'steps', { enumerable: true, configurable: true, get,
    set(steps) { Object.defineProperty(value, 'steps', { value: steps, enumerable: true, configurable: true, writable: true }); },
  });
  return value as T & { steps: S[] };
}

export function withDeferredVerificationSteps<T extends object, S extends VerificationStep>(value: T, render: () => S[]): T & { steps: S[] } {
  let snapshot: readonly S[] | undefined;
  return withStepSource(value, () => snapshot ??= Object.freeze([...render()]));
}

export function verificationCheckFields<T extends object>(value: T): Omit<T, 'steps'> {
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(value)) if (key !== 'steps') fields[key] = (value as Record<string, unknown>)[key];
  return fields as Omit<T, 'steps'>;
}

export function copyVerificationCheck<T extends { steps: VerificationStep[] }>(value: T): T {
  const getter = Object.getOwnPropertyDescriptor(value, 'steps')?.get;
  const source = getter && stepSources.get(getter);
  const fields = verificationCheckFields(value);
  return (source ? withStepSource(fields, source) : { ...fields, steps: [...value.steps] }) as unknown as T;
}
