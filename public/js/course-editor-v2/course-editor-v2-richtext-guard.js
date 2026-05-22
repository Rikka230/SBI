/**
 * SBI 8.0P.167.185
 * Guard ciblé éditeur V2 : Quill doit aussi monter sur les blocs génériques
 * qui possèdent une zone Contenu (resource, assignment, checkpoint, case_study).
 *
 * La base 8.0P.167.184 initialise Quill uniquement pour lesson alors que
 * renderGenericBlockEditor affiche déjà #block-content-quill pour les autres
 * blocs texte. Ce garde-fou monte Quill seulement si l'éditeur principal ne
 * l'a pas déjà fait, puis synchronise le textarea caché utilisé par la V2.
 */

const VERSION = '8.0P.167.185';
const ROOT_ID = 'sbi-course-editor-v2';
const MAIN_ID = 'course-v2-main';

const QUILL_TOOLBAR_OPTIONS = [
  [{ size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ align: [] }],
  ['link', 'image', 'video'],
  ['clean']
];

const SBI_QUILL_PRESETS = [
  { value: '', label: 'Style SBI' },
  { value: 'title_1', label: 'Titre SBI 1' },
  { value: 'section_title', label: 'Titre de partie' },
  { value: 'highlight', label: 'Texte important' },
  { value: 'body', label: 'Texte normal' }
];

let observer = null;
let scheduled = false;
let lastSelection = null;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function rememberSelection(range) {
  if (range && range.length > 0) {
    lastSelection = { index: range.index, length: range.length };
  }
}

function decorateToolbar(toolbarRoot) {
  if (!toolbarRoot || toolbarRoot.dataset.sbiRichtextGuardDecorated === 'true') return;
  toolbarRoot.dataset.sbiRichtextGuardDecorated = 'true';

  const labels = [
    ['.ql-size', 'Taille du texte'],
    ['.ql-bold', 'Gras'],
    ['.ql-italic', 'Italique'],
    ['.ql-underline', 'Souligner'],
    ['.ql-strike', 'Barrer'],
    ['.ql-color', 'Couleur du caractère'],
    ['.ql-background', 'Surlignage du caractère'],
    ['.ql-list[value="ordered"]', 'Liste numérotée'],
    ['.ql-list[value="bullet"]', 'Liste à puces'],
    ['.ql-align', 'Alignement'],
    ['.ql-link', 'Ajouter un lien'],
    ['.ql-image', 'Insérer une image'],
    ['.ql-video', 'Insérer une vidéo'],
    ['.ql-clean', 'Nettoyer la mise en forme']
  ];

  labels.forEach(([selector, label]) => {
    toolbarRoot.querySelectorAll(selector).forEach((element) => {
      element.dataset.sbiTooltip = label;
      element.classList.add('sbi-editor-v2-quill-tooltip-anchor');
      element.setAttribute('title', label);
      element.setAttribute('aria-label', label);
      if (element.tagName === 'BUTTON') element.setAttribute('type', 'button');

      const picker = element.tagName === 'SELECT' && element.nextElementSibling?.classList?.contains('ql-picker')
        ? element.nextElementSibling
        : null;
      if (picker) {
        picker.dataset.sbiTooltip = label;
        picker.setAttribute('title', label);
        picker.querySelector('.ql-picker-label')?.setAttribute('title', label);
      }
    });
  });
}

function applyPreset(quill, preset) {
  if (!quill || !preset) return;
  const current = quill.getSelection();
  const range = current || lastSelection || { index: Math.max(0, quill.getLength() - 1), length: 0 };
  const length = Math.max(range.length || 0, 1);

  quill.focus();
  quill.setSelection(range.index, range.length || 0, 'silent');

  if (preset === 'title_1') {
    quill.formatLine(range.index, length, 'header', 1, 'user');
    quill.formatText(range.index, range.length || 0, { bold: true, color: '#0f172a' }, 'user');
  } else if (preset === 'section_title') {
    quill.formatLine(range.index, length, 'header', 2, 'user');
    quill.formatText(range.index, range.length || 0, { bold: true, color: '#2A57FF' }, 'user');
  } else if (preset === 'highlight') {
    quill.formatLine(range.index, length, 'header', false, 'user');
    quill.formatText(range.index, range.length || 0, { bold: true, background: '#fff3e8', color: '#0f172a' }, 'user');
  } else if (preset === 'body') {
    quill.formatLine(range.index, length, 'header', false, 'user');
    quill.formatText(range.index, range.length || 0, {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      color: false,
      background: false,
      size: false
    }, 'user');
  }
}

function installPresetPicker(quill) {
  const toolbarRoot = quill?.getModule?.('toolbar')?.container;
  if (!toolbarRoot || toolbarRoot.dataset.sbiPresetInstalled === 'true') return;
  toolbarRoot.dataset.sbiPresetInstalled = 'true';

  const group = document.createElement('span');
  group.className = 'ql-formats sbi-quill-preset-group';

  const select = document.createElement('select');
  select.className = 'sbi-quill-preset-select';
  select.setAttribute('title', 'Styles SBI');
  select.setAttribute('aria-label', 'Styles SBI');

  SBI_QUILL_PRESETS.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.value;
    option.textContent = preset.label;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    if (!select.value) return;
    applyPreset(quill, select.value);
    syncHiddenTextarea(quill);
    select.value = '';
  });

  group.appendChild(select);
  toolbarRoot.insertBefore(group, toolbarRoot.firstChild);
}

function getHiddenTextarea() {
  return document.getElementById('block-content');
}

function getQuillContainer() {
  return document.getElementById('block-content-quill');
}

function syncHiddenTextarea(quill) {
  const hidden = getHiddenTextarea();
  if (!hidden || !quill?.root) return;
  const html = quill.root.innerHTML || '';
  hidden.value = html === '<p><br></p>' ? '' : html;
  hidden.dispatchEvent(new Event('input', { bubbles: true }));
}

function syncReadOnlyState(container, quill) {
  const hidden = getHiddenTextarea();
  const shell = document.querySelector(`#${ROOT_ID} .sbi-editor-shell`);
  const locked = Boolean(hidden?.disabled || shell?.classList?.contains('sbi-editor-shell--locked'));
  quill?.enable?.(!locked);
  container?.classList?.toggle('sbi-quill-editor--readonly', locked);
}

function shouldSkipContainer(container) {
  if (!container) return true;
  if (container.querySelector('.ql-editor')) return true;
  if (container.classList.contains('ql-container')) return true;
  if (container.dataset.sbiRichtextGuardMounted === 'true') return true;
  return false;
}

function ensureGenericQuill() {
  const root = document.getElementById(ROOT_ID);
  if (!root || !document.getElementById(MAIN_ID)) return;

  const container = getQuillContainer();
  const hidden = getHiddenTextarea();
  if (!container || !hidden) return;

  if (!window.Quill) {
    if (!container.querySelector('.sbi-editor-v2-quill-missing')) {
      container.innerHTML = '<div class="sbi-editor-v2-quill-missing">Éditeur riche indisponible. Le contenu reste sauvegardé en texte.</div>';
    }
    return;
  }

  if (shouldSkipContainer(container)) {
    const mounted = container.__sbiRichtextGuardQuill || null;
    if (mounted) syncReadOnlyState(container, mounted);
    return;
  }

  container.dataset.sbiRichtextGuardMounted = 'true';
  container.dataset.sbiRichtextGuardVersion = VERSION;

  const quill = new window.Quill(container, {
    theme: 'snow',
    modules: {
      toolbar: {
        container: QUILL_TOOLBAR_OPTIONS,
        handlers: {
          size(value) {
            const currentRange = this.quill.getSelection();
            const range = currentRange && currentRange.length > 0 ? currentRange : lastSelection;
            if (!range || range.length <= 0) return;
            this.quill.focus();
            this.quill.setSelection(range.index, range.length, 'silent');
            this.quill.formatText(range.index, range.length, 'size', value || false, 'user');
            this.quill.setSelection(range.index, range.length, 'silent');
            rememberSelection(range);
          }
        }
      }
    }
  });

  container.__sbiRichtextGuardQuill = quill;
  quill.root.innerHTML = hidden.value || '';
  quill.on('selection-change', (range) => rememberSelection(range));
  quill.on('text-change', () => syncHiddenTextarea(quill));

  const toolbar = quill.getModule('toolbar')?.container;
  if (toolbar) {
    ['mousedown', 'pointerdown', 'touchstart'].forEach((eventName) => {
      toolbar.addEventListener(eventName, () => rememberSelection(quill.getSelection()), true);
    });
    decorateToolbar(toolbar);
    installPresetPicker(quill);
  }

  syncReadOnlyState(container, quill);
}

function scheduleEnsure() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    ensureGenericQuill();
  });
}

function observeEditor() {
  observer?.disconnect?.();
  const root = document.getElementById(ROOT_ID) || document.body;
  observer = new MutationObserver(scheduleEnsure);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
  scheduleEnsure();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeEditor, { once: true });
} else {
  observeEditor();
}

window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(observeEditor, 80));
window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(observeEditor, 80));
