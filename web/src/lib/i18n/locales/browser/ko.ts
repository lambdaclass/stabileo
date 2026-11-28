// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { ko as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { ko as main } from 'virtual:app-i18n/ko';
import steel from '../steel/ko';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
