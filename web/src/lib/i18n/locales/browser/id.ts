// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { id as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { id as main } from 'virtual:app-i18n/id';
import steel from '../steel/id';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
