import type { Translations } from '../../types';
import statics from './statics/vi';
import kinematics from './kinematics/vi';
import influence from './influence/vi';
import secondOrder from './second-order/vi';
import plastic from './plastic/vi';
import dynamics from './dynamics/vi';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
