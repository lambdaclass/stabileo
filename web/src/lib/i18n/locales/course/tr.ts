import type { Translations } from '../../types';
import statics from './statics/tr';
import kinematics from './kinematics/tr';
import influence from './influence/tr';
import secondOrder from './second-order/tr';
import plastic from './plastic/tr';
import dynamics from './dynamics/tr';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
