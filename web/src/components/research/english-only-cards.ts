type Card = { title: string; hook: string };

/** Gallery cards, in Spanish and Portuguese, for experiments whose page is still published only in English. */
export const ENGLISH_ONLY_CARDS: Record<string, { es: Card; pt: Card; hu?: Card; zh?: Card }> = {
};

export function englishOnlyCard(paperId: string, locale: string): Card | undefined {
  return locale === 'es' || locale === 'pt' || locale === 'hu' || locale === 'zh' ? ENGLISH_ONLY_CARDS[paperId]?.[locale] : undefined;
}
