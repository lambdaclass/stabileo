/**
 * The explained step-by-step catalog's words, one file per group of methods
 * (plus the common ones), merged into each locale by the i18n store.
 */
import type { Translations } from '../../types';
import * as common from './common';
import * as continuous from './continuous';
import * as frames from './frames';
import * as trusses from './trusses';
import * as deformation from './deformation';
import * as cuts from './cuts';
import { courseEs, courseEn, coursePt } from '../course/index';

const parts = [common, continuous, frames, trusses, deformation, cuts];
const merge = (k: 'es' | 'en' | 'pt'): Translations => Object.assign({}, ...parts.map((p) => p[k]));

export const stepsEs = { ...merge('es'), ...courseEs };
export const stepsEn = { ...merge('en'), ...courseEn };
export const stepsPt = { ...merge('pt'), ...coursePt };
