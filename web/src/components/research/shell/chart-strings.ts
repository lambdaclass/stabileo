import { publicI18n } from '../../../lib/i18n/store.svelte';
const strings: Record<string, { axes: string; table: string }> = {
  en: { axes: '{y} against {x}', table: 'View chart data' },
  es: { axes: '{y} frente a {x}', table: 'Ver datos del gráfico' },
  pt: { axes: '{y} em função de {x}', table: 'Ver dados do gráfico' },
  de: { axes: '{y} über {x}', table: 'Diagrammdaten anzeigen' },
  fr: { axes: '{y} en fonction de {x}', table: 'Afficher les données du graphique' },
  tr: { axes: '{x} ile {y}', table: 'Grafik verilerini göster' },
};
export const chartStrings = () => strings[publicI18n.locale] ?? strings.en;
