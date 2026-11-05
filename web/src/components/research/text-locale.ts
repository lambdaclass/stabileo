import { EXPERIMENTS } from './experiments';
import { researchLocales } from '../../lib/i18n/research-routes';
import { publicI18n } from '../../lib/i18n/store.svelte';

export function paperTextLocale(paperId: string): string {
  const path = EXPERIMENTS.find((e) => e.paperId === paperId)?.path;
  return path && researchLocales(path).includes(publicI18n.locale) ? publicI18n.locale : 'en';
}
