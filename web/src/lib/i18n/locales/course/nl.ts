import type { Translations } from '../../types';
import statics from './statics/nl';
import kinematics from './kinematics/nl';
import influence from './influence/nl';
import secondOrder from './second-order/nl';
import plastic from './plastic/nl';
import dynamics from './dynamics/nl';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
