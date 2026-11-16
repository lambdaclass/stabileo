import type { Translations } from '../../types';
import statics from './statics/zh';
import kinematics from './kinematics/zh';
import influence from './influence/zh';
import secondOrder from './second-order/zh';
import plastic from './plastic/zh';
import dynamics from './dynamics/zh';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
