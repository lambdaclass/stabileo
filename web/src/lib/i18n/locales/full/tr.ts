import type { Translations } from '../../types';
import main from '../tr';
import steel from '../steel/tr';
import steps from '../steps/tr';

const full: Translations = { ...main, ...steel, ...steps };
export default full;
