/**
 * SBI 8.0P.167.101-GPT2.1
 * Cursus timeline drag & drop bridge.
 *
 * Périmètre : ajout du déplacement horizontal par semaine sans modifier le
 * modèle interne de admin-cursus.js. Le bridge pilote l'inspecteur existant.
 */

let installed = false;
let observer = null;
let draggedItemId = '';
let dragStartedAt = 0;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function getCursusRoot() {
  return document.getElementById('view-cursus');
}

function getTimelineCanvas() {
  return document.getElementById('cursus-timeline-canvas');
}

function getWeekWidth() {
  const canvas = getTimelineCanvas();
  if (!canvas) return 120;
  const styles = getComputedStyle(canvas);
  const value = parseFloat(styles.getPropertyValue('--cursus-week-width'));
  return Number.isFinite(value) && value > 20 ? value : 120;
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

function markBlocksDraggable() {
  const root = getCursusRoot();
  if (!root) return;

  $all('.sbi-cursus-block[data-id]', root).forEach((block) => {
    block.setAttribute('draggable', 'true');
    block.setAttribute('aria-grabbed', 'false');
    block.title = 'Glisser horizontalement pour déplacer la semaine de début';
  });
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-dnd-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-dnd-style';
  style.textContent = `
    .sbi-cursus-block[draggable="true"] { cursor: grab; }
    .sbi-cursus-block[draggable="true"]:active { cursor: grabbing; }
    .sbi-cursus-block.is-dragging {
      opacity: .72;
      transform: translateY(-2px) scale(.995);
      outline: 2px solid rgba(117, 242, 154, .72);
      box-shadow: 0 0 0 6px rgba(117, 242, 154, .14), 0 22px 42px rgba(0, 0, 0, .34);
    }
    .sbi-cursus-track-body.is-drop-target {
      background-color: rgba(42, 87, 255, .12);
      box-shadow: inset 0 0 0 1px rgba(117, 242, 154, .32);
    }
  `;
  document.head.appendChild(style);
}

function computeDropWeek(event, trackBody) {
  const rect = trackBody.getBoundingClientRect();
  const x = Math.max(0, event.clientX - rect.left);
  const weekWidth = getWeekWidth();
  return Math.max(1, Math.floor(x / weekWidth) + 1);
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function dispatchField(target, eventName = 'input') {
  target.dispatchEvent(new Event(eventName, { bubbles: true }));
}

async function selectItem(itemId) {
  const block = $(`.sbi-cursus-block[data-id="${CSS.escape(itemId)}"]`);
  if (!block) return false;

  block.click();
  await waitFrame();
  return Boolean($(`#cursus-inspector-content [data-field]`));
}

async function setSelectedItemStartWeek(week) {
  const inspector = document.getElementById('cursus-inspector-content');
  if (!inspector) return false;

  const lockInput = $('input[data-field="isLocked"]', inspector);
  if (lockInput && !lockInput.checked) {
    lockInput.checked = true;
    dispatchField(lockInput, 'input');
    dispatchField(lockInput, 'change');
    await waitFrame();
  }

  const refreshedInspector = document.getElementById('cursus-inspector-content');
  const startWeekInput = refreshedInspector?.querySelector('input[data-field="startWeek"]');
  if (!startWeekInput) return false;

  startWeekInput.disabled = false;
  startWeekInput.value = String(week);
  dispatchField(startWeekInput, 'input');
  dispatchField(startWeekInput, 'change');
  return true;
}

async function moveItemToWeek(itemId, week) {
  const selected = await selectItem(itemId);
  if (!selected) {
    setStatus('Déplacement impossible : élément introuvable.', 'error');
    return;
  }

  const moved = await setSelectedItemStartWeek(week);
  if (!moved) {
    setStatus('Déplacement impossible : inspecteur indisponible.', 'error');
    return;
  }

  await waitFrame();
  markBlocksDraggable();
  setStatus(`Bloc déplacé en S${week}. Pense à sauvegarder le cursus.`, 'success');
}

function clearDropTargets() {
  $all('.sbi-cursus-track-body.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
}

function handleDragStart(event) {
  const block = event.target?.closest?.('.sbi-cursus-block[data-id]');
  if (!block || !getCursusRoot()) return;

  draggedItemId = block.dataset.id || '';
  dragStartedAt = Date.now();
  block.classList.add('is-dragging');
  block.setAttribute('aria-grabbed', 'true');

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedItemId);
  setStatus('Déplacement en cours : dépose le bloc sur la semaine voulue.');
}

function handleDragEnd() {
  $all('.sbi-cursus-block.is-dragging').forEach((block) => {
    block.classList.remove('is-dragging');
    block.setAttribute('aria-grabbed', 'false');
  });
  clearDropTargets();
  draggedItemId = '';
}

function handleDragOver(event) {
  if (!draggedItemId) return;
  const trackBody = event.target?.closest?.('.sbi-cursus-track-body');
  if (!trackBody || !getCursusRoot()) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearDropTargets();
  trackBody.classList.add('is-drop-target');
}

function handleDrop(event) {
  if (!draggedItemId || !getCursusRoot()) return;
  const trackBody = event.target?.closest?.('.sbi-cursus-track-body');
  if (!trackBody) return;

  event.preventDefault();
  const droppedId = event.dataTransfer.getData('text/plain') || draggedItemId;
  const targetWeek = computeDropWeek(event, trackBody);
  const elapsed = Date.now() - dragStartedAt;
  clearDropTargets();

  if (!droppedId || elapsed < 80) return;
  moveItemToWeek(droppedId, targetWeek);
}

function observeCursus() {
  observer?.disconnect();
  const root = getCursusRoot();
  if (!root) return;

  markBlocksDraggable();
  observer = new MutationObserver(() => markBlocksDraggable());
  observer.observe(root, { childList: true, subtree: true });
}

function installListeners() {
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('dragend', handleDragEnd, true);
  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget || !event.target?.closest?.('.sbi-cursus-track-body')) clearDropTargets();
  }, true);
  document.addEventListener('drop', handleDrop, true);

  window.addEventListener('sbi:app-shell:navigated', () => {
    window.setTimeout(observeCursus, 80);
  });

  window.addEventListener('sbi:app-shell:ready', () => {
    window.setTimeout(observeCursus, 80);
  });
}

export function initAdminCursusDndBridge() {
  if (installed) {
    observeCursus();
    return;
  }

  installed = true;
  ensureStyles();
  installListeners();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeCursus, { once: true });
  } else {
    observeCursus();
  }
}

initAdminCursusDndBridge();
