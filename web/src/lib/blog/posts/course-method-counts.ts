import type { MethodGroup } from '../../engine/steps/registry';

export const courseMethodCounts = {
  stiffness: '1',
  flexibility: '1',
  continuous: '2',
  frames: '4',
  trusses: '3',
  deformation: '5',
  influence: '1',
  secondOrder: '4',
  plastic: '2',
  dynamics: '3',
} satisfies Record<MethodGroup, string>;
