import base from './playwright.config';
export default { ...base, use: { ...base.use, screenshot: 'on' } };
