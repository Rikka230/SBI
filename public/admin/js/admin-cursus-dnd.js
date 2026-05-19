/**
 * SBI 8.0P.167.101.1-GPT2.1
 * Cursus timeline drag & drop bridge.
 *
 * Périmètre : déplacement horizontal par semaine sans superposition.
 * Si la semaine visée est déjà occupée sur la même piste, le bloc est
 * automatiquement calé sur la prochaine place libre à droite, puis à gauche
 * si nécessaire.
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

function getWeeksCount() {
  const canvas = getTimelineCanvas();
  if (!canvas) return 8;
  const styles = getComputedStyle(canvas);
  const value = parseInt(styles.getPropertyValue('--cursus-weeks'), 10);
  return Number.isFinite(value) && value > 0 ? value : 8;
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
    .sbi-cursus-track-body.is-drop-conflict {
      background-color: rgba(255, 167, 74, .12);
      box-shadow: inset 0 0 0 1px rgba(255, 167, 74, .36);
    }
  `;
  document.head.appendChild(style);
}

function parseCssNumber(node, propertyName, fallback = 0) {
  if (!node) return fallback;
  const styles = getComputedStyle(node);
  const value = parseFloat(styles.getPropertyValue(propertyName));
  return Number.isFinite(value) ? value : fallback;
}

function getBlockStartWeekZero(block) {
  return Math.max(0, Math.round(parseCssNumber(block, '--start-week', 0)));
}

function getBlockSpanWeeks(block) {
  return Math.max(1, Math.round(parseCssNumber(block, '--span-week', 1)));
}

function computeDropWeek(event, trackBody) {
  const rect = trackBody.getBoundingClientRect();
  const x = Math.max(0, event.clientX - rect.left);
  const weekWidth = getWeekWidth();
  return Math.max(1, Math.floor(x / weekWidth) + 1);
}

function rangesOverlap(startA, spanA, startB, spanB) {
  const endA = startA + spanA;
  const endB = startB + spanB;
  return startA < endB && startB < endA;
}

function getOriginalTrackBody(itemId) {
  const block = $(`.sbi-cursus-block[data-id="${CSS.escape(itemId)}"]`);
  return block?.closest?.('.sbi-cursus-track-body') || null;
}

function getDraggedSpan(itemId) {
  const block = $(`.sbi-cursus-block[data-id="${CSS.escape(itemId)}"]`);
  return getBlockSpanWeeks(block);
}

function getOccupiedRanges(trackBody, excludedItemId = '') {
  if (!trackBody) return [];

  return $all('.sbi-cursus-block[data-id]', trackBody)
    .filter((block) => (block.dataset.id || '') !== excludedItemId)
    .map((block) => ({
      id: block.dataset.id || '',
      start: getBlockStartWeekZero(block),
      span: getBlockSpanWeeks(block),
      title: block.textContent?.trim() || ''
    }))
    .filter((range) => range.span > 0);
}

function isSlotFree(startWeekOneBased, span, ranges) {
  const startZero = Math.max(0, startWeekOneBased - 1);
  return !ranges.some((range) => rangesOverlap(startZero, span, range.start, range.span));
}

function findFreeWeek(targetWeek, span, ranges) {
  const safeTarget = Math.max(1, Number(targetWeek) || 1);
  if (isSlotFree(safeTarget, span, ranges)) return safeTarget;

  const weeks = getWeeksCount();
  const maxProbe = Math.max(weeks + 24, safeTarget + 24);

  for (let week = safeTarget + 1; week <= maxProbe; week += 1) {
    if (isSlotFree(week, span, ranges)) return week;
  }

  for (let week = safeTarget - 1; week >= 1; week -= 1) {
    if (isSlotFree(week, span, ranges)) return week;
  }

  return safeTarget;
}

function getResolvedDropWeek(itemId, targetWeek) {
  const originalTrackBody = getOriginalTrackBody(itemId);
  const ranges = getOccupiedRanges(originalTrackBody, itemId);
  const span = getDraggedSpan(itemId);
  const resolvedWeek = findFreeWeek(targetWeek, span, ranges);

  return {
    targetWeek,
    resolvedWeek,
    wasOccupied: resolvedWeek !== targetWeek,
    span
  };
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

async function moveItemToWeek(itemId, dropInfo) {
  const selected = await selectItem(itemId);
  if (!selected) {
    setStatus('Déplacement impossible : élément introuvable.', 'error');
    return;
  }

  const moved = await setSelectedItemStartWeek(dropInfo.resolvedWeek);
  if (!moved) {
    setStatus('Déplacement impossible : inspecteur indisponible.', 'error');
    return;
  }

  await waitFrame();
  markBlocksDraggable();

  if (dropInfo.wasOccupied) {
    setStatus(`S${dropInfo.targetWeek} occupée : bloc placé en S${dropInfo.resolvedWeek}. Pense à sauvegarder.`, 'success');
    return;
  }

  setStatus(`Bloc déplacé en S${dropInfo.resolvedWeek}. Pense à sauvegarder le cursus.`, 'success');
}

function clearDropTargets() {
  $all('.sbi-cursus-track-body.is-drop-target, .sbi-cursus-track-body.is-drop-conflict').forEach((node) => {
    node.classList.remove('is-drop-target', 'is-drop-conflict');
  });
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

  const targetWeek = computeDropWeek(event, trackBody);
  const dropInfo = getResolvedDropWeek(draggedItemId, targetWeek);
  trackBody.classList.add(dropInfo.wasOccupied ? 'is-drop-conflict' : 'is-drop-target');
}

function handleDrop(event) {
  if (!draggedItemId || !getCursusRoot()) return;
  const trackBody = event.target?.closest?.('.sbi-cursus-track-body');
  if (!trackBody) return;

  event.preventDefault();
  const droppedId = event.dataTransfer.getData('text/plain') || draggedItemId;
  const targetWeek = computeDropWeek(event, trackBody);
  const dropInfo = getResolvedDropWeek(droppedId, targetWeek);
  const elapsed = Date.now() - dragStartedAt;
  clearDropTargets();

  if (!droppedId || elapsed < 80) return;
  moveItemToWeek(droppedId, dropInfo);
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
