// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../it';
import steel from '../steel/it';

const full: Translations = { ...main, ...steel };
export default full;
