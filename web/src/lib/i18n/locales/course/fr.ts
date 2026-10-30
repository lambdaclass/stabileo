import type { Translations } from '../../types';
import statics from './statics/fr';
import kinematics from './kinematics/fr';
import influence from './influence/fr';
import secondOrder from './second-order/fr';
import plastic from './plastic/fr';
import dynamics from './dynamics/fr';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
