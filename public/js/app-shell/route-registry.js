/**
 * SBI 8.0K - Route registry
 *
 * Admin shell :
 * - admin index tabs
 * - Gestion Accueil
 * - Mon Profil
 *
 * Student shell :
 * - Mon Hub
 * - Mes Cours
 * - Mon Profil
 *
 * Teacher shell :
 * - Mon Espace
 * - Mes Cours
 * - Mon Profil
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
import {
  loadQuillIfNeeded,
  initCourseEditorQuill,
  installCourseEditorTabs,
  installMediaTypeSwitch,
  hasCourseEditorDom
} from './course-editor-bridge.js';

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

function isStudentProfile(url) {
  return normalizePath(url.pathname).toLowerCase() === '/student/mon-profil.html';
}

function isTeacherDashboard(url) {
  return normalizePath(url.pathname).toLowerCase() === '/teacher/dashboard.html';
}

function isTeacherCourses(url) {
  return normalizePath(url.pathname).toLowerCase() === '/teacher/mes-cours.html';
}

function isTeacherProfile(url) {
  return normalizePath(url.pathname).toLowerCase() === '/teacher/mon-profil.html';
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
    || path === '/student/mes-cours.html'
    || path === '/student/mon-profil.html';
}

function isTeacherShellContext() {
  const path = getCurrentPath();
  return path === '/teacher/dashboard.html'
    || path === '/teacher/mes-cours.html'
    || path === '/teacher/mon-profil.html';
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

function bindProfileTabs() {
  const root = document.querySelector('#main-content');
  if (!root) return () => {};

  const boundItems = [];

  function switchProfileTab(tabId, trigger = null) {
    if (!tabId) return;

    root.querySelectorAll('.student-sub-nav-item').forEach((item) => {
      item.classList.toggle('active', item === trigger || item.dataset.sbiProfileTab === tabId);
    });

    root.querySelectorAll('.student-view').forEach((view) => {
      view.classList.toggle('active', view.id === tabId);
    });
  }

  window.switchTab = (tabId, trigger = null) => {
    const activeTrigger = trigger || window.event?.currentTarget || null;
    switchProfileTab(tabId, activeTrigger);
  };

  root.querySelectorAll('.student-sub-nav-item[onclick*="switchTab"]').forEach((item) => {
    const inline = item.getAttribute('onclick') || '';
    const match = inline.match(/switchTab\(['"]([^'"]+)['"]\)/);
    const tabId = match?.[1];

    if (!tabId) return;

    item.dataset.sbiProfileTab = tabId;
    item.removeAttribute('onclick');

    const handler = () => switchProfileTab(tabId, item);
    item.addEventListener('click', handler);
    boundItems.push([item, handler]);
  });

  return () => {
    boundItems.forEach(([item, handler]) => item.removeEventListener('click', handler));
  };
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
    await ensureDocumentStyles(doc, url.href);
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

  await ensureDocumentStyles(doc, url.href);
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

  await ensureDocumentStyles(doc, url.href);
  await loadScriptOnce(CROPPER_SCRIPT, { globalName: 'Cropper' });

  applyBodyRouteClassesFromDocument(doc, ['sbi-profile-page', 'sbi-admin-surface']);
  replaceMainFromDocument(doc);
  const cleanupCropModal = replaceRouteNodeFromDocument(doc, '#crop-modal');
  const cleanupTabs = bindProfileTabs();
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

  if (typeof cleanupCropModal === 'function') registerCleanup(cleanupCropModal, 'admin-profile-crop-modal');
  if (typeof cleanupTabs === 'function') registerCleanup(cleanupTabs, 'admin-profile-tabs');

  return { viewKey: 'admin:profile' };
}

async function mountStudentPage({ url }) {
  const doc = await fetchAdminDocument(url);
  const isDashboard = isStudentDashboard(url);

  await ensureDocumentStyles(doc, url.href);
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

      if (typeof cleanup === 'function') registerCleanup(cleanup, 'student-hub');
    } finally {
      window.__SBI_APP_SHELL_MOUNTING_STUDENT_HUB = false;
    }

    return { viewKey: 'student:dashboard' };
  }

  window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES = true;

  try {
    const module = await import('/student/js/mes-cours.js');
    const cleanup = module.mountStudentCourses?.({ source: 'pjax-student-courses' });

    if (typeof cleanup === 'function') registerCleanup(cleanup, 'student-courses');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES = false;
  }

  return { viewKey: 'student:courses' };
}

async function mountStudentProfile({ url }) {
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  await loadScriptOnce(CROPPER_SCRIPT, { globalName: 'Cropper' });

  applyBodyRouteClassesFromDocument(doc, ['sbi-profile-page', 'sbi-student-surface', 'no-right-panel']);
  replaceMainFromDocument(doc);
  const cleanupCropModal = replaceRouteNodeFromDocument(doc, '#crop-modal');
  const cleanupTabs = bindProfileTabs();
  updateAdminChromeFromDocument(doc, 'Mon Profil - SBI Student');
  setLeftNavActive('/student/mon-profil.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_PROFILE = true;

  try {
    const module = await import('/js/profile-core.js');
    const cleanupProfile = module.mountProfileCore?.({ source: 'pjax-student-profile' });

    if (typeof cleanupProfile === 'function') registerCleanup(cleanupProfile, 'student-profile-core');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_PROFILE = false;
  }

  if (typeof cleanupCropModal === 'function') registerCleanup(cleanupCropModal, 'student-profile-crop-modal');
  if (typeof cleanupTabs === 'function') registerCleanup(cleanupTabs, 'student-profile-tabs');

  return { viewKey: 'student:profile' };
}

async function mountTeacherDashboard({ url }) {
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['no-right-panel']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Mon Espace - SBI Teacher');
  setLeftNavActive('/teacher/dashboard.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_TEACHER_DASHBOARD = true;

  try {
    const module = await import('/teacher/js/teacher-dashboard.js');
    const cleanup = module.mountTeacherDashboard?.({ source: 'pjax-teacher-dashboard' });

    if (typeof cleanup === 'function') registerCleanup(cleanup, 'teacher-dashboard');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_TEACHER_DASHBOARD = false;
  }

  return { viewKey: 'teacher:dashboard' };
}

async function mountTeacherCourses({ url }) {
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  await loadQuillIfNeeded(loadScriptOnce);

  applyBodyRouteClassesFromDocument(doc, ['sbi-course-editor-page', 'sbi-teacher-surface', 'no-right-panel']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Formations & Cours - SBI Teacher');
  setLeftNavActive('/teacher/mes-cours.html');
  updateUrlContext(url);

  if (!hasCourseEditorDom(document)) {
    throw new Error('DOM éditeur cours introuvable après injection PJAX.');
  }

  const cleanupTabs = installCourseEditorTabs();
  const cleanupMediaSwitch = installMediaTypeSwitch();
  const cleanupQuill = initCourseEditorQuill();

  window.__SBI_APP_SHELL_MOUNTING_COURSE_EDITOR = true;

  try {
    const module = await import('/admin/js/admin-courses.js');
    const cleanupCourses = module.mountAdminCourses?.({ source: 'pjax-teacher-courses' });

    if (typeof cleanupCourses === 'function') {
      registerCleanup(cleanupCourses, 'teacher-course-editor');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_COURSE_EDITOR = false;
  }

  if (typeof cleanupTabs === 'function') registerCleanup(cleanupTabs, 'teacher-course-tabs');
  if (typeof cleanupMediaSwitch === 'function') registerCleanup(cleanupMediaSwitch, 'teacher-course-media-switch');
  if (typeof cleanupQuill === 'function') registerCleanup(cleanupQuill, 'teacher-course-quill');

  return { viewKey: 'teacher:courses' };
}

async function mountTeacherProfile({ url }) {
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  await loadScriptOnce(CROPPER_SCRIPT, { globalName: 'Cropper' });

  applyBodyRouteClassesFromDocument(doc, ['sbi-profile-page', 'sbi-teacher-surface', 'no-right-panel']);
  replaceMainFromDocument(doc);
  const cleanupCropModal = replaceRouteNodeFromDocument(doc, '#crop-modal');
  const cleanupTabs = bindProfileTabs();
  updateAdminChromeFromDocument(doc, 'Mon Profil - SBI Teacher');
  setLeftNavActive('/teacher/mon-profil.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_PROFILE = true;

  try {
    const module = await import('/js/profile-core.js');
    const cleanupProfile = module.mountProfileCore?.({ source: 'pjax-teacher-profile' });

    if (typeof cleanupProfile === 'function') registerCleanup(cleanupProfile, 'teacher-profile-core');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_PROFILE = false;
  }

  if (typeof cleanupCropModal === 'function') registerCleanup(cleanupCropModal, 'teacher-profile-crop-modal');
  if (typeof cleanupTabs === 'function') registerCleanup(cleanupTabs, 'teacher-profile-tabs');

  return { viewKey: 'teacher:profile' };
}

export function createRouteRegistry() {
  const routes = [];

  routes.push({
    id: 'teacher-dashboard',
    canHandle(url) {
      return isTeacherDashboard(url) && isTeacherShellContext();
    },
    mount: mountTeacherDashboard
  });

  routes.push({
    id: 'teacher-courses',
    canHandle(url) {
      return isTeacherCourses(url) && isTeacherShellContext();
    },
    mount: mountTeacherCourses
  });

  routes.push({
    id: 'teacher-profile',
    canHandle(url) {
      return isTeacherProfile(url) && isTeacherShellContext();
    },
    mount: mountTeacherProfile
  });

  routes.push({
    id: 'student-profile',
    canHandle(url) {
      return isStudentProfile(url) && isStudentShellContext();
    },
    mount: mountStudentProfile
  });

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
