import type { AxesFrame } from './frame';
import { quantityTransform } from './quantity-transform';

export interface ModalQuantities {
  participationX?: number;
  participationY?: number;
  participationZ?: number;
  massRatioX?: number;
  massRatioY?: number;
  massRatioZ?: number;
}

type Components = [number | undefined, number | undefined, number | undefined];

export function modalPresentation(frame: AxesFrame, modes: readonly ModalQuantities[], withheld = false) {
  const transform = quantityTransform(frame);
  const cumulative: Components = [0, 0, 0];
  return modes.map(mode => {
    const participation: Components = [undefined, undefined, undefined];
    if (!withheld) [mode.participationX, mode.participationY, mode.participationZ].forEach((value, index) => {
      if (value === undefined) return;
      const out = transform.component(index, value, 'vector');
      participation[out.index] = out.value;
    });
    const massRatios = transform.permute<number | undefined>([mode.massRatioX, mode.massRatioY, mode.massRatioZ]);
    massRatios.forEach((value, index) => {
      cumulative[index] = withheld || value === undefined || cumulative[index] === undefined ? undefined : cumulative[index]! + value;
      if (withheld) massRatios[index] = undefined;
    });
    return { participation, massRatios, cumulative: [...cumulative] as Components };
  });
}
