export function numbers(text: string, locale: string): string[] {
  const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(12345.6);
  const decimal = parts.find(part => part.type === 'decimal')!.value;
  const group = parts.find(part => part.type === 'group')!.value;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const integer = `(?:\\d{1,3}(?:${escape(group)}\\d{3})+|\\d+)`;
  const superscripts = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const token = new RegExp(`(?:(?<![0-9])[+−-])?${integer}(?:${escape(decimal)}\\d+)?(?:e[+−-]?\\d+)?(?:[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?`, 'gi');
  const references = /(?:section|sección|seção|abschnitt|bölüm|§|CC BY|python|numpy|scipy)\s*\d+(?:\.\d+)+|\d+(?:\.\d+)+\.?\s*(?:szakasz|fejezet|节|節|bölüm)/gi;
  const prose = text.replace(references, ref => ref.replaceAll('.', ' '));
  return (prose.match(token) ?? []).map(value => {
    const normalized = value.split(group).join('').replace(decimal, '.').replaceAll('−', '-');
    const power = normalized.match(/[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/);
    if (!power) return String(Number(normalized));
    const exponent = [...power[0]].map(c => c === '⁻' ? '-' : c === '⁺' ? '+' : superscripts.indexOf(c)).join('');
    return String(Number(normalized.slice(0, power.index)) ** Number(exponent));
  });
}
