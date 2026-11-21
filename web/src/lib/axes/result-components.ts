import { type AxesFrame } from './frame';
import { quantityTransform } from './quantity-transform';

export function resultComponents(frame: AxesFrame, result: object | null | undefined) {
  const magnitude = !!result && 'magnitude' in result && !!result.magnitude;
  const transform = quantityTransform(frame);
  return {
    vec: (x: number, y: number, z: number) => transform.triple({ kind: magnitude ? 'magnitude' : 'vector', values: [x, y, z] }),
    rot: (x: number, y: number, z: number) => transform.triple({ kind: magnitude ? 'magnitude' : 'pseudovector', values: [x, y, z] }),
    plane: (value: number, axis: 'x' | 'z' | 'rot', sense: 1 | -1 = 1) => magnitude
      ? transform.plane({ kind: 'magnitude', value, axis })
      : axis === 'rot' ? transform.plane({ kind: 'pseudovector', value: sense * value, axis })
      : transform.plane({ kind: 'vector', value: sense * value, axis }),
  };
}
