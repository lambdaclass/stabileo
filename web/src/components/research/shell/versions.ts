export type Version = { version: number; date: string; commit: string | null; changes: string };
const VERSIONS = import.meta.glob<{ versions: Version[] }>('../../../../../research/*/*/versions.json', { eager: true, import: 'default' });

export function experimentVersions(id: string): Version[] {
  return Object.entries(VERSIONS).find(([file]) => file.endsWith(`/${id}/versions.json`))?.[1].versions ?? [];
}
