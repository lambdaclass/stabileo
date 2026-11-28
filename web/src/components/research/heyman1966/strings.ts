import { publicI18n } from '../../../lib/i18n/store.svelte';
import { en, type Strings } from './strings-en';
import { es } from './strings-es';
import { pt } from './strings-pt';
import { de } from './strings-de';
import { fr } from './strings-fr';
import { tr } from './strings-tr';
import { hu } from './strings-hu';
import { it } from './strings-it';
import { zh } from './strings-zh';

export const translations: Record<string, Strings> = { en, es, pt, de, fr, tr, hu, it, zh };
export const archStrings = (): Strings => translations[publicI18n.locale] ?? en;
