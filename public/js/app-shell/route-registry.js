/**
 * SBI 8.0A - Route registry
 *
 * Première route volontairement limitée : onglets admin déjà présents dans le DOM.
 * Les pages lourdes restent en reload classique tant qu'elles n'ont pas de mount/unmount dédié.
 */

function normalizePath(pathname) {
  if (!pathname) return '/';
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/admin') return '/admin/index.html';
  if (clean === '/student') return '/student/dashboard.html';
  if (clean === '/teacher') return '/teacher/dashboard.html';
  return clean;
}

function getAdminTabFromUrl(url) {
  return url.searchParams.get('tab') || sessionStorage.getItem('activeAdminTab') || 'view-dashboard';
}

function isAdminIndex(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/index.html';
}

function hasAdminTabApi() {
  return Boolean(window.SBI_ADMIN_TABS && typeof window.SBI_ADMIN_TABS.switchTo === 'function');
}

export function createRouteRegistry() {
  const routes = [];

  routes.push({
    id: 'admin-tab',
    canHandle(url) {
      if (!isAdminIndex(url)) return false;
      if (!isAdminIndex(new URL(window.location.href))) return false;
      if (!hasAdminTabApi()) return false;
      const tab = getAdminTabFromUrl(url);
      return Boolean(document.getElementById(tab));
    },
    async mount({ url }) {
      const tab = getAdminTabFromUrl(url);
      window.SBI_ADMIN_TABS.switchTo(tab, { updateUrl: false, source: 'app-shell' });
      document.title = 'SBI Console - Administration';
      return { viewKey: `admin:${tab}` };
    }
  });

  return {
    find(url) {
      return routes.find((route) => route.canHandle(url)) || null;
    },
    canHandle(url) {
      return Boolean(this.find(url));
    },
    list() {
      return routes.map((route) => route.id);
    }
  };
}
