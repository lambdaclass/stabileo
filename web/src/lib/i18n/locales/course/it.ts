import type { Translations } from '../../types';
import statics from './statics/it';
import kinematics from './kinematics/it';
import influence from './influence/it';
import secondOrder from './second-order/it';
import plastic from './plastic/it';
import dynamics from './dynamics/it';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
