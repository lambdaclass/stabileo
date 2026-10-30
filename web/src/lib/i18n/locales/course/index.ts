import type { Translations } from '../../types';
import * as statics from './statics/index';
import * as kinematics from './kinematics/index';
import * as influence from './influence/index';
import * as secondOrder from './second-order/index';
import * as plastic from './plastic/index';
import * as dynamics from './dynamics/index';

const parts = [statics, kinematics, influence, secondOrder, plastic, dynamics];
const merge = (k: 'es' | 'en' | 'pt'): Translations => Object.assign({}, ...parts.map((p) => p[k]));

export const courseEs = merge('es');
export const courseEn = merge('en');
export const coursePt = merge('pt');
