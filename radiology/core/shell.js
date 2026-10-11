import { h } from './dom.js';

export const DISCLAIMER = 'Educational use only, not for diagnosis or patient care.';

// Every page shows this line. Pages link core/theme.css themselves, before their own stylesheet.
export const disclaimer = () => h('p', { class: 'disclaimer' }, DISCLAIMER);
