import type { Translations } from '../../../types';
import { es as esDocs, en as enDocs, pt as ptDocs } from './docs';
import { es as esUi, en as enUi, pt as ptUi } from './ui';

export const es: Translations = { ...esDocs, ...esUi };

export const en: Translations = { ...enDocs, ...enUi };

export const pt: Translations = { ...ptDocs, ...ptUi };
