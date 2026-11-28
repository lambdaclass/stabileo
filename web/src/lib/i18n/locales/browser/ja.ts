// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { ja as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { ja as main } from 'virtual:app-i18n/ja';
import steel from '../steel/ja';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
