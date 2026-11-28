import type { Translations } from '../../types';
import statics from './statics/id';
import kinematics from './kinematics/id';
import influence from './influence/id';
import secondOrder from './second-order/id';
import plastic from './plastic/id';
import dynamics from './dynamics/id';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
