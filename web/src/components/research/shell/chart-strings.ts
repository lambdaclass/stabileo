import { publicI18n } from '../../../lib/i18n/store.svelte';
const strings: Record<string, { axes: string; table: string }> = {
  en: { axes: '{y} against {x}', table: 'View chart data' },
  es: { axes: '{y} frente a {x}', table: 'Ver datos del gráfico' },
  pt: { axes: '{y} em função de {x}', table: 'Ver dados do gráfico' },
  de: { axes: '{y} über {x}', table: 'Diagrammdaten anzeigen' },
  fr: { axes: '{y} en fonction de {x}', table: 'Afficher les données du graphique' },
  tr: { axes: '{x} ile {y}', table: 'Grafik verilerini göster' },
  hu: { axes: '{y} a(z) {x} függvényében', table: 'Diagramadatok megjelenítése' },
  id: { axes: '{y} terhadap {x}', table: 'Lihat data grafik' },
  zh: { axes: '{y} 随 {x} 的变化', table: '查看图表数据' },
};
export const chartStrings = () => strings[publicI18n.locale] ?? strings.en;
