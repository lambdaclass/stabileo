// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../ru';
import steel from '../steel/ru';

const full: Translations = { ...main, ...steel };
export default full;
