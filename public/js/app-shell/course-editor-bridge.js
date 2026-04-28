/**
 * SBI 8.0K - Course editor bridge
 *
 * Prépare et monte les éléments que les scripts inline ne relancent pas
 * en navigation PJAX : Quill, onglets éditeur et switch image/vidéo.
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
  return Boolean(window.Quill && window.quill && window.quill.root?.isConnected);
}

export async function loadQuillIfNeeded(loadScriptOnce) {
  if (window.Quill) return window.Quill;

  if (typeof loadScriptOnce !== 'function') {
    throw new Error('loadScriptOnce manquant pour charger Quill.');
  }

  await loadScriptOnce(QUILL_SCRIPT, { globalName: 'Quill' });
  return window.Quill;
}

export function initCourseEditorQuill() {
  const editor = document.getElementById('quill-editor');
  if (!editor) return () => {};

  if (!window.Quill) {
    throw new Error('Quill non chargé.');
  }

  if (window.quill && window.quill.root?.isConnected && window.quill.container?.contains(editor.querySelector('.ql-editor'))) {
    return () => {};
  }

  let lastQuillSelection = null;
  const toolbarCleanups = [];

  const toolbarOptions = [
    [{ size: ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image', 'video'],
    ['clean']
  ];

  function rememberQuillSelection(range) {
    if (range && range.length > 0) {
      lastQuillSelection = {
        index: range.index,
        length: range.length
      };
    }
  }

  window.quill = new window.Quill('#quill-editor', {
    theme: 'snow',
    modules: {
      toolbar: {
        container: toolbarOptions,
        handlers: {
          size(value) {
            const quill = this.quill;
            const currentRange = quill.getSelection();
            const range = currentRange && currentRange.length > 0
              ? currentRange
              : lastQuillSelection;

            if (range && range.length > 0) {
              quill.focus();
              quill.setSelection(range.index, range.length, 'silent');
              quill.formatText(range.index, range.length, 'size', value || false, 'user');
              quill.setSelection(range.index, range.length, 'silent');
              rememberQuillSelection(range);
            }
          }
        }
      }
    }
  });

  window.quill.on('selection-change', rememberQuillSelection);

  const toolbar = window.quill.getModule('toolbar')?.container;
  if (toolbar) {
    ['mousedown', 'pointerdown', 'touchstart'].forEach((eventName) => {
      const handler = () => rememberQuillSelection(window.quill?.getSelection?.());
      toolbar.addEventListener(eventName, handler, true);
      toolbarCleanups.push(() => toolbar.removeEventListener(eventName, handler, true));
    });
  }

  return () => {
    toolbarCleanups.splice(0, toolbarCleanups.length).forEach((cleanup) => cleanup());

    if (window.quill && !window.quill.root?.isConnected) {
      window.quill = null;
    }
  };
}

export function installCourseEditorTabs() {
  const cleanups = [];

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

    const handler = () => window.safeSwitchTab(tabId);
    item.addEventListener('click', handler);
    cleanups.push(() => item.removeEventListener('click', handler));
  });

  return () => cleanups.splice(0, cleanups.length).forEach((cleanup) => cleanup());
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
