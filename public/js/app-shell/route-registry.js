/**
 * SBI 8.0F - Route registry
 *
 * Admin shell :
 * - admin index tabs
 * - Gestion Accueil
 * - Mon Profil
 *
 * Student shell :
 * - Mon Hub
 * - Mes Cours
 */

import { registerCleanup } from './view-lifecycle.js';
import {
  fetchAdminDocument,
  ensureDocumentStyles,
  applyBodyRouteClassesFromDocument,
  cacheCurrentMain,
  hasCachedMain,
  restoreCachedMain,
  replaceMainFromDocument,
  replaceRouteNodeFromDocument,
  updateAdminChromeFromDocument,
  setLeftNavActive,
  loadScriptOnce
} from './admin-page-loader.js';
import { initAdminTabs } from '/admin/js/admin-ui/panels.js';

const CROPPER_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js';
const ADMIN_INDEX_CACHE_KEY = 'admin:index-main';

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

function isAdminProfile(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/admin-profile.html';
}

function isStudentDashboard(url) {
  return normalizePath(url.pathname).toLowerCase() === '/student/dashboard.html';
}

function isStudentCourses(url) {
  return normalizePath(url.pathname).toLowerCase() === '/student/mes-cours.html';
}

function isStudentShellRoute(url) {
  return isStudentDashboard(url) || isStudentCourses(url);
}

function getCurrentUrl() {
  return new URL(window.SBI_APP_SHELL_CURRENT_URL || window.location.href, window.location.origin);
}

function getCurrentPath() {
  return normalizePath(getCurrentUrl().pathname).toLowerCase();
}

function isAdminShellContext() {
  const path = getCurrentPath();
  return path === '/admin/index.html'
    || path === '/admin/site-index-settings.html'
    || path === '/admin/admin-profile.html';
}

function isStudentShellContext() {
  const path = getCurrentPath();
  return path === '/student/dashboard.html'
    || path === '/student/mes-cours.html';
}

function isCurrentAdminIndex() {
  return getCurrentPath() === '/admin/index.html';
}

function maybeCacheAdminIndexMain(reason) {
  if (!isCurrentAdminIndex()) return;
  cacheCurrentMain(ADMIN_INDEX_CACHE_KEY, {
    reason,
    activeTab: sessionStorage.getItem('activeAdminTab') || 'view-dashboard'
  });
}

function hasAdminTabApi() {
  return Boolean(window.SBI_ADMIN_TABS && typeof window.SBI_ADMIN_TABS.switchTo === 'function');
}

function updateUrlContext(url) {
  window.SBI_APP_SHELL_CURRENT_URL = url.href;
}

function notifyAdminIndexRestored(tab) {
  window.dispatchEvent(new CustomEvent('sbi:admin-index-restored', {
    detail: { tab }
  }));
}

async function mountAdminIndex({ url, source = 'app-shell' }) {
  const tab = getAdminTabFromUrl(url);
  const canRestoreIndex = hasCachedMain(ADMIN_INDEX_CACHE_KEY);

  if (canRestoreIndex) {
    applyBodyRouteClassesFromDocument(document.implementation.createHTMLDocument(''), ['sbi-dashboard-page', 'sbi-dashboard-redesign']);
    restoreCachedMain(ADMIN_INDEX_CACHE_KEY);
    initAdminTabs();
    notifyAdminIndexRestored(tab);
  } else if (!hasAdminTabApi() || !window.SBI_ADMIN_TABS.has?.(tab)) {
    const doc = await fetchAdminDocument(url);
    ensureDocumentStyles(doc, url.href);
    applyBodyRouteClassesFromDocument(doc, ['sbi-dashboard-page', 'sbi-dashboard-redesign']);
    replaceMainFromDocument(doc);
    updateAdminChromeFromDocument(doc, 'SBI Admin');
    initAdminTabs();
  } else {
    applyBodyRouteClassesFromDocument(document.implementation.createHTMLDocument(''), ['sbi-dashboard-page', 'sbi-dashboard-redesign']);
  }

  window.SBI_ADMIN_TABS?.switchTo?.(tab, { updateUrl: false, source });
  setLeftNavActive('');
  updateUrlContext(url);

  return { viewKey: `admin:${tab}` };
}

async function mountSiteIndex({ url }) {
  maybeCacheAdminIndexMain('leave-for-site-index');

  const doc = await fetchAdminDocument(url);

  ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc);
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

async function mountAdminProfile({ url }) {
  maybeCacheAdminIndexMain('leave-for-admin-profile');

  const doc = await fetchAdminDocument(url);

  ensureDocumentStyles(doc, url.href);
  await loadScriptOnce(CROPPER_SCRIPT, { globalName: 'Cropper' });

  applyBodyRouteClassesFromDocument(doc, ['sbi-profile-page', 'sbi-admin-surface']);
  replaceMainFromDocument(doc);
  const cleanupCropModal = replaceRouteNodeFromDocument(doc, '#crop-modal');
  updateAdminChromeFromDocument(doc, 'Profil Complet - SBI Console');
  setLeftNavActive('nav-users');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_PROFILE = true;

  try {
    const module = await import('/js/profile-core.js');
    const cleanupProfile = module.mountProfileCore?.({ source: 'pjax-admin-profile' });

    if (typeof cleanupProfile === 'function') {
      registerCleanup(cleanupProfile, 'admin-profile-core');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_PROFILE = false;
  }

  if (typeof cleanupCropModal === 'function') {
    registerCleanup(cleanupCropModal, 'admin-profile-crop-modal');
  }

  return { viewKey: 'admin:profile' };
}

async function mountStudentPage({ url }) {
  const doc = await fetchAdminDocument(url);
  const isDashboard = isStudentDashboard(url);

  ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['no-right-panel']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, isDashboard ? 'SBI Student - Mon Hub' : 'Mes Cours - SBI Student');
  setLeftNavActive(isDashboard ? '/student/dashboard.html' : '/student/mes-cours.html');
  updateUrlContext(url);

  if (isDashboard) {
    window.__SBI_APP_SHELL_MOUNTING_STUDENT_HUB = true;

    try {
      const module = await import('/student/js/student-hub.js');
      const cleanup = module.mountStudentHub?.({ source: 'pjax-student-dashboard' });

      if (typeof cleanup === 'function') {
        registerCleanup(cleanup, 'student-hub');
      }
    } finally {
      window.__SBI_APP_SHELL_MOUNTING_STUDENT_HUB = false;
    }

    return { viewKey: 'student:dashboard' };
  }

  window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES = true;

  try {
    const module = await import('/student/js/mes-cours.js');
    const cleanup = module.mountStudentCourses?.({ source: 'pjax-student-courses' });

    if (typeof cleanup === 'function') {
      registerCleanup(cleanup, 'student-courses');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES = false;
  }

  return { viewKey: 'student:courses' };
}

export function createRouteRegistry() {
  const routes = [];

  routes.push({
    id: 'student-dashboard',
    canHandle(url) {
      return isStudentDashboard(url) && isStudentShellContext();
    },
    mount: mountStudentPage
  });

  routes.push({
    id: 'student-courses',
    canHandle(url) {
      return isStudentCourses(url) && isStudentShellContext();
    },
    mount: mountStudentPage
  });

  routes.push({
    id: 'admin-profile',
    canHandle(url) {
      return isAdminProfile(url) && isAdminShellContext();
    },
    mount: mountAdminProfile
  });

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
      if (hasCachedMain(ADMIN_INDEX_CACHE_KEY)) return true;

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
      applyBodyRouteClassesFromDocument(document.implementation.createHTMLDocument(''), ['sbi-dashboard-page', 'sbi-dashboard-redesign']);
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
