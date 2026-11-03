import type { Translations } from '../../types';
import * as statics from './statics/index';
import * as kinematics from './kinematics/index';
import * as influence from './influence/index';

const parts = [statics, kinematics, influence];
const merge = (k: 'es' | 'en' | 'pt'): Translations => Object.assign({}, ...parts.map((p) => p[k]));

export const courseEs = merge('es');
export const courseEn = merge('en');
export const coursePt = merge('pt');
