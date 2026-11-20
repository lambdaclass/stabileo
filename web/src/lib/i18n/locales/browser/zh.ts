// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { zh as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { zh as main } from 'virtual:app-i18n/zh';
import steel from '../steel/zh';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
