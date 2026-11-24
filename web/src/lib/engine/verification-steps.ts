type StepsDescriptor = TypedPropertyDescriptor<string[]> & { get: () => string[] };
const stepSources = new WeakMap<() => string[], StepsDescriptor>();

export function withDeferredVerificationSteps<T extends object>(value: T, render: () => string[]): T & { steps: string[] } {
  let snapshot: readonly string[] | undefined;
  const descriptor: StepsDescriptor = {
    enumerable: true,
    configurable: true,
    get(this: { steps: string[] }) {
      const steps = [...(snapshot ??= Object.freeze([...render()]))];
      Object.defineProperty(this, 'steps', { value: steps, enumerable: true, configurable: true, writable: true });
      return steps;
    },
    set(this: { steps: string[] }, steps) {
      Object.defineProperty(this, 'steps', { value: steps, enumerable: true, configurable: true, writable: true });
    },
  };
  stepSources.set(descriptor.get, descriptor);
  return Object.defineProperty(value, 'steps', descriptor) as T & { steps: string[] };
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
  if (!source) return { ...fields, steps: [...value.steps] } as T;
  return Object.defineProperty(fields, 'steps', source) as T;
}
