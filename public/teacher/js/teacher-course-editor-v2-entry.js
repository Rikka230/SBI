/**
 * SBI 8.0P.167.176 - Teacher course editor V2 entry bridge
 * Entrée légère et nettoyable. Aucun setInterval global.
 */

const V2_EDITOR_PATH = '/teacher/course-editor.html';

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function buildV2Url(courseId = '') {
  const safeCourseId = normalizeString(courseId);
  return safeCourseId ? `${V2_EDITOR_PATH}?id=${encodeURIComponent(safeCourseId)}` : V2_EDITOR_PATH;
}

async function goToV2(courseId = '', source = 'teacher-library-v2-entry') {
  const target = buildV2Url(courseId);
  if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
    try {
      const handled = await window.SBI_APP_SHELL_NAVIGATE(target, { historyMode: 'push', source });
      if (handled) return true;
    } catch (error) {
      console.warn('[SBI Teacher Library] Navigation V2 PJAX indisponible, fallback classique :', error);
    }
  }
  window.location.href = target;
  return false;
}

function hideLegacyEditorAccess(root = document) {
  const navEditor = root.getElementById?.('nav-tab-editor') || document.getElementById('nav-tab-editor');
  if (navEditor) {
    navEditor.style.display = 'none';
    navEditor.classList.remove('active');
    navEditor.dataset.sbiV2Hidden = 'true';
  }

  const tabEditor = root.getElementById?.('tab-editor') || document.getElementById('tab-editor');
  if (tabEditor) {
    tabEditor.classList.remove('active');
    tabEditor.setAttribute('aria-hidden', 'true');
  }

  const tabList = root.getElementById?.('tab-list') || document.getElementById('tab-list');
  if (tabList && !tabList.classList.contains('active')) tabList.classList.add('active');

  const firstTab = root.querySelector?.('.student-sub-nav-item') || document.querySelector('.student-sub-nav-item');
  if (firstTab && !firstTab.classList.contains('active')) firstTab.classList.add('active');

  root.querySelectorAll?.('[data-teacher-legacy-edit-course], .teacher-course-btn--legacy').forEach((node) => node.remove());
}

function decorateTeacherCourseCards(root = document) {
  root.querySelectorAll?.('[data-teacher-edit-course]').forEach((button) => {
    const courseId = normalizeString(button.getAttribute('data-teacher-edit-course'));
    if (!courseId) return;
    button.dataset.sbiV2Decorated = 'true';
    button.textContent = 'Modifier';
    button.title = 'Ouvrir ce cours dans l’éditeur V2';
  });
}

function decorateNewCourseButton(root = document) {
  const button = root.getElementById?.('btn-trigger-new-course') || document.getElementById('btn-trigger-new-course');
  if (!button) return;
  button.dataset.sbiV2Decorated = 'true';
  button.textContent = '+ Nouveau cours';
  button.title = 'Créer un cours dans l’éditeur V2';
  button.removeAttribute('onclick');
}

function installLegacySwitchOverride(cleanups) {
  const originalSwitch = window.switchCourseTab;
  window.switchCourseTab = function patchedSwitchCourseTab(tabId, ...args) {
    if (tabId === 'tab-editor') {
      void goToV2('', 'teacher-legacy-tab-v2');
      return;
    }
    if (typeof originalSwitch === 'function') return originalSwitch.call(this, tabId, ...args);
  };
  cleanups.push(() => { window.switchCourseTab = originalSwitch; });
}

function mountTeacherCourseEditorV2Entry({ source = 'standard' } = {}) {
  const controller = new AbortController();
  const cleanups = [];
  const root = document.getElementById('main-content') || document;

  const refresh = () => {
    hideLegacyEditorAccess(document);
    decorateNewCourseButton(document);
    decorateTeacherCourseCards(document);
  };

  const clickHandler = (event) => {
    const editButton = event.target.closest?.('[data-teacher-edit-course]');
    if (editButton) {
      const courseId = normalizeString(editButton.getAttribute('data-teacher-edit-course'));
      if (!courseId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void goToV2(courseId, 'teacher-library-edit-v2');
      return;
    }

    const newButton = event.target.closest?.('#btn-trigger-new-course, [data-teacher-new-course-v2]');
    if (newButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void goToV2('', 'teacher-library-new-v2');
      return;
    }

    const legacyTab = event.target.closest?.('#nav-tab-editor');
    if (legacyTab) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void goToV2('', 'teacher-legacy-tab-v2');
    }
  };

  document.addEventListener('click', clickHandler, { capture: true, signal: controller.signal });

  const observerRoot = document.getElementById('teacher-courses-list-container') || root;
  const observer = new MutationObserver(refresh);
  observer.observe(observerRoot, { childList: true, subtree: true });
  cleanups.push(() => observer.disconnect());

  const libraryMountedHandler = refresh;
  window.addEventListener('sbi:teacher-library-mounted', libraryMountedHandler, { signal: controller.signal });

  installLegacySwitchOverride(cleanups);
  refresh();

  return () => {
    controller.abort();
    cleanups.splice(0).forEach((fn) => {
      try { fn(); } catch {}
    });
  };
}

export { mountTeacherCourseEditorV2Entry };

if (!window.__SBI_APP_SHELL_MOUNTING_TEACHER_COURSES_LIBRARY && document.getElementById('teacher-courses-list-container')) {
  mountTeacherCourseEditorV2Entry({ source: 'auto' });
}
