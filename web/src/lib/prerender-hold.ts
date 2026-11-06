type Holds = { __prerenderHolds?: number };

/** The prerender does not capture a page while any held work is unsettled. */
export function holdPrerender<T>(work: Promise<T>): Promise<T> {
  const scope = globalThis as Holds;
  scope.__prerenderHolds = (scope.__prerenderHolds ?? 0) + 1;
  // Released a task later, so the caller's own handlers and Svelte's flush render the result first.
  const release = () => { setTimeout(() => { scope.__prerenderHolds = (scope.__prerenderHolds ?? 1) - 1; }, 0); };
  work.then(release, release);
  return work;
}
