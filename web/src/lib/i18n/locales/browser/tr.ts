// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { tr as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { tr as main } from 'virtual:app-i18n/tr';
import steel from '../steel/tr';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
