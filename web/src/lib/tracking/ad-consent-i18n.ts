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
  it: {
    'adConsent.label': 'Cookie pubblicitari',
    'adConsent.text': 'Con il tuo permesso, usiamo cookie di Meta e Google per capire quali annunci portano persone a Stabileo.',
    'adConsent.accept': 'Accetta',
    'adConsent.decline': 'Rifiuta',
    'adConsent.privacy': 'Privacy',
  },
  zh: {
    'adConsent.label': '广告 Cookie',
    'adConsent.text': '经您许可，我们使用 Meta 和 Google 的 Cookie，了解哪些广告为 Stabileo 带来了访客。',
    'adConsent.accept': '接受',
    'adConsent.decline': '拒绝',
    'adConsent.privacy': '隐私',
  },
  nl: {
    'adConsent.label': 'Advertentiecookies',
    'adConsent.text': 'Met jouw toestemming gebruiken we cookies van Meta en Google om te leren welke advertenties mensen naar Stabileo brengen.',
    'adConsent.accept': 'Accepteren',
    'adConsent.decline': 'Weigeren',
    'adConsent.privacy': 'Privacy',
  },
};

registerFeatureDictionaries(adConsentTranslations);
