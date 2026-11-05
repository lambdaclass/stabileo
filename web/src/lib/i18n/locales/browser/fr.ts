// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { fr as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { fr as main } from 'virtual:app-i18n/fr';
import steel from '../steel/fr';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
