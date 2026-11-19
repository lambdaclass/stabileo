import { atLine, type MassLine, type SeismicLevel } from './seismic-mass';

type StoryLine = { line: MassLine; atStory: { x: number; y: number }; wi: number; wj: number };
type End = ReturnType<typeof atLine>;

function fitCarrier(lines: MassLine[], elevation: number): StoryLine[] | undefined {
  const slices = lines.map(line => ({ line, i: atLine(line, line.a), j: atLine(line, line.b), length: line.b - line.a }));
  let low: End = slices[0]!.i, high = low;
  for (const { i, j } of slices) for (const end of [i, j]) {
    if (end.z < low.z) low = end;
    if (end.z > high.z) high = end;
  }
  const width = high.z - low.z;
  if (!(width > 0 && Number.isFinite(width))) return undefined;
  const target = (elevation - low.z) / width;
  const atStory = { x: low.x + target * (high.x - low.x), y: low.y + target * (high.y - low.y) };
  const spans = slices.map(s => ({ ...s, a: (s.i.z - low.z) / width, b: (s.j.z - low.z) / width }));
  const mass = spans.reduce((sum, s) => sum + s.length * (s.i.weight + s.j.weight) / 2, 0);
  const firstNumerator = (s: typeof spans[number], wi: number, wj: number) =>
    s.length * (wi * (2 * s.a + s.b) + wj * (s.a + 2 * s.b));
  const length = spans.reduce((sum, s) => sum + s.length, 0);
  const mean = spans.reduce((sum, s) => sum + s.length * (s.a + s.b) / 2, 0) / length;
  const spread = spans.reduce((sum, s) => {
    const a = s.a - mean, b = s.b - mean;
    return sum + s.length * (a * a + a * b + b * b);
  }, 0) / 3;
  const originalMoment = spans.reduce((sum, s) => sum + firstNumerator(s, s.i.weight, s.j.weight), 0) / 6;
  const moment = mass * target;
  const gain = (moment - originalMoment) / spread;
  if (!(mass > 0 && spread > 0) || ![mass, spread, moment, gain, atStory.x, atStory.y].every(Number.isFinite)) return undefined;

  let fittedMass = 0, fittedMoment = 0;
  const fitted = spans.map(s => {
    const wi = s.i.weight + gain * (s.a - mean), wj = s.j.weight + gain * (s.b - mean);
    fittedMass += s.length * (wi + wj) / 2;
    fittedMoment += firstNumerator(s, wi, wj);
    return { line: s.line, atStory, wi, wj };
  });
  const roundoff = 64 * Number.EPSILON;
  if (!(Math.abs(fittedMass - mass) <= roundoff * mass &&
        Math.abs(fittedMoment / 6 - moment) <= roundoff * Math.max(mass, Math.abs(moment)))) return undefined;
  return fitted;
}

export function fitStoryCarriers(level: SeismicLevel): Map<MassLine, StoryLine> | undefined {
  const groups = new Map<number, MassLine[]>();
  for (const line of level.mass) {
    if (line.kind !== 'line' || line.nodeI.z === line.nodeJ.z) continue;
    const group = groups.get(line.carrierId);
    if (group) group.push(line);
    else groups.set(line.carrierId, [line]);
  }
  const fitted = new Map<MassLine, StoryLine>();
  for (const group of groups.values()) {
    const loads = fitCarrier(group, level.elevation);
    if (!loads) return undefined;
    for (const load of loads) fitted.set(load.line, load);
  }
  return fitted;
}
