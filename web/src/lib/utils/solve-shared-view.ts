export async function solveSharedView<T>(
  diagram: T,
  solve: () => Promise<{ ok: boolean }>,
  apply: (diagram: T) => void,
): Promise<void> {
  const outcome = await solve();
  if (outcome.ok) apply(diagram);
}
