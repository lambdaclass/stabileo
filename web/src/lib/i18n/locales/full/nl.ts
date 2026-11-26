// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../nl';
import steel from '../steel/nl';

const full: Translations = { ...main, ...steel };
export default full;
