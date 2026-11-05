import { registerFeatureDictionaries } from '../i18n/store.svelte';

export const adConsentTranslations: Record<string, Record<string, string>> = {
  es: {
    'adConsent.label': 'Cookies de publicidad',
    'adConsent.text': 'Con tu permiso, usamos cookies de Meta y Google para saber qué anuncios traen gente a Stabileo.',
    'adConsent.accept': 'Aceptar',
    'adConsent.decline': 'Rechazar',
    'adConsent.privacy': 'Privacidad',
  },
  en: {
    'adConsent.label': 'Advertising cookies',
    'adConsent.text': 'With your permission, we use Meta and Google cookies to learn which ads bring people to Stabileo.',
    'adConsent.accept': 'Accept',
    'adConsent.decline': 'Decline',
    'adConsent.privacy': 'Privacy',
  },
  pt: {
    'adConsent.label': 'Cookies de publicidade',
    'adConsent.text': 'Com a sua permissão, usamos cookies da Meta e do Google para saber quais anúncios trazem pessoas ao Stabileo.',
    'adConsent.accept': 'Aceitar',
    'adConsent.decline': 'Recusar',
    'adConsent.privacy': 'Privacidade',
  },
  de: {
    'adConsent.label': 'Werbe-Cookies',
    'adConsent.text': 'Mit Ihrer Zustimmung verwenden wir Cookies von Meta und Google, um zu erfahren, welche Anzeigen Menschen zu Stabileo bringen.',
    'adConsent.accept': 'Akzeptieren',
    'adConsent.decline': 'Ablehnen',
    'adConsent.privacy': 'Datenschutz',
  },
  fr: {
    'adConsent.label': 'Cookies publicitaires',
    'adConsent.text': 'Avec votre accord, nous utilisons des cookies de Meta et de Google pour savoir quelles publicités amènent des personnes sur Stabileo.',
    'adConsent.accept': 'Accepter',
    'adConsent.decline': 'Refuser',
    'adConsent.privacy': 'Confidentialité',
  },
  tr: {
    'adConsent.label': 'Reklam çerezleri',
    'adConsent.text': 'İzninizle, hangi reklamların Stabileo’ya ziyaretçi getirdiğini öğrenmek için Meta ve Google çerezlerini kullanıyoruz.',
    'adConsent.accept': 'Kabul et',
    'adConsent.decline': 'Reddet',
    'adConsent.privacy': 'Gizlilik',
  },
};

registerFeatureDictionaries(adConsentTranslations);
