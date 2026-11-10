import type { Translations } from '../../types';
import statics from './statics/hu';
import kinematics from './kinematics/hu';
import influence from './influence/hu';
import secondOrder from './second-order/hu';
import plastic from './plastic/hu';
import dynamics from './dynamics/hu';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
