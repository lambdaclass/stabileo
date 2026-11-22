type Templates = { modelDescription: string; solverDescription: string; momentDescription: string };
type Values = { tolerance: number; meshErrorCeilings: { relativeError: number }[]; axialExtensionBound: number; momentArea: number; first: number; last: number };

export function describeCase(s: Templates, locale: string, v: Values): Templates {
  const number = (x: number) => new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(x);
  const percent = (x: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumSignificantDigits: 3 }).format(x);
  const ceilings = v.meshErrorCeilings.map(c => c.relativeError);
  const values: Record<string, string> = {
    tolerance: percent(v.tolerance),
    ceilings: [...ceilings.slice(0, -1).map(x => number(x * 100)), percent(ceilings.at(-1)!)].join('/'),
    extension: percent(v.axialExtensionBound),
    momentArea: number(v.momentArea),
    range: `${number(v.first)}…${number(v.last)}`,
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
  return { modelDescription: fill(s.modelDescription), solverDescription: fill(s.solverDescription), momentDescription: fill(s.momentDescription) };
}
