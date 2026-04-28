/**
 * SBI 8.0A - App shell foundation
 *
 * Désactivé par défaut. À activer uniquement sur la branche labo avec :
 * localStorage.setItem('sbiPjaxEnabled', 'true')
 */

import { createRouteRegistry } from './route-registry.js';
import { createRouter } from './router.js';
import { injectAppShellStyles, markAppShellReady } from './transitions.js';
import { initRoutePreload } from './preload.js';
import { registerCleanup, createAbortController } from './view-lifecycle.js';
import { createListenerBag, disposeAllListenerBags } from './firebase-listeners.js';

let initialized = false;

function readFlag(name) {
  try { return localStorage.getItem(name) === 'true'; }
  catch { return false; }
}

function consumeQueryToggles() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('sbiPjax') === '1') {
    localStorage.setItem('sbiPjaxEnabled', 'true');
  }
  if (params.get('sbiPjax') === '0') {
    localStorage.removeItem('sbiPjaxEnabled');
  }
}

export function isSbiAppShellEnabled() {
  consumeQueryToggles();
  return readFlag('sbiPjaxEnabled');
}

export function initSbiAppShell() {
  if (initialized) return window.SBI_APP_SHELL || null;
  initialized = true;

  injectAppShellStyles();
  markAppShellReady();

  const enabled = isSbiAppShellEnabled();
  const debug = readFlag('sbiPjaxDebug');
  const registry = createRouteRegistry();
  const router = createRouter({ registry, debug });

  const api = {
    enabled,
    routes: registry.list(),
    navigate: router.navigate,
    canHandle: router.canHandle,
    registerCleanup,
    createAbortController,
    createListenerBag,
    disposeAllListenerBags
  };

  window.SBI_APP_SHELL = api;

  if (!enabled) {
    if (debug) console.info('[SBI AppShell] Présent mais désactivé. Active avec localStorage.sbiPjaxEnabled=true');
    return api;
  }

  router.attach();
  initRoutePreload({ router });
  document.body.dataset.sbiPjax = 'enabled';

  window.dispatchEvent(new CustomEvent('sbi:app-shell:ready', {
    detail: { routes: api.routes }
  }));

  if (debug) console.info('[SBI AppShell] Activé:', api.routes);
  return api;
}
