import type { Translations } from '../../types';
import statics from './statics/de';
import kinematics from './kinematics/de';
import influence from './influence/de';

const course: Translations = { ...statics, ...kinematics, ...influence };
export default course;
