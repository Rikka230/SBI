/**
 * SBI 8.0I.1 - App shell foundation
 *
 * Le PJAX est activé par défaut sur la branche labo.
 *
 * Désactivation de secours :
 * localStorage.setItem('sbiPjaxDisabled', 'true')
 * location.reload()
 *
 * Réactivation :
 * localStorage.removeItem('sbiPjaxDisabled')
 * location.reload()
 */

import { createRouteRegistry } from './route-registry.js';
import { createRouter } from './router.js';
import { injectAppShellStyles, markAppShellReady } from './transitions.js';
import { initRoutePreload } from './preload.js';
import { registerCleanup, createAbortController } from './view-lifecycle.js';
import { createListenerBag, disposeAllListenerBags } from './firebase-listeners.js';
import { listHardReloadRoutes } from './route-guards.js';

const DISABLED_FLAG = 'sbiPjaxDisabled';
const LEGACY_ENABLED_FLAG = 'sbiPjaxEnabled';

let initialized = false;

function readFlag(name) {
  try { return localStorage.getItem(name) === 'true'; }
  catch { return false; }
}

function setFlag(name, value) {
  try {
    if (value) localStorage.setItem(name, 'true');
    else localStorage.removeItem(name);
  } catch {}
}

function consumeQueryToggles() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('sbiPjax') === '1') {
    setFlag(DISABLED_FLAG, false);
    setFlag(LEGACY_ENABLED_FLAG, true);
  }

  if (params.get('sbiPjax') === '0') {
    setFlag(DISABLED_FLAG, true);
    setFlag(LEGACY_ENABLED_FLAG, false);
  }
}

function printRouteStatus(api, href = window.location.href) {
  const url = new URL(href, window.location.href);
  const status = api.routeStatus(url);

  console.table([{
    url: status.href,
    mode: status.mode,
    route: status.route || '-',
    reason: status.reason
  }]);

  return status;
}

function printRouteHelp(api) {
  const payload = {
    enabled: api.enabled,
    current: api.routeStatus(new URL(window.location.href)),
    migratedRoutes: api.routes,
    protectedReloadRoutes: api.hardReloadRoutes
  };

  console.info('[SBI PJAX] Diagnostic disponible.');
  console.info('Utilise window.SBI_PJAX_CHECK("/url") pour tester une URL.');
  console.info('Utilise window.SBI_PJAX_ROUTES() pour lister les routes.');
  return payload;
}

function installEmergencySwitches(api) {
  window.SBI_ENABLE_PJAX = () => {
    setFlag(DISABLED_FLAG, false);
    setFlag(LEGACY_ENABLED_FLAG, true);
    window.location.reload();
  };

  window.SBI_DISABLE_PJAX = () => {
    setFlag(DISABLED_FLAG, true);
    setFlag(LEGACY_ENABLED_FLAG, false);
    window.location.reload();
  };

  window.SBI_PJAX_STATUS = (href = window.location.href) => {
    const url = new URL(href, window.location.href);
    return api.routeStatus(url);
  };

  window.SBI_PJAX_CHECK = (href = window.location.href) => printRouteStatus(api, href);

  window.SBI_PJAX_ROUTES = () => {
    const data = {
      migrated: api.routes,
      hardReload: api.hardReloadRoutes
    };
    console.table(api.routes.map((route) => ({ mode: 'pjax', route })));
    console.table(api.hardReloadRoutes.map((item) => ({ mode: 'reload', path: item.path, reason: item.reason })));
    return data;
  };

  window.SBI_PJAX_HELP = () => printRouteHelp(api);

  window.SBI_APP_SHELL = api;
}

export function isSbiAppShellEnabled() {
  consumeQueryToggles();

  if (readFlag(DISABLED_FLAG)) {
    return false;
  }

  return true;
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
    defaultEnabled: true,
    disabled: !enabled,
    disableFlag: DISABLED_FLAG,
    routes: registry.list(),
    hardReloadRoutes: listHardReloadRoutes(),
    navigate: router.navigate,
    canHandle: router.canHandle,
    routeStatus: router.routeStatus,
    registerCleanup,
    createAbortController,
    createListenerBag,
    disposeAllListenerBags
  };

  installEmergencySwitches(api);

  document.body.dataset.sbiPjax = enabled ? 'enabled' : 'disabled';
  document.body.dataset.sbiPjaxRoutes = api.routes.join(',');

  if (!enabled) {
    if (debug) {
      console.info('[SBI AppShell] Désactivé par sbiPjaxDisabled=true. Réactive avec window.SBI_ENABLE_PJAX().');
    }

    window.dispatchEvent(new CustomEvent('sbi:app-shell:disabled', {
      detail: { routes: api.routes }
    }));

    return api;
  }

  router.attach();
  initRoutePreload({ router });

  window.dispatchEvent(new CustomEvent('sbi:app-shell:ready', {
    detail: { routes: api.routes, hardReloadRoutes: api.hardReloadRoutes }
  }));

  if (debug) printRouteHelp(api);

  return api;
}
