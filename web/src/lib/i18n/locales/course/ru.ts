import type { Translations } from '../../types';
import statics from './statics/ru';
import kinematics from './kinematics/ru';
import influence from './influence/ru';
import secondOrder from './second-order/ru';
import plastic from './plastic/ru';
import dynamics from './dynamics/ru';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
