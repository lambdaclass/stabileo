import type { Translations } from '../../types';
import * as statics from './statics/index';
import * as kinematics from './kinematics/index';

const parts = [statics, kinematics];
const merge = (k: 'es' | 'en' | 'pt'): Translations => Object.assign({}, ...parts.map((p) => p[k]));

export const courseEs = merge('es');
export const courseEn = merge('en');
export const coursePt = merge('pt');
