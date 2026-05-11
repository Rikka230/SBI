/**
 * SBI 8.0M.9 - Route guards PJAX
 *
 * Les routes sensibles restent en reload classique tant qu'elles n'ont pas
 * un lifecycle dédié testé.
 */

const HARD_RELOAD_PATHS = new Map([
  ['/student/cours-viewer.html', 'viewer étudiant / progression / quiz / vidéo'],
  ['/teacher/cours-viewer.html', 'viewer prof / preview protégé après rollback 8.0M.8'],
  ['/admin/cours-viewer.html', 'viewer admin / preview protégé après rollback 8.0M.8'],
  ['/admin/formations-live.html', 'live / médias / logique non migrée'],
  ['/change-email.html', 'flux sécurité email'],
  ['/login.html', 'authentification'],
  ['/index.html', 'index public']
]);

const HARD_RELOAD_PREFIXES = [
  ['/assets/', 'asset statique'],
  ['/uploads/', 'asset upload'],
  ['/api/', 'endpoint API'],
  ['/__/auth/', 'callback Firebase Auth']
];

function normalizePath(pathname) {
  if (!pathname) return '/';
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/admin') return '/admin/index.html';
  if (clean === '/student') return '/student/dashboard.html';
  if (clean === '/teacher') return '/teacher/dashboard.html';
  return clean;
}

function sameOrigin(url) {
  return Boolean(url && url.origin === window.location.origin);
}

function isFileDownload(url) {
  const pathname = normalizePath(url.pathname).toLowerCase();
  return /\.(pdf|zip|rar|7z|mp4|webm|mov|jpg|jpeg|png|webp|gif|svg|json|csv|xlsx?)$/i.test(pathname);
}

function getHardReloadReason(url) {
  if (!sameOrigin(url)) return 'origine externe';

  const pathname = normalizePath(url.pathname).toLowerCase();

  if (HARD_RELOAD_PATHS.has(pathname)) {
    return HARD_RELOAD_PATHS.get(pathname);
  }

  const prefixMatch = HARD_RELOAD_PREFIXES.find(([prefix]) => pathname.startsWith(prefix));
  if (prefixMatch) return prefixMatch[1];

  if (isFileDownload(url)) return 'fichier ou média';

  return null;
}

export function getRouteDecision(url, registry = null) {
  if (!url) {
    return {
      mode: 'ignore',
      reason: 'URL invalide',
      route: null,
      href: ''
    };
  }

  if (!sameOrigin(url)) {
    return {
      mode: 'reload',
      reason: 'navigation externe',
      route: null,
      href: url.href
    };
  }

  const hardReason = getHardReloadReason(url);
  if (hardReason) {
    return {
      mode: 'reload',
      reason: hardReason,
      route: null,
      href: url.href
    };
  }

  const route = registry?.find?.(url) || null;

  if (route) {
    return {
      mode: 'pjax',
      reason: 'route migrée',
      route: route.id,
      href: url.href
    };
  }

  return {
    mode: 'reload',
    reason: 'route non migrée',
    route: null,
    href: url.href
  };
}

export function listHardReloadRoutes() {
  return Array.from(HARD_RELOAD_PATHS.entries()).map(([path, reason]) => ({ path, reason }));
}
