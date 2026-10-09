/**
 * Content-script entry point.
 *
 * Injected (dynamically, for user-authorised origins only) into every frame of
 * the webmail. It activates exclusively when a supported composer is present
 * and the current origin is enabled, and keeps re-evaluating the document so
 * that composers which appear later are still handled.
 */

import { evaluateDomain, type Settings } from '../core/settings.js';
import { logger, setDebugEnabled } from '../utils/logger.js';
import { getCachedSettings, loadSettings, onSettingsChanged, watchStorageChanges } from '../utils/storage.js';
import { ComposerController } from './composer-controller.js';
import { createComposerScanner, type ComposerScanner } from './scanner.js';
import type { UiTheme } from './ui/styles.js';

declare global {
  interface Window {
    __TLP_DEBUG__?: boolean;
  }
}

function resolveTheme(settings: Settings): UiTheme {
  return settings.theme;
}

function isAuthorized(settings: Settings): boolean {
  return settings.enabled && evaluateDomain(settings, window.location.href).enabled;
}

function boot(): void {
  if (window.__TLP_DEBUG__) {
    setDebugEnabled(true);
  }

  const scanner: ComposerScanner = createComposerScanner({
    doc: document,
    location: window.location,
    isAuthorized: () => isAuthorized(getCachedSettings()),
    createController: (composer) => {
      const settings = getCachedSettings();
      logger.info('composer detected; activating TLP Mail Marker');
      return new ComposerController({
        doc: document,
        location: window.location,
        composer,
        settings,
        theme: resolveTheme(settings),
      });
    },
  });

  onSettingsChanged(() => {
    scanner.refresh();
  });

  void loadSettings().then(() => {
    watchStorageChanges();
    scanner.start();
  });
}

boot();
