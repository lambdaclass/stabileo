export function numEntry(field: { value: string }, shown: number, min: number, max: number): number | null {
  const raw = field.value;
  const v = Number(raw.replace(',', '.'));
  if (raw.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) return v;
  field.value = String(shown);
  return null;
}
