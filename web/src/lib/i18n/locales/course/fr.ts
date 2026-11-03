import type { Translations } from '../../types';
import statics from './statics/fr';
import kinematics from './kinematics/fr';

const course: Translations = { ...statics, ...kinematics };
export default course;
