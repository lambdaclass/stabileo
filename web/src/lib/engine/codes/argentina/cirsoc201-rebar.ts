export interface RebarSpec {
  diameter: number;
  area: number;
  label: string;
}

export const REBAR_DB: RebarSpec[] = [
  { diameter: 6,  area: 0.283, label: 'Ø6' },
  { diameter: 8,  area: 0.503, label: 'Ø8' },
  { diameter: 10, area: 0.785, label: 'Ø10' },
  { diameter: 12, area: 1.131, label: 'Ø12' },
  { diameter: 16, area: 2.011, label: 'Ø16' },
  { diameter: 20, area: 3.142, label: 'Ø20' },
  { diameter: 25, area: 4.909, label: 'Ø25' },
  { diameter: 32, area: 8.042, label: 'Ø32' },
];

export function rebarSpec(diameter: number): RebarSpec {
  return REBAR_DB.find(r => r.diameter === diameter)
    ?? { diameter, area: Math.PI * (diameter / 20) ** 2, label: `Ø${diameter}` };
}
