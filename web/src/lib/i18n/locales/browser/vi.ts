// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { vi as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { vi as main } from 'virtual:app-i18n/vi';
import steel from '../steel/vi';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
