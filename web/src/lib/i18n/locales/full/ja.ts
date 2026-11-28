// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../ja';
import steel from '../steel/ja';

const full: Translations = { ...main, ...steel };
export default full;
