/**
 * SBI 8.0P.167.120
 * Cursus placeholder replacement bridge.
 *
 * Fix : après consolidation Firestore, la page recharge automatiquement
 * le cursus actif pour éviter la copie locale périmée quand on change de cursus
 * sans faire F5.
 */

import { db } from '/js/firebase-init.js';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

let installed = false;
let observer = null;
let refreshScheduled = false;
let refreshingUi = false;
const pendingReplacements = new Map();

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function getRoot() {
  return document.getElementById('view-cursus');
}

function setStatus(message = '', tone = 'muted') {
  const status = document.getElementById('cursus-save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'success'
    ? '#75f29a'
    : tone === 'error'
      ? '#ff8fa3'
      : '#9fb0cf';
}

function clean(value = '', max = 220) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 180)).filter(Boolean);
  if (typeof value === 'string') return clean(value, 180) ? [clean(value, 180)] : [];
  return [];
}

function getSelectedPlaceholderBlock() {
  const selected = $('.sbi-cursus-block.is-selected[data-id]');
  if (!selected || !selected.classList.contains('type-placeholder_course')) return null;
  return selected;
}

function getSelectedPlaceholderId() {
  return getSelectedPlaceholderBlock()?.dataset?.id || '';
}

function getSelectedFormationContext() {
  const select = document.getElementById('cursus-formation-select');
  const option = select?.selectedOptions?.[0] || null;
  return {
    id: select?.value || '',
    name: clean(option?.textContent || '', 180)
  };
}

function getCourseTitle(course = {}) {
  return clean(course.titre || course.title || course.nom || course.name || 'Cours sans titre', 180);
}

function getCourseBlockLabel(course = {}) {
  return clean(course.bloc || course.blockTitle || course.blockName || course.moduleTitle || '', 120);
}

function getCourseStatusLabel(course = {}) {
  if (course.actif === true || course.lmsStatus === 'published' || course.statutValidation === 'approved') return 'Publié';
  if (course.lmsStatus === 'pending_review' || course.statutValidation === 'pending') return 'En attente';
  return 'Cours';
}

function getCourseDuration(course = {}) {
  return Math.max(1, Number(course.estimatedDurationDays || course.durationDays || 7) || 7);
}

function getCourseFormationRefs(course = {}) {
  return Array.from(new Set([
    ...normalizeArray(course.formationIds),
    ...normalizeArray(course.formationsIds),
    ...normalizeArray(course.targetFormationIds),
    ...normalizeArray(course.formations),
    ...normalizeArray(course.targetFormationTitles)
  ].filter(Boolean)));
}

function inferSourceFormation(course = {}, card = null) {
  const refs = getCourseFormationRefs(course);
  const sourceText = clean(card?.querySelector('small:last-of-type')?.textContent || '', 180)
    .replace(/^Source\s*:\s*/i, '')
    .trim();

  return {
    id: refs[0] || course.formationId || course.sourceFormationId || '',
    name: clean(course.formationName || course.sourceFormationName || sourceText || refs[0] || '', 180)
  };
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-placeholder-replace-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-placeholder-replace-style';
  style.textContent = `
    .sbi-cursus-tool-card button[data-action="replace-placeholder"] {
      border-color: rgba(117, 242, 154, .52);
      background: rgba(117, 242, 154, .12);
      color: #b8ffd0;
    }
    .sbi-cursus-block.is-placeholder-replaced,
    .sbi-cursus-block[data-sbi-replaced-placeholder="true"] {
      outline: 2px solid rgba(117, 242, 154, .82);
      box-shadow: 0 0 0 5px rgba(117, 242, 154, .14), 0 16px 34px rgba(0, 0, 0, .26);
    }
    .sbi-cursus-replace-hint {
      margin-top: .55rem;
      padding: .65rem .75rem;
      border: 1px solid rgba(117, 242, 154, .28);
      border-radius: 12px;
      background: rgba(117, 242, 154, .08);
      color: #b8ffd0;
      font-size: .76rem;
      line-height: 1.35;
    }
  `;
  document.head.appendChild(style);
}

function restoreToolButtons() {
  $all('#cursus-tool-list button[data-sbi-original-action]').forEach((button) => {
    const originalAction = button.dataset.sbiOriginalAction || 'add-course';
    const originalLabel = button.dataset.sbiOriginalLabel || button.textContent || 'Ajouter';

    if (button.dataset.action !== originalAction) button.dataset.action = originalAction;
    if (button.textContent !== originalLabel) button.textContent = originalLabel;

    button.classList.remove('is-placeholder-replace-btn');
    button.disabled = false;
    button.title = '';
    delete button.dataset.sbiOriginalAction;
    delete button.dataset.sbiOriginalLabel;
  });
}

function refreshToolButtons() {
  const root = getRoot();
  if (!root) return;

  const placeholderId = getSelectedPlaceholderId();
  restoreToolButtons();

  if (!placeholderId) return;

  $all('#cursus-tool-list .sbi-cursus-tool-card button[data-action="add-course"][data-id]', root).forEach((button) => {
    const card = button.closest('.sbi-cursus-tool-card');
    const alreadyPlaced = card?.classList.contains('is-placed') || button.textContent.trim().toLowerCase() === 'déjà';

    if (alreadyPlaced) {
      button.disabled = true;
      button.title = 'Ce cours est déjà placé dans le cursus.';
      return;
    }

    button.dataset.sbiOriginalAction = button.dataset.action || 'add-course';
    button.dataset.sbiOriginalLabel = button.textContent || 'Ajouter';
    button.dataset.action = 'replace-placeholder';
    button.textContent = 'Remplacer';
    button.classList.add('is-placeholder-replace-btn');
    button.title = 'Remplacer le cours futur sélectionné par ce cours';
  });
}

function markPendingBlocks() {
  $all('.sbi-cursus-block[data-id]').forEach((block) => {
    const isPending = pendingReplacements.has(block.dataset.id || '');
    block.classList.toggle('is-placeholder-replaced', isPending);
    if (isPending) block.dataset.sbiReplacedPlaceholder = 'true';
    else delete block.dataset.sbiReplacedPlaceholder;
  });
}

function renderInspectorHint() {
  const inspector = document.getElementById('cursus-inspector-content');
  if (!inspector) return;

  const oldHint = inspector.querySelector('.sbi-cursus-replace-hint');
  oldHint?.remove();

  const placeholderId = getSelectedPlaceholderId();
  if (!placeholderId) return;

  const replacement = pendingReplacements.get(placeholderId);
  const hint = document.createElement('div');
  hint.className = 'sbi-cursus-replace-hint';
  hint.textContent = replacement
    ? `Cours futur remplacé par « ${replacement.title} ». Sauvegarde le cursus pour consolider le lien au cours réel.`
    : 'Cours futur sélectionné : clique sur “Remplacer” dans la boîte à outils pour le convertir en vrai cours.';
  inspector.appendChild(hint);
}

function refreshUiNow() {
  if (refreshingUi || !getRoot()) return;

  refreshingUi = true;
  try {
    refreshToolButtons();
    markPendingBlocks();
    renderInspectorHint();
  } finally {
    refreshingUi = false;
  }
}

function scheduleRefresh(delay = 0) {
  if (refreshScheduled) return;
  refreshScheduled = true;

  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      refreshScheduled = false;
      refreshUiNow();
    });
  }, delay);
}

function dispatchInput(target, eventName = 'input') {
  target.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function rememberTemplateReload(templateId = '') {
  if (!templateId) return;
  try {
    sessionStorage.setItem('sbi:cursus:reload-template-after-placeholder-replace', JSON.stringify({
      templateId,
      at: Date.now()
    }));
  } catch (_) {}
}

function readTemplateReloadRequest() {
  try {
    const raw = sessionStorage.getItem('sbi:cursus:reload-template-after-placeholder-replace') || '';
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.templateId || Date.now() - Number(parsed.at || 0) > 90000) {
      sessionStorage.removeItem('sbi:cursus:reload-template-after-placeholder-replace');
      return null;
    }
    return parsed;
  } catch (_) {
    try {
      sessionStorage.removeItem('sbi:cursus:reload-template-after-placeholder-replace');
    } catch (__) {}
    return null;
  }
}

function restoreTemplateAfterReload(attempt = 0) {
  const request = readTemplateReloadRequest();
  if (!request) return;

  const select = document.getElementById('cursus-template-select');
  const option = select?.querySelector?.(`option[value="${CSS.escape(request.templateId)}"]`);

  if (!select || !option) {
    if (attempt < 40) window.setTimeout(() => restoreTemplateAfterReload(attempt + 1), 180);
    return;
  }

  try {
    sessionStorage.removeItem('sbi:cursus:reload-template-after-placeholder-replace');
  } catch (_) {}

  select.value = request.templateId;
  dispatchInput(select, 'change');
  window.setTimeout(() => {
    setStatus('Cursus rechargé avec le remplacement consolidé.', 'success');
  }, 240);
}

function reloadPageOnFreshTemplate(templateId = '') {
  rememberTemplateReload(templateId);
  window.setTimeout(() => {
    window.location.reload();
  }, 650);
}

async function fetchCourse(courseId) {
  const snap = await getDoc(doc(db, 'courses', courseId));
  if (!snap.exists()) throw new Error('Cours introuvable.');
  return { id: snap.id, ...(snap.data() || {}) };
}

function updateInspectorTextField(field, value) {
  const input = document.querySelector(`#cursus-inspector-content [data-field="${field}"]`);
  if (!input) return false;
  input.value = String(value ?? '');
  dispatchInput(input, 'input');
  dispatchInput(input, 'change');
  return true;
}

function buildReplacementPayload({ course, card, placeholderId }) {
  const context = getSelectedFormationContext();
  const source = inferSourceFormation(course, card);
  const title = getCourseTitle(course);
  const duration = getCourseDuration(course);

  return {
    placeholderId,
    courseId: course.id,
    title,
    courseTitle: title,
    courseStatus: getCourseStatusLabel(course),
    sourceFormationId: source.id,
    sourceFormationName: source.name,
    displayContextFormationId: context.id,
    displayContextFormationName: context.name,
    blockTitle: getCourseBlockLabel(course),
    estimatedDurationDays: duration,
    priorityLevel: course.priorityLevel || 'normal',
    isSharedCourse: Boolean(source.id && context.id && source.id !== context.id),
    grantedByCurriculum: true,
    replacedAt: Date.now()
  };
}

function coerceSelectedPlaceholderDom(replacement = {}) {
  const block = $(`.sbi-cursus-block[data-id="${CSS.escape(replacement.placeholderId || '')}"]`);
  if (!block) return;

  block.classList.remove('type-placeholder_course');
  block.classList.add('type-course', 'is-placeholder-replaced');
  block.dataset.sbiReplacedPlaceholder = 'true';

  const title = block.querySelector('.sbi-cursus-block-title strong');
  if (title) title.textContent = replacement.title || replacement.courseTitle || title.textContent;

  const selectedType = document.querySelector('.sbi-cursus-selected-card span');
  if (selectedType && selectedType.textContent.includes('Cours futur')) {
    selectedType.textContent = selectedType.textContent.replace('Cours futur', 'Cours');
  }
}

async function replaceSelectedPlaceholder(courseId, card = null) {
  const placeholderId = getSelectedPlaceholderId();
  if (!placeholderId) {
    setStatus('Sélectionne d’abord un bloc “Cours futur” dans la timeline.', 'error');
    return;
  }

  try {
    setStatus('Remplacement du cours futur...');
    const course = await fetchCourse(courseId);
    const replacement = buildReplacementPayload({ course, card, placeholderId });

    pendingReplacements.set(placeholderId, replacement);

    updateInspectorTextField('title', replacement.title);
    updateInspectorTextField('estimatedDurationDays', replacement.estimatedDurationDays);
    coerceSelectedPlaceholderDom(replacement);

    scheduleRefresh(80);
    setStatus(`Cours futur remplacé par « ${replacement.title} ». Sauvegarde le cursus pour confirmer.`, 'success');
  } catch (error) {
    console.warn('[SBI Cursus] Remplacement cours futur impossible :', error);
    setStatus(error?.message || 'Remplacement impossible.', 'error');
  }
}

function getActiveTemplateId() {
  return document.getElementById('cursus-template-select')?.value || '';
}

async function waitForTemplateId(timeoutMs = 5500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const id = getActiveTemplateId();
    if (id) return id;
    await new Promise((resolve) => window.setTimeout(resolve, 180));
  }
  return '';
}

function applyReplacementToItem(item = {}, replacement = null) {
  if (!replacement) return item;

  const next = {
    ...item,
    type: 'course',
    itemType: 'course',
    layer: 'courses',
    title: replacement.title,
    courseId: replacement.courseId,
    courseTitle: replacement.courseTitle,
    courseStatus: replacement.courseStatus || 'Cours',
    itemId: '',
    sourceFormationId: replacement.sourceFormationId,
    sourceFormationName: replacement.sourceFormationName,
    displayContextFormationId: replacement.displayContextFormationId,
    displayContextFormationName: replacement.displayContextFormationName,
    blockTitle: replacement.blockTitle,
    estimatedDurationDays: replacement.estimatedDurationDays || item.estimatedDurationDays || 7,
    durationDays: replacement.estimatedDurationDays || item.durationDays || item.estimatedDurationDays || 7,
    priorityLevel: replacement.priorityLevel || item.priorityLevel || 'normal',
    isSharedCourse: replacement.isSharedCourse,
    grantedByCurriculum: true,
    replacementSource: 'placeholder-replace-v2',
    replacedPlaceholderId: replacement.placeholderId || item.id || item.itemId || ''
  };

  if (next.id === next.itemId) next.id = item.id || replacement.placeholderId || next.courseId;
  return next;
}

async function consolidateReplacementsAfterSave() {
  if (!pendingReplacements.size) return;

  const templateId = await waitForTemplateId();
  if (!templateId) {
    setStatus('Cursus sauvegardé, mais remplacement à confirmer : recharge puis sauvegarde si besoin.', 'error');
    return;
  }

  try {
    const ref = doc(db, 'curriculumTemplates', templateId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    const items = Array.isArray(data.items) ? data.items : [];
    let changed = false;

    const patchedItems = items.map((item) => {
      const replacement = pendingReplacements.get(item.id || item.itemId || '')
        || pendingReplacements.get(item.replacedPlaceholderId || '');
      if (!replacement) return item;
      changed = true;
      return applyReplacementToItem(item, replacement);
    });

    if (!changed) return;

    await setDoc(ref, {
      items: patchedItems,
      itemCount: patchedItems.length,
      updatedAt: serverTimestamp(),
      replacementUpdatedAt: serverTimestamp(),
      replacementSource: 'placeholder-replace-v2'
    }, { merge: true });

    pendingReplacements.clear();
    scheduleRefresh(80);
    setStatus('Cours futur remplacé et sauvegardé comme cours réel. Rechargement du cursus...', 'success');
    reloadPageOnFreshTemplate(templateId);
  } catch (error) {
    console.warn('[SBI Cursus] Consolidation remplacement impossible :', error);
    setStatus('Le cursus est sauvegardé, mais le remplacement doit être vérifié.', 'error');
  }
}

function bindClicks() {
  document.addEventListener('click', (event) => {
    const replaceButton = event.target?.closest?.('button[data-action="replace-placeholder"][data-id]');
    if (replaceButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      replaceSelectedPlaceholder(replaceButton.dataset.id || '', replaceButton.closest('.sbi-cursus-tool-card'));
      return;
    }

    const cursusBlock = event.target?.closest?.('.sbi-cursus-block[data-id]');
    if (cursusBlock) {
      scheduleRefresh(80);
      return;
    }

    const saveButton = event.target?.closest?.('#cursus-save-btn');
    if (saveButton && pendingReplacements.size) {
      window.setTimeout(consolidateReplacementsAfterSave, 1200);
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.closest?.('#cursus-search, #cursus-source-filter')) scheduleRefresh(120);
  }, true);

  document.addEventListener('change', (event) => {
    if (event.target?.closest?.('#cursus-template-select, #cursus-formation-select, #cursus-source-filter')) scheduleRefresh(140);
  }, true);
}

function observeCursus() {
  observer?.disconnect();
  const root = getRoot();
  if (!root) return;

  scheduleRefresh(80);
  observer = new MutationObserver(() => scheduleRefresh(80));
  observer.observe(root, { childList: true, subtree: true });
}

function bindShellEvents() {
  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(observeCursus, 100));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(observeCursus, 100));
}

export function initAdminCursusPlaceholderReplaceBridge() {
  if (installed) {
    observeCursus();
    restoreTemplateAfterReload();
    return;
  }

  installed = true;
  ensureStyles();
  bindClicks();
  bindShellEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observeCursus();
      restoreTemplateAfterReload();
    }, { once: true });
  } else {
    observeCursus();
    restoreTemplateAfterReload();
  }
}

initAdminCursusPlaceholderReplaceBridge();
