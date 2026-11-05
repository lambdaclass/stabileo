import type { Translations } from '../../types';
import statics from './statics/fr';
import kinematics from './kinematics/fr';
import influence from './influence/fr';
import secondOrder from './second-order/fr';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder };
export default course;
