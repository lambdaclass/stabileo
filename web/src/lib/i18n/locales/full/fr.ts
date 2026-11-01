// Node-compatible dictionary for scripts and Playwright test discovery.
import type { Translations } from '../../types';
import main from '../fr';
import steel from '../steel/fr';
import steps from '../steps/fr';

const full: Translations = { ...main, ...steel, ...steps };
export default full;
