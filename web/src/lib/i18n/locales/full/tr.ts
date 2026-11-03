import type { Translations } from '../../types';
import main from '../tr';
import steel from '../steel/tr';

const full: Translations = { ...main, ...steel };
export default full;
