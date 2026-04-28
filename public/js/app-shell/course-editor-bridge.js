/**
 * SBI 8.0K.4 - Course editor bridge
 *
 * Prépare et monte les éléments que les scripts inline ne relancent pas
 * en navigation PJAX : Quill, onglets éditeur et switch image/vidéo.
 */

const QUILL_SCRIPT = 'https://cdn.quilljs.com/1.3.6/quill.min.js';
const TOOLTIP_STYLE_ID = 'sbi-quill-tooltip-style';
const TOOLTIP_PORTAL_ID = 'sbi-quill-tooltip-portal';

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
  const previousStyle = document.getElementById(TOOLTIP_STYLE_ID);
  if (previousStyle) previousStyle.remove();

  const style = document.createElement('style');
  style.id = TOOLTIP_STYLE_ID;
  style.textContent = `
    .ql-toolbar .sbi-quill-tooltip-anchor,
    .ql-toolbar .ql-picker.sbi-quill-tooltip-anchor {
      position: relative;
    }

    .ql-toolbar .sbi-quill-tooltip-anchor::before,
    .ql-toolbar .sbi-quill-tooltip-anchor::after {
      content: none !important;
      display: none !important;
    }

    .sbi-quill-tooltip-portal {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 2147482800;
      max-width: min(240px, calc(100vw - 24px));
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
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transform: translate(-50%, 6px);
      transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
    }

    .sbi-quill-tooltip-portal.is-visible {
      opacity: 1;
      visibility: visible;
      transform: translate(-50%, 0);
    }

    .sbi-quill-tooltip-portal::before {
      content: '';
      position: absolute;
      left: 50%;
      top: -5px;
      width: 9px;
      height: 9px;
      background: rgba(15, 23, 42, 0.94);
      transform: translateX(-50%) rotate(45deg);
      border-left: 1px solid rgba(15, 23, 42, 0.08);
      border-top: 1px solid rgba(15, 23, 42, 0.08);
    }

    @media (max-width: 768px) {
      .sbi-quill-tooltip-portal {
        display: none !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function getTooltipPortal() {
  injectQuillTooltipStyles();

  let portal = document.getElementById(TOOLTIP_PORTAL_ID);

  if (!portal) {
    portal = document.createElement('div');
    portal.id = TOOLTIP_PORTAL_ID;
    portal.className = 'sbi-quill-tooltip-portal';
    portal.setAttribute('role', 'tooltip');
    portal.setAttribute('aria-hidden', 'true');
    document.body.appendChild(portal);
  }

  return portal;
}

function positionTooltip(target, portal) {
  if (!target || !portal) return;

  const rect = target.getBoundingClientRect();
  const spacing = 10;
  const viewportPadding = 10;

  portal.style.left = '0px';
  portal.style.top = '0px';
  portal.classList.add('is-visible');

  const tooltipRect = portal.getBoundingClientRect();

  let left = rect.left + (rect.width / 2);
  let top = rect.bottom + spacing;

  const minLeft = viewportPadding + (tooltipRect.width / 2);
  const maxLeft = window.innerWidth - viewportPadding - (tooltipRect.width / 2);
  left = Math.max(minLeft, Math.min(maxLeft, left));

  /**
   * 8.0K.4 :
   * On force toujours l'affichage en dessous de l'outil.
   * Même si la page est basse, on ne bascule plus au-dessus.
   */
  top = Math.max(viewportPadding, top);

  portal.dataset.placement = 'bottom';
  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
}

function showStyledTooltip(target) {
  const label = target?.getAttribute('data-sbi-tooltip');
  if (!label) return;

  const portal = getTooltipPortal();
  portal.textContent = label;
  portal.setAttribute('aria-hidden', 'false');
  portal.dataset.placement = 'bottom';

  window.requestAnimationFrame(() => {
    positionTooltip(target, portal);
  });
}

function hideStyledTooltip() {
  const portal = document.getElementById(TOOLTIP_PORTAL_ID);
  if (!portal) return;

  portal.classList.remove('is-visible');
  portal.setAttribute('aria-hidden', 'true');
}

function bindStyledTooltip(target, cleanups) {
  if (!target || target.dataset.sbiTooltipBound === 'true') return;

  target.dataset.sbiTooltipBound = 'true';

  const show = () => showStyledTooltip(target);
  const hide = () => hideStyledTooltip();
  const reposition = () => {
    const portal = document.getElementById(TOOLTIP_PORTAL_ID);
    if (portal?.classList.contains('is-visible')) {
      positionTooltip(target, portal);
    }
  };

  target.addEventListener('mouseenter', show);
  target.addEventListener('focus', show);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('blur', hide);
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  cleanups.push(() => {
    target.removeEventListener('mouseenter', show);
    target.removeEventListener('focus', show);
    target.removeEventListener('mouseleave', hide);
    target.removeEventListener('blur', hide);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  });
}

function decorateTooltipElement(element, label, cleanups) {
  if (!element) return;

  element.removeAttribute('title');
  element.setAttribute('aria-label', label);
  element.setAttribute('data-sbi-tooltip', label);
  element.classList.add('sbi-quill-tooltip-anchor');

  if (element.tagName === 'BUTTON') {
    element.setAttribute('type', 'button');
  }

  bindStyledTooltip(element, cleanups);
}

function setToolbarLabel(toolbar, selector, label, cleanups) {
  const elements = toolbar.querySelectorAll(selector);

  elements.forEach((element) => {
    decorateTooltipElement(element, label, cleanups);

    if (element.tagName === 'SELECT') {
      const picker = element.nextElementSibling?.classList?.contains('ql-picker')
        ? element.nextElementSibling
        : null;

      if (picker) {
        decorateTooltipElement(picker, label, cleanups);
      }
    }
  });
}

function resetQuillNativeTitles(toolbar) {
  if (!toolbar) return;

  toolbar.querySelectorAll('[title]').forEach((element) => {
    element.removeAttribute('title');
  });
}

function applyQuillToolbarTooltips(toolbar, cleanups = []) {
  if (!toolbar) return;

  injectQuillTooltipStyles();
  resetQuillNativeTitles(toolbar);

  setToolbarLabel(toolbar, '.ql-size', 'Taille du texte', cleanups);
  setToolbarLabel(toolbar, '.ql-bold', 'Gras', cleanups);
  setToolbarLabel(toolbar, '.ql-italic', 'Italique', cleanups);
  setToolbarLabel(toolbar, '.ql-underline', 'Souligner', cleanups);
  setToolbarLabel(toolbar, '.ql-strike', 'Barrer', cleanups);
  setToolbarLabel(toolbar, '.ql-color', 'Couleur du caractère', cleanups);
  setToolbarLabel(toolbar, '.ql-background', 'Surlignage du caractère', cleanups);
  setToolbarLabel(toolbar, '.ql-list[value="ordered"]', 'Liste numérotée', cleanups);
  setToolbarLabel(toolbar, '.ql-list[value="bullet"]', 'Liste à puces', cleanups);
  setToolbarLabel(toolbar, '.ql-link', 'Ajouter un lien', cleanups);
  setToolbarLabel(toolbar, '.ql-image', 'Insérer une image', cleanups);
  setToolbarLabel(toolbar, '.ql-video', 'Insérer une vidéo', cleanups);
  setToolbarLabel(toolbar, '.ql-clean', 'Nettoyer la mise en forme', cleanups);

  toolbar.dataset.sbiTooltipsReady = 'true';
}

export function initCourseEditorQuill() {
  const editor = document.getElementById('quill-editor');
  if (!editor) return () => {};

  if (!window.Quill) {
    throw new Error('Quill non chargé.');
  }

  if (window.quill && window.quill.root?.isConnected && window.quill.container?.contains(editor.querySelector('.ql-editor'))) {
    const existingCleanups = [];
    const existingToolbar = window.quill.getModule('toolbar')?.container;
    applyQuillToolbarTooltips(existingToolbar, existingCleanups);

    return () => {
      existingCleanups.splice(0, existingCleanups.length).forEach((cleanup) => cleanup());
      hideStyledTooltip();
    };
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
    applyQuillToolbarTooltips(toolbar, toolbarCleanups);

    ['mousedown', 'pointerdown', 'touchstart'].forEach((eventName) => {
      const handler = () => rememberQuillSelection(window.quill?.getSelection?.());
      toolbar.addEventListener(eventName, handler, true);
      toolbarCleanups.push(() => toolbar.removeEventListener(eventName, handler, true));
    });
  }

  return () => {
    toolbarCleanups.splice(0, toolbarCleanups.length).forEach((cleanup) => cleanup());
    hideStyledTooltip();

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
