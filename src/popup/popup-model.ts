/** Re-exports used by the popup, keeping its imports tidy. */

export { TLP_LEVELS, getDefinition } from '../core/tlp.js';
export { domainMatchPatterns, hostForMatchPattern, normalizeDomain } from '../core/settings.js';

import { TLP_LEVELS, getDefinition } from '../core/tlp.js';

/** Canonical level definitions for the popup legend. */
export const TLP_LEVELS_FOR_UI = TLP_LEVELS.map((level) => getDefinition(level));
