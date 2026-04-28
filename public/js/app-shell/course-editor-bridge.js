/**
 * SBI 8.0K.2 - Course editor bridge
 *
 * Prépare et monte les éléments que les scripts inline ne relancent pas
 * en navigation PJAX : Quill, onglets éditeur et switch image/vidéo.
 */

const QUILL_SCRIPT = 'https://cdn.quilljs.com/1.3.6/quill.min.js';
const TOOLTIP_STYLE_ID = 'sbi-quill-tooltip-style';

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

function injectQuillTooltipStyles() {
  if (document.getElementById(TOOLTIP_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = TOOLTIP_STYLE_ID;
  style.textContent = `
    .ql-toolbar .sbi-quill-tooltip-anchor,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor {
      position: relative;
    }

    .ql-toolbar .sbi-quill-tooltip-anchor::after,
    .ql-toolbar .sbi-quill-tooltip-anchor::before {
      position: absolute;
      left: 50%;
      z-index: 80;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translate(-50%, 8px);
      transition: opacity 140ms ease, transform 140ms ease, visibility 140ms ease;
    }

    .ql-toolbar .sbi-quill-tooltip-anchor::after {
      content: attr(data-sbi-tooltip);
      top: calc(100% + 10px);
      min-width: max-content;
      max-width: 220px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(15, 23, 42, 0.10);
      background: rgba(15, 23, 42, 0.94);
      color: #ffffff;
      font-size: 11px;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: 0.01em;
      white-space: nowrap;
      box-shadow: 0 16px 34px rgba(15, 23, 42, 0.20);
      backdrop-filter: blur(12px);
    }

    .ql-toolbar .sbi-quill-tooltip-anchor::before {
      content: '';
      top: calc(100% + 5px);
      width: 9px;
      height: 9px;
      background: rgba(15, 23, 42, 0.94);
      transform: translate(-50%, 8px) rotate(45deg);
      border-left: 1px solid rgba(15, 23, 42, 0.08);
      border-top: 1px solid rgba(15, 23, 42, 0.08);
    }

    .ql-toolbar .sbi-quill-tooltip-anchor:hover::after,
    .ql-toolbar .sbi-quill-tooltip-anchor:hover::before,
    .ql-toolbar .sbi-quill-tooltip-anchor:focus-visible::after,
    .ql-toolbar .sbi-quill-tooltip-anchor:focus-visible::before,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor:hover::after,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor:hover::before,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor:focus-within::after,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor:focus-within::before {
      opacity: 1;
      visibility: visible;
      transform: translate(-50%, 0);
    }

    .ql-toolbar .sbi-quill-tooltip-anchor:hover::before,
    .ql-toolbar .sbi-quill-tooltip-anchor:focus-visible::before,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor:hover::before,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor:focus-within::before {
      transform: translate(-50%, 0) rotate(45deg);
    }

    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor .ql-picker-label {
      outline: none;
    }

    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor::after {
      top: calc(100% + 12px);
    }

    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor::before {
      top: calc(100% + 7px);
    }

    @media (max-width: 768px) {
      .ql-toolbar .sbi-quill-tooltip-anchor::after {
        display: none;
      }

      .ql-toolbar .sbi-quill-tooltip-anchor::before {
        display: none;
      }
    }
  `;

  document.head.appendChild(style);
}

function decorateTooltipElement(element, label) {
  if (!element) return;

  element.removeAttribute('title');
  element.setAttribute('aria-label', label);
  element.setAttribute('data-sbi-tooltip', label);
  element.classList.add('sbi-quill-tooltip-anchor');

  if (element.tagName === 'BUTTON') {
    element.setAttribute('type', 'button');
  }
}

function setToolbarLabel(toolbar, selector, label) {
  const elements = toolbar.querySelectorAll(selector);

  elements.forEach((element) => {
    decorateTooltipElement(element, label);

    if (element.tagName === 'SELECT') {
      const picker = element.nextElementSibling?.classList?.contains('ql-picker')
        ? element.nextElementSibling
        : null;

      if (picker) {
        decorateTooltipElement(picker, label);
      }
    }
  });
}

function applyQuillToolbarTooltips(toolbar) {
  if (!toolbar) return;

  injectQuillTooltipStyles();

  setToolbarLabel(toolbar, '.ql-size', 'Taille du texte');
  setToolbarLabel(toolbar, '.ql-bold', 'Gras');
  setToolbarLabel(toolbar, '.ql-italic', 'Italique');
  setToolbarLabel(toolbar, '.ql-underline', 'Souligner');
  setToolbarLabel(toolbar, '.ql-strike', 'Barrer');
  setToolbarLabel(toolbar, '.ql-color', 'Couleur du caractère');
  setToolbarLabel(toolbar, '.ql-background', 'Surlignage du caractère');
  setToolbarLabel(toolbar, '.ql-list[value="ordered"]', 'Liste numérotée');
  setToolbarLabel(toolbar, '.ql-list[value="bullet"]', 'Liste à puces');
  setToolbarLabel(toolbar, '.ql-link', 'Ajouter un lien');
  setToolbarLabel(toolbar, '.ql-image', 'Insérer une image');
  setToolbarLabel(toolbar, '.ql-video', 'Insérer une vidéo');
  setToolbarLabel(toolbar, '.ql-clean', 'Nettoyer la mise en forme');

  toolbar.dataset.sbiTooltipsReady = 'true';
}

export function initCourseEditorQuill() {
  const editor = document.getElementById('quill-editor');
  if (!editor) return () => {};

  if (!window.Quill) {
    throw new Error('Quill non chargé.');
  }

  if (window.quill && window.quill.root?.isConnected && window.quill.container?.contains(editor.querySelector('.ql-editor'))) {
    const existingToolbar = window.quill.getModule('toolbar')?.container;
    applyQuillToolbarTooltips(existingToolbar);
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
    applyQuillToolbarTooltips(toolbar);

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
