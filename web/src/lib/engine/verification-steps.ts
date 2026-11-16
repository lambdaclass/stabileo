type StepSource = () => readonly string[];
const stepSources = new WeakMap<() => unknown, StepSource>();

function withStepSource<T extends object>(value: T, source: StepSource): T & { steps: string[] } {
  const get = () => {
    const steps = [...source()];
    Object.defineProperty(value, 'steps', { value: steps, enumerable: true, configurable: true, writable: true });
    return steps;
  };
  stepSources.set(get, source);
  Object.defineProperty(value, 'steps', { enumerable: true, configurable: true, get,
    set(steps) { Object.defineProperty(value, 'steps', { value: steps, enumerable: true, configurable: true, writable: true }); },
  });
  return value as T & { steps: string[] };
}

export function withDeferredVerificationSteps<T extends object>(value: T, render: () => string[]): T & { steps: string[] } {
  let snapshot: readonly string[] | undefined;
  return withStepSource(value, () => snapshot ??= Object.freeze([...render()]));
}

export function verificationCheckFields<T extends object>(value: T): Omit<T, 'steps'> {
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(value)) if (key !== 'steps') fields[key] = (value as Record<string, unknown>)[key];
  return fields as Omit<T, 'steps'>;
}

export function copyVerificationCheck<T extends { steps: string[] }>(value: T): T {
  const getter = Object.getOwnPropertyDescriptor(value, 'steps')?.get;
  const source = getter && stepSources.get(getter);
  const fields = verificationCheckFields(value);
  return (source ? withStepSource(fields, source) : { ...fields, steps: [...value.steps] }) as unknown as T;
}
