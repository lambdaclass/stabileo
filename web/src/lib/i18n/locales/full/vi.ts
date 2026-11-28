// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../vi';
import steel from '../steel/vi';

const full: Translations = { ...main, ...steel };
export default full;
