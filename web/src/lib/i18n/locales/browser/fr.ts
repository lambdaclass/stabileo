// Browser-only: Vite shares public strings with the initial bundle.
// Reuse the public dictionary instead of emitting its strings again in this lazy chunk.
import { fr as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { fr as main } from 'virtual:app-i18n/fr';
import steel from '../steel/fr';

const full: Translations = { ...publicEntries, ...main, ...steel };
export default full;
