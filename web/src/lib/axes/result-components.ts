import { planeSigns, pseudoToUser, toUser, type AxesFrame, type Vec3 } from './frame';

export function resultComponents(frame: AxesFrame, result: object | null | undefined) {
  const magnitude = !!result && 'magnitude' in result && !!result.magnitude;
  const permute = (v: Vec3): [number, number, number] => frame.rows.map(row => v[row.findIndex(x => x !== 0)]!) as [number, number, number];
  const p = planeSigns(frame);
  return {
    vec: (x: number, y: number, z: number) => magnitude ? permute([x, y, z]) : toUser(frame, [x, y, z]),
    rot: (x: number, y: number, z: number, sense: 1 | -1 = 1) => magnitude ? permute([x, y, z]) : pseudoToUser(frame, [sense * x, sense * y, sense * z]),
    plane: (v: number, axis: 'x' | 'z' | 'rot') => magnitude ? v : v * (axis === 'x' ? p.sx : axis === 'z' ? p.sz : p.sr),
  };
}
