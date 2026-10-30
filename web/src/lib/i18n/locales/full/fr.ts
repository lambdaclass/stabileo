// Reuse the public dictionary instead of emitting its strings again in this lazy chunk.
import { fr as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { fr as main } from 'virtual:app-i18n/fr';
import steel from '../steel/fr';
import steps from '../steps/fr';

const full: Translations = { ...publicEntries, ...main, ...steel, ...steps };
export default full;
