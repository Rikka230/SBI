/**
 * SBI 8.0P.167.174 - Teacher course editor V2 entry bridge
 *
 * La V2 devient l’entrée officielle côté professeur :
 * - + Nouveau cours ouvre /teacher/course-editor.html
 * - Modifier ouvre /teacher/course-editor.html?id=...
 * - l’ancien éditeur n’est plus proposé dans l’interface.
 */

const V2_EDITOR_PATH = '/teacher/course-editor.html';

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function buildV2Url(courseId = '') {
  const safeCourseId = normalizeString(courseId);
  return safeCourseId ? `${V2_EDITOR_PATH}?id=${encodeURIComponent(safeCourseId)}` : V2_EDITOR_PATH;
}

async function goToV2(courseId = '') {
  const target = buildV2Url(courseId);
  if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
    try {
      const handled = await window.SBI_APP_SHELL_NAVIGATE(target, {
        historyMode: 'push',
        source: courseId ? 'teacher-library-edit-v2' : 'teacher-library-new-v2'
      });
      if (handled) return;
    } catch (error) {
      console.warn('[SBI Teacher Library] Navigation V2 PJAX indisponible, fallback classique :', error);
    }
  }
  window.location.href = target;
}

function hideLegacyEditorAccess() {
  const navEditor = document.getElementById('nav-tab-editor');
  if (navEditor) {
    navEditor.style.display = 'none';
    navEditor.classList.remove('active');
    navEditor.dataset.sbiV2Hidden = 'true';
  }

  const tabEditor = document.getElementById('tab-editor');
  if (tabEditor) tabEditor.classList.remove('active');

  const tabList = document.getElementById('tab-list');
  if (tabList && !tabList.classList.contains('active')) tabList.classList.add('active');

  const firstTab = document.querySelector('.student-sub-nav-item');
  if (firstTab && !firstTab.classList.contains('active')) firstTab.classList.add('active');

  document.querySelectorAll('[data-teacher-legacy-edit-course], .teacher-course-btn--legacy').forEach((node) => node.remove());
}

function decorateTeacherCourseCards(root = document) {
  hideLegacyEditorAccess();
  root.querySelectorAll('[data-teacher-edit-course]').forEach((button) => {
    const courseId = normalizeString(button.getAttribute('data-teacher-edit-course'));
    if (!courseId) return;

    button.dataset.sbiV2Decorated = 'true';
    button.textContent = 'Modifier';
    button.title = 'Ouvrir ce cours dans l’éditeur V2';
  });
}

function decorateNewCourseButton() {
  const button = document.getElementById('btn-trigger-new-course');
  if (!button) return;

  button.dataset.sbiV2Decorated = 'true';
  button.textContent = '+ Nouveau cours';
  button.title = 'Créer un cours dans l’éditeur V2';
  button.removeAttribute('onclick');
  button.onclick = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    void goToV2();
    return false;
  };
}

function installLegacyTabOverride() {
  if (window.__SBI_TEACHER_V2_SWITCH_OVERRIDE === true) return;
  window.__SBI_TEACHER_V2_SWITCH_OVERRIDE = true;

  const originalSwitch = window.switchCourseTab;
  window.switchCourseTab = function patchedSwitchCourseTab(tabId, ...args) {
    if (tabId === 'tab-editor') {
      void goToV2();
      return;
    }
    if (typeof originalSwitch === 'function') return originalSwitch.call(this, tabId, ...args);
  };
}

function handleV2EntryClick(event) {
  const editButton = event.target.closest?.('[data-teacher-edit-course]');
  if (editButton) {
    const courseId = editButton.getAttribute('data-teacher-edit-course');
    if (!courseId) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void goToV2(courseId);
    return true;
  }

  const newCourseButton = event.target.closest?.('#btn-trigger-new-course');
  if (newCourseButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void goToV2();
    return true;
  }

  const legacyEditorTab = event.target.closest?.('#nav-tab-editor');
  if (legacyEditorTab) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void goToV2();
    return true;
  }

  return false;
}

function installClickGuards() {
  if (window.__SBI_TEACHER_V2_ENTRY_CLICK_GUARD === true) return;
  window.__SBI_TEACHER_V2_ENTRY_CLICK_GUARD = true;
  window.addEventListener('click', handleV2EntryClick, true);
  document.addEventListener('click', handleV2EntryClick, true);
}

function installRenderObserver() {
  const root = document.getElementById('teacher-courses-list-container');
  if (!root) return null;

  decorateTeacherCourseCards(root);

  const observer = new MutationObserver(() => {
    decorateTeacherCourseCards(root);
    decorateNewCourseButton();
  });

  observer.observe(root, { childList: true, subtree: true });
  return observer;
}

function boot() {
  hideLegacyEditorAccess();
  decorateNewCourseButton();
  decorateTeacherCourseCards();
  installLegacyTabOverride();
  installClickGuards();
  installRenderObserver();

  window.addEventListener('sbi:teacher-library-mounted', () => {
    hideLegacyEditorAccess();
    decorateNewCourseButton();
    decorateTeacherCourseCards();
    installLegacyTabOverride();
  });

  window.setInterval(() => {
    hideLegacyEditorAccess();
    decorateNewCourseButton();
    decorateTeacherCourseCards();
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
