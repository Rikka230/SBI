/**
 * SBI 8.0P.130 - Route registry
 *
 * Admin shell :
 * - admin index tabs
 * - Comptes & accès dédié
 * - Promotions & cohortes
 * - Cursus
 * - Gestion Accueil
 * - Formations & Cours
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
} from './admin-page-loader.js?v=8.0P.167.231';
import { initAdminTabs } from '/admin/js/admin-ui/panels.js';
import {
  loadQuillIfNeeded,
  initCourseEditorQuill,
  installCourseEditorTabs,
  installMediaTypeSwitch,
  hasCourseEditorDom
} from './course-editor-bridge.js?v=8.0P.130';

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

function isAdminCourses(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/formations-cours.html';
}

function isAdminCourseEditorV2(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/course-editor.html';
}

function isAdminProfile(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/admin-profile.html';
}

function isAdminAccounts(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/admin-accounts.html';
}

function isAdminPromotions(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/admin-promotions.html';
}

function isAdminLives(url) {
  const path = normalizePath(url.pathname).toLowerCase();
  return path === '/admin/admin-lives.html' || path === '/admin/formations-live.html';
}

function isAdminCursus(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/admin-cursus.html';
}

function isAdminAuditLog(url) {
  return normalizePath(url.pathname).toLowerCase() === '/admin/admin-audit-log.html';
}

function isStudentDashboard(url) {
  return normalizePath(url.pathname).toLowerCase() === '/student/dashboard.html';
}

function isStudentCourses(url) {
  return normalizePath(url.pathname).toLowerCase() === '/student/mes-cours.html';
}

function isStudentLives(url) {
  return normalizePath(url.pathname).toLowerCase() === '/student/lives.html';
}

function isStudentLiveReplay(url) {
  const path = normalizePath(url.pathname).toLowerCase();
  return path === '/student/live-replay.html'
    || path === '/student/live-replay'
    || path.startsWith('/student/live-replay/')
    || path.startsWith('/student/live-replay.html/');
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

function isTeacherLives(url) {
  return normalizePath(url.pathname).toLowerCase() === '/teacher/lives.html';
}

function isTeacherCourseEditorV2(url) {
  return normalizePath(url.pathname).toLowerCase() === '/teacher/course-editor.html';
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
    || path === '/admin/formations-cours.html'
    || path === '/admin/course-editor.html'
    || path === '/admin/admin-profile.html'
    || path === '/admin/admin-accounts.html'
    || path === '/admin/admin-promotions.html'
    || path === '/admin/admin-lives.html'
    || path === '/admin/formations-live.html'
    || path === '/admin/admin-cursus.html'
    || path === '/admin/admin-audit-log.html';
}

function isStudentShellContext() {
  const path = getCurrentPath();
  return path === '/student/dashboard.html'
    || path === '/student/mes-cours.html'
    || path === '/student/lives.html'
    || path === '/student/live-replay.html'
    || path === '/student/live-replay'
    || path.startsWith('/student/live-replay/')
    || path.startsWith('/student/live-replay.html/')
    || path === '/student/mon-profil.html';
}

function isTeacherShellContext() {
  const path = getCurrentPath();
  return path === '/teacher/dashboard.html'
    || path === '/teacher/mes-cours.html'
    || path === '/teacher/lives.html'
    || path === '/teacher/course-editor.html'
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

function cleanupCourseEditorV2Artifacts() {
  document.querySelectorAll('.sbi-block-bank, [data-editor-bank], .sbi-editor-dialog-backdrop')
    .forEach((node) => node.remove());
}

function lockAdminProfileTarget(url) {
  const uid = url?.searchParams?.get('id') || '';
  if (!uid) return '';

  try {
    window.__SBI_ADMIN_PROFILE_TARGET_UID = uid;
    window.__SBI_ADMIN_PROFILE_TARGET_URL = url.href;
    sessionStorage.setItem('sbiAdminProfileTargetUid', uid);
    sessionStorage.setItem('sbiAdminProfileTargetUrl', url.href);
  } catch {}

  return uid;
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
  cleanupCourseEditorV2Artifacts();
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
  cleanupCourseEditorV2Artifacts();
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

async function mountAdminCourses({ url }) {
  cleanupCourseEditorV2Artifacts();
  maybeCacheAdminIndexMain('leave-for-admin-courses');

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  await loadQuillIfNeeded(loadScriptOnce);

  applyBodyRouteClassesFromDocument(doc, ['sbi-course-editor-page', 'sbi-admin-surface']);
  replaceMainFromDocument(doc);
  const cleanupFormationModal = replaceRouteNodeFromDocument(doc, '#formation-modal');
  updateAdminChromeFromDocument(doc, 'Formations & Cours - SBI Admin');
  setLeftNavActive('nav-formations');
  updateUrlContext(url);

  if (!hasCourseEditorDom(document)) {
    throw new Error('DOM éditeur cours admin introuvable après injection PJAX.');
  }

  const cleanupTabs = installCourseEditorTabs();
  const cleanupMediaSwitch = installMediaTypeSwitch();
  const cleanupQuill = initCourseEditorQuill();

  window.__SBI_APP_SHELL_MOUNTING_COURSE_EDITOR = true;

  try {
    const module = await import('/admin/js/admin-courses.js?v=8.0P.167.188');
    const cleanupCourses = module.mountAdminCourses?.({ source: 'pjax-admin-courses' });

    if (typeof cleanupCourses === 'function') {
      registerCleanup(cleanupCourses, 'admin-course-editor');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_COURSE_EDITOR = false;
  }

  if (typeof cleanupFormationModal === 'function') registerCleanup(cleanupFormationModal, 'admin-course-formation-modal');
  if (typeof cleanupTabs === 'function') registerCleanup(cleanupTabs, 'admin-course-tabs');
  if (typeof cleanupMediaSwitch === 'function') registerCleanup(cleanupMediaSwitch, 'admin-course-media-switch');
  if (typeof cleanupQuill === 'function') registerCleanup(cleanupQuill, 'admin-course-quill');

  return { viewKey: 'admin:courses' };
}

async function mountAdminProfile({ url }) {
  cleanupCourseEditorV2Artifacts();
  maybeCacheAdminIndexMain('leave-for-admin-profile');
  const targetUid = lockAdminProfileTarget(url);

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);

  try {
    await loadScriptOnce(CROPPER_SCRIPT, { globalName: 'Cropper' });
  } catch (error) {
    console.warn('[SBI AppShell] Cropper indisponible en PJAX, profil monté sans outil avatar :', error);
  }

  applyBodyRouteClassesFromDocument(doc, ['sbi-profile-page', 'sbi-admin-surface']);
  replaceMainFromDocument(doc);
  const cleanupCropModal = replaceRouteNodeFromDocument(doc, '#crop-modal');
  const cleanupTabs = bindProfileTabs();
  updateAdminChromeFromDocument(doc, 'Profil Complet - SBI Console');
  setLeftNavActive('nav-users');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_PROFILE = true;

  try {
    const module = await import('/js/profile-core.js?v=8.0P.167.205');
    const cleanupProfile = module.mountProfileCore?.({
      source: 'pjax-admin-profile',
      targetUid,
      targetUrl: url.href
    });

    if (typeof cleanupProfile === 'function') {
      registerCleanup(cleanupProfile, 'admin-profile-core');
    }
  } catch (error) {
    console.error('[SBI AppShell] Montage profil impossible sans rechargement forcé :', error);
    const status = document.getElementById('prof-status-text');
    if (status) status.textContent = 'Profil impossible à charger. Rafraîchis la page si besoin.';
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_PROFILE = false;
  }

  if (typeof cleanupCropModal === 'function') registerCleanup(cleanupCropModal, 'admin-profile-crop-modal');
  if (typeof cleanupTabs === 'function') registerCleanup(cleanupTabs, 'admin-profile-tabs');

  return { viewKey: 'admin:profile' };
}

async function mountAdminAccounts({ url }) {
  cleanupCourseEditorV2Artifacts();
  maybeCacheAdminIndexMain('leave-for-admin-accounts');

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['sbi-admin-surface']);
  replaceMainFromDocument(doc);
  const cleanupEditModal = replaceRouteNodeFromDocument(doc, '#edit-user-modal');
  updateAdminChromeFromDocument(doc, 'Comptes & accès - SBI Console');
  setLeftNavActive('nav-users');
  updateUrlContext(url);
  sessionStorage.setItem('activeAdminTab', 'view-users');

  window.__SBI_APP_SHELL_MOUNTING_ACCOUNTS = true;

  try {
    await import('/admin/js/admin-core.js?v=8.0P.167.64');
    window.SBI_ADMIN_CORE_REINIT?.();
    const module = await import('/admin/js/admin-accounts-dashboard.js?v=8.0P.167.64');
    module.mountAdminAccountsDashboard?.();
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_ACCOUNTS = false;
  }

  registerCleanup(() => window.SBI_ADMIN_CORE_DISCONNECT_USERS?.(), 'admin-accounts-users-listener');
  registerCleanup(() => window.SBI_ADMIN_ACCOUNTS_DASHBOARD_UNMOUNT?.(), 'admin-accounts-dashboard');
  if (typeof cleanupEditModal === 'function') registerCleanup(cleanupEditModal, 'admin-accounts-edit-modal');

  return { viewKey: 'admin:accounts' };
}

async function mountAdminPromotions({ url }) {
  cleanupCourseEditorV2Artifacts();
  maybeCacheAdminIndexMain('leave-for-admin-promotions');

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['sbi-admin-surface']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Promotions & cohortes - SBI Console');
  setLeftNavActive('nav-promotions');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_PROMOTIONS = true;

  try {
    const module = await import('/admin/js/admin-promotions.js?v=8.0P.167.64');
    const cleanupPromotions = module.mountAdminPromotions?.({ source: 'pjax-admin-promotions' });

    if (typeof cleanupPromotions === 'function') {
      registerCleanup(cleanupPromotions, 'admin-promotions');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_PROMOTIONS = false;
  }

  return { viewKey: 'admin:promotions' };
}

async function mountAdminCursus({ url }) {
  cleanupCourseEditorV2Artifacts();
  maybeCacheAdminIndexMain('leave-for-admin-cursus');

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['sbi-admin-surface']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Cursus - SBI Console');
  setLeftNavActive('nav-cursus');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_CURSUS = true;

  try {
    const module = await import('/admin/js/admin-cursus.js?v=8.0P.167.188');
    const cleanupCursus = module.mountAdminCursus?.({ source: 'pjax-admin-cursus' });

    await import('/admin/js/admin-cursus-placeholder-replace.js?v=8.0P.167.188');
    await import('/admin/js/admin-cursus-promotion-sync.js?v=8.0P.167.188');

    if (typeof cleanupCursus === 'function') {
      registerCleanup(cleanupCursus, 'admin-cursus');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_CURSUS = false;
  }

  return { viewKey: 'admin:cursus' };
}

async function mountLiveSchedulerRoute({ url, role = 'admin' }) {
  cleanupCourseEditorV2Artifacts();
  if (role === 'admin') maybeCacheAdminIndexMain('leave-for-admin-lives');

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, [
    role === 'admin' ? 'sbi-admin-surface' : 'sbi-teacher-surface',
    'sbi-live-page',
    role !== 'admin' ? 'no-right-panel' : ''
  ].filter(Boolean));
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, role === 'admin' ? 'Lives - SBI Console' : 'Lives - SBI Teacher');
  setLeftNavActive(role === 'admin' ? 'nav-lives' : '/teacher/lives.html');
  updateUrlContext(url);

  const module = await import('/js/live/live-scheduler-page.js?v=8.0P.167.224');
  const cleanup = module.mountLiveSchedulerPage?.(role);
  if (typeof cleanup === 'function') registerCleanup(cleanup, role === 'admin' ? 'admin-lives' : 'teacher-lives');

  return { viewKey: role === 'admin' ? 'admin:lives' : 'teacher:lives' };
}

async function mountAdminLives({ url }) {
  return mountLiveSchedulerRoute({ url, role: 'admin' });
}

async function mountTeacherLives({ url }) {
  return mountLiveSchedulerRoute({ url, role: 'teacher' });
}

async function mountAdminAuditLog({ url }) {
  cleanupCourseEditorV2Artifacts();
  maybeCacheAdminIndexMain('leave-for-admin-audit-log');

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['sbi-admin-surface']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Journal admin - SBI Console');
  setLeftNavActive('nav-audit-log');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_AUDIT_LOG = true;

  try {
    const module = await import('/admin/js/admin-global-audit-log.js?v=8.0P.167.58');
    const cleanupAuditLog = module.mountAdminGlobalAuditLog?.({ source: 'pjax-admin-audit-log' });

    if (typeof cleanupAuditLog === 'function') {
      registerCleanup(cleanupAuditLog, 'admin-global-audit-log');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_AUDIT_LOG = false;
  }

  return { viewKey: 'admin:audit-log' };
}

async function mountStudentPage({ url }) {
  cleanupCourseEditorV2Artifacts();
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
      const module = await import('/student/js/student-hub.js?v=8.0P.167.205');
      const cleanup = module.mountStudentHub?.({ source: 'pjax-student-dashboard' });

      if (typeof cleanup === 'function') registerCleanup(cleanup, 'student-hub');
    } finally {
      window.__SBI_APP_SHELL_MOUNTING_STUDENT_HUB = false;
    }

    return { viewKey: 'student:dashboard' };
  }

  window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES = true;

  try {
    const module = await import('/student/js/mes-cours.js?v=8.0P.167.205');
    const cleanup = module.mountStudentCourses?.({ source: 'pjax-student-courses' });

    if (typeof cleanup === 'function') registerCleanup(cleanup, 'student-courses');

    const promotionModule = await import('/student/js/student-promotion-course-view.js?v=8.0P.167.156');
    const cleanupPromotionView = promotionModule.mountStudentPromotionCourseView?.({ source: 'pjax-student-courses' });

    if (typeof cleanupPromotionView === 'function') registerCleanup(cleanupPromotionView, 'student-promotion-course-view');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_STUDENT_COURSES = false;
  }

  return { viewKey: 'student:courses' };
}

async function mountStudentLives({ url }) {
  cleanupCourseEditorV2Artifacts();
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['sbi-live-page', 'no-right-panel']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Mes lives - SBI Student');
  setLeftNavActive('/student/lives.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_STUDENT_LIVES = true;
  try {
    const module = await import('/student/js/student-lives.js?v=8.0P.167.231');
    const cleanup = module.mountStudentLivesPage?.();
    if (typeof cleanup === 'function') registerCleanup(cleanup, 'student-lives');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_STUDENT_LIVES = false;
  }

  return { viewKey: 'student:lives' };
}

async function mountStudentLiveReplay({ url }) {
  cleanupCourseEditorV2Artifacts();
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  applyBodyRouteClassesFromDocument(doc, ['sbi-live-page', 'sbi-live-replay-page', 'no-right-panel']);
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, 'Replay live - SBI Student');
  setLeftNavActive('/student/lives.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_LIVE_REPLAY = true;
  try {
    const module = await import('/student/js/live-replay.js?v=8.0P.167.231');
    const cleanup = module.mountStudentLiveReplayPage?.();
    if (typeof cleanup === 'function') registerCleanup(cleanup, 'student-live-replay');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_LIVE_REPLAY = false;
  }

  return { viewKey: 'student:live-replay' };
}

async function mountStudentProfile({ url }) {
  cleanupCourseEditorV2Artifacts();
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  await loadScriptOnce(CROPPER_SCRIPT, { globalName: 'Cropper' });

  applyBodyRouteClassesFromDocument(doc, ['sbi-student-surface', 'no-right-panel']);
  replaceMainFromDocument(doc);
  const cleanupCropModal = replaceRouteNodeFromDocument(doc, '#crop-modal');
  const cleanupTabs = bindProfileTabs();
  updateAdminChromeFromDocument(doc, 'Mon Profil - SBI Student');
  setLeftNavActive('/student/mon-profil.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_PROFILE = true;

  try {
    const module = await import('/js/profile-core.js?v=8.0P.167.205');
    const cleanupProfile = module.mountProfileCore?.({
      source: 'pjax-student-profile',
      targetUrl: url.href
    });

    if (typeof cleanupProfile === 'function') registerCleanup(cleanupProfile, 'student-profile-core');
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_PROFILE = false;
  }

  if (typeof cleanupCropModal === 'function') registerCleanup(cleanupCropModal, 'student-profile-crop-modal');
  if (typeof cleanupTabs === 'function') registerCleanup(cleanupTabs, 'student-profile-tabs');

  return { viewKey: 'student:profile' };
}

async function mountTeacherDashboard({ url }) {
  cleanupCourseEditorV2Artifacts();
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
  cleanupCourseEditorV2Artifacts();
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);

  applyBodyRouteClassesFromDocument(doc, ['sbi-course-editor-page', 'sbi-teacher-surface', 'no-right-panel']);
  replaceMainFromDocument(doc);
  const cleanupFormationModal = replaceRouteNodeFromDocument(doc, '#formation-modal');
  updateAdminChromeFromDocument(doc, 'Formations & Cours - SBI Teacher');
  setLeftNavActive('/teacher/mes-cours.html');
  updateUrlContext(url);

  /**
   * 8.0P.167.138 : la bibliothèque professeur reste le coeur de cette route.
   * Elle doit rester PJAX stable même si l'éditeur lourd/Quill n'est pas prêt.
   */
  window.__SBI_APP_SHELL_MOUNTING_TEACHER_COURSES_LIBRARY = true;
  try {
    const libraryModule = await import('/teacher/js/teacher-courses-library.js?v=8.0P.167.203');
    const cleanupTeacherLibrary = libraryModule.mountTeacherCoursesLibrary?.({ source: 'pjax-teacher-courses' });

    if (typeof cleanupTeacherLibrary === 'function') {
      registerCleanup(cleanupTeacherLibrary, 'teacher-courses-library');
    }

    const promotionModule = await import('/teacher/js/teacher-promotion-planning-select.js?v=8.0P.167.184');
    const cleanupPromotionSelect = promotionModule.mountTeacherPromotionPlanningSelect?.({ source: 'pjax-teacher-courses' });

    if (typeof cleanupPromotionSelect === 'function') {
      registerCleanup(cleanupPromotionSelect, 'teacher-promotion-planning-select');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_TEACHER_COURSES_LIBRARY = false;
  }

  // 8.0P.167.180 : l’entrée V2 est gérée directement par teacher-courses-library.

  if (typeof cleanupFormationModal === 'function') registerCleanup(cleanupFormationModal, 'teacher-course-formation-modal');

  return { viewKey: 'teacher:courses' };
}

async function mountCourseEditorV2Page({ url, role = 'teacher' }) {
  const isAdmin = role === 'admin';
  if (isAdmin) maybeCacheAdminIndexMain('leave-for-admin-course-editor-v2');

  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  await loadQuillIfNeeded(loadScriptOnce);

  // 8.0P.167.174 : en PJAX, le body du document courant ne garde pas
  // automatiquement les classes de la page éditeur. Sans ces classes, les
  // variables CSS de l'éditeur V2 disparaissent et la page devient quasi
  // brute/minuscule. On force donc les classes complètes du thème embarqué.
  applyBodyRouteClassesFromDocument(doc, [
    'sbi-editor-v2',
    isAdmin ? 'sbi-editor-v2--admin' : 'sbi-editor-v2--teacher',
    'sbi-editor-v2--embedded',
    'sbi-course-editor-page',
    isAdmin ? 'sbi-admin-surface' : 'sbi-teacher-surface',
    !isAdmin ? 'no-right-panel' : ''
  ].filter(Boolean));
  replaceMainFromDocument(doc);
  updateAdminChromeFromDocument(doc, isAdmin ? 'Éditeur cours V2 - SBI Admin' : 'Éditeur cours V2 - SBI Teacher');
  setLeftNavActive(isAdmin ? 'nav-formations' : '/teacher/mes-cours.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_COURSE_EDITOR_V2 = true;

  try {
    const module = await import('/js/course-editor-v2/course-editor-v2.js?v=8.0P.167.205');
    const cleanup = module.mountCourseEditorV2?.({
      source: isAdmin ? 'pjax-admin-course-editor-v2' : 'pjax-teacher-course-editor-v2',
      force: true
    });

    if (typeof cleanup === 'function') {
      registerCleanup(cleanup, isAdmin ? 'admin-course-editor-v2' : 'teacher-course-editor-v2');
    }
  } finally {
    window.__SBI_APP_SHELL_MOUNTING_COURSE_EDITOR_V2 = false;
  }

  return { viewKey: isAdmin ? 'admin:course-editor-v2' : 'teacher:course-editor-v2' };
}

async function mountTeacherCourseEditorV2({ url }) {
  return mountCourseEditorV2Page({ url, role: 'teacher' });
}

async function mountAdminCourseEditorV2({ url }) {
  return mountCourseEditorV2Page({ url, role: 'admin' });
}

async function mountTeacherProfile({ url }) {
  cleanupCourseEditorV2Artifacts();
  const doc = await fetchAdminDocument(url);

  await ensureDocumentStyles(doc, url.href);
  await loadScriptOnce(CROPPER_SCRIPT, { globalName: 'Cropper' });

  applyBodyRouteClassesFromDocument(doc, ['sbi-teacher-surface', 'no-right-panel']);
  replaceMainFromDocument(doc);
  const cleanupCropModal = replaceRouteNodeFromDocument(doc, '#crop-modal');
  const cleanupTabs = bindProfileTabs();
  updateAdminChromeFromDocument(doc, 'Mon Profil - SBI Teacher');
  setLeftNavActive('/teacher/mon-profil.html');
  updateUrlContext(url);

  window.__SBI_APP_SHELL_MOUNTING_PROFILE = true;

  try {
    const module = await import('/js/profile-core.js?v=8.0P.167.205');
    const cleanupProfile = module.mountProfileCore?.({
      source: 'pjax-teacher-profile',
      targetUrl: url.href
    });

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

  routes.push({ id: 'teacher-dashboard', canHandle(url) { return isTeacherDashboard(url) && isTeacherShellContext(); }, mount: mountTeacherDashboard });
  routes.push({ id: 'teacher-course-editor-v2', canHandle(url) { return isTeacherCourseEditorV2(url) && isTeacherShellContext(); }, mount: mountTeacherCourseEditorV2 });
  routes.push({ id: 'teacher-courses', canHandle(url) { return isTeacherCourses(url) && isTeacherShellContext(); }, mount: mountTeacherCourses });
  routes.push({ id: 'teacher-lives', canHandle(url) { return isTeacherLives(url) && isTeacherShellContext(); }, mount: mountTeacherLives });
  routes.push({ id: 'teacher-profile', canHandle(url) { return isTeacherProfile(url) && isTeacherShellContext(); }, mount: mountTeacherProfile });
  routes.push({ id: 'student-profile', canHandle(url) { return isStudentProfile(url) && isStudentShellContext(); }, mount: mountStudentProfile });
  routes.push({ id: 'student-dashboard', canHandle(url) { return isStudentDashboard(url) && isStudentShellContext(); }, mount: mountStudentPage });
  routes.push({ id: 'student-courses', canHandle(url) { return isStudentCourses(url) && isStudentShellContext(); }, mount: mountStudentPage });
  routes.push({ id: 'student-lives', canHandle(url) { return isStudentLives(url) && isStudentShellContext(); }, mount: mountStudentLives });
  routes.push({ id: 'student-live-replay', canHandle(url) { return isStudentLiveReplay(url) && isStudentShellContext(); }, mount: mountStudentLiveReplay });
  routes.push({ id: 'admin-course-editor-v2', canHandle(url) { return isAdminCourseEditorV2(url) && isAdminShellContext(); }, mount: mountAdminCourseEditorV2 });
  routes.push({ id: 'admin-courses', canHandle(url) { return isAdminCourses(url) && isAdminShellContext(); }, mount: mountAdminCourses });
  routes.push({ id: 'admin-profile', canHandle(url) { return isAdminProfile(url) && isAdminShellContext(); }, mount: mountAdminProfile });
  routes.push({ id: 'admin-accounts', canHandle(url) { return isAdminAccounts(url) && isAdminShellContext(); }, mount: mountAdminAccounts });
  routes.push({ id: 'admin-promotions', canHandle(url) { return isAdminPromotions(url) && isAdminShellContext(); }, mount: mountAdminPromotions });
  routes.push({ id: 'admin-lives', canHandle(url) { return isAdminLives(url) && isAdminShellContext(); }, mount: mountAdminLives });
  routes.push({ id: 'admin-cursus', canHandle(url) { return isAdminCursus(url) && isAdminShellContext(); }, mount: mountAdminCursus });
  routes.push({ id: 'admin-audit-log', canHandle(url) { return isAdminAuditLog(url) && isAdminShellContext(); }, mount: mountAdminAuditLog });
  routes.push({ id: 'admin-site-index', canHandle(url) { return isAdminSiteIndex(url) && isAdminShellContext(); }, mount: mountSiteIndex });

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
    find(url) { return routes.find((route) => route.canHandle(url)) || null; },
    canHandle(url) { return Boolean(this.find(url)); },
    list() { return routes.map((route) => route.id); }
  };
}
