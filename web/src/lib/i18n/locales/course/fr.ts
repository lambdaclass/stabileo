import type { Translations } from '../../types';
import statics from './statics/fr';
import kinematics from './kinematics/fr';
import influence from './influence/fr';

const course: Translations = { ...statics, ...kinematics, ...influence };
export default course;
