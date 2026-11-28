// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { nl as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { nl as main } from 'virtual:app-i18n/nl';
import steel from '../steel/nl';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
