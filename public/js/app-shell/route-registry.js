/**
 * SBI 8.0B - Route registry
 *
 * 8.0A : onglets admin déjà présents dans le DOM.
 * 8.0B : première vraie page externe admin, Gestion Accueil.
 */

import { registerCleanup } from './view-lifecycle.js';
import {
  fetchAdminDocument,
  ensureDocumentStyles,
  replaceMainFromDocument,
  updateAdminChromeFromDocument,
  setLeftNavActive
} from './admin-page-loader.js';
import { initAdminTabs } from '/admin/js/admin-ui/panels.js';

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

function isAdminSiteIndex(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/site-index-settings.html';
}

function isAdminShellContext() {
  const path = normalizePath(window.location.pathname).toLowerCase();
  return path === '/admin/index.html' || path === '/admin/site-index-settings.html';
}

function hasAdminTabApi() {
  return Boolean(window.SBI_ADMIN_TABS && typeof window.SBI_ADMIN_TABS.switchTo === 'function');
}

function updateUrlContext(url) {
  window.SBI_APP_SHELL_CURRENT_URL = url.href;
}

async function mountAdminIndex({ url, source = 'app-shell' }) {
  if (!hasAdminTabApi() || !window.SBI_ADMIN_TABS.has?.(getAdminTabFromUrl(url))) {
    const doc = await fetchAdminDocument(url);
    ensureDocumentStyles(doc, url.href);
    replaceMainFromDocument(doc);
    updateAdminChromeFromDocument(doc, 'SBI Admin');
    initAdminTabs();
  }

  const tab = getAdminTabFromUrl(url);
  window.SBI_ADMIN_TABS?.switchTo?.(tab, { updateUrl: false, source });
  updateUrlContext(url);

  return { viewKey: `admin:${tab}` };
}

async function mountSiteIndex({ url }) {
  const doc = await fetchAdminDocument(url);

  ensureDocumentStyles(doc, url.href);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Gestion Accueil');
  setLeftNavActive('nav-site-index');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_SITE_INDEX = true;

  try {
    const module = await import('/admin/js/site-index-settings.js');
    const cleanup = module.mountSiteIndexSettings?.({ root: document });

    if (typeof cleanup === 'function') {
      registerCleanup(cleanup, 'site-index-settings');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_SITE_INDEX = false;
  }

  return { viewKey: 'admin:site-index-settings' };
}

export function createRouteRegistry() {
  const routes = [];

  routes.push({
    id: 'admin-site-index',
    canHandle(url) {
      return isAdminSiteIndex(url) && isAdminShellContext();
    },
    mount: mountSiteIndex
  });

  routes.push({
    id: 'admin-index',
    canHandle(url) {
      if (!isAdminIndex(url)) return false;
      if (!isAdminShellContext()) return false;

      const tab = getAdminTabFromUrl(url);
      if (hasAdminTabApi() && window.SBI_ADMIN_TABS.has?.(tab)) return true;

      return true;
    },
    mount: mountAdminIndex
  });

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
      updateUrlContext(url);
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
