// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../de';
import steel from '../steel/de';

const full: Translations = { ...main, ...steel };
export default full;
