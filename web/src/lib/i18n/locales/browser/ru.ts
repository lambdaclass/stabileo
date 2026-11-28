// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { ru as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { ru as main } from 'virtual:app-i18n/ru';
import steel from '../steel/ru';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
