/**
 * SBI 8.0J - Course editor bridge
 *
 * Prépare la future migration PJAX de l'éditeur cours.
 * Ne force aucune route en PJAX pour l'instant.
 */

const QUILL_SCRIPT = 'https://cdn.quilljs.com/1.3.6/quill.min.js';

export const COURSE_EDITOR_ROUTES = {
  admin: '/admin/formations-cours.html',
  teacher: '/teacher/mes-cours.html'
};

export function hasCourseEditorDom(root = document) {
  return Boolean(
    root.querySelector('#quill-editor')
    && root.querySelector('#courses-list-container')
    && root.querySelector('#btn-trigger-new-course')
  );
}

export function isQuillReady() {
  return Boolean(window.Quill && window.quill);
}

export async function loadQuillIfNeeded(loadScriptOnce) {
  if (window.Quill) return window.Quill;
  if (typeof loadScriptOnce !== 'function') {
    throw new Error('loadScriptOnce manquant pour charger Quill.');
  }

  await loadScriptOnce(QUILL_SCRIPT, { globalName: 'Quill' });
  return window.Quill;
}

export function installCourseEditorTabs() {
  window.safeSwitchTab = function safeSwitchTab(tabId) {
    const currentActive = document.querySelector('.student-view.active');

    if (currentActive && currentActive.id === 'tab-editor' && tabId !== 'tab-editor') {
      const confirmLeave = confirm("Attention : les modifications non enregistrées seront perdues.\n\nAvez-vous bien cliqué sur Enregistrer avant de quitter ?");
      if (!confirmLeave) return;
    }

    document.querySelectorAll('.student-sub-nav-item').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.student-view').forEach((el) => el.classList.remove('active'));

    if (tabId === 'tab-list') {
      document.querySelector('.student-sub-nav-item:nth-child(1)')?.classList.add('active');
      const navEditor = document.getElementById('nav-tab-editor');
      if (navEditor) navEditor.style.display = 'none';
    } else {
      const navEditor = document.getElementById('nav-tab-editor');
      if (navEditor) {
        navEditor.style.display = 'block';
        navEditor.classList.add('active');
      }
    }

    document.getElementById(tabId)?.classList.add('active');
  };

  window.switchCourseTab = window.safeSwitchTab;

  document.querySelectorAll('.student-sub-nav-item[onclick*="safeSwitchTab"]').forEach((item) => {
    const inline = item.getAttribute('onclick') || '';
    const match = inline.match(/safeSwitchTab\(['"]([^'"]+)['"]\)/);
    const tabId = match?.[1];

    if (!tabId) return;

    item.removeAttribute('onclick');
    item.addEventListener('click', () => window.safeSwitchTab(tabId));
  });
}

export function installMediaTypeSwitch() {
  const handler = (event) => {
    if (event.target?.name !== 'media_type') return;

    const imageZone = document.getElementById('media-image-zone');
    const videoZone = document.getElementById('media-video-zone');

    if (event.target.value === 'image') {
      if (imageZone) imageZone.style.display = 'flex';
      if (videoZone) videoZone.style.display = 'none';
    } else {
      if (imageZone) imageZone.style.display = 'none';
      if (videoZone) videoZone.style.display = 'flex';
    }
  };

  document.body.addEventListener('change', handler);
  return () => document.body.removeEventListener('change', handler);
}
