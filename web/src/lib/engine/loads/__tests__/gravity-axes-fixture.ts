import { regionModel } from './physical-region-invariance';

export function skewCarriers(rollAngle: number, custom: boolean, angle = 0, mirror = 1, divided = false) {
  const c = angle === 0 ? 1 : 0, s = angle === 0 ? 0 : 1;
  const point = ([x, y]: number[]) => [mirror * x! * c - y! * s, mirror * x! * s + y! * c];
  const corners = [[0, 0], [6, 2], [6, 6], [0, 4]].map(point);
  const fractions = divided ? [0, 0.25, 0.5, 0.75] : [0, 0.5];
  const ring = corners.flatMap((a, k) => {
    const b = corners[(k + 1) % 4]!;
    return fractions.map(t => [a[0]! + t * (b[0]! - a[0]!), a[1]! + t * (b[1]! - a[1]!)]);
  });
  const model = regionModel([ring]);
  const orientation = { rollAngle, ...(custom ? { localYx: 0, localYy: 0, localYz: 1 } : {}) };
  for (const e of model.elements.values()) Object.assign(e, orientation);
  return { model, fractions, point, orientation, spanAxis: angle === 0 ? 'y' as const : 'x' as const };
}
