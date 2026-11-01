import type { Translations } from '../../types';
import main from '../de';
import steel from '../steel/de';
import steps from '../steps/de';

const full: Translations = { ...main, ...steel, ...steps };
export default full;
