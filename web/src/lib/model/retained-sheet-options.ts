import type { DesignOptions } from '../rc-sheets/design-options';

const legacyFields = {
  torsion: true, faces: true, flange: true, bentBars: true, slabBentBars: true,
  seismic: true, deflection: true, alternatives: true, criteria: true, flangeBeams: true,
} satisfies Record<keyof DesignOptions, true>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function retainedSheetOptions(own: unknown, legacy: unknown): Record<string, unknown> | undefined {
  if (isRecord(own)) return { ...own };
  if (!isRecord(legacy)) return undefined;
  const options = Object.entries(legacy).filter(([key, value]) =>
    Object.hasOwn(legacyFields, key) && (key !== 'torsion' || value === 'compatibility'));
  return options.length ? Object.fromEntries(options) : undefined;
}
