import type { Translations } from '../../types';
import statics from './statics/ko';
import kinematics from './kinematics/ko';
import influence from './influence/ko';
import secondOrder from './second-order/ko';
import plastic from './plastic/ko';
import dynamics from './dynamics/ko';

const course: Translations = { ...statics, ...kinematics, ...influence, ...secondOrder, ...plastic, ...dynamics };
export default course;
