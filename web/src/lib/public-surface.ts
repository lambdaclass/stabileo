import { EXAMPLE_IDS } from '../components/examples/ids';

export { MAIN_TOOL_IDS } from './main-tool-routes';
export const EXAMPLE_PATHS = ['/examples', ...EXAMPLE_IDS.map(id => `/examples/${id}`)] as const;
