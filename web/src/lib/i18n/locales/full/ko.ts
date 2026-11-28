// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../ko';
import steel from '../steel/ko';

const full: Translations = { ...main, ...steel };
export default full;
