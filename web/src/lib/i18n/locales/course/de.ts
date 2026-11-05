import type { Translations } from '../../types';
import statics from './statics/de';
import kinematics from './kinematics/de';
import influence from './influence/de';
import secondOrder from './second-order/de';
import plastic from './plastic/de';
import dynamics from './dynamics/de';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
