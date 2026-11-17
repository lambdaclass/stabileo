export const SUPPORT_TYPES = [
  'fixed', 'pinned', 'rollerX', 'rollerY', 'rollerZ', 'spring',
  'fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d', 'custom3d',
] as const;

export type SupportType = typeof SUPPORT_TYPES[number];

export function isSupportType(type: unknown): type is SupportType {
  return SUPPORT_TYPES.some(known => known === type);
}
