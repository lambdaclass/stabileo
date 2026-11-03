import type { Translations } from '../../types';
import statics from './statics/de';
import kinematics from './kinematics/de';
import influence from './influence/de';
import secondOrder from './second-order/de';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder };
export default course;
