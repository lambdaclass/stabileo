// Reuse the public dictionary instead of emitting its strings again in this lazy chunk.
import { de as publicEntries } from 'virtual:public-i18n';
import type { Translations } from '../../types';
import { de as main } from 'virtual:app-i18n/de';
import steel from '../steel/de';
import steps from '../steps/de';

const full: Translations = { ...publicEntries, ...main, ...steel, ...steps };
export default full;
