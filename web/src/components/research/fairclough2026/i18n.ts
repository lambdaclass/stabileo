import { researchLocale } from '../i18n';
import { translations } from './translations';
export { translations } from './translations';
export const fs = () => translations[researchLocale() as keyof typeof translations];
