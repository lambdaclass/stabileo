import type { Translations } from '../../types';
import statics from './statics/tr';
import kinematics from './kinematics/tr';

const course: Translations = { ...statics, ...kinematics };
export default course;
