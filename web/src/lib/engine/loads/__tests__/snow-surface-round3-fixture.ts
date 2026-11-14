import { mesh } from './snow-surface-round2-fixture';

function gable(x: number, y: number, perpendicular = false) {
  const point = (a: number, b: number, z: number) => perpendicular ? [x + b, y + a, z] : [x + a, y + b, z];
  return [
    [point(0, 0, 3), point(6, 0, 3), point(6, 4, 5), point(0, 4, 5)],
    [point(0, 4, 5), point(6, 4, 5), point(6, 8, 3), point(0, 8, 3)],
  ];
}

export function ridgeRoofs(kind: 'perpendicular' | 'L' | 'hip' | 'single') {
  if (kind === 'hip') return mesh([
    [[0, 0, 3], [8, 0, 3], [4, 4, 5]],
    [[8, 0, 3], [8, 12, 3], [4, 8, 5], [4, 4, 5]],
    [[8, 12, 3], [0, 12, 3], [4, 8, 5]],
    [[0, 12, 3], [0, 0, 3], [4, 4, 5], [4, 8, 5]],
  ]);
  return mesh(kind === 'single' ? gable(0, 0) : [...gable(kind === 'L' ? -6 : 0, 0), ...gable(kind === 'L' ? 0 : 20, kind === 'L' ? -6 : 20, true)]);
}

