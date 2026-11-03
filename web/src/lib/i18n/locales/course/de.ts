import type { Translations } from '../../types';
import statics from './statics/de';
import kinematics from './kinematics/de';

const course: Translations = { ...statics, ...kinematics };
export default course;
