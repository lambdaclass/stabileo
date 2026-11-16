// In a build this public import is empty: ensureLocale loads the public chunk alongside.
import { hu as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { hu as main } from 'virtual:app-i18n/hu';
import steel from '../steel/hu';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
