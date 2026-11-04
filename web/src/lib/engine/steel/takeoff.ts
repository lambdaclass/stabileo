/**
 * Steel takeoff by profile: how many members of each section, their length and their weight, and
 * the total. Weight from the section's area and the material's unit weight (77 kN/m³ when the
 * material states none), in kg; a member of variable section weighs its mean area.
 */
export interface TakeoffRow { profile: string; members: number; length: number; kgPerM: number; kg: number }

export function steelTakeoff(i: {
  members: ReadonlyArray<{ id: number; L: number; sectionName: string; area: number; rho?: number }>;
}): { rows: TakeoffRow[]; totalKg: number; totalLength: number } {
  const by = new Map<string, TakeoffRow>();
  for (const m of i.members) {
    const kgPerM = (m.area * (m.rho ?? 77) * 1000) / 9.80665;
    const r = by.get(m.sectionName) ?? { profile: m.sectionName, members: 0, length: 0, kgPerM, kg: 0 };
    r.members++; r.length += m.L; r.kg += kgPerM * m.L;
    by.set(m.sectionName, r);
  }
  const rows = [...by.values()].sort((a, b) => b.kg - a.kg);
  return { rows, totalKg: rows.reduce((s, r) => s + r.kg, 0), totalLength: rows.reduce((s, r) => s + r.length, 0) };
}
