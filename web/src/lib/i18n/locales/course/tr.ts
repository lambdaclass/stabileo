import type { Translations } from '../../types';
import statics from './statics/tr';
import kinematics from './kinematics/tr';
import influence from './influence/tr';

const course: Translations = { ...statics, ...kinematics, ...influence };
export default course;
