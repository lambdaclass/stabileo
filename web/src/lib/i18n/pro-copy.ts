/** Plain TypeScript with no import from the store, so Playwright can load it in Node. */

export type CopyLocale = 'es' | 'en' | 'pt' | 'de' | 'fr' | 'tr' | 'hu';

const UNFINISHED: Record<CopyLocale, RegExp> = {
  es: /desarrollo|\bbeta\b/i,
  en: /development|\bbeta\b/i,
  pt: /desenvolvimento|\bbeta\b/i,
  de: /Entwicklung|\bBeta\b/i,
  fr: /développement|\bb[eê]ta\b/i,
  tr: /geliştirme aşamas|geliştiriliyor|\bbeta\b/i,
  hu: /fejlesztés alatt|fejlesztési fázis|fejleszt(jük|ik)\b|\bb[eé]t[aá](?:ban\b|verzió|változat|\b)/i,
};

const DESIGN_OR_AI: Record<CopyLocale, RegExp> = {
  es: /diseño|armadura|detallado|\bIA\b/i,
  en: /design|reinforcement|detailing|\bAI\b/i,
  pt: /dimensionamento|projeto|armadura|detalhamento|\bIA\b/i,
  de: /Bemessung|Bewehrung|\bKI\b/,
  fr: /dimensionnement|ferraillage|armature|\bIA\b/i,
  tr: /tasarım|donatı|yapay zek|\bYZ\b/i,
  hu: /[Mm]éretez|[Vv]asal|[Rr]észletez|[Mm]esterséges intelligenci|\b(MI|AI)\b/,
};

function sentences(text: string): string[] {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The sentences of `text` that call something unfinished without naming code design or the AI.
 * `aboutPro`: the whole text describes PRO, so every such sentence counts; otherwise only the
 * sentences that name PRO do.
 */
export function unfinishedProClaims(text: string, locale: CopyLocale, { aboutPro }: { aboutPro: boolean }): string[] {
  return sentences(text).filter(
    (s) => UNFINISHED[locale].test(s) && !DESIGN_OR_AI[locale].test(s) && (aboutPro || /\bPRO\b/.test(s)),
  );
}
