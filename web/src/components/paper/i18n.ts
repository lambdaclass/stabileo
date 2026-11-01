import { publicI18n, type PublicLocale } from '../../lib/i18n/store.svelte';

/** The page around the paper; the paper itself is in English, translated from the Spanish original. */
type PaperStrings = { venue: string; download: string; original: string; language: string; metaTitle: string; metaDescription: string };

const S: Record<'es' | 'en', PaperStrings> & Partial<Record<PublicLocale, PaperStrings>> = {
  es: {
    venue: 'Trabajo presentado en las 29.ª Jornadas Argentinas de Ingeniería Estructural (JAIE 2026).',
    download: 'Descargar PDF',
    original: 'Original en castellano (PDF)',
    language: 'Esta es la traducción al inglés; el original en castellano se puede descargar.',
    metaTitle: 'Developing a structural calculation agent on top of a verified solver (paper) — Stabileo',
    metaDescription: 'El paper completo, en inglés: un agente de IA para cálculo estructural es confiable sólo si orquesta un solver verificado y no genera números por su cuenta.',
  },
  en: {
    venue: 'Presented at the 29th Argentine Structural Engineering Conference (JAIE 2026).',
    download: 'Download PDF',
    original: 'Spanish original (PDF)',
    language: '',
    metaTitle: 'Developing a structural calculation agent on top of a verified solver (paper) — Stabileo',
    metaDescription: 'The full paper: an AI agent for structural calculation is reliable only if it orchestrates a verified solver and never produces a number on its own.',
  },
  pt: {
    venue: 'Trabalho apresentado nas 29.ª Jornadas Argentinas de Engenharia Estrutural (JAIE 2026).',
    download: 'Baixar PDF',
    original: 'Original em espanhol (PDF)',
    language: 'Esta é a tradução para o inglês; o original em espanhol pode ser baixado.',
    metaTitle: 'Developing a structural calculation agent on top of a verified solver (artigo, em inglês) — Stabileo',
    metaDescription: 'O artigo completo, em inglês: um agente de IA para cálculo estrutural só é confiável se orquestra um solver verificado e nunca produz um número por conta própria.',
  },
  de: {
    venue: 'Vorgestellt auf den 29. Argentinischen Tagen des Konstruktiven Ingenieurbaus (JAIE 2026).',
    download: 'PDF herunterladen',
    original: 'Spanisches Original (PDF)',
    language: 'Dies ist die englische Übersetzung; das spanische Original steht zum Download bereit.',
    metaTitle: 'Developing a structural calculation agent on top of a verified solver (Fachartikel, auf Englisch) — Stabileo',
    metaDescription: 'Der vollständige Fachartikel auf Englisch: Ein KI-Agent für statische Berechnungen ist nur verlässlich, wenn er einen verifizierten Solver orchestriert und selbst keine Zahl erzeugt.',
  },
  fr: {
    venue: 'Article présenté aux 29es Journées argentines de génie des structures (JAIE 2026).',
    download: 'Télécharger le PDF',
    original: 'Original en espagnol (PDF)',
    language: 'Voici la traduction anglaise ; l’original en espagnol est téléchargeable.',
    metaTitle: 'Developing a structural calculation agent on top of a verified solver (article, en anglais) — Stabileo',
    metaDescription: 'L’article complet, en anglais : un agent d’IA pour le calcul de structures n’est fiable que s’il orchestre un solveur vérifié sans produire lui-même de chiffres.',
  },
  tr: {
    venue: '29. Arjantin Yapı Mühendisliği Günleri’nde (JAIE 2026) sunulan bildiri.',
    download: 'PDF’yi indir',
    original: 'İspanyolca aslı (PDF)',
    language: 'Bu, makalenin İngilizce çevirisidir; İspanyolca aslı indirilebilir.',
    metaTitle: 'Developing a structural calculation agent on top of a verified solver (makale, İngilizce) — Stabileo',
    metaDescription: 'Makalenin İngilizce tamamı: yapısal hesap için bir yapay zekâ ajanı, ancak doğrulanmış bir çözücüyü yönetir ve kendisi hiçbir sayı üretmezse güvenilirdir.',
  },
};

export function ps(): PaperStrings {
  return S[publicI18n.locale] ?? S.en;
}
