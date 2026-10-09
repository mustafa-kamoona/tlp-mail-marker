/** Provider adapter registry. */

import type { ComposerHandle, ProviderAdapter } from './interface.js';
import { RoundcubeAdapter } from './roundcube/roundcube-adapter.js';

/**
 * Ordered list of supported providers. Only Roundcube is implemented in this
 * release; add new adapters here once they are complete and tested.
 */
export const adapters: ProviderAdapter[] = [new RoundcubeAdapter()];

export interface DetectedProvider {
  adapter: ProviderAdapter;
  composer: ComposerHandle;
}

/** Find the first adapter that recognises the document and exposes a composer. */
export function detectComposer(doc: Document, location: Location): DetectedProvider | null {
  for (const adapter of adapters) {
    try {
      if (!adapter.supports(doc, location)) {
        continue;
      }
      const composer = adapter.findComposer(doc, location);
      if (composer) {
        return { adapter, composer };
      }
    } catch {
      // A broken adapter must never break the page or other adapters.
    }
  }
  return null;
}
