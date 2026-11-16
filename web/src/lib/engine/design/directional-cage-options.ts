import type { StirrupDef } from '../../design-contract/reinforcement';

export function secondaryLegCounts(minimum: number | undefined, maximum: number): Array<number | undefined> {
  if (minimum === undefined) return [undefined];
  return Array.from({ length: Math.max(0, maximum - minimum + 1) }, (_, i) => minimum + i);
}

export function boundedDirectionalOptions(options: StirrupDef[], limit: number, secondaryUtilization: (cage: StirrupDef) => number, minimumOptions: StirrupDef[]): StirrupDef[] {
  const baseline = minimumOptions.sort((a, b) => a.legs - b.legs || a.diameter - b.diameter || b.spacing - a.spacing);
  const minimumCount = Math.min(...minimumOptions.map(c => c.secondaryLegs ?? 2));
  const strongest = new Map<number, { cage: StirrupDef; utilization: number }>();
  for (const cage of options) {
    const count = cage.secondaryLegs ?? 2;
    if (count <= minimumCount) continue;
    const utilization = secondaryUtilization(cage);
    const previous = strongest.get(count);
    if (!previous || utilization < previous.utilization) strongest.set(count, { cage, utilization });
  }
  const retained = new Set([...strongest.values()].map(x => x.cage));
  if (retained.size > limit) throw new Error('Secondary cage counts exceed the option bound');
  for (const cage of baseline) {
    if (retained.size >= limit) break;
    retained.add(cage);
  }
  return [...baseline.filter(c => retained.has(c)), ...options.filter(c => retained.has(c) && !baseline.includes(c))];
}
