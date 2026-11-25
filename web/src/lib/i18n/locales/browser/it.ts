// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { it as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { it as main } from 'virtual:app-i18n/it';
import steel from '../steel/it';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
