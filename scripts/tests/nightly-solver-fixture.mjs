export function nightlySolverFixture(archive) {
  return Object.fromEntries(Object.entries(archive).filter(([key]) => !key.startsWith('_')));
}
