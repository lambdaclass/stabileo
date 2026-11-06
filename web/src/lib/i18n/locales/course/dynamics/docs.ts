import type { Translations } from '../../../types';
import * as sdof from './sdof';
import * as mdof from './mdof';
import * as mass from './mass';

const parts = [sdof, mdof, mass];
const merge = (k: 'es' | 'en' | 'pt'): Translations => Object.assign({}, ...parts.map((p) => p[k]));

export const es = merge('es');
export const en = merge('en');
export const pt = merge('pt');
