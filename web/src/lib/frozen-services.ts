export const FROZEN_SERVICES_NOTICE: Record<string, string> = {
  en: 'Accounts, AI and feedback are unavailable in this frozen version. Use the latest version for online services.',
  es: 'Las cuentas, la IA y los comentarios no están disponibles en esta versión congelada. Usá la última versión para los servicios en línea.',
  pt: 'Contas, IA e comentários não estão disponíveis nesta versão congelada. Use a versão mais recente para serviços online.',
  de: 'Konten, KI und Feedback sind in dieser eingefrorenen Version nicht verfügbar. Verwenden Sie für Onlinedienste die neueste Version.',
  fr: 'Les comptes, l’IA et les commentaires sont indisponibles dans cette version figée. Utilisez la dernière version pour les services en ligne.',
  tr: 'Hesaplar, yapay zekâ ve geri bildirim bu dondurulmuş sürümde kullanılamaz. Çevrimiçi hizmetler için en son sürümü kullanın.',
};

export function onlineServicesAvailable(): boolean {
  return !/^\/@[0-9a-f]{7,40}\/$/.test(import.meta.env.BASE_URL);
}
