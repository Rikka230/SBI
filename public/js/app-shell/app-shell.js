/**
 * SBI 8.0M.9 - App shell foundation
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

function getShellContext(api) {
  const effectiveUrl = new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
  const path = effectiveUrl.pathname.replace(/\/+$/, '') || '/';
  const app = document.getElementById('app-container');
  const leftActive = document.querySelector('#left-panel .nav-item.active, #left-panel .admin-return-link.active');
  const pageTitle = document.querySelector('.top-bar .page-title');

  let area = 'unknown';
  if (path.startsWith('/admin/')) area = 'admin';
  else if (path.startsWith('/student/')) area = 'student';
  else if (path.startsWith('/teacher/')) area = 'teacher';
  else if (path === '/' || path === '/index.html') area = 'public';

  return {
    enabled: api.enabled,
    area,
    path,
    href: effectiveUrl.href,
    routeDecision: api.routeStatus(effectiveUrl),
    title: document.title,
    pageTitle: pageTitle?.textContent?.trim() || '',
    activeNav: leftActive?.id || leftActive?.getAttribute('href') || leftActive?.getAttribute('data-sbi-href') || '',
    bodyClasses: Array.from(document.body.classList),
    noRightPanel: document.body.classList.contains('no-right-panel'),
    leftPanelOpen: app?.classList.contains('left-open') || false,
    rightPanelOpen: app?.classList.contains('right-open') || false,
    currentViewKey: window.SBI_APP_SHELL_ACTIVE_VIEW || null,
    shellUrl: window.SBI_APP_SHELL_CURRENT_URL || window.location.href
  };
}

function buildRouteAuditRows(api) {
  const probes = [
    { group: 'admin', path: '/admin/index.html?tab=view-dashboard', expected: 'pjax-if-admin-shell' },
    { group: 'admin', path: '/admin/index.html?tab=view-users', expected: 'pjax-if-admin-shell' },
    { group: 'admin', path: '/admin/site-index-settings.html', expected: 'pjax-if-admin-shell' },
    { group: 'admin', path: '/admin/formations-cours.html', expected: 'pjax-if-admin-shell' },
    { group: 'admin', path: '/admin/admin-profile.html', expected: 'pjax-if-admin-shell' },
    { group: 'student', path: '/student/dashboard.html', expected: 'pjax-if-student-shell' },
    { group: 'student', path: '/student/mes-cours.html', expected: 'pjax-if-student-shell' },
    { group: 'student', path: '/student/mon-profil.html', expected: 'pjax-if-student-shell' },
    { group: 'teacher', path: '/teacher/dashboard.html', expected: 'pjax-if-teacher-shell' },
    { group: 'teacher', path: '/teacher/mes-cours.html', expected: 'pjax-if-teacher-shell' },
    { group: 'teacher', path: '/teacher/mon-profil.html', expected: 'pjax-if-teacher-shell' },
    { group: 'protected', path: '/student/cours-viewer.html?id=test', expected: 'reload' },
    { group: 'protected', path: '/teacher/cours-viewer.html?id=test&preview=true', expected: 'reload' },
    { group: 'protected', path: '/admin/cours-viewer.html?id=test&preview=true', expected: 'reload' },
    { group: 'protected', path: '/admin/formations-live.html', expected: 'reload' },
    { group: 'protected', path: '/login.html', expected: 'reload' },
    { group: 'public', path: '/index.html', expected: 'reload' }
  ];

  return probes.map((probe) => {
    const url = new URL(probe.path, window.location.origin);
    const decision = api.routeStatus(url);

    return {
      group: probe.group,
      path: probe.path,
      expected: probe.expected,
      mode: decision.mode,
      route: decision.route || '-',
      reason: decision.reason
    };
  });
}

function printAudit(api) {
  const context = getShellContext(api);
  const rows = buildRouteAuditRows(api);
  const protectedViewerRows = rows.filter((row) => row.path.includes('/cours-viewer.html'));
  const unsafeViewerRows = protectedViewerRows.filter((row) => row.mode !== 'reload');

  console.info('[SBI PJAX] Contexte shell courant');
  console.table([{
    enabled: context.enabled,
    area: context.area,
    path: context.path,
    activeNav: context.activeNav || '-',
    noRightPanel: context.noRightPanel,
    viewKey: context.currentViewKey || '-'
  }]);

  console.info('[SBI PJAX] Audit routes migrées / protégées');
  console.table(rows);

  if (unsafeViewerRows.length) {
    console.warn('[SBI PJAX] Alerte : un viewer est annoncé PJAX alors qu’il doit rester protégé.', unsafeViewerRows);
  } else {
    console.info('[SBI PJAX] Viewer protégé : OK. Les viewers restent en reload classique.');
  }

  return {
    context,
    rows,
    protectedViewerOk: unsafeViewerRows.length === 0,
    unsafeViewerRows
  };
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

  window.SBI_PJAX_CONTEXT = () => {
    const context = getShellContext(api);
    console.table([{
      enabled: context.enabled,
      area: context.area,
      path: context.path,
      activeNav: context.activeNav || '-',
      noRightPanel: context.noRightPanel,
      viewKey: context.currentViewKey || '-'
    }]);
    return context;
  };

  window.SBI_PJAX_AUDIT = () => printAudit(api);

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
