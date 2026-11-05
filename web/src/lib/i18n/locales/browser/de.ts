// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { de as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { de as main } from 'virtual:app-i18n/de';
import steel from '../steel/de';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
