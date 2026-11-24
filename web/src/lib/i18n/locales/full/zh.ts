// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../zh';
import steel from '../steel/zh';

const full: Translations = { ...main, ...steel };
export default full;
