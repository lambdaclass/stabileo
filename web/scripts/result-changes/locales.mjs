export const REGISTRY_LOCALES = Object.freeze(['en', 'es', 'pt', 'de', 'fr', 'tr', 'zh', 'id']);

export function resultChangeLocaleProblems({ id, title, explanation }) {
  const problems = [];
  for (const locale of REGISTRY_LOCALES) {
    if (typeof title?.[locale] !== 'string' || !title[locale].trim()) problems.push(`change ${id}: missing title.${locale}`);
    if (typeof explanation?.[locale] !== 'string' || !explanation[locale].trim()) problems.push(`change ${id}: missing explanation.${locale}`);
  }
  return problems;
}
