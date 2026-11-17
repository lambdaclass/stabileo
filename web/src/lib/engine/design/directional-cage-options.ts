import type { StirrupDef } from '../../design-contract/reinforcement';

export function secondaryLegCounts(minimum: number | undefined, maximum: number): Array<number | undefined> {
  const first = minimum ?? 2;
  return Array.from({ length: Math.max(0, maximum - first + 1) }, (_, i) => minimum === undefined && i === 0 ? undefined : first + i);
}

export function boundedDirectionalOptions(options: StirrupDef[], limit: number, secondaryUtilization: (cage: Pick<StirrupDef, 'diameter' | 'spacing' | 'secondaryLegs'>) => number, minimumOptions: StirrupDef[]): StirrupDef[] {
  const baseline = minimumOptions.sort((a, b) => a.legs - b.legs || a.diameter - b.diameter || b.spacing - a.spacing);
  const minimumCount = Math.min(...minimumOptions.map(c => c.secondaryLegs ?? 2));
  const strongest = new Map<number, { cage: StirrupDef; utilization: number }>();
  const scores = new Map<string, number>();
  for (const cage of options) {
    const count = cage.secondaryLegs ?? 2;
    if (count <= minimumCount) continue;
    const key = `${cage.diameter}/${cage.spacing}/${count}`;
    let utilization = scores.get(key);
    if (utilization === undefined) {
      utilization = secondaryUtilization({ diameter: cage.diameter, spacing: cage.spacing, secondaryLegs: count });
      scores.set(key, utilization);
    }
    const previous = strongest.get(count);
    if (!previous || utilization < previous.utilization) strongest.set(count, { cage, utilization });
  }
  const retained = new Set([...strongest.values()].map(x => x.cage));
  if (retained.size > limit) throw new Error('Secondary cage counts exceed the option bound');
  for (const cage of baseline) {
    if (retained.size >= limit) break;
    retained.add(cage);
  }
  const baselineSet = new Set(baseline);
  return [...baseline.filter(c => retained.has(c)), ...options.filter(c => retained.has(c) && !baselineSet.has(c))];
}

export function candidateShearDepth(sectionDepth: number, cover: number, stirrupDiameterMm: number): number {
  return sectionDepth - cover - stirrupDiameterMm / 1000 - 0.008;
}
