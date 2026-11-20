export function loadFieldUnit(type: string, field: string): string {
  const f = field.toLowerCase();
  if (/^(fx|fy|fz|p|px|py|pz)$/.test(f)) return 'kN';
  if (/^(mx|my|mz)$/.test(f)) return 'kN·m';
  if (/^q/.test(f)) return type === 'surface3d' ? 'kN/m²' : 'kN/m';
  if (f === 'pressure') return 'kN/m²';
  if (/^(a|b|x|position|start|end|length)$/.test(f)) return 'm';
  if (/^(dt|dtg|dtuniform|dtgradient|dty|dtz)$/.test(f)) return '°C';
  if (f === 'angle') return '°';
  return '';
}
