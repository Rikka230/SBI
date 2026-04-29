/**
 * SBI 8.0M.11 - App shell foundation
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

const PRE_PR_FORBIDDEN_FILES = [
  {
    path: '/admin/repair-access.html',
    reason: 'ancienne page de réparation supprimée, ne doit pas revenir dans GitHub'
  },
  {
    path: '/admin/cours-viewer.html',
    reason: 'trace du test viewer PJAX 8.0M.7 rejeté, supprimée après rollback 8.0M.8'
  },
  {
    path: '/student/css/viewer-pjax.css',
    reason: 'CSS expérimental viewer PJAX 8.0M.7 rejeté, supprimé après rollback 8.0M.8'
  }
];

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

function getPjaxProbeDefinitions() {
  return [
    { group: 'admin', path: '/admin/index.html?tab=view-dashboard', label: 'Admin dashboard' },
    { group: 'admin', path: '/admin/index.html?tab=view-users', label: 'Admin utilisateurs' },
    { group: 'admin', path: '/admin/site-index-settings.html', label: 'Admin gestion accueil' },
    { group: 'admin', path: '/admin/formations-cours.html', label: 'Admin formations & cours' },
    { group: 'admin', path: '/admin/admin-profile.html', label: 'Admin profil' },
    { group: 'student', path: '/student/dashboard.html', label: 'Student dashboard' },
    { group: 'student', path: '/student/mes-cours.html', label: 'Student mes cours' },
    { group: 'student', path: '/student/mon-profil.html', label: 'Student profil' },
    { group: 'teacher', path: '/teacher/dashboard.html', label: 'Teacher dashboard' },
    { group: 'teacher', path: '/teacher/mes-cours.html', label: 'Teacher formations & cours' },
    { group: 'teacher', path: '/teacher/mon-profil.html', label: 'Teacher profil' },
    { group: 'protected', path: '/student/cours-viewer.html?id=test', label: 'Viewer étudiant réel' },
    { group: 'protected', path: '/teacher/cours-viewer.html?id=test&preview=true', label: 'Viewer prof preview' },
    { group: 'protected', path: '/admin/cours-viewer.html?id=test&preview=true', label: 'Viewer admin preview' },
    { group: 'protected', path: '/admin/formations-live.html', label: 'Live / médias' },
    { group: 'protected', path: '/login.html', label: 'Authentification' },
    { group: 'public', path: '/index.html', label: 'Index public' }
  ];
}

function getExpectedModeForProbe(probe, context) {
  if (probe.group === 'protected' || probe.group === 'public') {
    return {
      expected: 'reload',
      note: probe.path.includes('/cours-viewer.html')
        ? 'viewer protégé depuis rollback 8.0M.8'
        : 'route non migrée volontairement'
    };
  }

  if (probe.group === context.area) {
    return {
      expected: 'pjax',
      note: `route ${probe.group} testée dans son shell`
    };
  }

  return {
    expected: 'reload',
    note: `hors contexte actuel (${context.area || 'unknown'})`
  };
}

function getAuditVerdict(probe, decision, expectedInfo) {
  if (decision.mode === expectedInfo.expected) {
    if (probe.group === 'protected' || probe.group === 'public') return 'OK protégé';
    if (expectedInfo.note.startsWith('hors contexte')) return 'OK hors contexte';
    return 'OK PJAX';
  }

  if (probe.path.includes('/cours-viewer.html') && decision.mode !== 'reload') {
    return 'ALERTE viewer';
  }

  return 'ALERTE';
}

function buildRouteAuditRows(api) {
  const context = getShellContext(api);

  return getPjaxProbeDefinitions().map((probe) => {
    const url = new URL(probe.path, window.location.origin);
    const decision = api.routeStatus(url);
    const expectedInfo = getExpectedModeForProbe(probe, context);

    return {
      group: probe.group,
      label: probe.label,
      path: probe.path,
      expectedNow: expectedInfo.expected,
      mode: decision.mode,
      verdict: getAuditVerdict(probe, decision, expectedInfo),
      note: expectedInfo.note,
      route: decision.route || '-',
      reason: decision.reason
    };
  });
}

function summarizeAuditRows(rows) {
  return {
    total: rows.length,
    okPjax: rows.filter((row) => row.verdict === 'OK PJAX').length,
    okProtected: rows.filter((row) => row.verdict === 'OK protégé').length,
    okOutOfContext: rows.filter((row) => row.verdict === 'OK hors contexte').length,
    alerts: rows.filter((row) => row.verdict.startsWith('ALERTE')).length
  };
}

function printAudit(api) {
  const context = getShellContext(api);
  const rows = buildRouteAuditRows(api);
  const summary = summarizeAuditRows(rows);
  const alertRows = rows.filter((row) => row.verdict.startsWith('ALERTE'));
  const protectedViewerRows = rows.filter((row) => row.path.includes('/cours-viewer.html'));
  const unsafeViewerRows = protectedViewerRows.filter((row) => row.mode !== 'reload');
  const currentShellRows = rows.filter((row) => row.group === context.area);
  const protectedRows = rows.filter((row) => row.group === 'protected' || row.group === 'public');
  const outOfContextRows = rows.filter((row) => ['admin', 'student', 'teacher'].includes(row.group) && row.group !== context.area);

  console.info('[SBI PJAX] Contexte shell courant');
  console.table([{
    enabled: context.enabled,
    area: context.area,
    path: context.path,
    activeNav: context.activeNav || '-',
    noRightPanel: context.noRightPanel,
    viewKey: context.currentViewKey || '-'
  }]);

  console.info('[SBI PJAX] Résumé audit contextualisé');
  console.table([summary]);

  console.info(`[SBI PJAX] Routes ${context.area} attendues en PJAX dans le shell courant`);
  console.table(currentShellRows);

  console.info('[SBI PJAX] Routes protégées attendues en reload');
  console.table(protectedRows);

  console.info('[SBI PJAX] Routes hors contexte : reload normal depuis ce shell');
  console.table(outOfContextRows);

  if (unsafeViewerRows.length) {
    console.warn('[SBI PJAX] Alerte : un viewer est annoncé PJAX alors qu’il doit rester protégé.', unsafeViewerRows);
  } else {
    console.info('[SBI PJAX] Viewer protégé : OK. Les viewers restent en reload classique.');
  }

  if (alertRows.length) {
    console.warn('[SBI PJAX] Alertes audit à vérifier.', alertRows);
  } else {
    console.info('[SBI PJAX] Audit contextualisé : OK. Les reload hors contexte sont normaux.');
  }

  return {
    context,
    rows,
    summary,
    protectedViewerOk: unsafeViewerRows.length === 0,
    unsafeViewerRows,
    alertRows
  };
}

async function checkStaticPath(path) {
  const href = new URL(path, window.location.origin);
  href.searchParams.set('sbiPrePr', Date.now().toString(36));

  const requestOptions = { cache: 'no-store', credentials: 'same-origin' };
  let response = null;

  try {
    response = await fetch(href.href, { ...requestOptions, method: 'HEAD' });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(href.href, { ...requestOptions, method: 'GET' });
    }

    const absent = response.status === 404 || response.status === 410;

    return {
      path,
      status: response.status,
      state: absent ? 'absent' : 'present',
      ok: absent,
      href: href.href
    };
  } catch (error) {
    return {
      path,
      status: 'fetch-error',
      state: 'unknown',
      ok: false,
      href: href.href,
      error: error?.message || String(error)
    };
  }
}

async function buildPrePrFileRows() {
  const checks = await Promise.all(
    PRE_PR_FORBIDDEN_FILES.map(async (item) => {
      const result = await checkStaticPath(item.path);

      return {
        path: item.path,
        expected: 'absent',
        state: result.state,
        status: result.status,
        verdict: result.ok ? 'OK absent' : result.state === 'unknown' ? 'À vérifier' : 'ALERTE présent',
        reason: item.reason,
        href: result.href,
        error: result.error || ''
      };
    })
  );

  return checks;
}

async function printPrePrFileAudit() {
  const rows = await buildPrePrFileRows();
  const alerts = rows.filter((row) => row.verdict.startsWith('ALERTE'));
  const unknown = rows.filter((row) => row.verdict === 'À vérifier');

  console.info('[SBI PRE-PR] Fichiers obsolètes / expérimentaux à garder absents');
  console.table(rows.map((row) => ({
    path: row.path,
    expected: row.expected,
    state: row.state,
    status: row.status,
    verdict: row.verdict,
    reason: row.reason
  })));

  if (alerts.length) {
    console.warn('[SBI PRE-PR] Fichiers à supprimer avant PR.', alerts);
  } else if (unknown.length) {
    console.warn('[SBI PRE-PR] Certains fichiers n’ont pas pu être vérifiés automatiquement.', unknown);
  } else {
    console.info('[SBI PRE-PR] Nettoyage fichiers : OK. Aucun fichier obsolète détecté.');
  }

  return { rows, alerts, unknown, ok: alerts.length === 0 && unknown.length === 0 };
}

function buildPrePrSummary(routeAudit, fileAudit) {
  const pjaxAlerts = routeAudit?.alertRows?.length || 0;
  const viewerOk = Boolean(routeAudit?.protectedViewerOk);
  const fileAlerts = fileAudit?.alerts?.length || 0;
  const fileUnknown = fileAudit?.unknown?.length || 0;
  const ok = pjaxAlerts === 0 && viewerOk && fileAlerts === 0 && fileUnknown === 0;

  return {
    version: window.SBI_VERSION?.label || document.querySelector('[data-sbi-version-badge]')?.textContent?.trim() || 'version non exposée',
    shellArea: routeAudit?.context?.area || 'unknown',
    pjaxAlerts,
    viewerReloadProtected: viewerOk,
    forbiddenFilesPresent: fileAlerts,
    forbiddenFilesUnknown: fileUnknown,
    readyForPrReview: ok,
    verdict: ok ? 'OK pré-PR' : 'À corriger avant PR'
  };
}

async function printPrePrCheck(api) {
  console.info('[SBI PRE-PR] Check rapide avant nettoyage / PR');

  const routeAudit = printAudit(api);
  const fileAudit = await printPrePrFileAudit();
  const summary = buildPrePrSummary(routeAudit, fileAudit);

  console.info('[SBI PRE-PR] Résumé');
  console.table([summary]);

  if (summary.readyForPrReview) {
    console.info('[SBI PRE-PR] OK : shell stable, viewers protégés, fichiers obsolètes absents.');
  } else {
    console.warn('[SBI PRE-PR] À vérifier avant PR.', summary);
  }

  return {
    summary,
    routeAudit,
    fileAudit
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

  window.SBI_PRE_PR_FILES = () => printPrePrFileAudit();
  window.SBI_PRE_PR_CHECK = () => printPrePrCheck(api);

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
