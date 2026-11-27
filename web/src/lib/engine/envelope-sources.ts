const contributors = new WeakMap<object, readonly object[]>();

export function recordEnvelopeSources<E extends object>(envelope: E | null, sources: readonly object[]): E | null {
  if (envelope) contributors.set(envelope, [...sources]);
  return envelope;
}

export function envelopeSources(envelope: object | null) {
  return envelope && contributors.get(envelope);
}
