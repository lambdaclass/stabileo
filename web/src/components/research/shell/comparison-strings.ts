import { publicI18n } from '../../../lib/i18n/store.svelte';

type ComparisonStrings = { caption: string; quantity: string; paper: string; ours: string; difference: string; tolerance: string; curve: string; within: string; outside: string };

const strings: Record<string, ComparisonStrings> = {
  en: { caption: 'The paper against Stabileo', quantity: 'Quantity', paper: 'Paper', ours: 'Stabileo', difference: 'Difference', tolerance: 'Tolerance', curve: 'curve, {n} points: largest difference', within: 'within tolerance', outside: 'outside tolerance' },
  es: { caption: 'El artículo frente a Stabileo', quantity: 'Magnitud', paper: 'Artículo', ours: 'Stabileo', difference: 'Diferencia', tolerance: 'Tolerancia', curve: 'curva de {n} puntos: mayor diferencia', within: 'dentro de la tolerancia', outside: 'fuera de la tolerancia' },
  pt: { caption: 'O artigo frente ao Stabileo', quantity: 'Grandeza', paper: 'Artigo', ours: 'Stabileo', difference: 'Diferença', tolerance: 'Tolerância', curve: 'curva de {n} pontos: maior diferença', within: 'dentro da tolerância', outside: 'fora da tolerância' },
  de: { caption: 'Der Artikel im Vergleich mit Stabileo', quantity: 'Größe', paper: 'Artikel', ours: 'Stabileo', difference: 'Abweichung', tolerance: 'Toleranz', curve: 'Kurve mit {n} Punkten: größte Abweichung', within: 'innerhalb der Toleranz', outside: 'außerhalb der Toleranz' },
  fr: { caption: 'L’article face à Stabileo', quantity: 'Grandeur', paper: 'Article', ours: 'Stabileo', difference: 'Écart', tolerance: 'Tolérance', curve: 'courbe de {n} points : plus grand écart', within: 'dans la tolérance', outside: 'hors tolérance' },
  tr: { caption: 'Makale ve Stabileo karşılaştırması', quantity: 'Büyüklük', paper: 'Makale', ours: 'Stabileo', difference: 'Fark', tolerance: 'Tolerans', curve: '{n} noktalı eğri: en büyük fark', within: 'tolerans içinde', outside: 'tolerans dışında' },
  hu: { caption: 'A cikk és a Stabileo összevetése', quantity: 'Mennyiség', paper: 'Cikk', ours: 'Stabileo', difference: 'Eltérés', tolerance: 'Tűrés', curve: '{n} pontos görbe: legnagyobb eltérés', within: 'tűrésen belül', outside: 'tűrésen kívül' },
  zh: { caption: '论文与 Stabileo 的对比', quantity: '物理量', paper: '论文', ours: 'Stabileo', difference: '差值', tolerance: '容差', curve: '{n} 点曲线：最大差值', within: '在容差内', outside: '超出容差' },
};

export const comparisonStrings = () => strings[publicI18n.locale] ?? strings.en;
export const COMPARISON_LOCALES = Object.keys(strings);
