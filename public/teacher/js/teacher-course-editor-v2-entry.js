/**
 * SBI 8.0P.167.170 - Teacher course editor V2 entry bridge
 *
 * Transition contrôlée : la bibliothèque prof garde son rendu validé,
 * mais Nouveau cours / Modifier ouvrent la page dédiée V2.
 * L'ancien éditeur reste accessible en fallback par carte.
 */

const V2_EDITOR_PATH = '/teacher/course-editor.html';
const LEGACY_WAIT_MAX = 24;
const LEGACY_WAIT_DELAY = 125;

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

function ensureLegacyTabVisible() {
  const navEditor = document.getElementById('nav-tab-editor');
  if (navEditor) navEditor.style.display = '';

  if (typeof window.switchCourseTab === 'function') {
    window.switchCourseTab('tab-editor');
  } else {
    document.querySelectorAll('.student-sub-nav-item').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.student-view').forEach((view) => view.classList.remove('active'));
    navEditor?.classList.add('active');
    document.getElementById('tab-editor')?.classList.add('active');
  }
}

function openLegacyEditor(courseId, attempt = 0) {
  const safeCourseId = normalizeString(courseId);
  if (!safeCourseId) return;

  ensureLegacyTabVisible();

  if (typeof window.editCourse === 'function') {
    window.editCourse(safeCourseId);
    return;
  }

  if (attempt < LEGACY_WAIT_MAX) {
    window.setTimeout(() => openLegacyEditor(safeCourseId, attempt + 1), LEGACY_WAIT_DELAY);
    return;
  }

  window.location.href = `/teacher/mes-cours.html?edit=${encodeURIComponent(safeCourseId)}`;
}

function decorateTeacherCourseCards(root = document) {
  root.querySelectorAll('[data-teacher-edit-course]').forEach((button) => {
    const courseId = normalizeString(button.getAttribute('data-teacher-edit-course'));
    if (!courseId || button.dataset.sbiV2Decorated === 'true') return;

    button.dataset.sbiV2Decorated = 'true';
    button.textContent = 'Modifier V2';
    button.title = 'Ouvrir ce cours dans le nouvel éditeur dédié';

    const fallback = document.createElement('button');
    fallback.type = 'button';
    fallback.className = `${button.className || 'teacher-course-btn teacher-course-btn--secondary'} teacher-course-btn--legacy`;
    fallback.dataset.teacherLegacyEditCourse = courseId;
    fallback.textContent = 'Ancien éditeur';
    fallback.title = 'Ouvrir ce cours avec l’éditeur historique';

    button.insertAdjacentElement('afterend', fallback);
  });
}

function decorateNewCourseButton() {
  const button = document.getElementById('btn-trigger-new-course');
  if (!button || button.dataset.sbiV2Decorated === 'true') return;

  button.dataset.sbiV2Decorated = 'true';
  button.textContent = '+ Nouveau cours V2';
  button.title = 'Créer un cours dans le nouvel éditeur dédié';
}

function installClickGuards() {
  document.addEventListener('click', (event) => {
    const legacyButton = event.target.closest?.('[data-teacher-legacy-edit-course]');
    if (legacyButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openLegacyEditor(legacyButton.getAttribute('data-teacher-legacy-edit-course'));
      return;
    }

    const editButton = event.target.closest?.('[data-teacher-edit-course]');
    if (editButton) {
      const courseId = editButton.getAttribute('data-teacher-edit-course');
      if (!courseId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void goToV2(courseId);
      return;
    }

    const newCourseButton = event.target.closest?.('#btn-trigger-new-course');
    if (newCourseButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void goToV2();
    }
  }, true);
}

function installRenderObserver() {
  const root = document.getElementById('teacher-courses-list-container');
  if (!root) return null;

  decorateTeacherCourseCards(root);

  const observer = new MutationObserver(() => {
    decorateTeacherCourseCards(root);
  });

  observer.observe(root, { childList: true, subtree: true });
  return observer;
}

function boot() {
  decorateNewCourseButton();
  decorateTeacherCourseCards();
  installClickGuards();
  installRenderObserver();

  window.addEventListener('sbi:teacher-library-mounted', () => {
    decorateNewCourseButton();
    decorateTeacherCourseCards();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
