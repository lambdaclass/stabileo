// Reuse the public dictionary instead of emitting its strings again in this lazy chunk.
import { tr as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { tr as main } from 'virtual:app-i18n/tr';
import steel from '../steel/tr';
import steps from '../steps/tr';

const full: Translations = { ...publicEntries, ...main, ...steel, ...steps };
export default full;
