// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../fr';
import steel from '../steel/fr';

const full: Translations = { ...main, ...steel };
export default full;
