type Card = { title: string; hook: string };

/** Gallery cards, in Spanish and Portuguese, for experiments whose page is still published only in English. */
export const ENGLISH_ONLY_CARDS: Record<string, { es: Card; pt: Card; hu?: Card; zh?: Card; id?: Card }> = {
  'shell-obstacle-course': {
    es: { title: 'Pista de obstáculos para cáscaras — Belytschko et al. (1985)', hook: 'Refiná la cubierta, el cilindro y el hemisferio; mirá en vivo la precisión del motor de producción, fallas incluidas.' },
    pt: { title: 'Pista de obstáculos para cascas — Belytschko et al. (1985)', hook: 'Refine a cobertura, o cilindro e o hemisfério; veja ao vivo a precisão do motor de produção, falhas incluídas.' },
    hu: { title: 'Héjelemek akadálypályája — Belytschko et al. (1985)', hook: 'Finomítsa a tető, a henger és a félgömb hálóját, és nézze élőben a termékben használt megoldó pontosságát, a hibás eseteket is beleértve.' },
    id: { title: 'Arena rintangan untuk cangkang — Belytschko et al. (1985)', hook: 'Haluskan atap, silinder, dan hemisfer; lihat langsung akurasi mesin produksi, termasuk kegagalannya.' },
    zh: { title: '壳单元障碍赛 — Belytschko et al. (1985)', hook: '加密屋面、圆柱和半球的网格，实时查看生产环境计算引擎的精度，包括失败的算例。' },
  },
  'macneal-harder-1985': {
    es: { title: 'MacNeal–Harder (1985): ensayos del motor', hook: 'Ejecutá el motor de producción sobre casos de precisión compartidos; revisá cada resultado, fallas incluidas.' },
    pt: { title: 'MacNeal–Harder (1985): testes do motor', hook: 'Execute o motor de produção em casos de precisão compartilhados; examine cada resultado, falhas incluídas.' },
  },
};

export function englishOnlyCard(paperId: string, locale: string): Card | undefined {
  return locale === 'es' || locale === 'pt' || locale === 'hu' || locale === 'zh' || locale === 'id' ? ENGLISH_ONLY_CARDS[paperId]?.[locale] : undefined;
}
