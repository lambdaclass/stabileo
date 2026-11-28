import type { Translations } from '../../types';
import statics from './statics/ja';
import kinematics from './kinematics/ja';
import influence from './influence/ja';
import secondOrder from './second-order/ja';
import plastic from './plastic/ja';
import dynamics from './dynamics/ja';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
