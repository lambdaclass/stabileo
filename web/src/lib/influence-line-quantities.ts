/**
 * The quantities an influence line can be drawn for, in three groups.
 *
 * This list used to be written out as buttons in two places — the desktop
 * options bar and the floating toolbar — and this very arrangement had to be
 * edited in both when the quantities were renamed (Ry→Rz, Mz→My). The data
 * lives here once; each platform keeps its own button styling.
 */
export const IL_QUANTITY_GROUPS = [
  {
    labelKey: 'float.reactions',
    quantities: [
      { id: 'Rz', labelKey: 'float.rzVertical' },
      { id: 'Rx', labelKey: 'float.rxHoriz' },
      { id: 'My', labelKey: 'float.mySupport' },
    ],
  },
  {
    labelKey: 'float.internal',
    quantities: [
      { id: 'M', labelKey: 'float.mMoment' },
      { id: 'V', labelKey: 'float.vShear' },
      { id: 'N', labelKey: 'course.influence.q.N' },
    ],
  },
  {
    labelKey: 'course.influence.group.displacements',
    quantities: [
      { id: 'uz', labelKey: 'course.influence.q.uz' },
      { id: 'ux', labelKey: 'course.influence.q.ux' },
      { id: 'ry', labelKey: 'course.influence.q.ry' },
    ],
  },
] as const;

export type IlQuantityId = (typeof IL_QUANTITY_GROUPS)[number]['quantities'][number]['id'];

/** The unit load's two directions, offered beside the quantities. */
export const IL_DIRECTIONS = [
  { id: 'vertical', key: 'float.ilVertical', tip: 'float.ilVerticalTip' },
  { id: 'horizontal', key: 'float.ilHorizontal', tip: 'float.ilHorizontalTip' },
] as const;
