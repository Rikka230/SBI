/**
 * SBI 8.0M.7 - Route guards PJAX
 *
 * Les routes sensibles restent en reload classique par défaut.
 * Exception contrôlée : viewer preview admin/prof autorisé en PJAX uniquement avec preview=true.
 */

const HARD_RELOAD_PATHS = new Map([
  ['/student/cours-viewer.html', 'viewer étudiant / progression / quiz / vidéo'],
  ['/teacher/cours-viewer.html', 'viewer prof réel sans preview'],
  ['/admin/cours-viewer.html', 'viewer admin réel sans preview'],
  ['/admin/formations-live.html', 'live / médias / logique non migrée'],
  ['/change-email.html', 'flux sécurité email'],
  ['/login.html', 'authentification'],
  ['/index.html', 'index public']
]);

const PJAX_VIEWER_PREVIEW_PATHS = new Set([
  '/teacher/cours-viewer.html',
  '/admin/cours-viewer.html'
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

function isPjaxPreviewViewerException(url) {
  if (!url) return false;
  const pathname = normalizePath(url.pathname).toLowerCase();

  return PJAX_VIEWER_PREVIEW_PATHS.has(pathname)
    && url.searchParams.get('preview') === 'true'
    && Boolean(url.searchParams.get('id'));
}

function getHardReloadReason(url) {
  if (!sameOrigin(url)) return 'origine externe';

  const pathname = normalizePath(url.pathname).toLowerCase();

  if (isPjaxPreviewViewerException(url)) {
    return null;
  }

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

export function listPjaxViewerPreviewRoutes() {
  return Array.from(PJAX_VIEWER_PREVIEW_PATHS).map((path) => ({
    path,
    mode: 'pjax-preview-only',
    condition: 'preview=true + id présent'
  }));
}
