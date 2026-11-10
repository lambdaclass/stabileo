// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../hu';
import steel from '../steel/hu';

const full: Translations = { ...main, ...steel };
export default full;
