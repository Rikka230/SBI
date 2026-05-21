/**
 * SBI 8.0P.167.177 - Teacher course editor V2 entry bridge
 *
 * Bridge léger et nettoyable :
 * - + Nouveau cours ouvre /teacher/course-editor.html
 * - Modifier ouvre /teacher/course-editor.html?id=...
 * - l'ancien éditeur n'est plus proposé côté prof
 * - aucun interval persistant, donc pas de freeze après PJAX
 */

const V2_EDITOR_PATH = '/teacher/course-editor.html';
let activeCleanup = null;

function normalizeString(value) {
  return value == null ? '' : String(value).trim();
}

function buildV2Url(courseId = '') {
  const safeCourseId = normalizeString(courseId);
  return safeCourseId ? `${V2_EDITOR_PATH}?id=${encodeURIComponent(safeCourseId)}` : V2_EDITOR_PATH;
}

async function navigateToV2(courseId = '') {
  const target = buildV2Url(courseId);
  if (typeof window.SBI_APP_SHELL_NAVIGATE === 'function') {
    try {
      const handled = await window.SBI_APP_SHELL_NAVIGATE(target, {
        historyMode: 'push',
        source: courseId ? 'teacher-library-edit-v2' : 'teacher-library-new-v2'
      });
      if (handled) return true;
    } catch (error) {
      console.warn('[SBI Teacher Library] PJAX V2 indisponible, fallback classique :', error);
    }
  }
  window.location.assign(target);
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
    tabEditor.style.display = 'none';
    tabEditor.innerHTML = '';
  }

  const tabList = root.getElementById?.('tab-list') || document.getElementById('tab-list');
  if (tabList && !tabList.classList.contains('active')) tabList.classList.add('active');

  root.querySelectorAll?.('[data-teacher-legacy-edit-course], .teacher-course-btn--legacy').forEach((node) => node.remove());
}

function decorateNewCourseButton(root = document) {
  const button = root.getElementById?.('btn-trigger-new-course') || document.getElementById('btn-trigger-new-course');
  if (!button) return;
  button.dataset.sbiV2Decorated = 'true';
  button.textContent = '+ Nouveau cours';
  button.title = 'Créer un cours dans l’éditeur V2';
  button.removeAttribute('onclick');
}

function decorateCourseButtons(root = document) {
  root.querySelectorAll?.('[data-teacher-edit-course]').forEach((button) => {
    button.textContent = 'Modifier';
    button.title = 'Ouvrir ce cours dans l’éditeur V2';
    button.dataset.sbiV2Decorated = 'true';
  });
}

function handleClick(event) {
  const editButton = event.target.closest?.('[data-teacher-edit-course]');
  if (editButton) {
    const courseId = normalizeString(editButton.getAttribute('data-teacher-edit-course'));
    if (!courseId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void navigateToV2(courseId);
    return;
  }

  const newCourseButton = event.target.closest?.('#btn-trigger-new-course');
  if (newCourseButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void navigateToV2();
    return;
  }

  const legacyTab = event.target.closest?.('#nav-tab-editor');
  if (legacyTab) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void navigateToV2();
  }
}

function patchLegacySwitch() {
  const previous = typeof window.switchCourseTab === 'function' ? window.switchCourseTab : null;
  window.__SBI_TEACHER_V2_PREVIOUS_SWITCH = previous;
  window.switchCourseTab = function switchCourseTabV2(tabId, ...args) {
    if (tabId === 'tab-editor') {
      void navigateToV2();
      return;
    }
    return previous?.call(this, tabId, ...args);
  };
}

export function mountTeacherCourseEditorV2Entry({ source = 'standard' } = {}) {
  activeCleanup?.();

  const root = document;
  hideLegacyEditorAccess(root);
  decorateNewCourseButton(root);
  decorateCourseButtons(root);
  patchLegacySwitch();

  const observerRoot = document.getElementById('teacher-courses-list-container') || document.getElementById('main-content') || document.body;
  const observer = observerRoot ? new MutationObserver(() => {
    hideLegacyEditorAccess(root);
    decorateNewCourseButton(root);
    decorateCourseButtons(root);
  }) : null;

  observer?.observe(observerRoot, { childList: true, subtree: true });
  document.addEventListener('click', handleClick, true);

  const refreshHandler = () => {
    hideLegacyEditorAccess(root);
    decorateNewCourseButton(root);
    decorateCourseButtons(root);
  };
  window.addEventListener('sbi:teacher-library-mounted', refreshHandler);

  const cleanup = () => {
    document.removeEventListener('click', handleClick, true);
    window.removeEventListener('sbi:teacher-library-mounted', refreshHandler);
    observer?.disconnect();
    if (window.__SBI_TEACHER_V2_PREVIOUS_SWITCH) {
      window.switchCourseTab = window.__SBI_TEACHER_V2_PREVIOUS_SWITCH;
      delete window.__SBI_TEACHER_V2_PREVIOUS_SWITCH;
    }
    if (activeCleanup === cleanup) activeCleanup = null;
  };

  activeCleanup = cleanup;
  return cleanup;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountTeacherCourseEditorV2Entry({ source: 'auto' }), { once: true });
} else {
  mountTeacherCourseEditorV2Entry({ source: 'auto' });
}
